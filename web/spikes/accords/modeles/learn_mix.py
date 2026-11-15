"""Learn the weight of a candidate in the log-linear mix with CREMA (bench variant modele-mix)
on the dev pieces, then report it on the held-out pieces.

    python learn_mix.py <model> [--set subset|all] [--weights 0.25,0.5,0.75]

The weight maximises the mean colour score ("couleur", per beat, detected grid) over the
conditions of the dev pieces of the set. Results: ../resultats/modeles/<dev|controle>/<model>-w<w>/.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path

from corpus_list import corpus, subset

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def run(model: str, ids: list[str], w: float, tag: str) -> dict:
    out = ROOT / "resultats" / "modeles" / tag / f"{model}-w{w:g}"
    env = {**os.environ, "MODELE": model, "MIX_W": str(w), "BANC_DATA": os.environ.get("BANC_DATA", "/home/user/banc/data")}
    subprocess.run(["node", "dist/run.mjs", "--variant", "modele-mix", "--grid", "detected", "--only", ",".join(ids), "--out", str(out.relative_to(ROOT))],
                   cwd=ROOT, env=env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return json.loads((out / "modele-mix.json").read_text())


def colour(d: dict) -> dict[str, float]:
    return {k.split("|")[1]: v["rates"]["beat"]["couleur"] for k, v in d["groups"]["condition"].items() if k.startswith("detected")}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("--set", default="all", choices=["all", "subset"])
    ap.add_argument("--weights", default="0.2,0.35,0.5,0.65,0.8")
    a = ap.parse_args()
    items = corpus()
    if a.set == "subset":
        items = subset(items)
    dev = [x["id"] for x in items if x["split"] == "dev"]
    ctl = [x["id"] for x in items if x["split"] == "controle"]
    best, best_w = -1.0, None
    for w in (float(x) for x in a.weights.split(",")):
        c = colour(run(a.model, dev, w, "dev"))
        m = sum(c.values()) / len(c)
        print(f"dev  w={w:<5g} " + "  ".join(f"{k} {100 * v:.1f}" for k, v in c.items()) + f"  mean {100 * m:.1f}")
        if m > best:
            best, best_w = m, w
    c = colour(run(a.model, ctl, best_w, "controle"))
    print(f"held-out w={best_w:g} " + "  ".join(f"{k} {100 * v:.1f}" for k, v in c.items()))
    (ROOT / "resultats" / "modeles" / f"mix-{a.model}-{a.set}.json").write_text(json.dumps({"model": a.model, "set": a.set, "weight": best_w}))


if __name__ == "__main__":
    main()
