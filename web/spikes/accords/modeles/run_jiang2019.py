"""Jiang, Chen & Xia, "Large-Vocabulary Chord Transcription via Chord Structure
Decomposition" (ISMIR 2019): run the official 5-fold ensemble (PyTorch, CPU) or its
ONNX conversion, and save frame-wise probabilities (layout in common.py).

    python run_jiang2019.py song.wav out/song.jiang2019.npz            # PyTorch reference
    python run_jiang2019.py song.wav out/song.jiang2019-onnx.npz --onnx
    python run_jiang2019.py --export cache/jiang2019.onnx              # convert + parity check

Model (copied architecture, MIT, Music X Lab): a CNN over |CQT| + one bidirectional
LSTM, with six softmax heads per frame: triad (1 + 6 types x 12 roots = 73; index 0 = N),
bass (13: none + 12 pitch classes), seventh (4), ninth (4), eleventh (3), thirteenth (3),
the last four relative to the root. A chord's log-probability is the sum of the heads'
log-probabilities for its decomposition (upstream XHMMDecoder.get_chord_tag_obs); we
compute it for a chord dictionary (CHORDS below, 12 transpositions each) and normalise.

Features (what the JS side would compute): mono 22.05 kHz, librosa.hybrid_cqt magnitude
(no log), fmin F#0 = 23.12 Hz, 288 bins, 36 per octave, hop 512 (43.07 frames/s),
tuning estimated by librosa (tuning=None); the network reads bins 18..270 (252 bins).
InstanceNorm2d normalises over the whole input, so the graph wants the whole song at once
(dynamic length) or long windows.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import numpy as np

from common import CACHE, HERE, Timer, load_audio, model_file, save

REPO = ("https://github.com/music-x-lab/ISMIR2019-Large-Vocabulary-Chord-Recognition",
        "481f4ce703f8822b99f4037e9104ba1760e21ea3")
SRC = HERE / "src" / "jiang2019"
SR, HOP = 22050, 512
SPEC_DIM, CROP = 252, 18
# Chord dictionary (C-rooted, transposed to 12 roots): the upstream "submission" and
# "extended" lists, plus the app's other qualities and common jazz alterations.
CHORDS = """N C:maj C:min C:aug C:dim C:sus2 C:sus4 C:7 C:maj7 C:min7 C:minmaj7 C:maj6 C:min6 C:dim7 C:hdim7
C:9 C:maj9 C:min9 C:11 C:13 C:min11 C:maj13 C:7(b9) C:7(#9) C:7(13) C:7(b13) C:7(#11) C:maj7(#11) C:min7(11)
C:maj6(9) C:min6(9) C:sus4(b7) C:sus4(b7,9) C:maj(9) C:min(9)
C:maj/3 C:maj/5 C:min/b3 C:min/5 C:maj/b7 C:min/b7 C:maj/2 C:min/2 C:maj/4 C:7/3 C:7/5 C:7/b7 C:min7/b7
C:min7/b3 C:min7/5 C:maj7/3 C:maj7/5 C:maj7/7""".split()


def ensure_src() -> Path:
    if not (SRC / "complex_chord.py").exists():
        SRC.parent.mkdir(exist_ok=True)
        subprocess.run(["git", "clone", "-q", REPO[0], str(SRC)], check=True)
        subprocess.run(["git", "-C", str(SRC), "checkout", "-q", REPO[1]], check=True)
    return SRC


def build_net():
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    class CNN(nn.Module):  # upstream CNNFeatureExtractor
        def __init__(self):
            super().__init__()
            c1, c2, c3, c4 = 16, 32, 64, 80
            conv = lambda i, o, p=(1, 1): nn.Conv2d(i, o, (3, 3), padding=p)
            norm = nn.InstanceNorm2d
            self.conv1a, self.norm1a = conv(1, c1), norm(c1)
            self.conv1b, self.norm1b = conv(c1, c1), norm(c1)
            self.conv1c, self.norm1c = conv(c1, c1), norm(c1)
            self.pool1 = nn.MaxPool2d((1, 3))
            self.conv2a, self.norm2a = conv(c1, c2), norm(c2)
            self.conv2b, self.norm2b = conv(c2, c2), norm(c2)
            self.conv2c, self.norm2c = conv(c2, c2), norm(c2)
            self.pool2 = nn.MaxPool2d((1, 3))
            self.conv3a, self.norm3a = conv(c2, c3), norm(c3)
            self.conv3b, self.norm3b = conv(c3, c3), norm(c3)
            self.pool3 = nn.MaxPool2d((1, 4))
            self.conv4a, self.norm4a = conv(c3, c4, (1, 0)), norm(c4)
            self.conv4b, self.norm4b = conv(c4, c4, (1, 0)), norm(c4)
            self.output_size = 3 * c4

        def forward(self, x):
            b, t = x.shape[0], x.shape[1]
            x = x.view(b, 1, t, SPEC_DIM)
            for n in ("1a", "1b", "1c"):
                x = F.selu(getattr(self, "norm" + n)(getattr(self, "conv" + n)(x)))
            x = self.pool1(x)
            for n in ("2a", "2b", "2c"):
                x = F.selu(getattr(self, "norm" + n)(getattr(self, "conv" + n)(x)))
            x = self.pool2(x)
            for n in ("3a", "3b"):
                x = F.selu(getattr(self, "norm" + n)(getattr(self, "conv" + n)(x)))
            x = self.pool3(x)
            for n in ("4a", "4b"):
                x = F.selu(getattr(self, "norm" + n)(getattr(self, "conv" + n)(x)))
            return x.transpose(1, 2).reshape(b, t, self.output_size)

    class ChordNet(nn.Module):  # upstream ChordNet, inference only
        def __init__(self):
            super().__init__()
            self.audio_feature_block = CNN()
            self.condition_linear = nn.Linear(240 + 12 + 6 + 12, 128)  # unused, kept for the state dict
            self.lstm1 = nn.LSTM(240, 96, num_layers=1, bidirectional=True, batch_first=True)
            self.final_fc1 = nn.Linear(192, 100)

        def forward(self, x):
            x = self.audio_feature_block(x)
            x = self.lstm1(x)[0]
            x = self.final_fc1(x)  # [B, T, 100]
            cuts = [0, 73, 86, 90, 94, 97, 100]
            return [torch.softmax(x[..., a:b], -1) for a, b in zip(cuts[:-1], cuts[1:])]

    class Ensemble(nn.Module):
        """The five folds, heads averaged as upstream chord_recognition.py does. Input: [1, T, 288] |CQT|."""

        def __init__(self, nets):
            super().__init__()
            self.nets = nn.ModuleList(nets)

        def forward(self, cqt):
            x = cqt[:, :, CROP : CROP + SPEC_DIM]
            outs = [n(x) for n in self.nets]
            return tuple(torch.stack([o[i] for o in outs]).mean(0) for i in range(6))

    nets = []
    for i in range(5):
        sd = torch.load(model_file(f"jiang2019-s{i}"), map_location="cpu", weights_only=False)["net"]
        n = ChordNet()
        n.load_state_dict(sd)
        nets.append(n.eval())
    return Ensemble(nets).eval()


def features(y: np.ndarray) -> np.ndarray:
    import librosa

    c = librosa.hybrid_cqt(y, sr=SR, hop_length=HOP, fmin=librosa.note_to_hz("F#0"), n_bins=288,
                           bins_per_octave=36, tuning=None)
    return np.abs(c).T.astype(np.float32)  # [T, 288]


HEADS = ["triad", "bass", "seventh", "ninth", "eleventh", "thirteenth"]


def chord_table():
    """(names, decomposition array [K, 6]) for CHORDS in 12 transpositions, via the upstream code."""

    sys.path.insert(0, str(ensure_src()))
    np.int = int  # the upstream code predates NumPy 2
    from complex_chord import NUM_TO_ABS_SCALE, Chord, shift_complex_chord_array

    names, arrays, seen = ["N"], [(0, -1, -1, -1, -1, -1)], set()
    for name in CHORDS:
        if name == "N":
            continue
        a = Chord(name).to_numpy()
        if -2 in a:
            print("skip (not representable):", name, file=sys.stderr)
            continue
        q = name.split(":")[1]
        for s in range(12):
            sa = tuple(int(v) for v in shift_complex_chord_array(a, s))
            if sa in seen:
                continue
            seen.add(sa)
            root = NUM_TO_ABS_SCALE[s]
            names.append(f"{root}:{q}")
            arrays.append(sa)
    return names, np.array(arrays, np.int64)


def chord_probs(heads: list[np.ndarray], arrays: np.ndarray) -> np.ndarray:
    """Upstream XHMMDecoder.get_chord_tag_obs, normalised over the dictionary."""

    a = arrays.copy()
    a[:, 1] += 1
    lp = np.log(heads[0][:, a[:, 0]] + 1e-12)
    m = a[:, 1] >= 0
    lp[:, m] += np.log(heads[1][:, a[m, 1]] + 1e-12)
    for i in range(4):
        m = a[:, i + 2] >= 0
        lp[:, m] += np.log(heads[i + 2][:, a[m, i + 2]] + 1e-12)
    lp -= lp.max(1, keepdims=True)
    p = np.exp(lp)
    return (p / p.sum(1, keepdims=True)).astype(np.float32)


def run_torch(cqt: np.ndarray) -> list[np.ndarray]:
    import torch

    net = build_net()
    with torch.no_grad():
        return [h[0].numpy() for h in net(torch.from_numpy(cqt)[None])]


def run_onnx(cqt: np.ndarray, path: Path, threads: int = 1) -> list[np.ndarray]:
    import onnxruntime as ort

    so = ort.SessionOptions()
    so.intra_op_num_threads = threads
    s = ort.InferenceSession(str(path), so, providers=["CPUExecutionProvider"])
    return [h[0] for h in s.run(None, {"cqt": cqt[None]})]


def export(path: Path, audio: str) -> None:
    import onnx
    import torch

    net = build_net()
    path.parent.mkdir(parents=True, exist_ok=True)
    dummy = torch.from_numpy(features(load_audio(audio, SR)[: SR * 20]))[None]
    torch.onnx.export(net, (dummy,), str(path), input_names=["cqt"], output_names=HEADS, opset_version=17,
                      dynamic_axes={"cqt": {1: "frames"}, **{h: {1: "frames"} for h in HEADS}}, dynamo=False)
    m = onnx.load(str(path))
    onnx.checker.check_model(m)
    ops = sorted({n.op_type for n in m.graph.node})
    print(f"exported {path} ({path.stat().st_size} bytes), opset {m.opset_import[0].version}, ops: {' '.join(ops)}")
    cqt = features(load_audio(audio, SR))  # the whole song: another length than the export's
    ref = run_torch(cqt)
    got = run_onnx(cqt, path)
    for h, r, g in zip(HEADS, ref, got):
        print(f"  {h:10s} max |diff| {np.abs(r - g).max():.2e}  argmax equal {np.mean(r.argmax(1) == g.argmax(1)):.4f}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("audio", nargs="?")
    ap.add_argument("out", nargs="?")
    ap.add_argument("--onnx", action="store_true", help="run cache/jiang2019.onnx instead of PyTorch")
    ap.add_argument("--export", metavar="ONNX", help="convert to ONNX and check it against PyTorch")
    ap.add_argument("--check-audio", default=str(HERE.parent.parent / "analyse" / "demo" / "demo-swing.mp3"))
    a = ap.parse_args()
    if a.export:
        export(Path(a.export), a.check_audio)
        return
    y = load_audio(a.audio, SR)
    names, arrays = chord_table()
    with Timer() as t:
        cqt = features(y)
        heads = run_onnx(cqt, CACHE / "jiang2019.onnx") if a.onnx else run_torch(cqt)
    probs = chord_probs(heads, arrays)
    bass = np.concatenate([heads[1][:, 1:], heads[1][:, :1]], 1)  # -> C..B, none
    model = "jiang2019" + ("-onnx" if a.onnx else "")
    extra = {f"head_{h}": v for h, v in zip(HEADS, heads)}
    save(a.out, model=model, probs=probs, labels=np.array(names), hop=HOP / SR, t0=0.0, bass=bass,
         seconds=t.seconds, time_scale=1.0, audio_seconds=len(y) / SR, **extra)
    print(f"{model}: {probs.shape} in {t.seconds:.2f} s (RTF {t.seconds / (len(y) / SR):.3f}) -> {a.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
