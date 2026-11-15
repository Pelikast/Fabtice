"""Per truth segment, the label each model gives most often (plain argmax), to see
what kind of errors they make.

    python segments.py truth.json out/a.npz out/b.npz ...
"""

from __future__ import annotations

import sys
from collections import Counter

import numpy as np

from common import load_truth


def main(paths: list[str]) -> None:
    truth = load_truth(paths[0])
    models = [dict(np.load(p, allow_pickle=False)) for p in paths[1:]]
    print("truth".ljust(18) + "".join(str(z["model"])[:16].ljust(17) for z in models))
    for c in truth["chords"]:
        t = np.arange(c[0], c[1], 0.01)
        row = [c[2][:17].ljust(18)]
        for z in models:
            idx = np.clip(((t - float(z["t0"])) / float(z["hop"])).astype(int), 0, len(z["probs"]) - 1)
            lab = Counter(str(z["labels"][i]) for i in z["probs"][idx].argmax(1)).most_common(1)[0][0]
            row.append(lab[:16].ljust(17))
        print("".join(row))


if __name__ == "__main__":
    main(sys.argv[1:])
