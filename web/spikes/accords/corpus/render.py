"""MIDI files per stem, FluidSynth rendering, mix, and the « old record » sound."""

import subprocess
from pathlib import Path

import mido
import numpy as np
import soundfile as sf
from scipy import signal

SR = 44100
TPB = 480
LEAD_IN = 0.3  # seconds of silence before the first downbeat


def swing_ratio(bpm):
    return float(np.clip(0.66 - (bpm - 120) * (0.08 / 120), 0.56, 0.68))


def write_midi(path, parts, beat_durs, swing, cents, rng):
    """One MIDI file for the parts of a stem, on the common tempo map."""
    mid = mido.MidiFile(type=1, ticks_per_beat=TPB)
    tempo = mido.MidiTrack()
    mid.tracks.append(tempo)
    for i, d in enumerate(beat_durs):
        tempo.append(mido.MetaMessage("set_tempo", tempo=int(round(d * 1e6)), time=0 if i == 0 else TPB))
    chans = [c for c in range(16) if c != 9]
    k = 0
    for part in parts:
        ch = 9 if part.drums else chans[k % len(chans)]
        if not part.drums:
            k += 1
        tr = mido.MidiTrack()
        mid.tracks.append(tr)
        ev = [(0, mido.Message("program_change", channel=ch, program=part.program))]
        ev.append((0, mido.Message("control_change", channel=ch, control=10, value=int(part.pan))))
        ev.append((0, mido.Message("control_change", channel=ch, control=91, value=int(part.reverb))))
        ev.append((0, mido.Message("control_change", channel=ch, control=93, value=0)))
        ev.append((0, mido.Message("control_change", channel=ch, control=7, value=100)))
        if not part.drums and cents:
            # bend range stays at the default 2 semitones
            bend = int(round(8192 * cents / 200.0))
            ev.append((0, mido.Message("pitchwheel", channel=ch, pitch=int(np.clip(bend, -8192, 8191)))))
        for start, dur, pitch, vel in part.notes:
            s = start
            if swing and not part.straight:
                f = s - np.floor(s)
                if abs(f - 0.5) < 1e-6:
                    s = np.floor(s) + swing
            beat = int(np.clip(np.floor(s), 0, len(beat_durs) - 1))
            jitter = rng.normal(0, 0.008) / beat_durs[beat]
            if part.drums:
                jitter *= 0.6
            a = max(0, int(round((s + jitter) * TPB)))
            b = max(a + 10, int(round((s + jitter + dur) * TPB)))
            ev.append((a, mido.Message("note_on", channel=ch, note=pitch, velocity=vel)))
            ev.append((b, mido.Message("note_off", channel=ch, note=pitch, velocity=0)))
        ev.sort(key=lambda e: (e[0], 0 if e[1].type == "note_off" else 1))
        last = 0
        for t, msg in ev:
            tr.append(msg.copy(time=t - last))
            last = t
    mid.save(path)


def fluidsynth(midi_path, wav_path, soundfont, room=0.5):
    subprocess.run([
        "fluidsynth", "-ni", "-q", "-r", str(SR), "-g", "0.6", "-T", "wav", "-O", "float",
        "-o", "synth.reverb.active=1", "-o", f"synth.reverb.room-size={room}",
        "-o", "synth.reverb.level=0.6", "-o", "synth.chorus.active=0", "-o", "synth.cpu-cores=1",
        "-F", str(wav_path), str(soundfont), str(midi_path),
    ], check=True, stdout=subprocess.DEVNULL)


def load(path, n=None):
    x, sr = sf.read(path, dtype="float32", always_2d=True)
    assert sr == SR
    if n is not None:
        if len(x) < n:
            x = np.vstack([x, np.zeros((n - len(x), x.shape[1]), np.float32)])
        x = x[:n]
    return x


def active_db(x, floor=-45.0):
    """Loudness of the parts where the stem plays (50 ms frames above `floor` dB of its peak frame)."""
    m = x.mean(axis=1) if x.ndim == 2 else x
    f = int(0.05 * SR)
    k = len(m) // f
    if k == 0:
        return -120.0
    e = np.sqrt(np.mean(m[: k * f].reshape(k, f) ** 2, axis=1)) + 1e-12
    edb = 20 * np.log10(e)
    act = edb > edb.max() + floor
    return float(20 * np.log10(np.sqrt(np.mean(e[act] ** 2))))


def db(x):
    return 10 ** (x / 20)


# --------------------------------------------------------------- old record

def butter(x, kind, f, order=4):
    sos = signal.butter(order, f, btype=kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x).astype(np.float32)


def peaking(x, f0, gain_db, q):
    a = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    al = np.sin(w) / (2 * q)
    b = [1 + al * a, -2 * np.cos(w), 1 - al * a]
    aa = [1 + al / a, -2 * np.cos(w), 1 - al / a]
    return signal.lfilter(b, aa, x).astype(np.float32)


OLD_DEFAULTS = dict(lo=150.0, hi=4800.0, speed_cents=25.0, wow=0.0025, wow_hz=0.55, flutter=0.0008,
                    flutter_hz=6.5, room=0.3, drive=2.2, hiss_db=-34.0, crackle=9.0, pops=0.4)
"""Old-record knobs:
  lo, hi        pass band in Hz (records and early microphones: about 150-5000 Hz)
  speed_cents   the record turns a little fast or slow: pitch AND tempo change (truth times are rescaled)
  wow, wow_hz   slow speed wobble (fraction, rate)
  flutter       fast speed wobble
  room          share of a dull, short room echo that blends the instruments together
  drive         saturation of the cutting chain (1 = clean, 3 = strong)
  hiss_db       surface hiss, relative to the music's level
  crackle, pops clicks and pops per second
"""


MAX_DETUNE = 35.0
"""Largest total detune (piece tuning + record speed), in cents. Beyond about 50
cents the music is heard a semitone away and every chord is « wrong » by a
semitone: that is a transposition, not a chord error, so the bench avoids it."""


def old_settings(rng, strength, cents=0.0):
    """Per-piece old-record settings: `strength` 0 (mild) .. 1 (strong); `cents`: the piece's own tuning."""
    s = dict(OLD_DEFAULTS)
    s["lo"] = 120 + 80 * strength + rng.uniform(-15, 15)
    s["hi"] = 5600 - 1800 * strength + rng.uniform(-200, 200)
    s["speed_cents"] = float(rng.choice([-1, 1]) * rng.uniform(10, 45))
    s["wow"] = 0.0012 + 0.0025 * strength
    s["flutter"] = 0.0004 + 0.0008 * strength
    s["room"] = 0.2 + 0.25 * strength
    s["drive"] = 1.5 + 1.5 * strength
    s["hiss_db"] = -40 + 10 * strength
    s["crackle"] = 4 + 10 * strength
    s["pops"] = 0.2 + 0.6 * strength
    s["strength"] = strength
    sp = s["speed_cents"]
    if abs(cents + sp) > MAX_DETUNE:
        sp = -sp
    if abs(cents + sp) > MAX_DETUNE:
        sp = float(np.sign(cents + sp) * MAX_DETUNE - cents)
    s["speed_cents"] = sp
    return s


def old_linear(mono, s, seed):
    """The linear part of the old-record chain (speed, wow and flutter, room, band pass).
    The same seed gives the same wobble and room for the mix and for each stem.
    Returns (y, time_scale) with time_scale = new time / old time."""
    rng = np.random.default_rng(seed)
    x = mono.astype(np.float64)
    n = len(x)
    ratio = 2 ** (s["speed_cents"] / 1200)  # > 1: plays fast
    m = int(n / ratio)
    t_out = np.arange(m) / SR
    ph1, ph2 = rng.uniform(0, 2 * np.pi, 2)
    wobble = (s["wow"] / (2 * np.pi * s["wow_hz"])) * np.sin(2 * np.pi * s["wow_hz"] * t_out + ph1) \
        + (s["flutter"] / (2 * np.pi * s["flutter_hz"])) * np.sin(2 * np.pi * s["flutter_hz"] * t_out + ph2)
    pos = (t_out + wobble) * ratio * SR
    y = np.interp(pos, np.arange(n), x, left=0, right=0)
    # dull short room: decaying noise, low-passed
    L = int(0.45 * SR)
    ir = rng.standard_normal(L) * np.exp(-np.arange(L) / (0.09 * SR))
    ir = butter(ir, "low", 2500, 2).astype(np.float64)
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-12
    wet = signal.fftconvolve(y, ir)[:m]
    y = (1 - s["room"]) * y + s["room"] * wet * 3.0
    # the horn and the cutting chain: band pass and resonances
    y = butter(y, "high", s["lo"], 4)
    y = butter(y, "low", s["hi"], 4)
    y = peaking(y, 2300, 4.0, 1.2)
    y = peaking(y, 700, 2.0, 0.9)
    return y.astype(np.float64), 1 / ratio


def old_finish(y, s, seed):
    """Saturation and surface noise, on the mix only. Returns (out, gain applied before saturation)."""
    rng = np.random.default_rng(seed + 7)
    m = len(y)
    t_out = np.arange(m) / SR
    g = 0.9 / (np.max(np.abs(y)) + 1e-9)
    y = y * g
    d = s["drive"]
    y = np.tanh(d * y) / np.tanh(d)
    rms = np.sqrt(np.mean(y ** 2)) + 1e-9
    hiss = rng.standard_normal(m)
    hiss = butter(hiss, "high", 300, 2)
    hiss = butter(hiss, "low", min(8000, s["hi"] + 1500), 2)
    rot = 1 + 0.4 * np.sin(2 * np.pi * (78 / 60) * t_out + rng.uniform(0, 6.28))  # 78 rpm
    hiss = hiss / (np.std(hiss) + 1e-9) * rms * db(s["hiss_db"]) * rot
    clicks = np.zeros(m)
    k = rng.poisson(s["crackle"] * m / SR)
    idx = rng.integers(0, m, k)
    clicks[idx] = rng.pareto(3.0, k) * rms * 0.6 * rng.choice([-1, 1], k)
    k2 = rng.poisson(s["pops"] * m / SR)
    idx2 = rng.integers(0, m, k2)
    clicks[idx2] += rng.uniform(1.5, 4.0, k2) * rms * rng.choice([-1, 1], k2)
    dec = np.exp(-np.arange(int(0.003 * SR)) / (0.0006 * SR))
    clicks = np.convolve(clicks, dec)[:m]
    clicks = butter(clicks, "low", 6000, 2)
    y = y + hiss + clicks
    y = butter(y, "high", 60, 2)
    return y.astype(np.float32), g
