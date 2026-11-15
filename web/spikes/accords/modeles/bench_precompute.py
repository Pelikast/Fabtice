"""Run the chord-model candidates on the bench corpus and store their frame outputs where the
bench variants (banc/variantes/modele-*.ts) read them:

    $BANC_DATA/modeles/<model>/<sha256 of the audio file>.npz   (layout in common.py)
    $BANC_DATA/modeles/<model>/<sha256>.json + .f32             (the same, for TypeScript)

The .f32 file is little-endian float32: probs [T, C], then probs169 [T, 169] (folded onto
the app's chords, index root * 14 + quality, 168 = N), then bass [T, 13] and pitch [T, 12]
when the model gives them (flags in the .json). Times: frame i starts at t0 + i * hop
seconds of the audio file.

    nice python bench_precompute.py --models jiang2019,btc-large,chordmini-2e1d,basic-pitch [--subset]
    nice python bench_precompute.py --models tsumugi,tsumugi-noinfo --subset --threads 2

`tsumugi` gets the beats, downbeats and key the app detects (data/modeles/app-grid/, written by
the bench variant `modele-grille`), and also writes its own decoder's chords
(`tsumugi-dec`); `tsumugi-noinfo` gets neither beats nor key.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np

from combine import to_app_vocab
from corpus_list import DATA, corpus, sha, subset

HERE = Path(__file__).resolve().parent
PY = sys.executable


def write_ts(npz: Path) -> None:
    z = dict(np.load(npz, allow_pickle=False))
    T, C = z["probs"].shape
    p169 = to_app_vocab(z)
    parts = [z["probs"].astype("<f4"), p169.astype("<f4")]
    meta = {"model": str(z["model"]), "T": T, "C": C, "hop": float(z["hop"]), "t0": float(z["t0"]),
            "labels": [str(x) for x in z["labels"]], "bass": "bass" in z, "pitch": "pitch" in z,
            "seconds": float(z.get("seconds", 0.0)), "audio_seconds": float(z.get("audio_seconds", 0.0))}
    if "bass" in z:
        parts.append(z["bass"].astype("<f4").reshape(T, 13))
    if "pitch" in z:
        parts.append(z["pitch"].astype("<f4").reshape(T, 12))
    if "segments" in z:
        meta["segments"] = [s.split("\t") for s in (str(x) for x in z["segments"])]
    npz.with_suffix(".f32").write_bytes(b"".join(np.ascontiguousarray(p).tobytes() for p in parts))
    npz.with_suffix(".json").write_text(json.dumps(meta))


def run(model: str, audio: str, out: Path, threads: int, grid: Path | None) -> list[Path]:
    env = {**os.environ, "OMP_NUM_THREADS": str(threads), "MKL_NUM_THREADS": str(threads)}
    made = [out]
    if model in ("btc-large", "chordmini-2e1d", "crema"):
        cmd = [PY, "run_onnx.py", model, audio, str(out), "--tuning", "auto", "--threads", str(threads)]
    elif model == "jiang2019":
        cmd = [PY, "run_jiang2019.py", audio, str(out)]
    elif model == "basic-pitch":
        cmd = [PY, "run_basicpitch.py", audio, str(out)]
    elif model == "tsumugi":
        dec = out.parent.parent / "tsumugi-dec" / out.name
        dec.parent.mkdir(parents=True, exist_ok=True)
        cmd = [PY, "run_tsumugi.py", audio, str(out), "--info", str(grid), "--decoded", str(dec), "--threads", str(threads)]
        made.append(dec)
    elif model == "tsumugi-noinfo":
        cmd = [PY, "run_tsumugi.py", audio, str(out), "--info", "none", "--threads", str(threads)]
    else:
        raise SystemExit(f"unknown model {model}")
    subprocess.run(cmd, check=True, cwd=HERE, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return made


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", required=True)
    ap.add_argument("--subset", action="store_true")
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--only")
    a = ap.parse_args()
    items = corpus()
    if a.subset:
        items = subset(items)
    if a.only:
        keep = set(a.only.split(","))
        items = [x for x in items if x["id"] in keep]
    jobs = [(x, c, p) for x in items for c, p in x["conditions"].items()]
    for model in a.models.split(","):
        d = DATA / "modeles" / model
        d.mkdir(parents=True, exist_ok=True)
        t0 = time.time()
        for i, (x, c, path) in enumerate(jobs):
            h = sha(path)
            out = d / f"{h}.npz"
            if out.exists() and out.with_suffix(".f32").exists():
                continue
            grid = DATA / "modeles" / "app-grid" / f"{h}.json"
            if model == "tsumugi" and not grid.exists():
                print(f"no app grid for {x['id']} {c}: run the bench variant modele-grille first", file=sys.stderr)
                continue
            t = time.time()
            for f in run(model, path, out, a.threads, grid):
                if f.exists():
                    write_ts(f)
            print(f"{model:15s} {i + 1:3d}/{len(jobs)} {x['id']:26s} {c:11s} {time.time() - t:6.1f} s", file=sys.stderr, flush=True)
        print(f"{model}: done in {time.time() - t0:.0f} s", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
