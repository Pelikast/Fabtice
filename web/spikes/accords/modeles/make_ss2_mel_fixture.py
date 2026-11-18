"""Writes app/src/analysis/engine/fixtures/sheetsage2-mel.json: MERT-v2's own front end
(torchaudio Spectrogram + MelScale + AmplitudeToDB, as modeling_mert2.MERT2MelFrontend) on a
0.5 s test signal, with mean 0 and deviation 1 (the checkpoint's normalisation is not copied),
for sheetsage2Mel.test.ts.

    python make_ss2_mel_fixture.py
"""
import json
import math
from pathlib import Path

import torch
import torchaudio

OUT = Path(__file__).resolve().parents[4] / "app" / "src" / "analysis" / "engine" / "fixtures" / "sheetsage2-mel.json"
n = 12000
x = torch.tensor([0.3 * math.sin(i * 0.0731) + 0.2 * math.sin(i * 0.4113) + 0.05 * math.sin(i * 1.9) for i in range(n)], dtype=torch.float32)
spec = torchaudio.transforms.Spectrogram(n_fft=2048, win_length=2048, hop_length=240, power=2.0)(x)
mel = torchaudio.transforms.AmplitudeToDB(stype="power", top_db=None)(torchaudio.transforms.MelScale(n_mels=128, sample_rate=24000, n_stft=1025)(spec))
mel = mel[..., :-1].transpose(-1, -2)
OUT.write_text(json.dumps({"frames": mel.shape[0], "mel": [round(float(v), 3) for v in mel.flatten()]}))
print(OUT, tuple(mel.shape))
