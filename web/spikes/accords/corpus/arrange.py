"""From a chart to the notes of every instrument, grouped by stem.

Times are in beats from the start of the piece (beat 0 = first downbeat);
the tempo map turns them into seconds (see midi.py). All randomness comes from
one numpy Generator seeded per piece: the same seed gives the same notes.

Difficulty knobs (piece["knobs"], defaults in KNOBS) -- what each one does:

  lead_db     level of the melody / solo instrument above the band, in dB. A
              loud melody playing tensions is what fools a chord detector most.
  tension     probability that a long melody note, or a comping voicing, uses
              a tension (9, 11, 13, b9...) instead of a plain chord tone.
  variation   probability, from the second chorus on, of a reharmonisation
              that ALL instruments play (tritone substitute, added ii, passing
              diminished, maj7 <-> 6): the truth follows it. Repeats are
              therefore close but not identical.
  drift       slow tempo wander, as a fraction (0.02 = about +/-2 %).
  accel       overall tempo change from start to end (0.03 = 3 % faster).
  bass_busy   how often the walking bass starts a chord on its 3rd or 5th
              instead of the root, and uses chromatic approach notes.
  anticip     probability that the comping plays the next chord an eighth
              early (on the "and" of the last beat), as pianists do.
  pedal       probability that a bar is played over a tonic pedal (role
              "pedal"); the truth then has a bass note (slash chord).
  minor       the piece is in a minor key (choice of altered tensions).
  cents       tuning away from A = 440 Hz (all pitched instruments).
"""

import numpy as np

from harmony import Chord, available_tensions, chord_scale

KNOBS = dict(lead_db=2.0, tension=0.35, variation=0.25, drift=0.01, accel=0.0, bass_busy=0.25,
             anticip=0.25, pedal=0.3, minor=False, cents=0.0)

# General MIDI programs (0-based) and registers.
INSTR = {
    "piano": (0, 48, 79), "epiano": (4, 48, 79), "vibes": (11, 53, 89), "organ": (17, 48, 84),
    "nylon": (24, 45, 76), "jazzgtr": (26, 40, 76), "banjo": (105, 48, 79),
    "acbass": (32, 28, 55), "tuba": (58, 28, 53),
    "trumpet": (56, 55, 82), "mutedtrumpet": (59, 55, 82), "trombone": (57, 40, 70),
    "alto": (65, 51, 80), "tenor": (66, 44, 75), "clarinet": (71, 52, 86), "flute": (73, 60, 93),
    "choir": (52, 48, 76), "voice": (53, 48, 77),
}


# ------------------------------------------------------------------ the form

class Bar:
    __slots__ = ("index", "start", "beats", "chords", "section", "chorus", "pedal", "pos", "occurrence")

    def __init__(self, index, start, beats, chords, section, chorus, pos=0, occurrence=0):
        self.index = index
        self.start = start
        self.beats = beats
        self.chords = chords  # [(beat 1-based, Chord)]
        self.section = section
        self.chorus = chorus
        self.pedal = None
        self.pos = pos  # bar index inside its section
        self.occurrence = occurrence  # which section of the chorus (0, 1, 2...)

    def chord_at(self, beat):
        """Chord sounding at beat (1-based, may be fractional)."""
        cur = self.chords[0][1]
        for b, c in self.chords:
            if b <= beat + 1e-9:
                cur = c
        return cur


def _is_dom(c):
    return c.quality in ("7", "aug7")


def expand_form(piece, parse_chart, rng, knobs, tonic=None):
    """All bars of all choruses, with the reharmonisations of the later choruses."""
    meter = piece["meter"]
    sections = [(label, parse_chart(text, meter)) for label, text in piece["form"]]
    flat = []
    for occ, (label, bars) in enumerate(sections):
        for k, chords in enumerate(bars):
            flat.append((label, chords, k, occ))
    bars = []
    idx = 0
    for chorus in range(1, piece["choruses"] + 1):
        for j, (label, chords, k, occ) in enumerate(flat):
            chords = [(b, c) for b, c in chords]
            if chorus >= 2 and piece["style"] not in ("modal",):
                chords = _vary(chords, flat, j, meter, rng, knobs, piece["style"], tonic, k)
            bars.append(Bar(idx, idx * meter, meter, chords, label, chorus, k, occ))
            idx += 1
    return bars


def _vary(chords, flat, j, meter, rng, knobs, style, tonic, pos):
    """Reharmonisations a band plays on a later chorus. Never on the first bar
    of a section, never on the tonic chord itself."""
    p = knobs["variation"]
    if pos == 0:
        return list(chords)
    nxt = flat[(j + 1) % len(flat)][1][0][1]
    out = list(chords)
    last_b, last = out[-1]
    r = rng.random()
    # Tritone substitute of a dominant resolving down a fifth.
    if _is_dom(last) and (nxt.root - last.root) % 12 == 5 and r < p and style != "trad" and last.root != tonic:
        out[-1] = (last_b, Chord(last.root + 6, "7", (), None))
        return out
    r = rng.random()
    # ii before a dominant that fills the bar.
    if meter == 4 and len(out) == 1 and _is_dom(last) and last.bass is None and r < p * 0.6 and last.root != tonic:
        return [(1, Chord(last.root + 7, "min7")), (3, last)]
    r = rng.random()
    # Passing diminished between two chords a whole step apart.
    if meter == 4 and len(out) == 1 and (nxt.root - last.root) % 12 == 2 and r < p * 0.6 and last.bass is None:
        return [(1, last), (3, Chord(last.root + 1, "dim7"))]
    r = rng.random()
    # Colour of the tonic chords.
    if len(out) == 1 and r < p * 0.5:
        swap = {"maj7": "maj6", "maj6": "maj7", "min7": "min6" if style == "bossa" else "min7"}
        if last.quality in swap and style != "trad":
            return [(1, Chord(last.root, swap[last.quality], (), last.bass))]
    return out


def choose_extensions(bars, rng, knobs, style):
    """Each chord occurrence gets the tensions the comping plays (the truth keeps them)."""
    for bar in bars:
        new = []
        for b, c in bar.chords:
            if c.ext or style == "trad":
                new.append((b, c))
                continue
            if style == "modal" and c.quality == "min7":
                new.append((b, c.with_ext(("9", "11"))))
                continue
            if rng.random() < knobs["tension"] * 1.6:
                opts = [o for o in available_tensions(c, knobs["minor"]) if o]
                new.append((b, c.with_ext(opts[rng.integers(len(opts))]) if opts else c))
            else:
                new.append((b, c))
        bar.chords = new


def apply_pedals(bars, piece, rng, knobs, tonic):
    """Role "pedal": some bars over the tonic in the bass (truth: slash chord)."""
    if piece["band"].get("bass") != "pedal":
        return
    for bar in bars:
        if bar.chorus % 2 == 1 and rng.random() < knobs["pedal"] and len(bar.chords) == 1:
            b, c = bar.chords[0]
            if c.root != tonic:
                bar.pedal = tonic
                bar.chords = [(b, Chord(c.root, c.quality, c.ext, tonic))]


# --------------------------------------------------------------- note output

class Part:
    """One instrument: a program, a level, a pan, and its notes."""

    def __init__(self, name, program, stem, vel_scale=1.0, pan=64, reverb=50, drums=False):
        self.name = name
        self.program = program
        self.stem = stem
        self.notes = []  # (start_beat, dur_beats, pitch, velocity)
        self.vel_scale = vel_scale
        self.pan = pan
        self.reverb = reverb
        self.drums = drums
        self.straight = False

    def add(self, start, dur, pitch, vel):
        v = int(np.clip(vel * self.vel_scale, 1, 127))
        self.notes.append((float(start), float(max(0.05, dur)), int(pitch), v))


def fit(pc, lo, hi, near):
    """MIDI note of pitch class pc within [lo, hi], closest to `near`."""
    cands = [n for n in range(lo, hi + 1) if n % 12 == pc % 12]
    if not cands:
        return near
    return min(cands, key=lambda n: abs(n - near))


# ------------------------------------------------------------------ voicings

def tension_pcs(c):
    return c.tensions()


def voicing_pcs(c, rootless=True, quartal_alt=0):
    r = c.root
    iv = {
        "maj": [4, 7], "min": [3, 7], "aug": [4, 8], "dim": [3, 6], "sus2": [2, 7], "sus4": [5, 7],
        "7": [4, 10], "maj7": [4, 11], "min7": [3, 10], "minmaj7": [3, 11], "maj6": [4, 9],
        "min6": [3, 9], "dim7": [3, 6, 9], "hdim7": [3, 6, 10], "7sus4": [5, 10], "aug7": [4, 8, 10],
    }[c.quality]
    pcs = [(r + i) % 12 for i in iv] + c.tensions()
    if len(set(pcs)) < 4:
        fifth = {"aug": 8, "aug7": 8, "dim": 6, "dim7": 6, "hdim7": 6}.get(c.quality, 7)
        pcs.append((r + fifth) % 12)
    if not rootless or len(set(pcs)) < 3:
        pcs.append(r)
    out = []
    for p in pcs:
        if p not in out:
            out.append(p)
    return out


def close_voicing(pcs, lo, hi, prev_center, rng, spread=False):
    """Stack the pitch classes into a voicing in [lo, hi] close to the previous one."""
    best, best_score = None, 1e9
    for k in range(len(pcs)):
        order = pcs[k:] + pcs[:k]
        for base in range(lo, lo + 12):
            if base % 12 != order[0]:
                continue
            notes = [base]
            for p in order[1:]:
                n = notes[-1] + 1
                while n % 12 != p:
                    n += 1
                notes.append(n)
            if spread and len(notes) >= 4:
                notes[-2] -= 12  # drop 2
                notes.sort()
            if notes[0] < lo or notes[-1] > hi:
                continue
            center = sum(notes) / len(notes)
            score = abs(center - prev_center) + 0.15 * (notes[-1] - notes[0]) + rng.random() * 0.5
            if score < best_score:
                best, best_score = notes, score
    if best is None:
        best = sorted(fit(p, lo, hi + 12, prev_center) for p in pcs)
    return best


def quartal(c, alt):
    """So What voicings: stacked fourths (9, 5, 1, 11, b7) or (1, 11, b7, b3, 5)."""
    r = c.root
    if alt % 2 == 0:
        base = 52 + ((r + 2 - 52) % 12)
        return [base, base + 5, base + 10, base + 15, base + 20]
    base = 50 + ((r - 50) % 12)
    return [base, base + 5, base + 10, base + 15, base + 19]


# ------------------------------------------------------------- the arranger

class Arranger:
    def __init__(self, piece, bars, rng, knobs, key_tonic):
        self.p = piece
        self.bars = bars
        self.rng = rng
        self.k = knobs
        self.tonic = key_tonic
        self.meter = piece["meter"]
        self.parts = []
        self.total = len(bars) * self.meter

    def part(self, *a, **kw):
        p = Part(*a, **kw)
        self.parts.append(p)
        return p

    # all chord changes: (beat position, Chord)
    def changes(self):
        out = []
        for bar in self.bars:
            for b, c in bar.chords:
                out.append((bar.start + b - 1, c))
        return out

    def chord_at(self, t):
        bar = self.bars[min(len(self.bars) - 1, int(t // self.meter))]
        return bar.chord_at(t - bar.start + 1)

    def next_change(self, t):
        for pos, c in self.changes():
            if pos > t + 1e-6:
                return pos, c
        return self.total, self.bars[0].chords[0][1]

    # ---------------------------------------------------------------- drums
    def drums(self, style):
        kit = {"swing": 32, "waltz": 32, "shuffle": 32, "bossa": 0, "brushes": 40, "trad": 0}.get(style, 32)
        d = self.part("drums", kit, "drums", vel_scale=0.85, drums=True, reverb=40)
        rng = self.rng
        m = self.meter
        for bar in self.bars:
            s = bar.start
            fill = (bar.index % 8) == 7
            if style in ("swing", "shuffle"):
                for b in range(m):
                    d.add(s + b, 0.3, 51, 72 + 8 * (b % 2) + rng.integers(-6, 7))
                    if b % 2 == 1:
                        d.add(s + b + (0.5 if style == "swing" else 2 / 3), 0.2, 51, 58 + rng.integers(-6, 7))
                        d.add(s + b, 0.2, 44, 55)
                    d.add(s + b, 0.2, 36, 28 + rng.integers(0, 8))
                    if style == "shuffle":
                        d.add(s + b + 2 / 3, 0.2, 51, 55)
                        if b % 2 == 1:
                            d.add(s + b, 0.2, 38, 85)
                    elif rng.random() < 0.22:
                        d.add(s + b + rng.choice([0.5, 0.0, 2 / 3]), 0.2, 38, 40 + rng.integers(0, 35))
                if fill:
                    for i in range(3):
                        d.add(s + m - 1 + i / 3, 0.2, rng.choice([38, 45, 47]), 70 + rng.integers(0, 20))
                if bar.index % 8 == 0 and bar.index > 0:
                    d.add(s, 1.0, 49, 85)
            elif style == "waltz":
                for b in range(m):
                    d.add(s + b, 0.3, 51, 70 + (10 if b == 0 else 0))
                d.add(s + 1.5, 0.2, 51, 55)
                d.add(s + 1, 0.2, 44, 50)
                d.add(s + 2, 0.2, 44, 50)
                d.add(s, 0.2, 36, 40)
                if rng.random() < 0.25:
                    d.add(s + 2.5, 0.2, 38, 45)
            elif style == "bossa":
                d.straight = True
                for e in range(8):
                    d.add(s + e / 2, 0.2, 42, 50 + (12 if e % 2 == 0 else 0) + rng.integers(-5, 6))
                for t in (0, 1.5, 2, 3.5):
                    d.add(s + t, 0.3, 36, 60 if t in (0, 2) else 45)
                pat = (0, 1.5, 3) if bar.index % 2 == 0 else (1, 2.5)
                for t in pat:
                    d.add(s + t, 0.2, 37, 70)
            elif style == "brushes":
                for e in range(m * 4):
                    d.add(s + e / 4, 0.25, 38, 18 + rng.integers(0, 10))
                for b in range(m):
                    if b % 2 == 1:
                        d.add(s + b, 0.3, 38, 48)
                        d.add(s + b, 0.2, 44, 45)
                d.add(s, 0.3, 36, 30)
            elif style == "trad":
                for b in range(m):
                    d.add(s + b, 0.3, 36, 52)
                    if b % 2 == 1:
                        d.add(s + b, 0.2, 38, 78 + rng.integers(-6, 7))
                    if rng.random() < 0.35:
                        d.add(s + b + 0.5, 0.2, 76, 50)
                if fill:
                    for i in range(4):
                        d.add(s + m - 1 + i / 4, 0.2, 38, 60 + 10 * i)
                if bar.index % 8 == 0 and bar.index > 0:
                    d.add(s, 1.0, 49, 75)

    # ----------------------------------------------------------------- bass
    def bass(self, role):
        instr = "tuba" if role == "tuba" else "acbass"
        prog, lo, hi = INSTR[instr]
        b = self.part("bass", prog, "bass", vel_scale=1.0, reverb=30)
        rng = self.rng
        m = self.meter
        busy = self.k["bass_busy"]
        prev = 40
        if role == "bossa":
            b.straight = True
        for bar in self.bars:
            s = bar.start
            if bar.pedal is not None:
                n = fit(bar.pedal, lo, 45, 38)
                b.add(s, m - 0.1, n, 92)
                prev = n
                continue
            if role in ("two", "tuba", "pedal") or (role == "walk" and self.p["style"] in ("ballad",)):
                pts = [1] if m == 3 else [1, 3]
                for k, beat in enumerate(pts):
                    c = bar.chord_at(beat)
                    first = any(bb == beat for bb, _ in bar.chords)
                    pc = c.bass if (c.bass is not None and first) else (c.root if first or k == 0 else (c.root + 7) % 12)
                    n = fit(pc, lo, hi - 8, prev)
                    dur = (m if m == 3 else 2) - 0.15 if role != "tuba" else 0.8
                    b.add(s + beat - 1, dur, n, 90 + rng.integers(-6, 7))
                    prev = n
                    if role == "two" and rng.random() < 0.3 and m == 4 and k == 1:
                        tgt = self.chord_at(s + m)
                        b.add(s + 3, 0.9, fit((tgt.root + rng.choice([-1, 1])) % 12, lo, hi - 8, prev), 80)
                continue
            if role == "bossa":
                c1 = bar.chord_at(1)
                c3 = bar.chord_at(3)
                r1 = c1.bass if c1.bass is not None else c1.root
                n1 = fit(r1, lo, hi - 10, prev)
                n5 = fit((c1.root + 7) % 12, lo, hi - 10, n1)
                b.add(s, 1.4, n1, 92)
                b.add(s + 1.5, 0.45, n5, 80)
                r3 = c3.root if c3 is not c1 else (c1.root + 7) % 12
                n3 = fit(r3, lo, hi - 10, n5)
                b.add(s + 2, 1.4, n3, 88)
                b.add(s + 3.5, 0.45, fit(self.chord_at(s + m).root, lo, hi - 10, n3), 78)
                prev = n3
                continue
            # walking bass, one note per beat
            for beat in range(1, m + 1):
                t = s + beat - 1
                c = bar.chord_at(beat)
                starts = any(bb == beat for bb, _ in bar.chords)
                npos, nc = self.next_change(t)
                if starts:
                    if c.bass is not None:
                        pc = c.bass
                    else:
                        r = rng.random()
                        tones = c.tones()
                        pc = c.root if r > busy else (tones[1] if r < busy * 0.6 else tones[2 % len(tones)])
                elif abs(npos - (t + 1)) < 1e-6:
                    tgt = nc.bass if nc.bass is not None else nc.root
                    r = rng.random()
                    if r < 0.4 + busy * 0.6:
                        pc = (tgt + rng.choice([-1, 1])) % 12
                    else:
                        pc = (tgt + 7) % 12
                else:
                    sc = chord_scale(c, self.k["minor"])
                    if rng.random() < 0.6:
                        pc = rng.choice(c.tones())
                    else:
                        pc = rng.choice(sc)
                n = fit(pc, lo, hi - 4, prev + rng.integers(-3, 4))
                if abs(n - prev) > 9:
                    n = fit(pc, lo, hi - 4, prev)
                b.add(t, 0.92, n, 88 + rng.integers(-8, 8) + (6 if beat == 1 else 0))
                prev = n

    # -------------------------------------------------------------- comping
    def comp(self, role, instr="piano", stem="piano", vel=1.0):
        prog, lo, hi = INSTR[instr]
        p = self.part(instr, prog, stem, vel_scale=vel, pan=54 if stem == "piano" else 78, reverb=55)
        rng = self.rng
        m = self.meter
        center = 64
        alt = 0
        if role in ("bossa",):
            p.straight = True
        for bar in self.bars:
            s = bar.start
            chords = bar.chords
            nxt_bar = self.bars[bar.index + 1] if bar.index + 1 < len(self.bars) else None
            # rhythm of the bar: (offset beats, duration, which chord: 0 own / 1 next bar's first)
            hits = []
            if role == "comp":
                pats4 = [[(0, 0.6), (1.5, 0.4)], [(0.5, 0.5), (2.5, 0.5)], [(0, 1.8), (2.5, 0.4)],
                         [(1.5, 0.4), (3, 0.6)], [(0, 0.4), (1.5, 0.4), (3, 0.8)], [(1, 0.4), (2.5, 1.0)]]
                pats3 = [[(1, 0.6), (2, 0.6)], [(0, 1.0), (1.5, 0.5)], [(1, 0.4), (2.5, 0.4)], [(0, 2.5)]]
                pats = pats4 if m == 4 else pats3
                hits = [(o, d, 0) for o, d in pats[rng.integers(len(pats))]]
            elif role == "sparse":
                if rng.random() < 0.7:
                    o = rng.choice([0.0, 1.5, 2.5, 1.0])
                    hits = [(o, 0.5, 0)]
            elif role == "ballad":
                hits = [(0, m - 0.1, 0)] if len(chords) == 1 else [(0, 1.9, 0), (2, 1.9, 0)]
            elif role == "quartal":
                hits = [(o, d, 0) for o, d in [[(0, 1.0)], [(1.5, 0.4), (2, 1.5)], [(3.5, 0.5)], [(0, 0.4), (2.5, 0.4)]][rng.integers(4)]]
            elif role == "four":
                hits = [(b, 0.45, 0) for b in range(m)]
            elif role == "bossa":
                pat = [(0, 0.4), (1.5, 0.4), (3, 0.4)] if bar.index % 2 == 0 else [(1, 0.4), (2.5, 0.9)]
                hits = [(o, d, 0) for o, d in pat]
            elif role == "stride":
                hits = [(b, 0.4, 0) for b in range(1, m, 2)]
            elif role == "banjo":
                hits = [(b, 0.35, 0) for b in range(m)]
            # anticipation of the next bar's chord
            if role in ("comp", "sparse", "bossa", "quartal") and nxt_bar is not None and rng.random() < self.k["anticip"]:
                hits = [h for h in hits if h[0] < m - 0.5] + [(m - 0.5, 0.9, 1)]
            for o, d, which in hits:
                if which == 1:
                    c = nxt_bar.chords[0][1]
                else:
                    c = bar.chord_at(o + 1)
                    # never hold a chord over the next change in the bar
                    for bb, _ in chords:
                        if o + 1 < bb < o + 1 + d:
                            d = bb - (o + 1) - 0.05
                if role == "quartal" and c.quality == "min7":
                    notes = quartal(c, alt)
                    alt += 1 if rng.random() < 0.5 else 0
                elif role in ("four",):
                    third = (c.root + (3 if c.quality in ("min", "min7", "min6", "minmaj7", "dim", "dim7", "hdim7") else 4)) % 12
                    sev = {"7": 10, "maj7": 11, "min7": 10, "maj6": 9, "min6": 9, "dim7": 9, "hdim7": 10, "minmaj7": 11,
                           "7sus4": 10, "aug7": 10}.get(c.quality, 7)
                    r = fit(c.root, 40, 52, 45)
                    notes = [r, fit((c.root + sev) % 12, r + 1, r + 12, r + 9), fit(third, r + 12, r + 20, r + 15)]
                elif role in ("stride", "banjo"):
                    pcs = c.tones()[:3] + ([(c.root + 9) % 12] if c.quality == "maj6" else []) + \
                          ([(c.root + 10) % 12] if c.quality == "7" else [])
                    notes = close_voicing(pcs, 55 if role == "banjo" else 57, 76, center, rng)
                else:
                    rootless = role not in ("ballad",) or rng.random() < 0.5
                    pcs = voicing_pcs(c, rootless=rootless)
                    notes = close_voicing(pcs, lo + 4, min(hi, 78), center, rng, spread=(instr != "piano" and len(pcs) >= 4))
                center = 0.7 * center + 0.3 * (sum(notes) / len(notes))
                center = min(70, max(56, center))
                v = 62 + rng.integers(-10, 12)
                spread = 0.012 if role == "banjo" else 0.0
                for i, n in enumerate(notes):
                    p.add(s + o + i * spread, d, n, v)
                if role == "stride":
                    # left hand: bass note on 1 and 3
                    for b0 in range(0, m, 2):
                        cc = bar.chord_at(b0 + 1)
                        pc = cc.bass if cc.bass is not None else (cc.root if b0 == 0 else (cc.root + 7) % 12)
                        p.add(s + b0, 0.5, fit(pc, 36, 50, 43), 72)
                if role == "ballad" and rng.random() < 0.5:
                    # broken chord in eighths over the second half
                    for i, n in enumerate(sorted(notes)[:4]):
                        p.add(s + o + d / 2 + i * 0.5, 0.45, n + 12, 50)

    # ------------------------------------------------------------- melodies
    def _melody_note_choices(self, c, strong):
        tones = c.tones()
        tens = c.tensions() or [p for p in chord_scale(c, self.k["minor"]) if p not in tones][:2]
        if strong and self.rng.random() < self.k["tension"]:
            return tens or tones
        return tones if strong else chord_scale(c, self.k["minor"])

    def head(self, part, lo, hi, chorus_filter=None, rhythm="head"):
        """A melody written once per section label: repeats of a section are the same tune."""
        rng = self.rng
        tunes = {}
        m = self.meter
        for bar in self.bars:
            if chorus_filter and not chorus_filter(bar.chorus):
                continue
            key = (bar.section, bar.pos)
            if key not in tunes:
                # durations in beats for this bar, filling the bar
                if rhythm == "ballad":
                    opts = [[m], [m / 2, m / 2], [1.5, 0.5, 2] if m == 4 else [2, 1], [1, 1, 1, 1] if m == 4 else [1, 1, 1]]
                    durs = opts[rng.integers(len(opts))]
                else:
                    opts = [[2, 1, 1] if m == 4 else [2, 1], [1.5, 0.5, 2] if m == 4 else [1.5, 0.5, 1],
                            [m], [0.5, 0.5, 1, 2] if m == 4 else [0.5, 0.5, 2], [1, 1, 1, 1] if m == 4 else [1, 1, 1],
                            [3, 1] if m == 4 else [3]]
                    durs = opts[rng.integers(len(opts))]
                rest_end = (bar.index % 4) == 3 and rng.random() < 0.6
                tunes[key] = (list(durs), rest_end, rng.integers(0, 10**6))
            durs, rest_end, sub = tunes[key]
            r2 = np.random.default_rng(sub)
            t = 0.0
            prev = (lo + hi) // 2
            for i, d in enumerate(durs):
                if rest_end and i == len(durs) - 1:
                    break
                c = bar.chord_at(t + 1)
                strong = d >= 1
                pool = self._melody_note_choices(c, strong) if r2.random() > 0.1 else c.tones()
                pc = pool[r2.integers(len(pool))]
                n = fit(pc, lo + 3, hi - 3, prev + r2.integers(-4, 5))
                part.add(bar.start + t, d * 0.95, n, 92 + r2.integers(-8, 10))
                prev = n
                t += d

    def solo(self, part, lo, hi, chorus_filter=None, arpeggio=False):
        rng = self.rng
        m = self.meter
        t = 0.0
        end = self.total
        prev = (lo + hi) // 2
        while t < end:
            bar = self.bars[int(t // m)]
            if chorus_filter and not chorus_filter(bar.chorus):
                t = (int(t // m) + 1) * m
                continue
            phrase = rng.integers(4, 15) / 2  # beats
            stop = min(end, t + phrase)
            while t < stop - 1e-9:
                c = self.chord_at(t)
                on = abs(t - round(t)) < 1e-6
                if on:
                    pool = self._melody_note_choices(c, True)
                    if arpeggio:
                        pool = c.tones() + c.tensions()
                    pc = pool[rng.integers(len(pool))]
                    n = fit(pc, lo, hi, prev + rng.integers(-5, 6))
                else:
                    # passing: step towards the next strong note, often chromatic
                    nc = self.chord_at(t + 0.5)
                    target = fit(rng.choice(nc.tones()), lo, hi, prev + rng.integers(-4, 5))
                    step = 1 if target > prev else -1
                    if rng.random() < 0.45:
                        n = target - step  # chromatic approach
                    else:
                        sc = chord_scale(c, self.k["minor"])
                        n = prev + step
                        while n % 12 not in sc:
                            n += step
                n = int(np.clip(n, lo, hi))
                dur = 0.5 if rng.random() > 0.12 else 1.0
                part.add(t, dur * 0.9, n, 88 + rng.integers(-10, 14) + (8 if not on else 0))
                prev = n
                t += dur
            t += rng.integers(1, 5) / 2

    def lead(self, spec):
        instr, _, mode = spec.partition(":")
        mode = mode or "head-solo"
        prog, lo, hi = INSTR[instr]
        part = self.part(instr, prog, "vocals" if instr == "voice" else "other",
                         vel_scale=10 ** (self.k["lead_db"] / 40), pan=70, reverb=60)
        last = self.p["choruses"]
        ballad = self.p["style"] == "ballad"
        if mode == "head":
            self.head(part, lo, hi, rhythm="ballad" if ballad else "head")
        elif mode == "solo":
            self.solo(part, lo, hi)
        else:
            self.head(part, lo, hi, chorus_filter=lambda ch: ch in (1, last), rhythm="ballad" if ballad else "head")
            self.solo(part, lo, hi, chorus_filter=lambda ch: ch not in (1, last))
        return part

    def pads(self, instrs, stem, vel=1.0, rhythmic=False):
        """Harmonised section (horns or voices) carrying the chords."""
        parts = [self.part(i, INSTR[i][0], stem, vel_scale=vel, pan=40 + 15 * k, reverb=65) for k, i in enumerate(instrs)]
        rng = self.rng
        center = 62
        m = self.meter
        for bar in self.bars:
            spans = []
            for k, (b, c) in enumerate(bar.chords):
                e = bar.chords[k + 1][0] if k + 1 < len(bar.chords) else m + 1
                spans.append((b - 1, e - b, c))
            for o, d, c in spans:
                pcs = voicing_pcs(c, rootless=True)[:len(parts)]
                while len(pcs) < len(parts):
                    pcs.append(c.root)
                notes = close_voicing(pcs, 50, 76, center, rng, spread=True)
                center = min(66, max(58, sum(notes) / len(notes)))
                notes = sorted(notes)[::-1]
                if rhythmic and rng.random() < 0.4:
                    for hit in (0, 1.5):
                        if hit < d:
                            for pt, n in zip(parts, notes):
                                pt.add(bar.start + o + hit, 0.45, n, 80)
                else:
                    for pt, n in zip(parts, notes):
                        pt.add(bar.start + o, d - 0.08, n, 66 + rng.integers(-5, 6))
        return parts

    def dixie(self):
        tp = self.part("trumpet", INSTR["trumpet"][0], "other", vel_scale=10 ** (self.k["lead_db"] / 40), pan=64, reverb=45)
        cl = self.part("clarinet", INSTR["clarinet"][0], "other", vel_scale=0.85, pan=84, reverb=45)
        tb = self.part("trombone", INSTR["trombone"][0], "other", vel_scale=0.9, pan=44, reverb=45)
        self.head(tp, 58, 79)
        self.solo(cl, 62, 86, arpeggio=True)
        rng = self.rng
        prev = 55
        for bar in self.bars:
            for k, (b, c) in enumerate(bar.chords):
                e = bar.chords[k + 1][0] if k + 1 < len(bar.chords) else self.meter + 1
                tones = c.tones()
                pc = tones[1] if rng.random() < 0.6 else tones[-1]
                n = fit(pc, 46, 64, prev)
                tb.add(bar.start + b - 1, (e - b) * 0.9, n, 80)
                prev = n

    # ------------------------------------------------------------------ all
    def arrange(self):
        band = self.p["band"]
        style = self.p["style"]
        if "drums" in band:
            self.drums(band["drums"])
        if "bass" in band:
            self.bass(band["bass"])
        if "piano" in band:
            self.comp(band["piano"], "piano", "piano", vel=0.9 if band["piano"] != "sparse" else 0.8)
        if "guitar" in band:
            g = band["guitar"]
            instr = {"bossa": "nylon", "banjo": "banjo"}.get(g, "jazzgtr")
            self.comp(g, instr, "guitar", vel=0.85)
        other = band.get("other")
        if other == "section":
            self.pads(["trumpet", "alto", "tenor", "trombone"], "other", vel=0.9, rhythmic=False)
            self.lead("trumpet:head")
        elif other == "dixie":
            self.dixie()
        elif other:
            self.lead(other)
        voc = band.get("vocals")
        if voc == "pad":
            self.pads(["choir", "choir", "voice", "voice"], "vocals", vel=0.95)
            lead = self.part("voice", INSTR["voice"][0], "vocals", vel_scale=1.1, pan=64, reverb=60)
            self.head(lead, 62, 77, rhythm="ballad" if style == "ballad" else "head")
        elif voc == "lead":
            self.lead("voice:head")
        return self.parts


def tempo_map(n_beats, bpm, knobs, rng):
    """Beat durations (seconds) for every beat: slow wander and optional overall change."""
    x = np.cumsum(rng.standard_normal(n_beats + 1))
    x = x - np.linspace(x[0], x[-1], len(x))
    k = np.ones(16) / 16
    x = np.convolve(x, k, mode="same")
    x = x / (np.max(np.abs(x)) + 1e-9)
    ramp = np.linspace(0, 1, len(x)) * knobs["accel"]
    tempo = bpm * (1 + knobs["drift"] * x + ramp)
    return 60.0 / tempo
