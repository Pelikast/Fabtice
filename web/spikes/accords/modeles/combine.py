"""Model combination, first look: every model's frame probabilities are mapped onto the
app's 169 chords (12 roots x 14 qualities + N; extensions folded into their base quality,
inversions into their chord), resampled on a common 10 ms grid, and mixed by a weighted
geometric mean (log-linear pooling) or arithmetic mean. Plain argmax, no prior.

    python combine.py truth.json out/a.npz out/b.npz ... [--weights 1,1,...] [--mean geo|arith]

Prints the score of every model alone, then of the mix. `to_app_vocab` is what a bench
variant would reuse.
"""

from __future__ import annotations

import argparse

import numpy as np

from common import chord_index, load_truth, reduce_label
from sanity import score, truth_grid

N_APP = 169


def to_app_vocab(z: dict) -> np.ndarray:
    """[T, C] model probabilities -> [T, 169] (X and unknown labels dropped, rows renormalised)."""

    labels = [str(x) for x in z["labels"]]
    M = np.zeros((len(labels), N_APP), np.float32)
    for i, l in enumerate(labels):
        if l == "X":
            continue
        r, q, _ = reduce_label(l)
        M[i, chord_index(r, q)] = 1.0
    p = z["probs"].astype(np.float32) @ M
    return p / np.maximum(p.sum(1, keepdims=True), 1e-12)


def on_grid(z: dict, t: np.ndarray) -> np.ndarray:
    p = to_app_vocab(z)
    idx = np.clip(((t - float(z["t0"])) / float(z["hop"])).astype(int), 0, p.shape[0] - 1)
    return p[idx]


def decode(p: np.ndarray) -> list[tuple[int, str | None, int]]:
    from common import QUALS

    am = p.argmax(1)
    return [(-1, None, -1) if c == 168 else (c // 14, QUALS[c % 14], c // 14) for c in am]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("truth")
    ap.add_argument("npz", nargs="+")
    ap.add_argument("--weights")
    ap.add_argument("--mean", default="geo", choices=["geo", "arith"])
    a = ap.parse_args()
    truth = load_truth(a.truth)
    t, g = truth_grid(truth)
    zs = [dict(np.load(p, allow_pickle=False)) for p in a.npz]
    w = [float(x) for x in a.weights.split(",")] if a.weights else [1.0] * len(zs)
    grids = [on_grid(z, t) for z in zs]
    print(f"{'model':38s} {'root':>6s} {'qual14':>6s} {'majmin':>6s}")
    for z, p in zip(zs, grids):
        r, q, m, _, _ = score(g, decode(p), None)
        print(f"{str(z['model']):38s} {r:6.3f} {q:6.3f} {m:6.3f}")
    if a.mean == "geo":
        mix = sum(wi * np.log(p + 1e-4) for wi, p in zip(w, grids)) / sum(w)
    else:
        mix = sum(wi * p for wi, p in zip(w, grids)) / sum(w)
    r, q, m, _, _ = score(g, decode(mix), None)
    print(f"{'mix (' + a.mean + ', ' + ','.join(f'{x:g}' for x in w) + ')':38s} {r:6.3f} {q:6.3f} {m:6.3f}")


if __name__ == "__main__":
    main()
