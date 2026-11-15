"""First-order sanity measure: plain frame-wise argmax (no prior, no beat pooling)
against a truth file with chords [start, end, voiced label, basic label].

    python sanity.py truth.json out/a.npz out/b.npz ...

Scores are time-weighted over the annotated span (sampled every 10 ms):
  root   : same root (N counts as a class)
  quality: same root and same quality once both are reduced to the app's 14 qualities
  majmin : same root and same third (maj / min family), sevenths ignored
  bass   : the model's bass output (if any) equals the truth's bass (root when no inversion)
Also: frame-wise agreement between models (are their errors independent?).
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

from common import QUAL_PCS, load_truth, reduce_label

MAJ = {"maj", "7", "maj7", "maj6", "aug", "sus2", "sus4"}


def family(q: str | None) -> str | None:
    if q is None:
        return None
    if q in ("min", "min7", "minmaj7", "min6"):
        return "min"
    if q in ("dim", "dim7", "hdim7"):
        return "dim"
    return "maj"


def truth_grid(truth: dict, step: float = 0.01):
    ch = truth["chords"]
    t = np.arange(ch[0][0], ch[-1][1], step)
    lab = [None] * len(t)
    j = 0
    for i, x in enumerate(t):
        while j < len(ch) - 1 and x >= ch[j][1]:
            j += 1
        lab[i] = ch[j][3] if len(ch[j]) > 3 else ch[j][2]
    return t, [reduce_label(l) for l in lab]


def model_grid(npz: dict, t: np.ndarray):
    probs, labels = npz["probs"], [str(x) for x in npz["labels"]]
    idx = np.clip(((t - float(npz["t0"])) / float(npz["hop"])).astype(int), 0, probs.shape[0] - 1)
    red = [reduce_label(l) for l in labels]
    am = probs.argmax(1)
    pred = [red[am[i]] for i in idx]
    bass = None
    if "bass" in npz:
        b = npz["bass"].argmax(1)
        bass = [int(b[i]) if b[i] < 12 else -1 for i in idx]
    return pred, bass, idx, am


def score(truth, pred, bass):
    n = len(truth)
    root = np.mean([p[0] == g[0] for p, g in zip(pred, truth)])
    qual = np.mean([p[0] == g[0] and p[1] == g[1] for p, g in zip(pred, truth)])
    mm = np.mean([p[0] == g[0] and family(p[1]) == family(g[1]) for p, g in zip(pred, truth)])
    bs = np.mean([b == g[2] for b, g in zip(bass, truth)]) if bass else float("nan")
    return root, qual, mm, bs, n


def main(paths: list[str]) -> None:
    truth = load_truth(paths[0])
    t, g = truth_grid(truth)
    rows, preds = [], {}
    for p in paths[1:]:
        z = dict(np.load(p, allow_pickle=False))
        pred, bass, _, _ = model_grid(z, t)
        name = str(z["model"]) + (f" (tuning {float(z['tuning_cents']):+.0f})" if "tuning_cents" in z and abs(float(z["tuning_cents"])) > 0.5 else "")
        r = score(g, pred, bass)
        rtf = float(z["seconds"]) / float(z["audio_seconds"]) if "audio_seconds" in z else float("nan")
        rows.append((name, *r[:4], rtf))
        preds[name] = pred
    print(f"{'model':38s} {'root':>6s} {'qual14':>6s} {'majmin':>6s} {'bass':>6s} {'RTF':>6s}")
    for name, r, q, m, b, rtf in rows:
        print(f"{name:38s} {r:6.3f} {q:6.3f} {m:6.3f} {b:6.3f} {rtf:6.3f}")
    names = list(preds)
    if len(names) > 1:
        print("\nroot errors shared (fraction of A's root errors also made by B, any wrong root):")
        for a in names:
            ea = np.array([p[0] != x[0] for p, x in zip(preds[a], g)])
            line = []
            for b in names:
                eb = np.array([p[0] != x[0] for p, x in zip(preds[b], g)])
                line.append(f"{(ea & eb).sum() / max(1, ea.sum()):5.2f}")
            print(f"{a[:38]:38s} " + " ".join(line))
        print("oracle (any model right on root): "
              f"{np.mean([any(preds[n][i][0] == g[i][0] for n in names) for i in range(len(g))]):.3f}")


if __name__ == "__main__":
    main(sys.argv[1:])
