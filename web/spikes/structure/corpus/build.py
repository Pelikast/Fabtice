"""From a piece of pieces.py to its ground truth (no audio): every bar with its
times, chords (as played, reharmonisations included), section letter, chorus,
part and key; the parts, the modulations, the expected « Grille complète
simplifiée » and the known chart. Deterministic: the seed of the piece.

    python3 corpus/build.py                 # writes verites/<id>.json and the Tier S fixture
    python3 corpus/build.py --check         # fails when a committed file differs

The Tier S fixture (app/src/structure/bench/fixtures/corpus.json) is the same
truth, without the per-bar beat times, so that the app's tests can read it.
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1] / "accords" / "corpus"))

from harmony import LETTER, PCS_FLAT, PCS_SHARP, Chord, parse_chart  # noqa: E402
from pieces import PIECES  # noqa: E402

ROOT = HERE.parent
VERITES = ROOT / "verites"
FIXTURE = HERE.parents[3] / "app" / "src" / "structure" / "bench" / "fixtures" / "corpus.json"

FIXTURE_BAR = ("start", "end", "beats", "chorus", "section", "pos", "part", "chords", "lead", "play")
START = 1.0 # seconds of silence before the first downbeat
TAIL = 2.0  # seconds after the last bar

# Arranger instrument -> (part instrument id of model/structure.ts, stem of the separation)
INSTRUMENT = {
    "voice": ("voice", "vocals"), "piano": ("piano", "piano"), "jazzgtr": ("guitar", "guitar"),
    "acbass": ("bass", "bass"), "drums": ("drums", "drums"), "trumpet": ("trumpet", "other"),
    "mutedtrumpet": ("trumpet", "other"), "tenor": ("saxophone", "other"), "alto": ("saxophone", "other"),
    "trombone": ("trombone", "other"), "clarinet": ("clarinet", "other"), "flute": ("flute", "other"),
    "vibes": ("vibraphone", "other"),
}

# Nominal level (linear RMS) of each stem by role: what Tier S simulates; Tier R measures the real one.
LEVEL = {
    "drums": {"normal": 0.12, "solo": 0.30, "soft": 0.05},
    "bass": {"normal": 0.10, "solo": 0.18},
    "piano": {"comp": 0.08, "sparse": 0.05, "quartal": 0.07, "pop": 0.08, "intro": 0.14, "solo": 0.20},
    "guitar": {"comp": 0.06, "four": 0.05, "bossa": 0.07, "banjo": 0.08, "pop": 0.08, "intro": 0.14, "solo": 0.20},
    "lead": {"head": 0.22, "solo": 0.20, "intro": 0.14},
}

FAMILY_TEXT = {  # family-level writing of a quality (the « Grille complète simplifiée »)
    "maj": "", "maj7": "maj7", "maj6": "maj7", "min": "m", "min7": "m7", "min6": "m6", "minmaj7": "m6",
    "7": "7", "aug7": "7", "aug": "+", "dim": "dim", "dim7": "dim7", "hdim7": "m7b5",
    "sus2": "sus4", "sus4": "sus4", "7sus4": "7sus4",
}


def parse_key(text):
    name, mode = text.split()
    pc = (LETTER[name[0]] + {"b": -1, "#": 1}.get(name[1:2], 0)) % 12
    return {"tonic": pc, "mode": mode}


def key_json(k):
    sharp = (k["tonic"], k["mode"]) in {(7, "major"), (2, "major"), (9, "major"), (4, "major"), (11, "major"),
                                         (6, "major"), (4, "minor"), (11, "minor"), (6, "minor"), (1, "minor"),
                                         (9, "minor"), (8, "minor")}
    name = (PCS_SHARP if sharp else PCS_FLAT)[k["tonic"]]
    return {"tonic": k["tonic"], "mode": k["mode"], "name": f"{name} {k['mode']}"}


def transpose_key(k, n):
    return {"tonic": (k["tonic"] + n) % 12, "mode": k["mode"]}


def chord_text(c, flats):
    return c.text(flats)


def family_chord(c):
    """The chord as the simplified chart writes it: root and family, no extension, no bass."""
    q = {"maj6": "maj7", "minmaj7": "min6", "aug7": "7", "sus2": "sus4"}.get(c.quality, c.quality)
    return Chord(c.root, q, (), None)


def split_keys(text):
    return text.split() if " " in text.strip() else list(text.strip())


# ------------------------------------------------------------------ reharmonisations

def vary(chords, nxt, rng, p, style, meter, first):
    """What the band plays on one occurrence of a bar of the form (chords: [(beat 1-based, Chord)]).

    First occurrence of a section bar: the written chord, with an extension now and then.
    Later occurrences: extensions change (G7, G13, G7#5), tritone substitutes of dominants
    resolving down a fifth, a ii added before a dominant, maj7 <-> 6, and rarely a chord that
    changes family (I -> iii, ii -> II7). The consensus of the occurrences stays the written chord."""
    out = [(b, c) for b, c in chords]
    if style in ("pop",):
        return out
    if not first and p > 0:
        b, last = out[-1]
        r = rng.random()
        if last.quality == "7" and nxt is not None and (nxt.root - last.root) % 12 == 5 and r < p * 0.8 and style != "trad":
            out[-1] = (b, Chord(last.root + 6, "7"))
        elif meter == 4 and len(out) == 1 and last.quality == "7" and r < p * 1.2:
            out = [(1, Chord(last.root + 7, "min7")), (3, last)]
        elif len(out) == 1 and last.quality in ("maj7", "maj6") and r < p * 1.6:
            out = [(1, Chord(last.root, "maj6" if last.quality == "maj7" else "maj7"))]
        elif len(out) == 1 and r < p * 1.8:
            if last.quality == "maj7":
                out = [(1, Chord(last.root + 4, "min7"))]  # I -> iii
            elif last.quality == "min7":
                out = [(1, Chord(last.root, "7"))]  # ii -> II7
    ext_p = 0.15 if first else 0.55
    if style == "trad":
        return out
    res = []
    for b, c in out:
        if rng.random() < ext_p:
            opts = {"7": [("9",), ("13",), ("#5",), ("b9",), ("#9",), ("9", "13"), ("#11",)],
                    "maj7": [("9",), ("#11",)], "min7": [("9",), ("11",)], "maj6": [("9",)],
                    "hdim7": [("9",)], "min6": [("9",)]}.get(c.quality)
            if opts:
                c = c.with_ext(opts[rng.integers(len(opts))])
        res.append((b, c))
    return res


# ------------------------------------------------------------------ expansion

def expand(piece):
    rng = np.random.default_rng(piece["seed"])
    meter = piece["meter"]
    main_key = parse_key(piece["key"])
    flats = key_json(main_key)["name"].split()[0].find("#") < 0
    sections = {}
    for k, v in piece["sections"].items():
        text, key = (v if isinstance(v, tuple) else (v, None))
        sections[k] = (parse_chart(text, meter), parse_key(key) if key else None)
    form = split_keys(piece["form"]) if piece["form"] else []
    jazz = piece["mode"] == "jazz"

    bars = []  # dicts
    parts = []
    seen = set()  # (section key, pos, up) already played once
    cursor = 0
    chorus = 0
    counts = {}

    def add_bar(chords, base, section_key, pos, part_index, key, lead, play, chorus_no, block):
        bars.append(dict(chords=chords, base=base, section_key=section_key, pos=pos, part=part_index,
                         key=key, lead=lead, play=play, chorus=chorus_no, block=block))

    def band_play(kind, lead_instr, lead_role):
        """Nominal stem levels for one bar."""
        band = piece["band"]
        play = {}
        if kind == "drums-solo":
            return {"drums": LEVEL["drums"]["solo"]}
        if "drums" in band:
            play["drums"] = LEVEL["drums"]["soft" if kind == "bass-solo" else "normal"]
        if "bass" in band:
            play["bass"] = LEVEL["bass"]["solo" if kind == "bass-solo" else "normal"]
        if "piano" in band:
            play["piano"] = LEVEL["piano"]["sparse" if kind == "bass-solo" else band["piano"]]
        if "guitar" in band:
            play["guitar"] = LEVEL["guitar"][band["guitar"]] * (0.6 if kind == "bass-solo" else 1)
        if lead_instr:
            stem = INSTRUMENT[lead_instr][1]
            lvl = LEVEL["lead"][lead_role]
            if stem in ("piano", "guitar") and lead_role == "intro":
                lvl = LEVEL[stem]["intro"]
            play[stem] = round(play.get(stem, 0) * 0.5 + lvl, 4)
        return play

    for entry in piece["plan"]:
        typ, what, who = entry[0], entry[1], entry[2]
        opts = entry[3] if len(entry) > 3 else {}
        up = opts.get("up", 0)
        part_index = len(parts)
        first_bar = len(bars)
        letters = []
        if typ in ("intro", "outro"):
            chart = parse_chart(what, meter)
            for pos, chords in enumerate(chart):
                chords = [(b, c.transpose(up)) for b, c in chords]
                lead = (who, "intro") if who else None
                add_bar(chords, chords, None, pos, part_index, transpose_key(main_key, up), lead,
                        band_play("band", who, "intro"), None, ("extra", typ, part_index))
        elif typ == "tag":
            n, times = (int(x) for x in what.split("x"))
            tail = [b for b in bars if b["section_key"] is not None][-n:]
            for t in range(times):
                for pos, src in enumerate(tail):
                    add_bar(src["chords"], src["base"], None, pos, part_index, src["key"], (who, "head") if who else None,
                            band_play("band", who, "head"), None, ("extra", "tag", part_index))
            typ = "outro"
        else:
            if isinstance(what, int):
                keys = []
                for _ in range(what):
                    keys += form
            else:
                keys = split_keys(what)
            trade = None
            if typ == "trade":
                trade = (who.split("/"), opts.get("every", 4))
            role = "head" if typ in ("theme", "verse", "chorus", "bridge") else "solo"
            k_in_part = 0
            for skey in keys:
                if jazz:
                    if form[cursor] != skey:
                        raise SystemExit(f"{piece['id']}: section {skey} where the form has {form[cursor]}")
                    if cursor == 0:
                        chorus += 1
                    cursor = (cursor + 1) % len(form)
                letters.append(skey[0])
                chart, skeykey = sections[skey]
                key = transpose_key(skeykey or main_key, up)
                for pos, chords in enumerate(chart):
                    # next chord in the form, for the tritone substitutes
                    if pos + 1 < len(chart):
                        nxt = chart[pos + 1][0][1]
                    else:
                        nxt = None
                    base = [(b, c.transpose(up)) for b, c in chords]
                    first = (skey, pos, up) not in seen
                    seen.add((skey, pos, up))
                    played = vary(base, nxt.transpose(up) if nxt else None, rng, piece["vary"], piece["style"], meter, first)
                    lead_instr, kind = who, "band"
                    if trade:
                        lead_instr = trade[0][(k_in_part // trade[1]) % len(trade[0])]
                    if lead_instr == "drums":
                        kind, lead_instr = "drums-solo", None
                    elif lead_instr == "acbass":
                        kind, lead_instr = "bass-solo", None
                    lead = (lead_instr, role) if lead_instr else None
                    play = band_play(kind, lead_instr, role)
                    add_bar(played, base, skey, pos, part_index, key, lead, play, chorus if jazz else None,
                            ("form", up))
                    k_in_part += 1
        # the part(s)
        end_bar = len(bars)
        if typ == "trade":
            names, every = who.split("/"), opts.get("every", 4)
            for j, s in enumerate(range(first_bar, end_bar, every)):
                instr = names[j % len(names)]
                parts.append(dict(type="solo", lead=instr, firstBar=s, endBar=min(end_bar, s + every), letters=[]))
        else:
            lead_name = who if typ not in ("intro", "outro") else None
            parts.append(dict(type=typ, lead=lead_name, firstBar=first_bar, endBar=end_bar, letters=letters))
        for i in range(first_bar, end_bar):
            bars[i]["part"] = len(parts) - 1 if typ != "trade" else next(
                j for j, p in enumerate(parts) if p["firstBar"] <= i < p["endBar"])
    for p in parts:
        counts[p["type"]] = counts.get(p["type"], 0) + 1
        p["number"] = counts[p["type"]]
        p["instrument"] = INSTRUMENT[p["lead"]][0] if p["lead"] else None
        # letters of a trade chunk: the letters whose section starts inside it
    return dict(bars=bars, parts=parts, form=form, main_key=main_key, flats=flats, meter=meter)


# ------------------------------------------------------------------ truth

def tempo_beats(piece, n_beats):
    rng = np.random.default_rng(piece["seed"] + 7)
    drift = 0.02 if piece["style"] == "ballad" else 0.01
    x = np.cumsum(rng.standard_normal(n_beats + 1))
    x = x - np.linspace(x[0], x[-1], len(x))
    x = np.convolve(x, np.ones(16) / 16, mode="same")
    x = x / (np.max(np.abs(x)) + 1e-9)
    durs = 60.0 / (piece["bpm"] * (1 + drift * x))
    return START + np.concatenate([[0.0], np.cumsum(durs[:n_beats])])


def chords_json(chords, flats):
    return [{"beat": b - 1, "text": c.text(flats)} for b, c in chords]


def simplified(piece, ex):
    """The expected « Grille complète simplifiée »: every section of the form written once per key
    block (consecutive repeats of a section inside a chorus as `times`), intro, outro and tags
    outside the form as their own block; consensus = the written chord at family level."""
    bars = ex["bars"]
    flats = ex["flats"]
    meter = ex["meter"]
    if piece["mode"] == "jazz" and len(set(ex["form"])) == len(ex["form"]) and max(
            (b["chorus"] or 0) for b in bars) <= 1:
        return None  # through-composed: nothing to fold
    sections = []  # dict(id, label, bars:[...], times, src key)
    where = {}  # (kind, key...) -> section index
    places = []

    def written_bars(base_list):
        out = []
        prev = None
        for base in base_list:
            fam = [(b, family_chord(c)) for b, c in base]
            sim = prev is not None and [(b, c.key()) for b, c in fam] == [(b, c.key()) for b, c in prev]
            out.append({"beats": meter, "chords": [] if sim else chords_json(fam, flats), "simile": sim})
            prev = fam
        return out

    i = 0
    n = len(bars)
    while i < n:
        b = bars[i]
        if b["block"][0] == "extra":
            j = i
            while j < n and bars[j]["block"] == b["block"]:
                j += 1
            kind = b["block"][1]
            label = {"part": "intro" if kind == "intro" else "outro"}
            seg = bars[i:j]
            # a tag: the repeated bars written once, `times` = repeats
            period = len(seg)
            if kind == "tag":
                period = next(p for p in range(1, len(seg) + 1)
                              if len(seg) % p == 0 and all(seg[k]["pos"] == seg[k % p]["pos"] for k in range(len(seg))))
            sid = f"{label['part']}" if not any(s["id"] == label["part"] for s in sections) else f"{label['part']}-{len(sections)}"
            sections.append(dict(id=sid, label=label, bars=written_bars([x["base"] for x in seg[:period]]),
                                 times=len(seg) // period))
            for k in range(i, j):
                places.append([k, len(sections) - 1, (k - i) % period])
            i = j
            continue
        # a bar of the form: its section key in its key block
        up = b["block"][1]
        skey = b["section_key"]
        j = i
        while j < n and bars[j]["section_key"] == skey and bars[j]["block"] == b["block"] and (
                j == i or bars[j]["pos"] != 0):
            j += 1
        ident = (skey, up)
        if ident not in where:
            letter = skey[0]
            sid = skey if up == 0 else f"{skey}+{up}"
            seg = bars[i:j]
            sections.append(dict(id=sid, label={"letter": letter}, bars=written_bars([x["base"] for x in seg]),
                                 times=1, ident=ident, key=None))
            where[ident] = len(sections) - 1
            # consecutive repeats right after the first appearance, inside the same chorus
            k = j
            times = 1
            while k < n and bars[k]["section_key"] == skey and bars[k]["block"] == b["block"] and \
                    bars[k]["pos"] == 0 and bars[k]["chorus"] == b["chorus"]:
                k2 = k + 1
                while k2 < n and bars[k2]["section_key"] == skey and bars[k2]["pos"] != 0:
                    k2 += 1
                times += 1
                k = k2
            sections[-1]["times"] = times
        s = where[ident]
        for k in range(i, j):
            places.append([k, s, bars[k]["pos"]])
        i = j
    # key change marks on written sections: first bar of a section whose key differs from the one before
    prev_key = None
    for s in sections:
        s.pop("ident", None)
        s.pop("key", None)
    first_place = {}
    for bar, s, off in places:
        first_place.setdefault((s, off), bar)
    for si, s in enumerate(sections):
        bar = first_place.get((si, 0))
        k = bars[bar]["key"] if bar is not None else None
        s["keyChange"] = key_json(k) if (prev_key is not None and k != prev_key) else None
        if k is not None:
            prev_key = k
    form_line = []
    for pi, p in enumerate(ex["parts"]):
        form_line.append({"part": pi, "letters": "".join(p["letters"])})
    return dict(form=form_line, sections=sections, places=places)


def truth(piece):
    ex = expand(piece)
    bars = ex["bars"]
    meter = ex["meter"]
    flats = ex["flats"]
    beats = tempo_beats(piece, len(bars) * meter)
    out_bars = []
    marks = []
    for i, b in enumerate(bars):
        start, end = beats[i * meter], beats[(i + 1) * meter]
        if b["section_key"] is not None and b["pos"] == 0:
            marks.append({"bar": i, "label": b["section_key"][0]})
        if b["section_key"] is None and piece["mode"] == "pop" and False:
            pass
        out_bars.append({
            "index": i, "start": round(float(start), 4), "end": round(float(end), 4), "beats": meter,
            "chorus": b["chorus"], "section": b["section_key"][0] if b["section_key"] else None,
            "sectionKey": b["section_key"], "pos": b["pos"], "part": b["part"],
            "chords": chords_json(b["chords"], flats), "written": chords_json([(x, family_chord(c)) for x, c in b["base"]], flats),
            "key": key_json(b["key"]),
            "lead": None if not b["lead"] else {"instrument": INSTRUMENT[b["lead"][0]][0], "arranger": b["lead"][0],
                                                "stem": INSTRUMENT[b["lead"][0]][1], "role": b["lead"][1]},
            "play": b["play"],
        })
    key_changes = []
    for i in range(1, len(bars)):
        if bars[i]["key"] != bars[i - 1]["key"]:
            key_changes.append({"bar": i, "key": key_json(bars[i]["key"])})
    choruses = []
    for i, b in enumerate(bars):
        c = b["chorus"]
        if c is None:
            continue
        if not choruses or choruses[-1]["chorus"] != c:
            choruses.append({"chorus": c, "firstBar": i, "endBar": i + 1})
        else:
            choruses[-1]["endBar"] = i + 1
    jazz = piece["mode"] == "jazz"
    form_letters = "".join(k[0] for k in ex["form"])
    many = max((b["chorus"] or 0) for b in bars) >= 2
    chorus_bars = sum(len(parse_chart(piece["sections"][k] if not isinstance(piece["sections"][k], tuple)
                                      else piece["sections"][k][0], meter)) for k in ex["form"]) if jazz else None
    parts = [{"type": p["type"], "number": p["number"], "instrument": p["instrument"], "lead": p["lead"],
              "firstBar": p["firstBar"], "endBar": p["endBar"], "letters": "".join(p["letters"])} for p in ex["parts"]]
    stems = {}
    for b in bars:
        for s in b["play"]:
            stems.setdefault(s, set())
    band = piece["band"]
    names = {"drums": "drums", "bass": "acbass", "piano": "piano", "guitar": {"bossa": "nylon", "banjo": "banjo"}.get(
        band.get("guitar"), "jazzgtr")}
    for s in stems:
        if s in names and s in band:
            stems[s].add(names[s])
    for b in bars:
        if b["lead"]:
            stems[INSTRUMENT[b["lead"][0]][1]].add(b["lead"][0])
    known = None
    if jazz:
        kb = []
        for skey in ex["form"]:
            chart, _ = (lambda v: (parse_chart(v if not isinstance(v, tuple) else v[0], meter), None))(piece["sections"][skey])
            for pos, chords in enumerate(chart):
                kb.append({"section": skey[0] if pos == 0 else None, "chords": chords_json(chords, flats)})
        known = {"title": piece["title"], "key": key_json(ex["main_key"]), "meter": meter, "bars": kb}
    return {
        "id": piece["id"], "title": piece["title"], "standard": piece["standard"], "style": piece["style"],
        "mode": piece["mode"], "meter": meter, "bpm": piece["bpm"], "seed": piece["seed"],
        "key": key_json(ex["main_key"]), "subset": piece["subset"], "render": list(piece["render"]),
        "band": piece["band"],
        "duration": round(float(beats[-1]) + TAIL, 4),
        "beats": [round(float(x), 4) for x in beats],
        "form": form_letters if jazz else "",
        "formScored": bool(jazz and many),
        "chorusBars": chorus_bars if (jazz and many) else None,
        "choruses": choruses,
        "sections": marks,
        "parts": parts,
        "keyChanges": key_changes,
        "simplified": simplified(piece, ex),
        "known": known,
        "stems": {k: sorted(v) for k, v in sorted(stems.items())},
        "bars": out_bars,
    }


def verite_text(t):
    """One line per bar: readable in a diff, and small."""
    head = {k: v for k, v in t.items() if k not in ("bars", "beats")}
    lines = ["{"]
    for k, v in head.items():
        lines.append(f" {json.dumps(k)}: {dumps(v)},")
    lines.append(f' "beats": {dumps(t["beats"])},')
    lines.append(' "bars": [')
    lines.append(",\n".join("  " + dumps(b) for b in t["bars"]))
    lines.append(" ]")
    lines.append("}")
    return "\n".join(lines) + "\n"


def dumps(x):
    return json.dumps(x, ensure_ascii=False, separators=(",", ":"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    only = set(a.only.split(",")) if a.only else None
    ids = [p["id"] for p in PIECES]
    assert len(ids) == len(set(ids)), "duplicate ids"
    VERITES.mkdir(parents=True, exist_ok=True)
    fixture = []
    bad = []
    for p in PIECES:
        t = truth(p)
        if only is None or p["id"] in only:
            path = VERITES / f"{p['id']}.json"
            text = verite_text(t)
            if a.check:
                if not path.exists() or path.read_text() != text:
                    bad.append(str(path))
            else:
                path.write_text(text)
        f = {k: v for k, v in t.items() if k not in ("beats", "band", "seed", "render")}
        f["bars"] = [{k: v for k, v in bar.items() if k in FIXTURE_BAR} for bar in t["bars"]]
        for bar in f["bars"]:
            if bar["lead"]:
                bar["lead"] = {k: bar["lead"][k] for k in ("instrument", "stem", "role")}
        fixture.append(f)
    text = "[\n" + ",\n".join(dumps(f) for f in fixture) + "\n]\n"
    if a.check:
        if not FIXTURE.exists() or FIXTURE.read_text() != text:
            bad.append(str(FIXTURE))
        if bad:
            raise SystemExit("different: " + ", ".join(bad))
        print("identique")
        return
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text)
    n_bars = sum(len(f["bars"]) for f in fixture)
    print(f"{len(fixture)} morceaux, {n_bars} mesures -> {VERITES} et {FIXTURE}")


if __name__ == "__main__":
    main()
