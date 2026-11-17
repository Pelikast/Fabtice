"""The pieces of the structure corpus.

Every chart below is written for this bench, as chord strings (the syntax of
web/spikes/accords/corpus/harmony.py). Some follow the common-practice
harmony of well-known standards (our own reading, not a copy of any
collection); the blues, rhythm changes, Satin Doll, Blue Bossa and Ipanema
charts are imported from the chords bench.

Fields of a piece
-----------------
id, title, standard (the title is a real tune), style (arranger style:
swing | ballad | bossa | waltz | trad | modal | shuffle | pop), mode
(jazz | pop: the truth of the Jazz/Pop decision), meter, key ("B minor"),
bpm, seed, subset (part of the default Tier S subset), render (conditions
to render in Tier R: "propre", "disque").

sections: {letter: chart} or {letter: (chart, "Key")} when the section is
    written in another key that lasts (a real modulation, e.g. a bridge in
    another key). A section without a key is in the key in force.
form: the sections of one chorus: letters ("AABA"), or section keys separated
    by spaces when two sections share a letter but not all their chords
    ("A A2 B A2": the letter is the first character of the key).
    "" for pop pieces (no chorus form).
plan: the parts in playing order, each a tuple (type, what, who, options):
    type    intro | theme | solo | trade | outro | tag | verse | chorus | bridge
    what    for intro / outro: a chart string; for tag: how many bars of the
            end of the form are repeated, and how many times ("4x3");
            for the other types: letters ("AABC") or a number of choruses.
    who     the lead instrument (arranger name: voice, piano, jazzgtr, acbass,
            drums, trumpet, tenor, alto, trombone, clarinet, flute, vibes…);
            None: no lead (the band alone). For `trade`: "alto/drums", the
            two instruments trading `opts["every"]` bars (default 4).
    options up: semitones the part is transposed (a key change that lasts).
band: the accompaniment (drums, bass, piano, guitar styles), see orchestra.py.
vary: probability of a reharmonisation on a repeated section (see build.py).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "accords" / "corpus"))
from charts import PIECES as CHORD_PIECES  # noqa: E402

_CP = {p["id"]: p for p in CHORD_PIECES}


def _sec(piece_id, i):
    return _CP[piece_id]["form"][i][1]


BLUES_F = _sec("blues-fa-swing", 0)
BLUES_C_MINOR = _sec("blues-mineur-do", 0)
RHYTHM_A1 = _sec("anatole-sib", 0)
RHYTHM_A2 = _sec("anatole-sib", 1)
RHYTHM_B = _sec("anatole-sib", 2)
SATIN_A = _sec("satin", 0)
SATIN_B = _sec("satin", 2)
IPANEMA_A1 = _sec("ipanema", 0)
IPANEMA_A2 = _sec("ipanema", 1)
IPANEMA_B = _sec("ipanema", 2)
BLUE_BOSSA = _sec("blue-bossa", 0)  # 16 bars: 8 in C minor, then 4 in Db major (a passing key), back to C minor

JAZZ = dict(drums="swing", bass="walk", piano="comp")
GUITAR_TRIO = dict(drums="swing", bass="walk", guitar="comp")
BOSSA = dict(drums="bossa", bass="bossa", guitar="bossa")
BALLAD = dict(drums="brushes", bass="walk", piano="comp")
WALTZ = dict(drums="waltz", bass="walk", piano="comp")
POP = dict(drums="pop", bass="pop", piano="pop", guitar="pop")


def P(**kw):
    kw.setdefault("standard", False)
    kw.setdefault("mode", "jazz")
    kw.setdefault("meter", 4)
    kw.setdefault("style", "swing")
    kw.setdefault("band", JAZZ)
    kw.setdefault("vary", 0.25)
    kw.setdefault("subset", False)
    kw.setdefault("render", ("propre",))
    return kw


PIECES = [
    # ------------------------------------------------------------------ the cahier's example
    P(id="autumn-leaves", title="Autumn Leaves", standard=True, key="B minor", bpm=132, seed=501,
      sections={"A": "Em7 | A7 | Dmaj7 | Gmaj7 | C#m7b5 | F#7 | Bm7 | Bm7",
                "B": "C#m7b5 | F#7 | Bm7 | Bm7 | Em7 | A7 | Dmaj7 | Gmaj7",
                "C": "C#m7b5 | F#7 | Bm7 Bb7 | Am7 G#7 | C#m7b5 | F#7 | Bm7 | Bm7"},
      form="AABC",
      plan=[("intro", "Bm7 | Bm7 | Bm7 | Bm7", None),
            ("theme", "AABC", "voice"),
            ("solo", "AABC", "piano"),
            ("solo", "AA", "trumpet"),
            ("theme", "BC", "voice")],
      subset=True, render=("propre", "disque")),

    # ------------------------------------------------------------------ AABA 32
    P(id="rhythm-tenor-long", title="I Got Rhythm", standard=True, key="Bb major", bpm=208, seed=502,
      sections={"A": RHYTHM_A1, "A2": RHYTHM_A2, "B": RHYTHM_B}, form="A A2 B A2",
      plan=[("theme", 1, "tenor"), ("solo", 3, "tenor"), ("solo", 1, "piano"), ("theme", 1, "tenor")],
      subset=True, render=("propre", "disque")),
    P(id="satin-doll-tag", title="Satin Doll", standard=True, key="C major", bpm=124, seed=503,
      sections={"A": SATIN_A, "B": SATIN_B}, form="AABA",
      band=dict(drums="swing", bass="walk", guitar="comp", piano="sparse"),
      plan=[("theme", 1, "mutedtrumpet"), ("solo", 1, "jazzgtr"), ("solo", "AA", "trombone"),
            ("solo", "BA", "piano"), ("theme", 1, "mutedtrumpet"), ("tag", "4x3", "mutedtrumpet")],
      subset=True, render=("propre", "disque")),
    P(id="aaba-cinq-solistes", title="Jam en sol", key="G major", bpm=176, seed=504,
      sections={"A": "Gmaj7 | Em7 | Am7 | D7 | Bm7 | E7 | Am7 | D7",
                "B": "Dm7 | G7 | Cmaj7 | Cmaj7 | Cm7 | F7 | Bm7 E7 | Am7 D7"},
      form="AABA",
      plan=[("theme", 1, "tenor"), ("solo", 1, "trumpet"), ("solo", 1, "jazzgtr"), ("solo", 1, "trombone"),
            ("solo", 1, "piano"), ("solo", 1, "clarinet"), ("solo", 1, "acbass"), ("theme", 1, "tenor")],
      band=dict(drums="swing", bass="walk", piano="comp", guitar="four"), subset=True),
    P(id="aaba-voix-flute", title="Chanson en mi bémol", key="Eb major", bpm=112, seed=505, style="ballad",
      sections={"A": "Ebmaj7 | Cm7 | Fm7 | Bb7 | Gm7 | C7 | Fm7 Bb7 | Ebmaj7",
                "B": "Bbm7 | Eb7 | Abmaj7 | Abmaj7 | Am7 | D7 | Gm7 C7 | Fm7 Bb7"},
      form="AABA", band=BALLAD,
      plan=[("intro", "Fm7 | Bb7 | Ebmaj7 | Bb7", "piano"), ("theme", 1, "voice"), ("solo", "AA", "flute"),
            ("theme", "BA", "voice"), ("outro", "Fm7 | Bb7 | Ebmaj7 | Ebmaj7", None)]),
    P(id="aaba-echanges", title="Échanges de quatre", key="F major", bpm=196, seed=506,
      sections={"A": "Fmaj7 | D7 | Gm7 | C7 | Am7 | D7 | Gm7 | C7",
                "B": "Cm7 | F7 | Bbmaj7 | Bbmaj7 | Bm7 | E7 | Gm7 | C7"},
      form="AABA",
      plan=[("theme", 1, "alto"), ("solo", 1, "alto"), ("trade", 1, "drums/alto"), ("theme", 1, "alto")],
      subset=True),

    # ------------------------------------------------------------------ ABAC 32
    P(id="abac-trompette", title="Forme ABAC en fa", key="F major", bpm=150, seed=507,
      sections={"A": "Fmaj7 | Fmaj7 | Am7b5 | D7 | Gm7 | Gm7 | C7 | C7",
                "B": "Am7 | D7 | Gm7 | C7 | Fmaj7 | Fmaj7 | Gm7 | C7",
                "C": "Bbmaj7 | Bbm7 | Am7 | D7 | Gm7 | C7 | Fmaj7 | Gm7 C7"},
      form="ABAC",
      plan=[("intro", "Gm7 C7 | Gm7 C7 | Gm7 C7 | Gm7 C7", "piano"), ("theme", 1, "trumpet"), ("solo", 2, "trumpet"),
            ("solo", 1, "vibes"), ("theme", 1, "trumpet"), ("outro", "Gm7 C7 | Gm7 C7 | Fmaj7 | Fmaj7", None)],
      subset=True, render=("propre", "disque")),
    P(id="abac-valse", title="Valse en si bémol", key="Bb major", meter=3, bpm=168, seed=508, style="waltz",
      sections={"A": "Bbmaj7 | D7 | Ebmaj7 | G7 | Cm7 | F7 | Dm7 | G7",
                "B": "Cm7 | F7 | Dm7 | G7 | Cm7 | F7 | Bbmaj7 | F7",
                "C": "Ebmaj7 | Ebm7 | Dm7 | G7 | Cm7 | F7 | Bbmaj7 | Bbmaj7"},
      form="ABAC", band=WALTZ,
      plan=[("theme", 1, "flute"), ("solo", 1, "vibes"), ("solo", 1, "piano"), ("theme", 1, "flute")],
      subset=True),

    # ------------------------------------------------------------------ AABC
    P(id="aabc-clarinette", title="Forme AABC en sol mineur", key="G minor", bpm=140, seed=509,
      sections={"A": "Cm7 | F7 | Bbmaj7 | Ebmaj7 | Am7b5 | D7 | Gm7 | Gm7",
                "B": "Am7b5 | D7 | Gm7 | Gm7 | Cm7 | F7 | Bbmaj7 | Ebmaj7",
                "C": "Am7b5 | D7 | Gm7 C7 | Fm7 Bb7 | Am7b5 | D7 | Gm7 | Gm7"},
      form="AABC",
      plan=[("theme", 1, "clarinet"), ("solo", "AA", "jazzgtr"), ("solo", "BC", "piano"),
            ("solo", 1, "clarinet"), ("theme", 1, "clarinet")]),

    # ------------------------------------------------------------------ blues 12
    P(id="blues-solistes", title="Blues en fa", key="F major", bpm=138, seed=510,
      sections={"A": BLUES_F}, form="A",
      plan=[("theme", 2, "alto"), ("solo", 2, "jazzgtr"), ("solo", 2, "piano"), ("solo", 1, "acbass"),
            ("solo", 1, "drums"), ("theme", 2, "alto")],
      band=dict(drums="swing", bass="walk", piano="comp", guitar="four"), subset=True, render=("propre", "disque")),
    P(id="blues-mineur-vents", title="Blues mineur en do", key="C minor", bpm=124, seed=511,
      sections={"A": BLUES_C_MINOR}, form="A",
      plan=[("theme", 2, "tenor"), ("solo", 2, "trumpet"), ("solo", 2, "clarinet"), ("solo", 2, "trombone"),
            ("theme", 1, "tenor")]),
    P(id="blues-shuffle-chant", title="Blues lent chanté", key="Bb major", bpm=84, seed=512, style="shuffle",
      sections={"A": "Bb7 | Eb7 | Bb7 | Fm7 Bb7 | Eb7 | Edim7 | Bb7 | G7 | Cm7 | F7 | Bb7 G7 | Cm7 F7"},
      form="A", band=dict(drums="shuffle", bass="walk", piano="comp"),
      plan=[("intro", "Cm7 | F7 | Bb7 | F7", "piano"), ("theme", 2, "voice"), ("solo", 1, "tenor"),
            ("theme", 1, "voice"), ("tag", "4x2", "voice")]),
    P(id="blues-valse", title="Blues à trois temps", key="G major", meter=3, bpm=172, seed=513, style="waltz",
      sections={"A": "G7 | C7 | G7 | Dm7 G7 | C7 | C#dim7 | G7 | Bm7 E7 | Am7 | D7 | G7 E7 | Am7 D7"},
      form="A", band=WALTZ,
      plan=[("theme", 2, "vibes"), ("solo", 3, "vibes"), ("solo", 2, "piano"), ("theme", 1, "vibes")]),

    # ------------------------------------------------------------------ 16 bars, AAB, through-composed
    P(id="seize-mesures", title="Seize mesures en ré", key="D major", bpm=152, seed=514,
      sections={"A": "Dmaj7 | Bm7 | Em7 | A7 | Dmaj7 | B7 | Em7 | A7 | "
                     "F#m7 | B7 | Em7 | A7 | Am7 | D7 | Gmaj7 | Em7 A7"},
      form="A",
      plan=[("theme", 1, "trumpet"), ("solo", 3, "alto"), ("solo", 1, "trumpet"), ("theme", 1, "trumpet")]),
    P(id="aab-trad", title="Air traditionnel en trois parties", key="F major", bpm=180, seed=515, style="trad",
      sections={"A": "F | F | C7 | C7 | C7 | C7 | F | F",
                "B": "F | F7 | Bb | Bbm | F | C7 | F | F"},
      form="AAB", band=dict(drums="trad", bass="walk", guitar="banjo", piano="comp"),
      plan=[("theme", 1, "clarinet"), ("solo", 1, "trombone"), ("solo", 1, "clarinet"), ("solo", 1, "trumpet"),
            ("theme", 1, "clarinet")], vary=0.1),
    P(id="sans-reprise", title="Pièce d'un seul tenant", key="A minor", bpm=100, seed=516, style="ballad",
      sections={"A": "Am7 | D7 | Gmaj7 | Cmaj7 | F#m7b5 | B7 | Em7 | E7",
                "B": "Dm7 | G7 | Cmaj7 | A7 | Dm7 | E7 | Am7 | Am7",
                "C": "Fmaj7 | Bb7 | Am7 | D7 | Gm7 | C7 | Fmaj7 | E7",
                "D": "Am7 | Am7/G | F#m7b5 | Fmaj7 | Dm7 | E7 | Am7 | Am7"},
      form="ABCD", band=BALLAD, plan=[("theme", 1, "voice")]),

    # ------------------------------------------------------------------ head by voice / horn, ballads, bossa
    P(id="ipanema-chant", title="The Girl from Ipanema", standard=True, key="F major", bpm=128, seed=517,
      style="bossa", band=BOSSA,
      sections={"A": IPANEMA_A1, "A2": IPANEMA_A2, "B": IPANEMA_B}, form="A A2 B A2",
      plan=[("intro", "Fmaj7 | Gb7 | Fmaj7 | Gb7", None), ("theme", 1, "voice"), ("solo", "A A2 B A2 A A2", "tenor"),
            ("theme", "B A2", "voice"), ("outro", "Fmaj7 | Gb7 | Fmaj7 | Fmaj7", None)],
      subset=True, render=("propre", "disque")),
    P(id="blue-bossa-flute", title="Blue Bossa", standard=True, key="C minor", bpm=140, seed=518, style="bossa",
      band=BOSSA, sections={"A": BLUE_BOSSA}, form="A",
      plan=[("theme", 2, "flute"), ("solo", 2, "jazzgtr"), ("solo", 2, "flute"), ("theme", 2, "flute")]),

    # ------------------------------------------------------------------ modulations that count
    P(id="so-what-modal", title="So What", standard=True, key="D minor", bpm=136, seed=519, style="modal",
      sections={"A": " | ".join(["Dm7"] * 8), "B": (" | ".join(["Ebm7"] * 8), "Eb minor")}, form="AABA",
      band=dict(drums="swing", bass="walk", piano="quartal"),
      plan=[("theme", 1, "trumpet"), ("solo", 2, "trumpet"), ("solo", 1, "tenor"), ("theme", 1, "trumpet")],
      vary=0.0, subset=True),
    P(id="pont-autre-ton", title="Ballade au pont lointain", key="Db major", bpm=72, seed=520, style="ballad",
      sections={"A": "Ebm7 Bb7 | Ebm7 Ab7 | Dbmaj7 Gb7 | Fm7 E7 | Ebm7 Ab7 | Dbmaj7 Bb7 | Ebm7 Ab7 | Dbmaj7",
                "B": ("Em7 A7 | Dmaj7 | Em7 A7 | Dmaj7 | Bm7 E7 | Amaj7 | Em7 A7 | Dmaj7 Ab7", "D major")},
      form="AABA", band=BALLAD,
      plan=[("theme", 1, "tenor"), ("solo", "AA", "piano"), ("theme", "BA", "tenor")],
      subset=True, render=("propre", "disque")),
    P(id="demi-ton-final", title="Chorus final un demi-ton plus haut", key="F major", bpm=160, seed=521,
      sections={"A": "Fmaj7 | Dm7 | Gm7 | C7 | Am7 | Dm7 | Gm7 | C7",
                "B": "Cm7 | F7 | Bbmaj7 | Bbmaj7 | Am7 | D7 | Gm7 | C7"},
      form="AABA",
      plan=[("theme", 1, "voice"), ("solo", 1, "jazzgtr"), ("solo", 1, "piano"), ("theme", 1, "voice", dict(up=1))],
      subset=True),
    P(id="pont-en-mi", title="Pont en mi", key="C major", bpm=144, seed=522,
      sections={"A": "Cmaj7 | Am7 | Dm7 | G7 | Em7 | A7 | Dm7 | G7",
                "B": ("F#m7 | B7 | Emaj7 | C#m7 | F#m7 | B7 | Emaj7 | G7", "E major")},
      form="AABA",
      plan=[("theme", 1, "alto"), ("solo", 2, "piano"), ("theme", 1, "alto")]),

    # ------------------------------------------------------------------ modulations that do NOT count
    P(id="relatif-va-et-vient", title="Va-et-vient avec le relatif", key="C major", bpm=150, seed=523,
      sections={"A": "Cmaj7 | Am7 | Dm7 | G7 | Cmaj7 | Am7 | Dm7 G7 | Cmaj7",
                "B": "Bm7b5 | E7 | Am7 | Am7 | Bm7b5 | E7 | Am7 | G7"},
      form="AABA",
      plan=[("theme", 1, "trombone"), ("solo", 1, "trombone"), ("solo", 1, "jazzgtr"), ("theme", 1, "trombone")],
      band=dict(drums="swing", bass="walk", piano="comp", guitar="four")),
    P(id="deux-cinq-passage", title="Deux-cinq de passage", key="Bb major", bpm=184, seed=524,
      sections={"A": "Bbmaj7 | Cm7 F7 | Dm7 G7 | Cm7 F7 | Fm7 Bb7 | Ebmaj7 | Am7 D7 | Gm7 C7",
                "B": "Cm7 | F7 | Dm7 G7 | Cm7 F7 | Ebm7 Ab7 | Dbmaj7 | Cm7 | F7"},
      form="AABA",
      plan=[("theme", 1, "tenor"), ("solo", 2, "trumpet"), ("theme", 1, "tenor")], subset=True),
    P(id="mineur-pont-majeur", title="Thème mineur, pont court en majeur", key="D minor", bpm=132, seed=525,
      sections={"A": "Dm7 | Em7b5 A7 | Dm7 | Em7b5 A7 | Gm7 | C7 | Fmaj7 | Em7b5 A7",
                "B": "Bbmaj7 | Bbmaj7 | Gm7 | C7 | Em7b5 | A7 | Dm7 | Em7b5 A7"},
      form="AABA",
      plan=[("theme", 1, "flute"), ("solo", 1, "vibes"), ("solo", 1, "flute"), ("theme", 1, "flute")]),
    P(id="chaine-deux-cinq", title="Chaîne de II-V", key="C major", bpm=132, seed=526,
      sections={"A": _sec("deux-cinq-chaine", 0)}, form="A", band=GUITAR_TRIO,
      plan=[("theme", 1, "clarinet"), ("solo", 2, "clarinet"), ("solo", 1, "jazzgtr"), ("theme", 1, "clarinet")]),

    # ------------------------------------------------------------------ more parts: half-chorus solos, drums, bass
    P(id="demi-chorus", title="Solos d'un demi-chorus", key="Ab major", bpm=168, seed=527,
      sections={"A": "Abmaj7 | Fm7 | Bbm7 | Eb7 | Cm7 | F7 | Bbm7 | Eb7",
                "B": "Ebm7 | Ab7 | Dbmaj7 | Dbmaj7 | Dm7 | G7 | Bbm7 | Eb7"},
      form="AABA",
      plan=[("theme", 1, "trumpet"), ("solo", "AA", "alto"), ("solo", "BA", "trombone"), ("solo", "AA", "piano"),
            ("solo", "BA", "acbass"), ("theme", 1, "trumpet")], subset=True),
    P(id="batterie-et-basse", title="Solos de basse et de batterie", key="Eb major", bpm=200, seed=528,
      sections={"A": "Ebmaj7 | Cm7 | Fm7 | Bb7 | Gm7 C7 | Fm7 Bb7 | Ebmaj7 | Bb7"},
      form="AA",
      plan=[("theme", 1, "trumpet"), ("solo", 2, "piano"), ("solo", 2, "acbass"), ("solo", 1, "drums"),
            ("theme", 1, "trumpet")]),

    # ------------------------------------------------------------------ pop
    P(id="pop-ballade", title="Chanson pop en sol", mode="pop", style="pop", key="G major", bpm=80, seed=531,
      sections={"A": "G | D | Em | C | G | D | C | C",
                "B": "C | G | D | Em | C | G | D | D",
                "C": "Am | Em | C | D | Am | Em | C | D"},
      form="", band=POP,
      plan=[("intro", "G | D | C | C", None), ("verse", "A", "voice"), ("chorus", "B", "voice"),
            ("verse", "A", "voice"), ("chorus", "B", "voice"), ("bridge", "C", "voice"), ("solo", "A", "jazzgtr"),
            ("chorus", "BB", "voice"), ("outro", "G | D | C | G", None)],
      vary=0.0, subset=True, render=("propre", "disque")),
    P(id="pop-camion", title="Chanson qui monte d'un ton", mode="pop", style="pop", key="A major", bpm=116, seed=532,
      sections={"A": "A | F#m | D | E | A | F#m | D | E",
                "B": "D | A | E | F#m | D | A | E | E"},
      form="", band=POP,
      plan=[("intro", "A | A | D | E", None), ("verse", "A", "voice"), ("chorus", "B", "voice"),
            ("verse", "A", "voice"), ("chorus", "B", "voice"), ("solo", "A", "jazzgtr"),
            ("chorus", "BB", "voice", dict(up=2)), ("outro", "B | B | E | B", None, dict(up=2))],
      vary=0.0, subset=True),
    P(id="pop-rock", title="Rock en mi", mode="pop", style="pop", key="E major", bpm=132, seed=533,
      sections={"A": "E | E | A | A | E | E | B | B",
                "B": "A | B | E | C#m | A | B | E | E",
                "C": "C#m | A | E | B | C#m | A | B | B"},
      form="", band=POP,
      plan=[("intro", "E | E | E | E", "jazzgtr"), ("verse", "A", "voice"), ("chorus", "B", "voice"),
            ("verse", "A", "voice"), ("chorus", "B", "voice"), ("bridge", "C", "voice"), ("solo", "AB", "jazzgtr"),
            ("chorus", "B", "voice"), ("outro", "E | E | B | E", None)],
      vary=0.0),
    P(id="pop-valse", title="Chanson à trois temps", mode="pop", style="pop", key="F major", meter=3, bpm=138, seed=534,
      sections={"A": "F | C | Dm | Bb | F | C | Bb | C",
                "B": "Bb | C | F | Dm | Bb | C | F | F"},
      form="", band=POP,
      plan=[("intro", "F | C | F | C", None), ("verse", "A", "voice"), ("chorus", "B", "voice"),
            ("verse", "A", "voice"), ("chorus", "B", "voice"), ("solo", "A", "piano"), ("chorus", "B", "voice"),
            ("outro", "F | C | F | F", None)],
      vary=0.0),
    P(id="pop-mineur", title="Chanson pop en la mineur", mode="pop", style="pop", key="A minor", bpm=96, seed=535,
      sections={"A": "Am | F | C | G | Am | F | C | G",
                "B": "F | G | C | Am | F | G | Am | Am",
                "C": "Dm | Am | Dm | E | Dm | Am | E | E"},
      form="", band=POP,
      plan=[("intro", "Am | F | C | G", None), ("verse", "A", "voice"), ("verse", "A", "voice"), ("chorus", "B", "voice"),
            ("verse", "A", "voice"), ("chorus", "B", "voice"), ("bridge", "C", "voice"), ("chorus", "BB", "voice"),
            ("outro", "Am | Am", None)],
      vary=0.0),

    # ------------------------------------------------------------------ jazz with a vocal head and more instruments
    P(id="aaba-chant-vibes", title="Chanson en la bémol", key="Ab major", bpm=120, seed=536, style="ballad",
      sections={"A": "Abmaj7 | Bbm7 Eb7 | Abmaj7 | Ebm7 Ab7 | Dbmaj7 | Gb7 | Cm7 F7 | Bbm7 Eb7",
                "B": "Dbmaj7 | Dbm7 Gb7 | Abmaj7 | Fm7 | Bb7 | Bb7 | Bbm7 | Eb7"},
      form="AABA", band=BALLAD,
      plan=[("intro", "Bbm7 | Eb7 | Abmaj7 | Eb7", "piano"), ("theme", 1, "voice"), ("solo", 1, "vibes"),
            ("solo", "AA", "alto"), ("theme", "BA", "voice"), ("tag", "2x3", "voice")]),
    P(id="abac-quatre-vents", title="Quatre vents", key="Bb major", bpm=188, seed=537,
      sections={"A": "Bbmaj7 | G7 | Cm7 | F7 | Dm7 | G7 | Cm7 | F7",
                "B": "Fm7 | Bb7 | Ebmaj7 | Ab7 | Dm7 | G7 | Cm7 | F7",
                "C": "Ebmaj7 | Edim7 | Dm7 | G7 | Cm7 | F7 | Bbmaj7 | Cm7 F7"},
      form="ABAC",
      plan=[("theme", 1, "trumpet"), ("solo", 1, "tenor"), ("solo", 1, "trombone"), ("solo", 1, "flute"),
            ("solo", 1, "trumpet"), ("theme", 1, "trumpet")], render=("propre", "disque")),
]
