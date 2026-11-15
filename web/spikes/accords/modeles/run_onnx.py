"""Run a public-ONNX chord candidate on one audio file and save the frame-wise
probabilities (layout in common.py).

    python run_onnx.py crema           song.wav out/song.crema.npz [--tuning auto|none]
    python run_onnx.py btc-large       song.wav out/song.btc-large.npz
    python run_onnx.py chordmini-2e1d  song.wav out/song.chordmini-2e1d.npz

What each candidate needs from the host (what the JS side would compute):

* crema: mono 44.1 kHz samples; the CQT is inside the graph. Frames: hop 4096 / 44100 s.
* btc-large: mono 22.05 kHz, arithmetic-mean downmix; log(|CQT| + 1e-6) with librosa.cqt
  (fmin C1 = 32.70 Hz, 144 bins, 24 per octave, hop 2048), computed in independent 10 s blocks
  as BTC's reference runner does; normalised (x - mean) / std with btc_meta.json's values (NOT
  in the graph); windows of 108 frames (input [batch, 108, 144], dynamic batch). Frame step:
  10 s / 108 = 0.09259 s (BTC's own time unit). Output: 170 logits, BTC's large vocabulary.
* chordmini-2e1d: same CQT, but over the whole signal (no blocks); normalisation inside the
  graph; static input [16, 108, 144] (pad with zero windows). Frame step: 2048 / 22050 s.
  The reference runner smooths the logits with a 9-frame uniform filter before argmax; we
  save the raw softmax (smoothing belongs to the decoder).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort

from common import QUALS, PCS, Timer, librosa_cqt_log, load_audio, model_file, retune, save, softmax, tuning_factor

BTC_QUALS = ["min", "maj", "dim", "aug", "min6", "maj6", "min7", "minmaj7", "maj7", "7", "dim7", "hdim7", "sus2", "sus4"]


def btc_labels() -> list[str]:
    """BTC / ChordMini large vocabulary: root-major order, 14 qualities each, then X, N."""

    out = [f"{r}:{q}" for r in PCS for q in BTC_QUALS]
    return out + ["X", "N"]


def crema_labels() -> list[str]:
    labels = ["N", "X"] + [f"{r}:{q}" for r in PCS for q in QUALS]
    return sorted(labels)


def session(path: Path, threads: int) -> ort.InferenceSession:
    so = ort.SessionOptions()
    so.intra_op_num_threads = threads
    so.log_severity_level = 3
    return ort.InferenceSession(str(path), so, providers=["CPUExecutionProvider"])


def run_crema(y44: np.ndarray, threads: int) -> dict:
    s = session(model_file("crema"), threads)
    r = s.run(None, {"audio": y44[None, :].astype(np.float32)})
    names = [o.name for o in s.get_outputs()]
    out = dict(zip(names, r))
    root = out["chord_root"]
    return {"probs": out["chord_tag"], "labels": crema_labels(), "hop": 4096 / 44100, "pitch": out["chord_pitch"],
            "bass": out["chord_bass"], "root": root}


def windows(feat: np.ndarray, n: int = 108) -> tuple[np.ndarray, int]:
    T = feat.shape[0]
    pad = (-T) % n
    f = np.pad(feat, ((0, pad), (0, 0)))
    return f.reshape(-1, n, feat.shape[1]), T


def run_btc(y22: np.ndarray, threads: int) -> dict:
    meta = json.loads(model_file("btc-meta").read_text())["models"]["large"]
    feat = librosa_cqt_log(y22, block_seconds=10.0)
    feat = (feat - meta["mean"]) / meta["std"]
    w, T = windows(feat)
    s = session(model_file("btc-large"), threads)
    logits = s.run(None, {"feature": w.astype(np.float32)})[0].reshape(-1, 170)[:T]
    labels = [l if ":" in l or l in ("X", "N") else f"{l}:maj" for l in meta["labels"]]
    assert labels == btc_labels()
    return {"probs": softmax(logits), "labels": labels, "hop": 10.0 / 108}


def run_chordmini(y22: np.ndarray, threads: int) -> dict:
    cfg = json.loads(model_file("chordmini-config").read_text())
    feat = librosa_cqt_log(y22)
    w, T = windows(feat)
    s = session(model_file("chordmini-2e1d"), threads)
    outs = []
    for i in range(0, len(w), 16):
        g = w[i : i + 16]
        n = len(g)
        g = np.pad(g, ((0, 16 - n), (0, 0), (0, 0)))
        outs.append(s.run(None, {"features": g.astype(np.float32)})[0][:n])
    logits = np.concatenate(outs).reshape(-1, 170)[:T]
    labels = [l if ":" in l or l in ("X", "N") else f"{l}:maj" for l in cfg["chordVocab"]]
    assert labels == btc_labels()
    return {"probs": softmax(logits), "labels": labels, "hop": cfg["hopLength"] / cfg["sampleRate"]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("model", choices=["crema", "btc-large", "chordmini-2e1d"])
    ap.add_argument("audio")
    ap.add_argument("out")
    ap.add_argument("--tuning", default="none", help="'auto' (estimate and correct), 'none', or cents")
    ap.add_argument("--threads", type=int, default=1, help="1 thread is closest to the browser's WASM case")
    a = ap.parse_args()

    sr = 44100 if a.model == "crema" else 22050
    y = load_audio(a.audio, sr)
    cents, factor = 0.0, 1.0
    if a.tuning == "auto":
        cents, factor = tuning_factor(y, sr)
    elif a.tuning != "none":
        cents = float(a.tuning)
        factor = 2.0 ** (cents / 1200.0)
    with Timer() as t:
        yt = retune(y, sr, factor)
        r = {"crema": run_crema, "btc-large": run_btc, "chordmini-2e1d": run_chordmini}[a.model](yt, a.threads)
    r["hop"] = r["hop"] / factor  # back to the original audio's clock
    save(a.out, model=a.model, t0=0.0, seconds=t.seconds, time_scale=factor, tuning_cents=cents,
         audio_seconds=len(y) / sr, **r)
    print(f"{a.model}: {r['probs'].shape[0]} frames, {t.seconds:.2f} s for {len(y) / sr:.1f} s of audio "
          f"(RTF {t.seconds / (len(y) / sr):.3f}), tuning {cents:+.1f} cents -> {a.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
