#!/bin/sh
# The bench runs of the chord-model candidates (after bench_precompute.py). Results go to
# ../resultats/modeles/<set>/<model><OUT_TAG>/<variant>.json|md.
#   sh bench_runs.sh <model> <variant> <set> [extra bench args…]
# <set>: all | dev | controle (whole corpus) | subset | subset-dev | subset-controle
# (the subset is the one the slow models ran on, see corpus_list.py).
set -e
cd "$(dirname "$0")/.."
export BANC_DATA="${BANC_DATA:-/home/user/banc/data}"
model="$1"; variant="$2"; set_="${3:-subset}"; shift 3 || true
case "$set_" in subset*) sub=--subset;; *) sub=;; esac
case "$set_" in *dev) part=dev;; *controle) part=controle;; *) part=;; esac
only=""
if [ "$set_" != all ]; then
  only="--only $(python3 modeles/corpus_list.py --json $sub 2>/dev/null | python3 -c "
import json,sys; x=json.load(sys.stdin); s='$part'
print(','.join(i['id'] for i in x if not s or i['split']==s))")"
fi
MODELE="$model" node dist/run.mjs --variant "$variant" --grid detected $only --out "resultats/modeles/$set_/$model${OUT_TAG:-}" "$@" 2>&1 | tail -1
