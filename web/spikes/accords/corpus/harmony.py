"""Chord symbols for the corpus, in the app's vocabulary
(app/src/model/harmony.ts): 16 qualities, 11 extensions, an optional bass.

A chart is written as text, one bar per `|`-separated cell, e.g.
    "Dm7 G7 | Cmaj7 | Bm7b5 E7b9 | Am6"
Two chords in a 4/4 bar fall on beats 1 and 3, four chords on each beat; a
chord can carry its beat explicitly: "C@1 A7@4". "%" repeats the previous
bar's last chord.
"""

import re

PCS_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
PCS_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
LETTER = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

QUALITY_INTERVALS = {
    "maj": (0, 4, 7), "min": (0, 3, 7), "aug": (0, 4, 8), "dim": (0, 3, 6),
    "sus2": (0, 2, 7), "sus4": (0, 5, 7), "7": (0, 4, 7, 10), "maj7": (0, 4, 7, 11),
    "min7": (0, 3, 7, 10), "minmaj7": (0, 3, 7, 11), "maj6": (0, 4, 7, 9),
    "min6": (0, 3, 7, 9), "dim7": (0, 3, 6, 9), "hdim7": (0, 3, 6, 10),
    "7sus4": (0, 5, 7, 10), "aug7": (0, 4, 8, 10),
}
EXTENSION_INTERVAL = {"b9": 1, "9": 2, "#9": 3, "11": 5, "#11": 6, "b13": 8, "13": 9, "6": 9, "b5": 6, "#5": 8}
EXT_ORDER = ["6", "b5", "#5", "b9", "9", "#9", "11", "#11", "b13", "13", "alt"]

# Longest first. Text as typed in the charts below; the app's parser reads the same text.
ALIASES = [
    ("m(maj7)", "minmaj7"), ("m7b5", "hdim7"), ("dim7", "dim7"), ("mmaj7", "minmaj7"), ("maj7", "maj7"),
    ("7sus4", "7sus4"), ("sus4", "sus4"), ("sus2", "sus2"), ("m7", "min7"), ("m6", "min6"),
    ("dim", "dim"), ("aug7", "aug7"), ("aug", "aug"), ("+7", "aug7"), ("+", "aug"),
    ("m", "min"), ("6", "maj6"), ("7", "7"), ("", "maj"),
]


class Chord:
    __slots__ = ("root", "quality", "ext", "bass")

    def __init__(self, root, quality, ext=(), bass=None):
        self.root = root % 12
        self.quality = quality
        self.ext = tuple(sorted(set(ext), key=EXT_ORDER.index))
        self.bass = None if bass is None or bass % 12 == self.root else bass % 12

    def key(self):
        return (self.root, self.quality, self.ext, self.bass)

    def __eq__(self, o):
        return isinstance(o, Chord) and self.key() == o.key()

    def __hash__(self):
        return hash(self.key())

    def tones(self):
        """Pitch classes of the chord tones (no extensions)."""
        return [(self.root + i) % 12 for i in QUALITY_INTERVALS[self.quality]]

    def tensions(self):
        return [(self.root + EXTENSION_INTERVAL[e]) % 12 for e in self.ext if e in EXTENSION_INTERVAL]

    def with_ext(self, ext):
        return Chord(self.root, self.quality, ext, self.bass)

    def transpose(self, n):
        return Chord(self.root + n, self.quality, self.ext, None if self.bass is None else self.bass + n)

    def text(self, flats=True):
        names = PCS_FLAT if flats else PCS_SHARP
        q = {"maj": "", "min": "m", "aug": "+", "dim": "dim", "sus2": "sus2", "sus4": "sus4", "7": "7",
             "maj7": "maj7", "min7": "m7", "minmaj7": "m(maj7)", "maj6": "6", "min6": "m6",
             "dim7": "dim7", "hdim7": "m7b5", "7sus4": "7sus4", "aug7": "+7"}[self.quality]
        ext = self.ext
        if self.quality == "maj6" and "6" in ext:
            ext = tuple(e for e in ext if e != "6")
        s = names[self.root] + q + (f"({','.join(ext)})" if ext else "")
        if self.bass is not None:
            s += "/" + names[self.bass]
        return s

    def json(self, flats=True):
        return {"symbol": self.text(flats), "root": self.root, "quality": self.quality,
                "extensions": list(self.ext), "bass": self.bass}

    def __repr__(self):
        return self.text()


def parse_note(s):
    m = re.match(r"([A-G])([b#]?)", s)
    if not m:
        raise ValueError(s)
    pc = LETTER[m.group(1)] + {"": 0, "b": -1, "#": 1}[m.group(2)]
    return pc % 12, s[m.end():]


def parse_chord(text):
    """'G7b9', 'Bbmaj7', 'F#m7b5', 'C/E', 'D7(#11)', 'Ebm6', 'Gsus4'."""
    t = text.strip()
    bass = None
    if "/" in t and not t.endswith(")"):
        t, b = t.rsplit("/", 1)
        bass, _ = parse_note(b)
    root, rest = parse_note(t)
    quality = "maj"
    for alias, q in ALIASES:
        if rest.startswith(alias):
            quality = q
            rest = rest[len(alias):]
            break
    ext = []
    rest = rest.replace("(", "").replace(")", "").replace(",", "")
    while rest:
        m = re.match(r"(b9|#9|9|#11|11|b13|13|b5|#5)", rest)
        if not m:
            raise ValueError(f"cannot read {text!r} (rest {rest!r})")
        ext.append(m.group(1))
        rest = rest[m.end():]
    return Chord(root, quality, ext, bass)


def parse_chart(text, meter=4):
    """Bars as lists of (beat, Chord)."""
    bars = []
    last = None
    for cell in text.split("|"):
        cell = cell.strip()
        if not cell:
            continue
        toks = cell.split()
        if toks == ["%"]:
            bars.append([(1, last)])
            continue
        chords = []
        n = len(toks)
        for i, tok in enumerate(toks):
            if "@" in tok:
                tok, b = tok.split("@")
                beat = int(b)
            elif n == 1:
                beat = 1
            elif n == 2:
                beat = 1 if i == 0 else (3 if meter == 4 else 3 if meter == 3 else meter // 2 + 1)
            elif n == meter:
                beat = i + 1
            else:
                raise ValueError(f"bar {cell!r}: give the beats with @")
            chords.append((beat, parse_chord(tok)))
        last = chords[-1][1]
        bars.append(chords)
    return bars


# ----------------------------------------------------------------- scales

def chord_scale(ch, minor_key=False):
    """A plausible scale (pitch classes) for melodic lines over the chord."""
    r = ch.root
    q = ch.quality
    if q in ("maj", "maj7", "maj6"):
        iv = (0, 2, 4, 5, 7, 9, 11) if "#11" not in ch.ext else (0, 2, 4, 6, 7, 9, 11)
    elif q in ("min7", "min"):
        iv = (0, 2, 3, 5, 7, 9, 10)
    elif q in ("min6", "minmaj7"):
        iv = (0, 2, 3, 5, 7, 9, 11)
    elif q == "7":
        if "b9" in ch.ext or "#9" in ch.ext or "b13" in ch.ext:
            iv = (0, 1, 3, 4, 7, 8, 10)  # altered-ish / phrygian dominant
        elif "#11" in ch.ext:
            iv = (0, 2, 4, 6, 7, 9, 10)
        else:
            iv = (0, 2, 4, 5, 7, 9, 10)
    elif q == "hdim7":
        iv = (0, 1, 3, 5, 6, 8, 10)
    elif q in ("dim7", "dim"):
        iv = (0, 2, 3, 5, 6, 8, 9, 11)
    elif q in ("sus4", "7sus4", "sus2"):
        iv = (0, 2, 5, 7, 9, 10)
    else:  # aug, aug7
        iv = (0, 2, 4, 6, 8, 10)
    return [(r + i) % 12 for i in iv]


def available_tensions(ch, minor_context=False):
    """Extensions a comping player may add to a chord written without any."""
    q = ch.quality
    if q == "7":
        if minor_context:
            return [(), ("b9",), ("b9", "b13"), ("#9",), ("b13",)]
        return [(), ("9",), ("13",), ("9", "13"), ("9",), ("b9",), ("#11",), ("9", "13")]
    if q == "maj7":
        return [(), ("9",), ("9",), ("9", "#11"), ("13",)]
    if q == "maj6":
        return [(), ("9",)]
    if q == "min7":
        return [(), ("9",), ("9",), ("11",), ("9", "11")]
    if q == "min6":
        return [(), ("9",)]
    if q == "minmaj7":
        return [(), ("9",)]
    if q == "hdim7":
        return [(), (), ("11",)]
    if q == "7sus4":
        return [(), ("9",), ("13",)]
    return [()]
