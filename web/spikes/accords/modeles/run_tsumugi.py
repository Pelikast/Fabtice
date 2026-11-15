"""Tsumugi-Chords (anime-song, 2026; code MIT, weights CC BY-NC 4.0): run the chord model
(PyTorch, CPU) with beats, downbeats and key given by us, and save its 25 Hz frame-wise
probabilities (layout in common.py). Optionally also its own semi-Markov decoder.

    python run_tsumugi.py song.wav out/song.tsumugi.npz --info beats.json [--decoded out/x.npz]

`--info`: a JSON with "beats" ([[time, beat number], ...], as the bench truth and Fabtice's
analysis give them) and "key" ("B:major"); or Tsumugi's own {"beats", "downbeats", "keys"}.
The model was trained WITH beats and key as inputs (SheetSage2-Refined's); without them
(`--info none`) it still runs but scores lower. For a fair bench, give it the beats and key
of Fabtice's own analysis, not the truth.

Model: stereo 25.6 kHz, 30 s windows (middle 20 s kept); harmonic CQT (5 harmonics, 36 bins
per octave from A0, 312 bins, 50 Hz) computed inside the network with torch.stft; a conv stem
and axis Transformers (note-transcription backbone), then a chord reader. Outputs at 25 Hz:
`detail` 745 classes (12 roots x 62 qualities, N last), `bass` 13, `root` 13, `tones` 12,
chord boundary. 16.9 M parameters, 68 MB (fp32 safetensors).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

from common import HERE, PCS, Timer, load_audio, model_file, save

REPO = ("https://github.com/anime-song/Tsumugi-Chords", "755b1e2a3838853c66321dfe29a5fc2c7bf0c325")
SRC = HERE / "src" / "tsumugi"


def ensure_src() -> Path:
    if not (SRC / "tsumugi_chords").exists():
        SRC.parent.mkdir(exist_ok=True)
        subprocess.run(["git", "clone", "-q", REPO[0], str(SRC)], check=True)
    subprocess.run(["git", "-C", str(SRC), "checkout", "-q", REPO[1]], check=False)
    sys.path.insert(0, str(SRC))
    return SRC


def read_info(path: str | None, duration: float) -> dict | None:
    if not path or path == "none":
        return None
    d = json.loads(Path(path).read_text())
    if "downbeats" in d:
        return d
    beats = [float(b[0]) for b in d["beats"]]
    downbeats = [float(b[0]) for b in d["beats"] if int(b[1]) == 1]
    key = d.get("key")
    keys = [{"start": 0.0, "end": duration, "key": key}] if key else []
    return {"beats": beats, "downbeats": downbeats, "keys": keys}


def detail_labels() -> list[str]:
    from tsumugi_chords.theory import QUALITIES, chord_to_mir_eval

    labels = [""] * (12 * len(QUALITIES) + 1)
    for qi, q in enumerate(QUALITIES):
        for r in range(12):
            labels[12 * qi + r] = chord_to_mir_eval(r, q, None)
    labels[-1] = "N"
    return labels


def onnx_song(wave: np.ndarray, info: dict | None, threads: int, window: float = 30.0, context: float = 5.0):
    """note_chords.song_logits with the ONNX graph: 30 s windows, the middle 20 s kept (the song's ends
    excepted). This is the chunking the JS side would do."""

    import onnxruntime as ort
    from tsumugi_chords.axis import RATE
    from tsumugi_chords.heads import FRAME_RATE
    from tsumugi_chords.note_chords import BEAT_FEATURES, KEY_FEATURES, beat_features, key_features

    so = ort.SessionOptions()
    so.intra_op_num_threads = threads
    so.log_severity_level = 3
    s = ort.InferenceSession(str(HERE / "cache" / "tsumugi-chords.onnx"), so, providers=["CPUExecutionProvider"])
    per = RATE // FRAME_RATE
    frames = wave.shape[-1] // per
    size, margin = int(window * FRAME_RATE), int(context * FRAME_RATE)
    core = size - 2 * margin
    wave = np.pad(wave, ((0, 0), (0, max(0, size * per - wave.shape[-1]))))
    outs: list[list[np.ndarray]] = [[], [], [], [], []]
    for kept in range(0, frames, core):
        start = min(max(0, kept - margin), max(0, frames - size))
        end = min(kept + core, frames)
        w = wave[None, :, start * per : (start + size) * per].astype(np.float32)
        if info is None:
            b = np.zeros((1, size, BEAT_FEATURES), np.float32)
            k = np.zeros((1, size, KEY_FEATURES), np.float32)
        else:
            b = beat_features(info["beats"], info.get("downbeats", []), start / FRAME_RATE, size)[None]
            k = key_features(info.get("keys", []), start / FRAME_RATE, size)[None]
        r = s.run(None, {"wave": w, "beats": b, "keys": k})
        for j, v in enumerate(r):
            outs[j].append(v[0, kept - start : end - start])
    return [np.concatenate(o) for o in outs]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("out")
    ap.add_argument("--info", required=True, help="JSON with beats and key, or 'none'")
    ap.add_argument("--decoded", help="also run Tsumugi's own decoder and save its segments as one-hot frames here")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--onnx", action="store_true", help="run cache/tsumugi-chords.onnx (convert_tsumugi.py) instead of PyTorch")
    a = ap.parse_args()

    import torch

    torch.set_num_threads(a.threads)
    ensure_src()
    from tsumugi_chords.axis import RATE
    from tsumugi_chords.decode import ChordDecoder
    from tsumugi_chords.heads import FRAME_RATE
    from tsumugi_chords.note_chords import load_note_chords, song_logits

    wave = load_audio(a.audio, RATE, channels=2)
    duration = wave.shape[1] / RATE
    info = read_info(a.info, duration)
    if a.onnx:
        with Timer() as t:
            detail, bass, root, tones, boundary = onnx_song(wave, info, a.threads)
    else:
        net = load_note_chords(model_file("tsumugi-model"), "cpu")
        with Timer() as t:
            o = song_logits(net, torch.from_numpy(wave), info)
        sm = lambda k: torch.softmax(o[k].float(), -1).numpy()
        detail, bass, root = sm("detail"), sm("bass"), sm("root")
        tones = torch.sigmoid(o["tones"].float()).numpy()
        boundary = torch.sigmoid(o["chord_boundary"].float()).numpy().reshape(-1)
    labels = detail_labels()
    common = dict(hop=1.0 / FRAME_RATE, t0=0.0, time_scale=1.0, audio_seconds=duration)
    save(a.out, model="tsumugi" + ("-onnx" if a.onnx else ""), probs=detail, labels=np.array(labels), bass=bass, root=root, pitch=tones,
         boundary=boundary, seconds=t.seconds, **common)
    print(f"tsumugi: {detail.shape} in {t.seconds:.1f} s (RTF {t.seconds / duration:.3f}) -> {a.out}", file=sys.stderr)

    if a.decoded:
        if info is None:
            raise SystemExit("the decoder needs beats")
        cfg = json.loads(model_file("tsumugi-config").read_text())["chord_tracker"]
        dec = ChordDecoder(model_file("tsumugi-tables"), model_file("tsumugi-bigram"), cfg["decoding"])
        with Timer() as td:
            chords = dec(detail, bass, boundary, info["beats"], info.get("downbeats", []), info.get("keys", []))
        names = sorted({c.label for c in chords})
        T = detail.shape[0]
        probs = np.zeros((T, len(names)), np.float32)
        bass_oh = np.zeros((T, 13), np.float32)
        for c in chords:
            f0, f1 = int(round(c.start * FRAME_RATE)), int(round(c.end * FRAME_RATE))
            probs[f0:f1, names.index(c.label)] = 1.0
            bass_oh[f0:f1, c.bass if c.bass is not None else (c.root if c.root is not None else 12)] = 1.0
        probs[probs.sum(1) == 0, names.index("N") if "N" in names else 0] = 1.0
        save(a.decoded, model="tsumugi-decoded", probs=probs, labels=np.array(names), bass=bass_oh,
             seconds=t.seconds + td.seconds, segments=np.array([f"{c.start:.3f}\t{c.end:.3f}\t{c.label}" for c in chords]),
             **common)
        for c in chords:
            print(f"  {c.start:7.2f} {c.end:7.2f} {c.label:14s} {c.symbol}", file=sys.stderr)


if __name__ == "__main__":
    main()
