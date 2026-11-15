#!/bin/sh
# The bench runs of the chord-model candidates (after bench_precompute.py). Results go to
# ../resultats/modeles/<set>/<model>/<variant>.json|md.
#   sh bench_runs.sh <model> <variant> [all|subset|dev|controle] [extra bench args…]
set -e
cd "$(dirname "$0")/.."
export BANC_DATA="${BANC_DATA:-/home/user/banc/data}"
model="$1"; variant="$2"; set_="${3:-subset}"; shift 3 || true
ids() { python3 modeles/corpus_list.py --json ${1:+--subset} 2>/dev/null | python3 -c "
import json,sys; x=json.load(sys.stdin); s='$2'
print(','.join(i['id'] for i in x if not s or i['split']==s))"; }
case "$set_" in
  all) only="";;
  subset) only="--only $(ids 1 '')";;
  dev) only="--only $(ids 1 dev)";;
  controle) only="--only $(ids 1 controle)";;
esac
MODELE="$model" node dist/run.mjs --variant "$variant" --grid detected $only --out "resultats/modeles/$set_/$model" "$@" 2>&1 | tail -1
