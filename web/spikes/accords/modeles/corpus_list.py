"""List the bench corpus (id, style, split, conditions, audio paths) and the subset used
for the slow candidates.

    python corpus_list.py [--subset] [--json]

Split: banc/partage.json (dev / controle). Subset for Tsumugi: within each synthetic style,
the first dev piece and the first held-out piece (sorted by id), clipped to 14 pieces with
every style covered; GuitarSet: one take per style family (bn, jazz) per player = 8 takes.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

DATA = Path(os.environ.get("BANC_DATA", "/home/user/banc/data"))
HERE = Path(__file__).resolve().parent
SPLIT_FILE = HERE.parent / "banc" / "partage.json"


def split() -> dict[str, str]:
    if SPLIT_FILE.exists():
        d = json.loads(SPLIT_FILE.read_text())
    else:  # the shared split (origin/accords-structure), copied
        d = json.loads((HERE / "partage.json").read_text())
    return {**{i: "dev" for i in d["dev"]}, **{i: "controle" for i in d["controle"]}}


def corpus() -> list[dict]:
    sp = split()
    out = []
    for d in sorted((DATA / "corpus").iterdir()):
        f = d / "truth.json"
        if not f.exists():
            continue
        t = json.loads(f.read_text())
        conds = {c: str(d / v["mix"]) for c, v in t["conditions"].items()}
        out.append({"id": t["id"], "style": t["style"], "source": t["source"], "split": sp.get(t["id"], "?"),
                    "conditions": conds, "key": t["key"]["name"]})
    return out


def subset(items: list[dict]) -> list[dict]:
    synth = [x for x in items if not x["id"].startswith("gs-")]
    styles = sorted({x["style"] for x in synth})
    pick = []
    for s in styles:
        for part in ("dev", "controle"):
            c = [x for x in synth if x["style"] == s and x["split"] == part]
            if c:
                pick.append(c[0])
    # Modal and shuffle have a dev piece only: fill up to 14 with more swing (the largest and
    # hardest style), alternating held-out and dev.
    extra = [x for x in synth if x["style"] == "swing" and x not in pick]
    order = [x for x in extra if x["split"] == "controle"][:1] + [x for x in extra if x["split"] == "dev"][:1]
    for x in order:
        if len(pick) < 14:
            pick.append(x)
    gs = []
    for player in ("00", "01", "02", "03"):
        for fam in ("bn1", "jazz1"):
            c = [x for x in items if x["id"].startswith(f"gs-{player}-{fam}")]
            gs += c[:1]
    return pick + gs


def sha(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


if __name__ == "__main__":
    items = corpus()
    if "--subset" in sys.argv:
        items = subset(items)
    if "--json" in sys.argv:
        print(json.dumps(items, indent=1))
    else:
        for x in items:
            print(f"{x['id']:28s} {x['style']:14s} {x['split']:9s} {' '.join(x['conditions'])}")
        print(len(items), "pieces", file=sys.stderr)
