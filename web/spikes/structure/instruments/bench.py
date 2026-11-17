"""Scores every excerpt of the bench with every candidate and stores the group scores.

Usage: python bench.py DATA_DIR [--set synth|urmp|irmas] [--models yamnet,ced-tiny]
Writes DATA_DIR/scores/<set>-<model>.json: one entry per (excerpt, condition) with the
truth and the [windows, groups] scores (`models.GROUP_NAMES`).
"""

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1] / "accords" / "corpus"))
import models  # noqa: E402
import render  # noqa: E402

BLEEDS = [None, -18.0, -12.0, -6.0]  # accompaniment level relative to the lead (dB), None: lead alone


def to16k(x, sr):
    if sr == 16000:
        return x.astype(np.float32)
    from math import gcd
    g = gcd(int(sr), 16000)
    return signal.resample_poly(x, 16000 // g, int(sr) // g).astype(np.float32)


def mono(path):
    x, sr = sf.read(path, dtype="float32", always_2d=True)
    return x.mean(axis=1), sr


def old_record(x, seed, strength=0.7):
    s = render.old_settings(np.random.default_rng(seed), strength)
    y, _ = render.old_linear(x, s, seed)
    y, _ = render.old_finish(y, s, seed)
    return y.astype(np.float32)


def synth_items(data):
    d = data / "synth"
    for e in json.loads((d / "index.json").read_text()):
        lead, sr = mono(d / f"{e['id']}_lead.wav")
        band, _ = mono(d / f"{e['id']}_band.wav")
        n = min(len(lead), len(band))
        lead, band = lead[:n], band[:n]
        l_db = render.active_db(lead)
        b_db = render.active_db(band)
        for bleed in BLEEDS:
            x = lead if bleed is None else lead + band * render.db(l_db + bleed - b_db)
            x = x / (np.max(np.abs(x)) + 1e-9) * 0.5
            for old in (False, True):
                y = old_record(x, e["seed"]) if old else x
                cond = ("vieux" if old else "propre") + ("" if bleed is None else f"{int(bleed)}dB")
                yield e["id"], e["truth"], cond, to16k(y, sr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("data", type=Path)
    ap.add_argument("--set", default="synth")
    ap.add_argument("--models", default="yamnet,ced-tiny")
    ap.add_argument("--win", type=float, default=10.0, help="CED window, seconds")
    args = ap.parse_args()
    taggers = [models.Tagger(args.data, m) for m in args.models.split(",")]
    if args.set == "synth":
        items = synth_items(args.data)
    else:
        import real
        items = real.items(args.data, args.set)
    out = {t.name: [] for t in taggers}
    timing = {t.name: [0.0, 0.0] for t in taggers}
    for eid, truth, cond, x in items:
        for t in taggers:
            t0 = time.perf_counter()
            g = t.groups(t.raw(x, args.win))
            timing[t.name][0] += time.perf_counter() - t0
            timing[t.name][1] += len(x) / 16000
            out[t.name].append(dict(id=eid, truth=truth, cond=cond, scores=np.round(g, 5).tolist()))
        print(eid, cond, flush=True)
    d = args.data / "scores"
    d.mkdir(parents=True, exist_ok=True)
    for t in taggers:
        (d / f"{args.set}-{t.name}.json").write_text(json.dumps(dict(groups=models.GROUP_NAMES, items=out[t.name])))
        s, a = timing[t.name]
        print(f"{t.name}: {s:.1f} s of compute for {a:.0f} s of audio ({10 * s / a:.3f} s per 10 s, python CPU)")


if __name__ == "__main__":
    main()
