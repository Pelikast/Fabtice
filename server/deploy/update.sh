#!/bin/bash
# Fabtice server deploy step.
# Run every minute as root by the systemd timer that cloud-init installs, right
# after the repository has been refreshed in /opt/fabtice. Idempotent: it only
# rebuilds when the code, the hostname or the day changed, or a container died.
set -u
export DEBIAN_FRONTEND=noninteractive

DIR=/opt/fabtice
STATE=/var/lib/fabtice
STATUS="$STATE/status"
LOG="$STATUS/deploy.log"
mkdir -p "$STATUS"

log() { echo "[$(date -u +%FT%TZ)] $*" >>"$LOG"; }
run() { log "\$ $*"; "$@" >>"$LOG" 2>&1; }

if [ -f "$LOG" ] && [ "$(wc -l <"$LOG")" -gt 2000 ]; then
  tail -n 800 "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

# 1. Plain-HTTP status page on port 8081, independent of Docker, so a broken
#    deploy can still be diagnosed from a browser.
if [ ! -f /etc/systemd/system/fabtice-status.service ]; then
  cat >/etc/systemd/system/fabtice-status.service <<EOF
[Unit]
Description=Fabtice deploy status page
After=network-online.target

[Service]
ExecStart=/usr/bin/python3 -m http.server 8081 --directory $STATUS
Restart=always
DynamicUser=yes

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now fabtice-status.service >>"$LOG" 2>&1
fi

# 2. Swap, so image builds cannot run out of memory on a 1 GB server.
if [ ! -f /swapfile ] && [ "$(swapon --noheadings | wc -l)" -eq 0 ]; then
  log "Creating a 2 GB swap file"
  if fallocate -l 2G /swapfile && chmod 600 /swapfile \
    && mkswap /swapfile >>"$LOG" 2>&1 && swapon /swapfile; then
    echo '/swapfile none swap sw 0 0' >>/etc/fstab
  else
    log "Swap file could not be enabled (continuing without)"
  fi
fi

# 3. Docker.
if ! docker compose version >/dev/null 2>&1; then
  log "Installing Docker"
  run apt-get -o DPkg::Lock::Timeout=180 update
  if ! run apt-get -o DPkg::Lock::Timeout=180 install -y docker.io docker-compose-v2; then
    log "FAILED: Docker install (will retry)"
    exit 1
  fi
fi

# 4. Public hostname: server/deploy/hostname if present, else <ip>.sslip.io.
IP4=$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p')
if [ -s "$DIR/server/deploy/hostname" ]; then
  HOST=$(tr -d ' \n\r' <"$DIR/server/deploy/hostname")
else
  HOST="${IP4//./-}.sslip.io"
fi

COMMIT=$(git -C "$DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)
DAY=$(date -u +%F)
WANT="$COMMIT $HOST $DAY"
HAVE=$(cat "$STATE/deployed" 2>/dev/null || true)

cd "$DIR/server" || exit 1
printf 'FABTICE_HOST=%s\nFABTICE_COMMIT=%s\nYTDLP_REFRESH=%s\n' "$HOST" "$COMMIT" "$DAY" >.env

RUNNING=$(docker compose ps --status running -q 2>/dev/null | wc -l)
if [ "$WANT" != "$HAVE" ] || [ "$RUNNING" -lt 2 ]; then
  log "Deploying [$WANT] (was [${HAVE:-nothing}], running containers: $RUNNING)"
  if run docker compose up -d --build --remove-orphans; then
    echo "$WANT" >"$STATE/deployed"
    log "Deploy OK"
  else
    log "FAILED: docker compose up (will retry)"
  fi
  run docker compose ps
  docker image prune -f >/dev/null 2>&1
fi

# 5. Status files (no request data: only deploy state and Caddy's own logs).
docker compose logs --no-color --tail 60 caddy >"$STATUS/caddy.log" 2>&1
cat >"$STATUS/status.json" <<EOF
{"time":"$(date -u +%FT%TZ)","commit":"$COMMIT","host":"$HOST","ip4":"$IP4","deployed":"$(cat "$STATE/deployed" 2>/dev/null)","running":$(docker compose ps --status running -q 2>/dev/null | wc -l)}
EOF
chmod -R a+rX "$STATUS"
