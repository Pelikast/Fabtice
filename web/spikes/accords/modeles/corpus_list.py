"""List the bench corpus (id, style, split, conditions, audio paths) and the subset used
for the slow candidates.

    python corpus_list.py [--subset] [--json]

Split: banc/partage.json (dev / test, here "controle"). Subset for the slow candidate: SUBSET.
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
    """The shared dev / held-out split of banc/partage.json ("dev" / "test", ids or globs);
    "test" is called "controle" here."""

    import fnmatch

    d = json.loads(SPLIT_FILE.read_text())
    ids = [p.name for p in (DATA / "corpus").iterdir() if (p / "truth.json").exists()]
    out = {}
    for part, name in (("dev", "dev"), ("test", "controle"), ("controle", "controle")):
        for pat in d.get(part, []):
            for i in ids:
                if fnmatch.fnmatch(i, pat):
                    out[i] = name
    return out


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


# The pieces the slow candidate (Tsumugi) ran on: 14 synthetic pieces covering every style and
# 8 GuitarSet takes (one bossa and one jazz take per player). Frozen: chosen before the split
# of banc/partage.json was fixed, they happen to fall 7 / 7 and 4 / 4 into dev and held-out.
SUBSET = ["ballade-cuivres", "ballade-mib", "blue-bossa", "bossa-mi", "so-what", "blues-lent-shuffle", "anatole-sib",
          "blues-bird", "bill-bailey", "georgia", "blues-valse-sol", "valse-cliche-re", "blues-mineur-do", "blues-fa-swing",
          "gs-00-bn1-147-gb", "gs-00-jazz1-130-d", "gs-01-bn1-129-eb", "gs-01-jazz1-200-b", "gs-02-bn1-147-gb",
          "gs-02-jazz1-130-d", "gs-03-bn1-129-eb", "gs-03-jazz1-200-b"]


def subset(items: list[dict]) -> list[dict]:
    return [x for x in items if x["id"] in SUBSET]


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
