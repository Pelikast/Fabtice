"""Basic Pitch (Spotify, ICASSP 2022; Apache-2.0) as an independent bass and pitch-class cue,
not a chord model. Saves (layout in common.py):

    probs/labels : the bass pitch class seen as a "root" (labels "C:maj" .. "B:maj", "N"), so
                   sanity.py's root score reads as "how often the lowest note is the root"
    bass         : the same, [T, 13] (C..B, none)
    pitch        : pitch-class activations [T, 12] (max over octaves of the note posteriors)
    notes        : the raw note posteriorgram [T, 88] (A0..C8)

    python run_basicpitch.py song.wav out/song.basic-pitch.npz

Host side: mono 22.05 kHz, windows of 43 844 samples overlapping by 30 frames (7 680
samples), the signal padded with 3 840 zeros in front; the CQT is inside the graph.
Output 172 frames per window at 22050 / 256 = 86.13 frames/s; 15 frames dropped at each
side of every window when stitching (as basic_pitch.inference does).
"""

from __future__ import annotations

import sys

import numpy as np
import onnxruntime as ort

from common import PCS, Timer, load_audio, model_file, save

SR, HOP, N, OLAP = 22050, 256, 43844, 30


def notes(y: np.ndarray) -> np.ndarray:
    s = ort.InferenceSession(str(model_file("basic-pitch")), providers=["CPUExecutionProvider"])
    inp = s.get_inputs()[0].name
    names = [o.name for o in s.get_outputs()]
    olap = OLAP * HOP
    hop = N - olap
    x = np.concatenate([np.zeros(olap // 2, np.float32), y])
    wins = []
    for i in range(0, len(x), hop):
        w = x[i : i + N]
        wins.append(np.pad(w, (0, N - len(w))))
    batch = np.stack(wins)[..., None].astype(np.float32)
    out = dict(zip(names, s.run(None, {inp: batch})))
    # Outputs in the saved model's alphabetical order: :0 contour [264], :1 note [88], :2 onset [88].
    note = out["StatefulPartitionedCall:1"]
    n = OLAP // 2
    note = note[:, n:-n].reshape(-1, 88)
    frames = int(np.ceil(len(y) / HOP))
    return note[:frames]


def main() -> None:
    audio, outp = sys.argv[1], sys.argv[2]
    y = load_audio(audio, SR)
    with Timer() as t:
        nt = notes(y)
    T = nt.shape[0]
    midi = np.arange(21, 109)
    pc_act = np.zeros((T, 12), np.float32)
    for k in range(88):
        pc_act[:, midi[k] % 12] = np.maximum(pc_act[:, midi[k] % 12], nt[:, k])
    # Bass: the lowest note between E1 and G3 whose posterior passes 0.3, weighted by its posterior.
    bass = np.zeros((T, 13), np.float32)
    lo = (midi >= 28) & (midi <= 55)
    for f in range(T):
        act = np.where(lo & (nt[f] > 0.3))[0]
        if len(act):
            bass[f, midi[act[0]] % 12] = 1.0
        else:
            bass[f, 12] = 1.0
    labels = np.array([f"{p}:maj" for p in PCS] + ["N"])
    save(outp, model="basic-pitch-bass", probs=bass, labels=labels, bass=bass, pitch=pc_act, notes=nt,
         hop=HOP / SR, t0=0.0, seconds=t.seconds, time_scale=1.0, audio_seconds=len(y) / SR)
    print(f"basic-pitch: {T} frames in {t.seconds:.2f} s -> {outp}", file=sys.stderr)


if __name__ == "__main__":
    main()
