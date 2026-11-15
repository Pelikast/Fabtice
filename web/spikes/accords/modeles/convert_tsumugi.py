"""Convert the Tsumugi-Chords chord model to ONNX (one fixed 30 s window) and check it
against the original PyTorch model.

    python convert_tsumugi.py cache/tsumugi-chords.onnx

The only change to the network is how its constant-Q front end is computed: the original
takes torch.stft of each octave and multiplies the one-sided spectrum by the FFT of the CQT
atoms (complex tensors, which ONNX export does not handle). That product is a fixed linear
map of each windowed frame, so it is rewritten exactly as a strided Conv1d whose real and
imaginary kernels are window * irfft-like transform of the atoms' spectra. Everything else
(stem, axis Transformers, chord reader) is exported as is.

Graph inputs (batch 1, a 30 s window of the song; the runner keeps the middle 20 s):
  wave  [1, 2, 768000]  stereo at 25.6 kHz
  beats [1, 750, 11]    beat features at 25 Hz (note_chords.beat_features)
  keys  [1, 750, 25]    key features at 25 Hz (note_chords.key_features)
Outputs (25 Hz, 750 frames): detail [1, 750, 745] softmax, bass [1, 750, 13] softmax,
root [1, 750, 13] softmax, tones [1, 750, 12] sigmoid, boundary [1, 750] sigmoid.
"""

from __future__ import annotations

import math
import sys
import time
from pathlib import Path

import numpy as np

from common import load_audio, model_file
from run_tsumugi import ensure_src, read_info

WINDOW_S, FRAME_RATE = 30, 25


def patch_frontend(front) -> None:
    """Replace NoteFrontend.forward by an exact real-valued version (no complex tensors).

    The CQT of each octave becomes a strided Conv1d (real and imaginary kernels); the
    phase difference |angle(a * conj(b))| is written with Atan and Where (ONNX has no Atan2);
    the stereo cues use the real and imaginary parts explicitly."""

    import torch
    import torch.nn.functional as F

    cqt, h, c = front.hcqt.cqt, front.hcqt, front.config
    for i, size in enumerate(cqt.fft_sizes):
        K = getattr(cqt, f"kernel_{i}")  # [bins, size//2+1] complex: one-sided FFT of the atoms
        w = getattr(cqt, f"window_{i}")  # [size]
        # out[b] = sum_k rfft(w * frame)[k] K[b, k] = sum_n frame[n] w[n] sum_k K[b, k] e^{-2 pi i k n / size}
        n = torch.arange(size, dtype=torch.float64)
        k = torch.arange(size // 2 + 1, dtype=torch.float64)
        e = torch.exp(-2j * math.pi * k[:, None] * n[None] / size)  # [K, N]
        g = (K.to(torch.complex128) @ e) * w.to(torch.float64)[None]  # [bins, N]
        cqt.register_buffer(f"conv_{i}", torch.cat([g.real, g.imag], 0).float()[:, None, :], persistent=False)

    def fit(x, frames):
        return F.pad(x, (0, max(0, frames - x.shape[-1])))[..., :frames]

    def complex_cqt(x):  # [N, samples] -> (re, im) [N, actual bins, frames], low bins first
        frames = math.ceil(x.shape[-1] / cqt.hop)
        re, im = [], []
        for i, size in enumerate(cqt.fft_sizes):
            xp = F.pad(x[:, None], (size // 2, size // 2), mode="reflect")
            y = F.conv1d(xp, getattr(cqt, f"conv_{i}"), stride=cqt.hop // 2**i)
            bins = y.shape[1] // 2
            re.append(fit(y[:, :bins], frames))
            im.append(fit(y[:, bins:], frames))
            if i < cqt.octaves - 1:
                x = F.conv1d(x[:, None], cqt.fir, stride=2, padding=cqt.fir.shape[-1] // 2)[:, 0]
        return torch.cat(re[::-1], 1), torch.cat(im[::-1], 1)

    def forward(wave):
        batch = wave.shape[0]
        zr, zi = complex_cqt(wave.float().flatten(0, 1))
        mag = torch.sqrt(zr * zr + zi * zi)
        large = F.pad(mag, (0, 0, 0, h.large - h.actual))
        spec = large[:, h.lower] + h.alpha * (large[:, h.upper] - large[:, h.lower])
        parts = [h.normalise(spec.unflatten(0, (batch, c.channels)).flatten(1, 2), None)]
        fr, fi = zr[:, : c.bins], zi[:, : c.bins]
        if c.phase:  # |angle(f[t] * conj(f[t-1]))| * |f[t]|
            ar, ai = fr[..., 1:], fi[..., 1:]
            br, bi = fr[..., :-1], fi[..., :-1]
            pr = ar * br + ai * bi
            pi_ = ai * br - ar * bi
            base = torch.atan(pi_.abs() / pr.abs().clamp_min(1e-30))
            dphi = torch.where(pr >= 0, base, math.pi - base)
            sal = F.pad(dphi * mag[:, : c.bins, 1:], (1, 0))
            parts.append(h.normalise(sal.unflatten(0, (batch, c.channels)), None))
        if c.stereo:
            lr_r, lr_i = fr.unflatten(0, (batch, c.channels)), fi.unflatten(0, (batch, c.channels))
            lr_, li = lr_r[:, 0], lr_i[:, 0]
            rr, ri = lr_r[:, 1], lr_i[:, 1]
            cr = lr_ * rr + li * ri  # left * conj(right)
            ci = li * rr - lr_ * ri
            energy = torch.sqrt(cr * cr + ci * ci)
            weight = torch.log1p(energy / energy.mean(dim=(1, 2), keepdim=True).clamp_min(1e-12)).clamp(max=4.0) / 4.0
            ur, ui = cr / energy.clamp_min(1e-12), ci / energy.clamp_min(1e-12)
            al, ar_ = torch.sqrt(lr_ * lr_ + li * li), torch.sqrt(rr * rr + ri * ri)
            floor = 1e-2 * (al + ar_).mean(dim=(1, 2), keepdim=True).clamp_min(1e-12)
            ild = (torch.log((al + floor) / (ar_ + floor)).clamp(-3.0, 3.0) / 3.0) * (weight > 0).float()
            cues = torch.stack((ui * weight, ur * weight, ild), 1)
            parts.append(cues.transpose(-1, -2).contiguous())
        return torch.cat(parts, 1)

    front.forward = forward


def wrapper(net):
    import torch

    class Wrap(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.net = net

        def forward(self, wave, beats, keys):
            o = self.net(wave, beats, keys)
            return (torch.softmax(o["detail"], -1), torch.softmax(o["bass"], -1), torch.softmax(o["root"], -1),
                    torch.sigmoid(o["tones"]), torch.sigmoid(o["chord_boundary"]).flatten(1))

    return Wrap().eval()


def main(out: str, audio: str | None = None, info_path: str | None = None) -> None:
    import onnx
    import onnxruntime as ort
    import torch

    ensure_src()
    from tsumugi_chords.axis import RATE
    from tsumugi_chords.note_chords import beat_features, key_features, load_note_chords

    here = Path(__file__).resolve().parent
    audio = audio or str(here.parent.parent / "analyse" / "demo" / "demo-swing.mp3")
    info_path = info_path or str(here.parent.parent / "analyse" / "demo" / "demo-swing.json")
    wave = load_audio(audio, RATE, channels=2)
    n = WINDOW_S * RATE
    wave = np.pad(wave, ((0, 0), (0, max(0, n - wave.shape[1]))))[:, :n]
    info = read_info(info_path, wave.shape[1] / RATE)
    frames = WINDOW_S * FRAME_RATE
    beats = beat_features(info["beats"], info["downbeats"], 0.0, frames)[None]
    keys = key_features(info["keys"], 0.0, frames)[None]
    inputs = (torch.from_numpy(wave[None].copy()), torch.from_numpy(beats), torch.from_numpy(keys))

    ref_net = wrapper(load_note_chords(model_file("tsumugi-model"), "cpu"))
    with torch.no_grad():
        ref = [r.numpy() for r in ref_net(*inputs)]
    net = load_note_chords(model_file("tsumugi-model"), "cpu")
    patch_frontend(net.notes.frontend)
    w = wrapper(net)
    with torch.no_grad():
        pat = [r.numpy() for r in w(*inputs)]
    names = ["detail", "bass", "root", "tones", "boundary"]
    for nm, r, p in zip(names, ref, pat):
        print(f"patched torch vs original  {nm:9s} max |diff| {np.abs(r - p).max():.2e}")
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(w, inputs, out, input_names=["wave", "beats", "keys"], output_names=names, opset_version=17,
                      dynamo=False, do_constant_folding=True)
    m = onnx.load(out)
    onnx.checker.check_model(m)
    ops = sorted({nd.op_type for nd in m.graph.node})
    print(f"exported {out}: {Path(out).stat().st_size} bytes, opset {m.opset_import[0].version}, ops: {' '.join(ops)}")
    so = ort.SessionOptions()
    so.intra_op_num_threads = 1
    s = ort.InferenceSession(out, so, providers=["CPUExecutionProvider"])
    t = time.perf_counter()
    got = s.run(None, {"wave": inputs[0].numpy(), "beats": beats, "keys": keys})
    dt = time.perf_counter() - t
    for nm, r, g in zip(names, ref, got):
        extra = f"  argmax equal {np.mean(r[0].argmax(-1) == g[0].argmax(-1)):.4f}" if r.ndim == 3 else ""
        print(f"onnx vs original torch     {nm:9s} max |diff| {np.abs(r - g).max():.2e}{extra}")
    print(f"one 30 s window, 1 thread: {dt:.1f} s")


if __name__ == "__main__":
    main(*sys.argv[1:])
