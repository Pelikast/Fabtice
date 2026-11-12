# Sourced as the first line of a CI step: copies everything the step prints
# into $RUNNER_TEMP/ci-logs/<name>.log, which the last job publishes on the
# ci-logs branch.
#   source "$GITHUB_WORKSPACE/desktop/ci/log-step.sh" 03-build
mkdir -p "$RUNNER_TEMP/ci-logs"
exec > >(tee -a "$RUNNER_TEMP/ci-logs/$1.log") 2>&1
echo "### step $1 — $(date -u +%Y-%m-%dT%H:%M:%SZ) — $(uname -mrs)"
