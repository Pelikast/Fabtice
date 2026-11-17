"""From the truth of a piece (verites/<id>.json) to the notes of every
instrument, grouped by stem, with the chords bench's arranger
(web/spikes/accords/corpus/arrange.py): its drums, walking bass, comping,
melodies (`head`: the same tune on every repeat of a section) and solos.

What this file adds: the parts change who plays. A theme is the arranger's
`head` on the lead instrument's bars only, a solo its `solo` line; when the
piano or the guitar solos, its comping steps back (the piano keeps a soft
left hand, the guitar stops); a bass solo replaces the walking line and the
band plays softly; a drum solo is the drums alone, louder and busier. Pop
pieces get a straight rock beat, a root-and-fifth bass and quarter-note
chords. Every bar of the truth carries its stem levels (`play`): the
orchestration follows them.

Bars are passed to the arranger with `chorus` = the bar's index, so the
arranger's `chorus_filter` selects exact bar ranges.
"""

import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "accords" / "corpus"))

from arrange import INSTR, KNOBS, Arranger, Bar  # noqa: E402
from harmony import parse_chord  # noqa: E402

SOLO_RANGE = {"piano": (60, 86), "jazzgtr": (55, 81), "acbass": (36, 62)}


def bars_of(truth):
    """The arranger's bars (beats from the first downbeat, chords 1-based)."""
    meter = truth["meter"]
    out = []
    for i, b in enumerate(truth["bars"]):
        chords = [(c["beat"] + 1, parse_chord(c["text"])) for c in b["chords"]]
        out.append(Bar(i, i * meter, meter, chords, b["section"] or "X", i, b["pos"], 0))
    return out


def knobs_of(truth):
    k = dict(KNOBS)
    k.update(lead_db=3.0, tension=0.35, variation=0.0, drift=0.0, minor=truth["key"]["mode"] == "minor")
    return k


def pop_drums(arr, bars_set):
    d = arr.part("drums", 0, "drums", vel_scale=0.9, drums=True, reverb=30)
    d.straight = True
    m = arr.meter
    rng = arr.rng
    for bar in arr.bars:
        if bar.index not in bars_set:
            continue
        s = bar.start
        for e in range(2 * m):
            d.add(s + e / 2, 0.2, 42, 70 + 10 * (e % 2 == 0) + rng.integers(-6, 7))
        d.add(s, 0.3, 36, 100)
        if m == 4:
            d.add(s + 2, 0.3, 36, 92)
            d.add(s + 2.5, 0.3, 36, 80 if rng.random() < 0.5 else 1)
            d.add(s + 1, 0.3, 38, 100)
            d.add(s + 3, 0.3, 38, 104)
        else:
            d.add(s + 1, 0.3, 38, 96)
            d.add(s + 2, 0.3, 38, 96)
        if bar.index % 8 == 7:
            for k, n in enumerate((50, 48, 45, 43)):
                d.add(s + m - 1 + k / 4, 0.2, n, 96)
        if bar.index % 8 == 0:
            d.add(s, 1.0, 49, 100)
    return d


def pop_bass(arr, bars_set):
    prog, lo, hi = INSTR["acbass"]
    b = arr.part("bass", 33, "bass", vel_scale=1.0, reverb=20)  # electric bass (finger)
    b.straight = True
    m = arr.meter
    for bar in arr.bars:
        if bar.index not in bars_set:
            continue
        for e in range(2 * m):
            c = bar.chord_at(e / 2 + 1)
            root = 28 + (c.root - 4) % 12
            n = root + (7 if e % 4 == 3 else 0)
            b.add(bar.start + e / 2, 0.45, n, 92 if e % 2 == 0 else 78)
    return b


def drum_solo(arr, part, bars_set):
    rng = arr.rng
    toms = (50, 48, 47, 45, 43, 41)
    for bar in arr.bars:
        if bar.index not in bars_set:
            continue
        s = bar.start
        part.add(s, 0.3, 36, 110)
        for k in range(4 * arr.meter):
            if rng.random() < 0.7:
                n = 38 if rng.random() < 0.45 else int(toms[rng.integers(len(toms))])
                part.add(s + k / 4, 0.15, n, 80 + rng.integers(0, 40))
        if rng.random() < 0.4:
            part.add(s, 1.0, 49, 110)


def keep(part, bars_set, meter, scale=None):
    """Keep only the notes of the bars in `bars_set` (scale the others' velocity instead when `scale`)."""
    notes = []
    for st, du, p, v in part.notes:
        i = int(st // meter)
        if i in bars_set:
            notes.append((st, du, p, v))
        elif scale:
            notes.append((st, du, p, max(1, int(v * scale))))
    part.notes = notes


def arrange(truth):
    """All the parts (arrange.Part) of the piece, with their stems."""
    rng = np.random.default_rng(truth["seed"] + 11)
    bars = bars_of(truth)
    meter = truth["meter"]
    pop = truth["mode"] == "pop"
    piece = dict(band=truth["band"], style="ballad" if truth["style"] == "ballad" else ("swing" if pop else truth["style"]),
                 meter=meter, choruses=1)
    arr = Arranger(piece, bars, rng, knobs_of(truth), truth["key"]["tonic"])
    tb = truth["bars"]
    n = len(tb)
    allb = set(range(n))
    drums_solo = {i for i, b in enumerate(tb) if set(b["play"]) == {"drums"}}
    bass_solo = {i for i, b in enumerate(tb) if b["lead"] is None and b["play"].get("bass", 0) >= 0.15}
    band = truth["band"]
    # ---- drums
    if "drums" in band:
        if pop:
            pop_drums(arr, allb - drums_solo)
        else:
            arr.drums(band["drums"])
            keep([p for p in arr.parts if p.stem == "drums"][-1], allb - drums_solo - bass_solo, meter)
            if bass_solo:
                # soft brushes under a bass solo
                arr2 = Arranger(piece, bars, np.random.default_rng(truth["seed"] + 12), knobs_of(truth), truth["key"]["tonic"])
                arr2.drums("brushes")
                src = arr2.parts[-1]
                keep(src, bass_solo, meter)
                soft = arr.part("drums", 40, "drums", drums=True, reverb=40)
                soft.notes = [(st, du, p, max(1, v // 2)) for st, du, p, v in src.notes]
        if drums_solo:
            ds = arr.part("drums", 32, "drums", vel_scale=1.0, drums=True, reverb=40)
            drum_solo(arr, ds, drums_solo)
    # ---- bass
    if "bass" in band:
        if pop:
            pop_bass(arr, allb - drums_solo)
        else:
            arr.bass(band["bass"])
            keep([p for p in arr.parts if p.stem == "bass"][-1], allb - drums_solo - bass_solo, meter)
    # ---- comping
    lead_bars = {}
    for i, b in enumerate(tb):
        if b["lead"]:
            lead_bars.setdefault(b["lead"]["stem"], set()).add(i)
    for stem, instr_default in (("piano", "piano"), ("guitar", "jazzgtr")):
        if stem not in band:
            continue
        role = band[stem]
        if pop:
            role = "ballad" if stem == "piano" else "four"
        instr = {"bossa": "nylon", "banjo": "banjo"}.get(role, instr_default)
        arr.comp(role, instr, stem, vel=0.9 if role != "sparse" else 0.8)
        part = [p for p in arr.parts if p.stem == stem][-1]
        soloing = {i for i in lead_bars.get(stem, set()) if tb[i]["lead"]["role"] == "solo"}
        quiet = {i for i, b in enumerate(tb) if b["lead"] is None and i in bass_solo}
        if stem == "piano":
            keep(part, allb - drums_solo - soloing - quiet, meter)
            # a soft left hand under the piano's own solo, sparse chords under a bass solo
            arr2 = Arranger(piece, bars, np.random.default_rng(truth["seed"] + 13), knobs_of(truth), truth["key"]["tonic"])
            arr2.comp("sparse", "piano", "piano", vel=0.55)
            lh = arr2.parts[-1]
            keep(lh, soloing | quiet, meter)
            part.notes += lh.notes
        else:
            keep(part, allb - drums_solo - soloing - bass_solo, meter)
    # ---- leads, part by part
    for pi, p in enumerate(truth["parts"]):
        if p["type"] in ("intro", "outro") and not p["lead"]:
            continue
        rows = [i for i in range(p["firstBar"], p["endBar"]) if tb[i]["lead"]]
        if not rows:
            continue
        by_instr = {}
        for i in rows:
            by_instr.setdefault(tb[i]["lead"]["arranger"], set()).add(i)
        for instr, idx in by_instr.items():
            role = tb[min(idx)]["lead"]["role"]
            if role == "intro":
                continue  # an intro played by the piano or the guitar: their comping (louder by the levels)
            if instr == "drums":
                continue
            prog, lo, hi = INSTR[instr]
            if role == "solo" and instr in SOLO_RANGE:
                lo, hi = SOLO_RANGE[instr]
            stem = tb[min(idx)]["lead"]["stem"]
            lead_db = 3.0
            part = arr.part(instr, prog, stem, vel_scale=10 ** (lead_db / 40), pan=70, reverb=60)
            sel = (lambda s: (lambda ch: ch in s))(idx)
            if role == "solo":
                arr.solo(part, lo, hi, chorus_filter=sel)
            else:
                arr.head(part, lo, hi, chorus_filter=sel, rhythm="ballad" if truth["style"] in ("ballad", "pop") else "head")
    return arr.parts


# Relative loudness of each stem in the mix (dB, active parts only): as in the chords bench.
STEM_DB = dict(drums=-8.0, bass=-5.0, piano=-6.0, guitar=-7.0, other=-2.0, vocals=-2.0)
