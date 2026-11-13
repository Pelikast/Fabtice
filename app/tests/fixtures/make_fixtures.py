#!/usr/bin/env python3
"""Regenerates the small audio fixtures of tests/import.mjs.

    python3 -m venv /tmp/fx && /tmp/fx/bin/pip install soundfile numpy
    /tmp/fx/bin/python app/tests/fixtures/make_fixtures.py

Everything is synthetic (a 440 Hz tone with a soft attack and release, plus a
fifth above it at a lower level), so the files carry no rights and the
waveform is easy to recognise. Made with soundfile 0.14 (libsndfile 1.2.2):

    tone.wav    mono,   11025 Hz, 16-bit PCM, 1.5 s   (resampled by the browser)
    tone.aiff   mono,   44100 Hz, 16-bit PCM, 1.0 s   (written by hand below: the
                                                       app reads AIFF itself)
    tone.flac   stereo, 44100 Hz, 16-bit,      1.5 s   (right channel a fifth up)
    tone.mp3    mono,   44100 Hz, MPEG layer III, 1.5 s (libmp3lame through libsndfile)

The m4a fixture is not made here: tests use desktop/test/fixtures/tone-dash.m4a
(4 s, stereo AAC, fragmented MP4, as the Mac app's extraction returns them).
"""

import struct
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

OUT = Path(__file__).resolve().parent


def tone(rate: int, seconds: float, frequency: float = 440.0) -> np.ndarray:
    t = np.arange(int(round(rate * seconds))) / rate
    envelope = np.minimum(1.0, np.minimum(t / 0.05, (seconds - t) / 0.1))
    signal = 0.5 * np.sin(2 * np.pi * frequency * t) + 0.2 * np.sin(2 * np.pi * frequency * 1.5 * t)
    return (0.8 * envelope * signal).astype(np.float64)


def extended80(value: int) -> bytes:
    """80-bit IEEE extended float of a positive integer (the AIFF sample rate)."""
    exponent = value.bit_length() - 1
    mantissa = value << (63 - exponent)
    return struct.pack(">HQ", 16383 + exponent, mantissa)


def write_aiff(path: Path, samples: np.ndarray, rate: int) -> None:
    """Mono 16-bit big-endian AIFF."""
    pcm = np.clip(np.round(samples * 32767), -32768, 32767).astype(">i2").tobytes()
    comm = struct.pack(">hIh", 1, len(samples), 16) + extended80(rate)
    ssnd = struct.pack(">II", 0, 0) + pcm
    body = b"AIFF" + b"COMM" + struct.pack(">I", len(comm)) + comm + b"SSND" + struct.pack(">I", len(ssnd)) + ssnd
    path.write_bytes(b"FORM" + struct.pack(">I", len(body)) + body)


def main() -> int:
    sf.write(OUT / "tone.wav", tone(11025, 1.5), 11025, subtype="PCM_16", format="WAV")
    write_aiff(OUT / "tone.aiff", tone(44100, 1.0), 44100)
    left = tone(44100, 1.5)
    right = tone(44100, 1.5, 660.0)
    sf.write(OUT / "tone.flac", np.stack([left, right], axis=1), 44100, subtype="PCM_16", format="FLAC")
    sf.write(OUT / "tone.mp3", tone(44100, 1.5), 44100, format="MP3", subtype="MPEG_LAYER_III")
    for name in ("tone.wav", "tone.aiff", "tone.flac", "tone.mp3"):
        print(f"{name}: {(OUT / name).stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
