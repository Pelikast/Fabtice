# Altered versions of the demo piece (web/spikes/analyse/demo/demo-swing.mp3,
# synthetic, CC0), on which the REAL beat network fails the way the owner saw
# on an old record: a passage where the rhythm section is almost gone (a
# muffled band, a wind line at another rate), the whole piece coloured like an
# old record (band-limited, hiss, crackle). The beat truth stays the demo's.
#
#   python3 make_audio.py <demo-swing.mp3> <out dir>
#
# then `node run_network.mjs` (same folder) turns the files into the fixture
# the unit tests read. Needs numpy and ffmpeg.

import subprocess
import sys

import numpy as np

SR = 48000
PERIOD = 0.4456  # the demo's median beat interval (s)

# name: (start, end, level of what remains of the band in dB, a muffled copy of the band (400 Hz low-pass) under it,
#        wind line notes per beat or None)
CASES = {
    'gap-14.3-19.7': (14.3, 19.7, -30, False, None),
    'silence-14.3-19.7': (14.33, 19.73, -40, False, None),
    'wind-8.8-14.3': (8.79, 14.33, -24, True, 2 / 3),
    'wind-21.5-26.9': (21.49, 26.85, -24, True, 3 / 4),
    'muffled-8.8-12.5': (8.79, 12.49, -30, True, None),
}


def load(src):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def save(fn, z):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f64le', '-ar', str(SR), '-ac', '1', '-i', '-', fn], input=z.astype(np.float64).tobytes(), check=True)


def lowpass(sig, fc):
    """One-pole low-pass, applied in the frequency domain."""
    a = np.exp(-2 * np.pi * fc / SR)
    f = np.fft.rfftfreq(len(sig), 1 / SR)
    return np.fft.irfft(np.fft.rfft(sig) * (1 - a) / (1 - a * np.exp(-2j * np.pi * f / SR)), len(sig))


def band(sig, lo, hi):
    f = np.fft.rfftfreq(len(sig), 1 / SR)
    g = (1 / (1 + (lo / np.maximum(f, 1e-3)) ** 4)) * (1 / (1 + (f / hi) ** 4))
    return np.fft.irfft(np.fft.rfft(sig) * g, len(sig))


def old_record(sig, seed=1, snr_db=18):
    rng = np.random.default_rng(seed)
    y = band(sig, 250, 3500)
    rms = np.sqrt(np.mean(y ** 2))
    noise = band(rng.standard_normal(len(y)), 200, 6000)
    noise *= rms / np.sqrt(np.mean(noise ** 2)) * 10 ** (-snr_db / 20)
    crackle = np.zeros(len(y))
    idx = rng.integers(0, len(y), int(len(y) / SR * 30))
    crackle[idx] = rng.standard_normal(len(idx)) * rms * 4
    return y + noise + crackle


def wind_line(n, start, end, rate, seed=2):
    """A reed-like line (sawtooth with vibrato), `rate` notes per beat, accented attacks."""
    rng = np.random.default_rng(seed)
    t = np.arange(n) / SR
    y = np.zeros(n)
    note = PERIOD / rate
    k, tt = 0, start
    while tt < end:
        f0 = 220 * 2 ** (rng.integers(0, 12) / 12)
        i0, i1 = int(tt * SR), min(n, int((tt + note) * SR))
        tl = t[i0:i1] - tt
        ph = 2 * np.pi * np.cumsum(f0 * (1 + 0.006 * np.sin(2 * np.pi * 5.5 * tl))) / SR
        saw = sum(np.sin(h * ph) / h for h in range(1, 12))
        y[i0:i1] += saw * np.minimum(1, tl / 0.012) * np.exp(-tl / (note * 2.5)) * (1.0 if k % 2 == 0 else 0.7)
        tt += note
        k += 1
    return y


def passage(x, s, e, keep_db, muffled, rate):
    i0, i1 = int(s * SR), int(e * SR)
    fade = int(0.05 * SR)
    g = np.ones(len(x))
    ramp = np.linspace(1, 10 ** (keep_db / 20), fade)
    g[i0:i0 + fade] = ramp
    g[i0 + fade:i1 - fade] = 10 ** (keep_db / 20)
    g[i1 - fade:i1] = ramp[::-1]
    y = x * g + (lowpass(x, 400) * (1 - g) * 0.6 if muffled else 0)
    if rate:
        w = wind_line(len(y), s, e, rate)
        y += w * np.sqrt(np.mean(x ** 2)) / np.sqrt(np.mean(w[i0:i1] ** 2)) * 10 ** (-2 / 20)
    return y


def main():
    src, out = sys.argv[1], sys.argv[2]
    x = load(src)
    z = old_record(x)
    save(f'{out}/old.wav', z / np.max(np.abs(z)) * 0.9)
    for name, (s, e, keep_db, muffled, rate) in CASES.items():
        z = old_record(passage(x, s, e, keep_db, muffled, rate))
        save(f'{out}/{name}.wav', z / np.max(np.abs(z)) * 0.9)
        print(name)


if __name__ == '__main__':
    main()
