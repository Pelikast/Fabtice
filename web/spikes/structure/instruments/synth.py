"""Synthetic lead excerpts for the instrument-recognition bench.

Each excerpt is a short improvised line (swing eighths, rests, a few long
notes) played by one lead instrument, rendered by FluidSynth with the free
GeneralUser GS soundfont, plus an accompaniment (piano comping, walking bass,
ride cymbal) rendered apart. `bench.py` mixes them at several bleed levels and
applies the « vieux disque » chain of the chords bench, to imitate what lands
in the separated track « Autres ».

Usage: python synth.py DATA_DIR [--per 6]
Writes DATA_DIR/synth/<id>_lead.wav, <id>_band.wav and DATA_DIR/synth/index.json.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

import mido
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "accords" / "corpus"))
import render  # noqa: E402  (the chords bench: FluidSynth call, old-record chain)

SOUNDFONT = dict(
    name="GeneralUser GS 2.0.3",
    url="https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/684543d5e5efaef08d02be50dcda8d552478fa60/GeneralUser-GS.sf2",
    sha256="9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe",
)

# truth id, GM program (0-based), MIDI range of a comfortable solo line
LEADS = [
    ("trumpet", 56, 55, 82),
    ("trumpet", 59, 55, 80),  # muted trumpet
    ("trombone", 57, 40, 70),
    ("saxophone", 65, 49, 80),  # alto
    ("saxophone", 66, 44, 75),  # tenor
    ("saxophone", 64, 56, 86),  # soprano
    ("saxophone", 67, 36, 66),  # baritone
    ("clarinet", 71, 52, 86),
    ("flute", 73, 60, 93),
    ("piano", 0, 55, 86),
    ("guitar", 26, 50, 79),
    ("vibraphone", 11, 53, 89),
    ("violin", 40, 55, 93),
    ("organ", 16, 50, 84),
    ("voice", 53, 55, 76),  # « voice oohs »
]

SCALE = np.array([0, 2, 3, 5, 7, 9, 10])  # dorian, with chromatic passing notes added below
TPB = 480
SR = render.SR
DUR = 10.0


def soundfont(data):
    path = data / "soundfont" / "GeneralUser-GS.sf2"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["curl", "-sSfL", "--retry", "3", "-o", str(path), SOUNDFONT["url"]], check=True)
    import hashlib
    h = hashlib.sha256(path.read_bytes()).hexdigest()
    assert h == SOUNDFONT["sha256"], f"soundfont SHA-256 mismatch: {h}"
    return path


def line(rng, lo, hi, beats):
    """A jazz-like line: (start beat, duration in beats, pitch, velocity)."""
    root = int(rng.integers(0, 12))
    pitches = [p for p in range(lo, hi + 1) if (p - root) % 12 in SCALE]
    cur = int(rng.integers(len(pitches) // 3, 2 * len(pitches) // 3))
    notes, t = [], 0.0
    while t < beats - 1:
        r = rng.random()
        if r < 0.12:  # rest
            t += float(rng.choice([0.5, 1.0, 2.0]))
            continue
        dur = float(rng.choice([0.5, 0.5, 0.5, 0.5, 1.0, 1.5, 2.0]))
        step = int(rng.choice([-2, -1, -1, 1, 1, 2, 3, -3, 4, -4]))
        cur = int(np.clip(cur + step, 0, len(pitches) - 1))
        p = pitches[cur]
        if rng.random() < 0.1 and p + 1 <= hi:
            p += 1  # chromatic passing note
        vel = int(np.clip(rng.normal(90, 14), 50, 125))
        notes.append((t, min(dur, beats - t) * 0.95, p, vel))
        t += dur
    return notes


def band(rng, beats):
    """Accompaniment: piano comping, walking bass, ride (program, channel, notes)."""
    root = 48 + int(rng.integers(0, 12))
    prog = [(2, 'm7'), (7, '7'), (0, 'maj7'), (0, 'maj7')]  # ii V I I, a bar each
    shapes = {'m7': [3, 7, 10, 14], '7': [4, 10, 14, 16], 'maj7': [4, 7, 11, 14]}
    piano, bass, ride = [], [], []
    for b in range(int(beats // 4)):
        deg, q = prog[b % 4]
        r = root + deg
        for hit in sorted(rng.choice([0, 1.5, 2, 3, 3.5], size=2, replace=False)):
            dur = 0.4 if hit % 1 else 0.9
            for iv in shapes[q]:
                piano.append((4 * b + hit, dur, r + 12 + iv - 12 * (iv > 12), int(rng.integers(55, 80))))
        for k in range(4):
            note = r - 12 + [0, 4 if q != 'm7' else 3, 7, 10 if k == 3 else 9][k]
            bass.append((4 * b + k, 0.9, int(note), int(rng.integers(80, 100))))
        for k in range(4):
            ride.append((4 * b + k, 0.3, 51, 80))
            if k % 2:
                ride.append((4 * b + k + 2 / 3, 0.2, 51, 60))
                ride.append((4 * b + k, 0.1, 44, 70))
    return [(0, 0, piano), (32, 1, bass), (0, 9, ride)]


def write_midi(path, bpm, tracks, swing):
    mid = mido.MidiFile(type=1, ticks_per_beat=TPB)
    meta = mido.MidiTrack()
    meta.append(mido.MetaMessage("set_tempo", tempo=int(60e6 / bpm), time=0))
    mid.tracks.append(meta)
    for prog, ch, notes in tracks:
        tr = mido.MidiTrack()
        ev = [(0, mido.Message("program_change", channel=ch, program=prog)),
              (0, mido.Message("control_change", channel=ch, control=91, value=40)),
              (0, mido.Message("control_change", channel=ch, control=7, value=100))]
        for s, d, p, v in notes:
            if abs(s - np.floor(s) - 0.5) < 1e-6:
                s = np.floor(s) + swing
            a = int(round(s * TPB))
            ev.append((a, mido.Message("note_on", channel=ch, note=int(p), velocity=int(v))))
            ev.append((a + max(10, int(round(d * TPB))), mido.Message("note_off", channel=ch, note=int(p), velocity=0)))
        ev.sort(key=lambda e: (e[0], 0 if e[1].type == "note_off" else 1))
        last = 0
        for t, m in ev:
            tr.append(m.copy(time=t - last))
            last = t
        mid.tracks.append(tr)
    mid.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("data", type=Path)
    ap.add_argument("--per", type=int, default=6, help="excerpts per lead sound")
    args = ap.parse_args()
    sf2 = soundfont(args.data)
    out = args.data / "synth"
    out.mkdir(parents=True, exist_ok=True)
    index = []
    for li, (truth, program, lo, hi) in enumerate(LEADS):
        for k in range(args.per):
            seed = 1000 * li + k
            rng = np.random.default_rng(seed)
            bpm = float(rng.uniform(90, 220))
            beats = DUR * bpm / 60
            swing = render.swing_ratio(bpm)
            eid = f"{truth}-{program}-{k}"
            ch = 0 if program != 0 else 2  # keep the lead off the band's channels
            for name, tracks in (("lead", [(program, ch, line(rng, lo, hi, beats))]), ("band", band(rng, beats))):
                mid = out / f"{eid}_{name}.mid"
                wav = out / f"{eid}_{name}.wav"
                write_midi(mid, bpm, tracks, swing)
                render.fluidsynth(mid, wav, sf2, room=0.5)
                mid.unlink()
            index.append(dict(id=eid, truth=truth, program=program, bpm=round(bpm, 1), seed=seed))
            print(eid, flush=True)
    (out / "index.json").write_text(json.dumps(index, indent=1))


if __name__ == "__main__":
    main()
