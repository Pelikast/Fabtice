"""Shared helpers for the chord-model candidates.

Every runner writes one .npz with the same layout, so the bench (and model
combination tests) can read them all the same way:

    probs      float32 [T, C]  per-frame probabilities over `labels` (softmax applied)
    labels     str     [C]     Harte labels of the classes ("C:maj7", "N", "X", ...)
    hop        float           frame step in seconds of the ORIGINAL audio
    t0         float           time of frame 0's start (frame i covers t0 + i*hop .. +hop)
    model      str             candidate id
    bass       float32 [T, 13] optional: bass pitch class (C=0 .. B=11, 12 = none)
    pitch      float32 [T, 12] optional: pitch-class activations (C=0 .. B=11)
    seconds    float           wall time of the model run (feature extraction included)
    time_scale float           > 0; model time = original time * time_scale (tuning correction)

Times are always given in the original audio's clock, even when the audio was
resampled to correct the tuning.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"
OUT = HERE / "out"

PCS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLATS = {"Db": 1, "Eb": 3, "Gb": 6, "Ab": 8, "Bb": 10, "Cb": 11, "Fb": 4, "E#": 5, "B#": 0}
# The 14 qualities of the app's engine (app/src/analysis/engine/chords.ts).
QUALS = ["maj", "min", "aug", "dim", "sus2", "sus4", "7", "maj7", "min7", "minmaj7", "maj6", "min6", "dim7", "hdim7"]
QUAL_PCS = {
    "maj": {0, 4, 7}, "min": {0, 3, 7}, "aug": {0, 4, 8}, "dim": {0, 3, 6}, "sus2": {0, 2, 7}, "sus4": {0, 5, 7},
    "7": {0, 4, 7, 10}, "maj7": {0, 4, 7, 11}, "min7": {0, 3, 7, 10}, "minmaj7": {0, 3, 7, 11},
    "maj6": {0, 4, 7, 9}, "min6": {0, 3, 7, 9}, "dim7": {0, 3, 6, 9}, "hdim7": {0, 3, 6, 10},
}
# Extended or alternative shorthands reduced to one of the 14 (extensions dropped).
SHORT = {
    "": "maj", "maj": "maj", "M": "maj", "min": "min", "m": "min", "aug": "aug", "dim": "dim",
    "sus2": "sus2", "sus4": "sus4", "sus": "sus4", "7": "7", "maj7": "maj7", "min7": "min7",
    "minmaj7": "minmaj7", "maj6": "maj6", "6": "maj6", "min6": "min6", "dim7": "dim7", "hdim7": "hdim7",
    "9": "7", "11": "7", "13": "7", "maj9": "maj7", "maj11": "maj7", "maj13": "maj7",
    "min9": "min7", "min11": "min7", "min13": "min7", "minmaj9": "minmaj7", "7sus4": "sus4", "sus4(b7)": "sus4",
    "5": "maj", "1": "maj", "aug7": "7", "7#5": "7", "7b5": "7", "hdim": "hdim7", "69": "maj6", "min69": "min6",
    "add9": "maj", "madd9": "min", "minadd9": "min",
}
INTERVAL = {"1": 0, "b2": 1, "2": 2, "#2": 3, "b3": 3, "3": 4, "4": 5, "#4": 6, "b5": 6, "5": 7, "#5": 8,
            "b6": 8, "6": 9, "bb7": 9, "b7": 10, "7": 11, "b9": 1, "9": 2, "#9": 3, "11": 5, "#11": 6,
            "b13": 8, "13": 9}


def parse_root(s: str) -> int:
    if s in FLATS:
        return FLATS[s]
    base = PCS.index(s[0].upper())
    for acc in s[1:]:
        base += 1 if acc == "#" else -1 if acc == "b" else 0
    return base % 12


def reduce_label(label: str) -> tuple[int, str | None, int]:
    """Harte label -> (root pc or -1 for N/X, one of QUALS or None, bass pc or -1).

    Extensions in parentheses are dropped; the quality is the shorthand reduced to
    the app's 14 qualities. Unknown shorthands fall back to the closest template.
    """

    label = label.strip()
    if label in ("N", "X", ""):
        return -1, None, -1
    root_s, _, rest = label.partition(":")
    if not _ and len(root_s) > 1 and root_s[1:] not in ("#", "b"):  # "Cmin7"-like labels without colon
        i = 2 if len(root_s) > 1 and root_s[1] in "#b" else 1
        root_s, rest = root_s[:i], root_s[i:]
    root = parse_root(root_s)
    rest, _, bass_s = rest.partition("/")
    short, _, ext = rest.partition("(")
    q = SHORT.get(short)
    if q is None:
        q = "maj"
    bass = root
    if bass_s:
        try:
            bass = (root + INTERVAL[bass_s]) % 12
        except KeyError:
            bass = root
    return root, q, bass


def chord_index(root: int, q: str | None) -> int:
    """Our own index: root * 14 + quality, 168 = N (as in app/src/analysis/engine/chords.ts)."""

    return 168 if root < 0 or q is None else root * 14 + QUALS.index(q)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def load_audio(path: Path | str, sr: int, channels: int = 1) -> np.ndarray:
    """Decode with ffmpeg to float32 at `sr`. Mono uses the arithmetic mean (L+R)/2,
    as librosa.load does (models trained with librosa are gain-sensitive)."""

    cmd = ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "2", "-ar", str(sr), "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    x = np.frombuffer(raw, np.float32).reshape(-1, 2).T.copy()
    return x.mean(0) if channels == 1 else x


def tuning_factor(y: np.ndarray, sr: int) -> tuple[float, float]:
    """Estimate the tuning (cents from A440) and the resampling factor that brings it to 440 Hz.

    Playing `y` resampled by `factor` (n -> n * factor samples at the same rate) lowers it by
    the measured deviation; model time = original time * factor."""

    import librosa

    # Fraction of a semitone (bins_per_octave=12), in [-0.5, 0.5).
    cents = float(librosa.estimate_tuning(y=y, sr=sr, bins_per_octave=12)) * 100.0
    return cents, float(2.0 ** (cents / 1200.0))


def retune(y: np.ndarray, sr: int, factor: float) -> np.ndarray:
    import librosa

    if abs(factor - 1.0) < 1e-6:
        return y
    # Resample to sr*factor then reinterpret at sr: pitch goes down by `cents`, duration grows by factor.
    return librosa.resample(y, orig_sr=sr, target_sr=int(round(sr * factor)), res_type="soxr_hq").astype(np.float32)


def librosa_cqt_log(y: np.ndarray, sr: int = 22050, hop: int = 2048, n_bins: int = 144, bpo: int = 24,
                    block_seconds: float | None = None) -> np.ndarray:
    """log(|CQT| + 1e-6), [T, n_bins], as BTC-ISMIR19 and ChordMini compute it (fmin = C1).

    BTC's reference runner computes the CQT in independent 10 s blocks and concatenates
    them (block_seconds=10); ChordMini's runner computes it over the whole signal."""

    import librosa

    def cqt(x):
        return librosa.cqt(x, sr=sr, n_bins=n_bins, bins_per_octave=bpo, hop_length=hop)

    if block_seconds is None:
        feat = cqt(y)
    else:
        n = int(sr * block_seconds)
        parts, i = [], 0
        while len(y) > i + n:
            parts.append(cqt(y[i : i + n]))
            i += n
        parts.append(cqt(y[i:]))
        feat = np.concatenate(parts, axis=1)
    return np.log(np.abs(feat) + 1e-6).T.astype(np.float32)


def softmax(x: np.ndarray, axis: int = -1) -> np.ndarray:
    x = x - x.max(axis=axis, keepdims=True)
    e = np.exp(x)
    return e / e.sum(axis=axis, keepdims=True)


def save(path: Path | str, **arrays) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(path, **{k: np.asarray(v) for k, v in arrays.items()})
    return path


class Timer:
    def __enter__(self):
        self.t = time.perf_counter()
        return self

    def __exit__(self, *a):
        self.seconds = time.perf_counter() - self.t


def model_file(name: str) -> Path:
    """Path of a file fetched by fetch_models.py (checked against its pinned SHA-256)."""

    from fetch_models import FILES, fetch

    return fetch(name, FILES[name])


def load_truth(path: Path | str) -> dict:
    return json.loads(Path(path).read_text())
