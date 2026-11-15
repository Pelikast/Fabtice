"""Gather bench results (resultats/<…>/<variant>.json) into one Markdown table per grid and
condition: root, colour, full chord, bass, missed / extra changes, and the share of beats
whose root is wrong by a fifth / fourth (the ii-V confusion).

    python bench_table.py "label=path/to/variant.json" ... [--grid detected]
"""

from __future__ import annotations

import json
import sys

CONDS = [("propre", "synthèse, propre"), ("disque", "synthèse, vieux disque"), ("reel", "GuitarSet"), ("reel-disque", "GuitarSet, vieux disque")]
FIFTH = "fondamentale à la quinte / quarte"
SEVENTH = "bonne fondamentale, septième ou sixte fausse"


def pct(x: float | None) -> str:
    return "—" if x is None else f"{100 * x:.0f} %"


def main(args: list[str]) -> None:
    grid = "detected"
    if "--grid" in args:
        grid = args[args.index("--grid") + 1]
        args = [a for a in args if a not in ("--grid", grid)]
    runs = [(a.split("=", 1)[0], json.load(open(a.split("=", 1)[1]))) for a in args]
    for cond, title in CONDS:
        key = f"{grid}|{cond}"
        rows = [(lab, d["groups"]["condition"][key]) for lab, d in runs if key in d["groups"]["condition"]]
        if not rows:
            continue
        n = rows[0][1]["rates"]["pieces"]
        print(f"\n**{title}** ({n} morceaux, grille {'détectée' if grid == 'detected' else 'vraie'})\n")
        print("| Variante | Fondamentale | Couleur | Complet | Basse | Manqués | En trop | Quinte/quarte | 7e/6te fausse |")
        print("|---|---|---|---|---|---|---|---|---|")
        for lab, g in rows:
            r, c = g["rates"], g["counts"]
            beats = c["beats"]
            miss = r["missing"] if c.get("twoChordBars") else None
            print(f"| {lab} | {pct(r['beat']['fondamentale'])} | {pct(r['beat']['couleur'])} | {pct(r['beat']['complet'])} | "
                  f"{pct(r['beat']['basse'])} | {pct(miss)} | {pct(r['extra'])} | {pct(c['errors'].get(FIFTH, 0) / beats)} | "
                  f"{pct(c['errors'].get(SEVENTH, 0) / beats)} |")


if __name__ == "__main__":
    main(sys.argv[1:])
