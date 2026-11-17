"""The candidate taggers, run with onnxruntime (CPU) on 16 kHz mono audio.

Each candidate returns, for a mono 16 kHz signal, a matrix [windows, groups]
of AudioSet scores gathered into the groups the app cares about (`GROUPS`,
the max of the AudioSet classes of each group).
"""

import csv
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
import onnxruntime as ort

HF = "https://huggingface.co/"
CANDIDATES = {
    "yamnet": dict(
        repo="audiojs/yamnet", rev="32997c946aaca3ebca95148c657838b28fe0d794", file="yamnet.fp16.onnx",
        sha256="0a1f3b050ebfdfa651e78fb12714c3c1fe750ceebd58529818a1ddddec515688", bytes=7495175,
        labels=("zeropointnine/yamnet-onnx", "ac2ca3bd45d12ec1f19f1144205ea529b4e9dedf", "yamnet_class_map.csv"),
    ),
    "ced-tiny": dict(
        repo="mispeech/ced-tiny", rev="ace276d29dd0bb3f3517b0fa8cf300738c409019", file="model.onnx",
        sha256="3890f227660be71886ff48633d11a731993e0206db8a486781412c28a0873435", bytes=6681767,
        labels=("mispeech/ced-tiny", "ace276d29dd0bb3f3517b0fa8cf300738c409019", "config.json"),
    ),
}

# The groups the app names (`model/structure.ts#PART_INSTRUMENTS`) and the AudioSet
# display names gathered in each. `brass` and `woodwind` are the generic families.
GROUPS = {
    "trumpet": ["Trumpet"],
    "trombone": ["Trombone"],
    "saxophone": ["Saxophone"],
    "clarinet": ["Clarinet"],
    "flute": ["Flute"],
    "brass": ["Brass instrument", "French horn"],
    "woodwind": ["Wind instrument, woodwind instrument", "Wind instrument"],
    "piano": ["Piano", "Electric piano"],
    "guitar": ["Guitar", "Electric guitar", "Acoustic guitar", "Steel guitar, slide guitar", "Steel guitar"],
    "vibraphone": ["Vibraphone", "Marimba, xylophone", "Mallet percussion"],
    "violin": ["Violin, fiddle", "Bowed string instrument", "String section", "Cello"],
    "organ": ["Organ", "Electronic organ", "Hammond organ"],
    "voice": ["Singing", "Choir", "Male singing", "Female singing", "Humming", "Speech"],
    "harmonica": ["Harmonica", "Accordion"],
    "whistling": ["Whistling", "Whistle"],
    "music": ["Music", "Musical instrument"],
}
GROUP_NAMES = list(GROUPS)


def fetch(data, name):
    c = CANDIDATES[name]
    d = data / "models"
    d.mkdir(parents=True, exist_ok=True)
    path = d / f"{name}.onnx"
    if not path.exists():
        subprocess.run(["curl", "-sSfL", "-o", str(path), f"{HF}{c['repo']}/resolve/{c['rev']}/{c['file']}"], check=True)
    assert hashlib.sha256(path.read_bytes()).hexdigest() == c["sha256"], name
    repo, rev, f = c["labels"]
    lab = d / f"{name}-{f}"
    if not lab.exists():
        subprocess.run(["curl", "-sSfL", "-o", str(lab), f"{HF}{repo}/resolve/{rev}/{f}"], check=True)
    if f.endswith(".csv"):
        with open(lab) as fh:
            names = [r["display_name"] for r in csv.DictReader(fh)]
    else:
        id2 = json.loads(lab.read_text())["id2label"]
        names = [id2[str(i)] for i in range(len(id2))]
    return path, names


def group_matrix(names):
    """[classes, groups] 0/1 membership."""
    idx = {n: i for i, n in enumerate(names)}
    cols = []
    for g in GROUP_NAMES:
        cols.append([idx[n] for n in GROUPS[g] if n in idx])
        assert cols[-1], g
    return cols


# ------------------------------------------------------------------ YAMNet features

def hz_to_mel(f):
    return 1127.0 * np.log1p(f / 700.0)


def yamnet_mel_matrix():
    """tf.signal.linear_to_mel_weight_matrix(64, 257, 16000, 125, 7500), HTK mels, no zero bin."""
    n_bins, sr, lo, hi, n_mel = 257, 16000, 125.0, 7500.0, 64
    freqs = np.linspace(0, sr / 2, n_bins)[1:]
    spec_mel = hz_to_mel(freqs)
    edges = np.linspace(hz_to_mel(lo), hz_to_mel(hi), n_mel + 2)
    lower, center, upper = edges[:-2], edges[1:-1], edges[2:]
    m = spec_mel[:, None]
    w = np.maximum(0, np.minimum((m - lower) / (center - lower), (upper - m) / (upper - center)))
    return np.vstack([np.zeros((1, n_mel)), w])  # [257, 64]


_MEL = None


def yamnet_patches(x):
    """features.py: frames of 400 every 160, periodic Hann, |rfft 512|, mel, ln(+0.001); patches 96 every 48."""
    global _MEL
    if _MEL is None:
        _MEL = yamnet_mel_matrix()
    x = np.asarray(x, np.float64)
    if len(x) < 15600:
        x = np.pad(x, (0, 15600 - len(x)))
    n_frames = 1 + (len(x) - 400) // 160
    idx = np.arange(400)[None, :] + 160 * np.arange(n_frames)[:, None]
    win = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(400) / 400)
    spec = np.abs(np.fft.rfft(x[idx] * win, 512))
    logmel = np.log(spec @ _MEL + 0.001)
    n_p = 1 + max(0, (len(logmel) - 96) // 48)
    if len(logmel) < 96:
        logmel = np.pad(logmel, ((0, 96 - len(logmel)), (0, 0)))
    return np.stack([logmel[48 * i: 48 * i + 96] for i in range(n_p)]).astype(np.float32)


class Tagger:
    def __init__(self, data, name, threads=2):
        self.name = name
        path, names = fetch(data, name)
        self.names = names
        self.cols = group_matrix(names)
        so = ort.SessionOptions()
        so.intra_op_num_threads = threads
        self.sess = ort.InferenceSession(str(path), so, providers=["CPUExecutionProvider"])
        self.inp = self.sess.get_inputs()[0].name

    def raw(self, x16, win_s=None):
        """[windows, classes] scores."""
        if self.name == "yamnet":
            return self.sess.run(None, {self.inp: yamnet_patches(x16)})[0]
        win = int((win_s or 10.0) * 16000)
        hop = win // 2
        outs = []
        starts = list(range(0, max(1, len(x16) - win // 2), hop)) or [0]
        for s in starts:
            seg = x16[s: s + win]
            if len(seg) < 16000:
                seg = np.pad(seg, (0, 16000 - len(seg)))
            outs.append(self.sess.run(None, {self.inp: seg[None, :].astype(np.float32)})[0][0])
        return np.stack(outs)

    def groups(self, raw):
        return np.stack([raw[:, c].max(axis=1) for c in self.cols], axis=1)
