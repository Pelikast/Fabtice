"""The pieces of the synthetic corpus.

Every chart below is written for this bench: generic jazz forms (blues,
rhythm changes, ii-V-I chains, modal vamp, bossa, ballad, waltz) and, for the
« known chart » test, a few pieces that follow the harmony of well-known
standards or public-domain tunes (written before 1929). For those the title is
the real one; the chords are our own reading of common practice, not copied
from any collection.

Fields
------
id, title, standard (True when the title is a real tune, for title lookup),
style: swing | ballad | bossa | waltz | trad | modal | shuffle
meter, key ("Bb major"), bpm, choruses, form: [(section, chart)],
band: which instrument plays what (see arrange.py, ROLES),
knobs: difficulty settings (see arrange.py, KNOBS), seed.
"""

BLUES_F = "F7 | Bb7 | F7 | Cm7 F7 | Bb7 | Bdim7 | F7 | Am7 D7 | Gm7 | C7 | F7 D7 | Gm7 C7"
BIRD_BLUES_F = ("Fmaj7 | Em7b5 A7 | Dm7 G7 | Cm7 F7 | Bb7 | Bbm7 Eb7 | Am7 D7 | Abm7 Db7 | "
                "Gm7 | C7 | Am7 D7 | Gm7 C7")

PIECES = [
    # ------------------------------------------------------------ blues family
    dict(id="blues-fa-swing", title="Blues en fa", standard=False, style="swing", meter=4,
         key="F major", bpm=138, choruses=6, form=[("A", BLUES_F)],
         band=dict(drums="swing", bass="walk", piano="comp", other="tenor:head-solo"),
         knobs=dict(lead_db=2, tension=0.35, variation=0.3, drift=0.01), seed=101),
    dict(id="blues-sib-basie", title="Blues en si bémol, façon Basie", standard=False, style="swing",
         meter=4, key="Bb major", bpm=158, choruses=6,
         form=[("A", "Bb7 | Eb7 | Bb7 | Bb7 | Eb7 | Edim7 | Bb7 | G7 | Cm7 | F7 | Bb7 G7 | Cm7 F7")],
         band=dict(drums="swing", bass="walk", guitar="four", piano="sparse", other="trumpet:head-solo"),
         knobs=dict(lead_db=3, tension=0.3, variation=0.35, drift=0.015), seed=102),
    dict(id="blues-mineur-do", title="Blues mineur en do", standard=False, style="swing", meter=4,
         key="C minor", bpm=118, choruses=5,
         form=[("A", "Cm7 | Fm7 | Cm7 | Cm7 | Fm7 | Fm7 | Cm7 | Cm7 | Ab7 | G7b9 | Cm7 | Dm7b5 G7b9")],
         band=dict(drums="swing", bass="walk", piano="comp", other="alto:head-solo"),
         knobs=dict(lead_db=5, tension=0.45, variation=0.25, drift=0.01, minor=True), seed=103),
    dict(id="blues-bird", title="Blues « Parker » en fa", standard=False, style="swing", meter=4,
         key="F major", bpm=196, choruses=7, form=[("A", BIRD_BLUES_F)],
         band=dict(drums="swing", bass="walk", piano="comp", other="alto:solo"),
         knobs=dict(lead_db=4, tension=0.45, variation=0.3, drift=0.01), seed=104),
    dict(id="blues-valse-sol", title="Blues à trois temps en sol", standard=False, style="waltz", meter=3,
         key="G major", bpm=168, choruses=5,
         form=[("A", "G7 | C7 | G7 | Dm7 G7 | C7 | C#dim7 | G7 | Bm7 E7 | Am7 | D7 | G7 E7 | Am7 D7")],
         band=dict(drums="waltz", bass="walk", piano="comp", other="vibes:head-solo"),
         knobs=dict(lead_db=1, tension=0.35, variation=0.3, drift=0.01), seed=105),
    dict(id="blues-lent-shuffle", title="Blues lent en mi bémol", standard=False, style="shuffle", meter=4,
         key="Eb major", bpm=76, choruses=3,
         form=[("A", "Eb7 | Ab7 | Eb7 | Bbm7 Eb7 | Ab7 | Adim7 | Eb7 | C7 | Fm7 | Bb7 | Eb7 C7 | Fm7 Bb7")],
         band=dict(drums="shuffle", bass="walk", piano="comp", other="tenor:solo", vocals="pad"),
         knobs=dict(lead_db=5, tension=0.4, variation=0.3, drift=0.02), seed=106),

    # ---------------------------------------------------------- rhythm, ii-V
    dict(id="anatole-sib", title="I Got Rhythm", standard=True, style="swing", meter=4,
         key="Bb major", bpm=212, choruses=3,
         form=[("A", "Bb6 G7 | Cm7 F7 | Dm7 G7 | Cm7 F7 | Fm7 Bb7 | Eb7 Edim7 | Dm7 G7 | Cm7 F7"),
               ("A", "Bb6 G7 | Cm7 F7 | Dm7 G7 | Cm7 F7 | Fm7 Bb7 | Eb7 Edim7 | Cm7 F7 | Bb6"),
               ("B", "D7 | D7 | G7 | G7 | C7 | C7 | F7 | F7"),
               ("A", "Bb6 G7 | Cm7 F7 | Dm7 G7 | Cm7 F7 | Fm7 Bb7 | Eb7 Edim7 | Cm7 F7 | Bb6")],
         band=dict(drums="swing", bass="walk", piano="comp", other="tenor:head-solo"),
         knobs=dict(lead_db=3, tension=0.4, variation=0.35, drift=0.01), seed=107),
    dict(id="deux-cinq-chaine", title="Chaîne de II-V", standard=False, style="swing", meter=4,
         key="C major", bpm=132, choruses=4,
         form=[("A", "Dm7 | G7 | Cmaj7 | Cmaj7 | Cm7 | F7 | Bbmaj7 | Bbmaj7 | "
                     "Bbm7 | Eb7 | Abmaj7 | Am7b5 D7b9 | Gm7 | C7 | Fmaj7 | Em7b5 A7b9")],
         band=dict(drums="swing", bass="walk", guitar="comp", other="clarinet:head-solo"),
         knobs=dict(lead_db=2, tension=0.35, variation=0.3, drift=0.01), seed=108),
    dict(id="deux-cinq-mineur-rapide", title="II-V mineurs rapides", standard=False, style="swing", meter=4,
         key="D minor", bpm=236, choruses=5,
         form=[("A", "Em7b5 | A7b9 | Dm6 | Dm6 | Bm7b5 | E7b9 | Am6 | Am6 | "
                     "Am7b5 | D7b9 | Gm7 | Gm7 | Em7b5 | A7b9 | Dm6 | Em7b5 A7b9")],
         band=dict(drums="swing", bass="walk", piano="comp", other="trumpet:solo"),
         knobs=dict(lead_db=4, tension=0.45, variation=0.25, drift=0.01, minor=True), seed=109),
    dict(id="tous-ces-trucs", title="All the Things You Are", standard=True, style="swing", meter=4,
         key="Ab major", bpm=168, choruses=2,
         form=[("A", "Fm7 | Bbm7 | Eb7 | Abmaj7 | Dbmaj7 | G7 | Cmaj7 | Cmaj7"),
               ("A", "Cm7 | Fm7 | Bb7 | Ebmaj7 | Abmaj7 | Am7b5 D7 | Gmaj7 | Gmaj7"),
               ("B", "Am7 | D7 | Gmaj7 | Gmaj7 | F#m7b5 | B7 | Emaj7 | C+7"),
               ("A", "Fm7 | Bbm7 | Eb7 | Abmaj7 | Dbmaj7 | Dbm7 | Cm7 | Bdim7 | Bbm7 | Eb7 | Abmaj7 | Gm7b5 C7")],
         band=dict(drums="swing", bass="walk", piano="comp", other="trumpet:head-solo"),
         knobs=dict(lead_db=2, tension=0.35, variation=0.25, drift=0.01), seed=110),
    dict(id="satin", title="Satin Doll", standard=True, style="swing", meter=4,
         key="C major", bpm=124, choruses=2,
         form=[("A", "Dm7 G7 | Dm7 G7 | Em7 A7 | Em7 A7 | Am7 D7 | Abm7 Db7 | Cmaj7 | Cmaj7"),
               ("A", "Dm7 G7 | Dm7 G7 | Em7 A7 | Em7 A7 | Am7 D7 | Abm7 Db7 | Cmaj7 | Cmaj7"),
               ("B", "Gm7 | C7 | Fmaj7 | Fmaj7 | Am7 | D7 | G7 | G7"),
               ("A", "Dm7 G7 | Dm7 G7 | Em7 A7 | Em7 A7 | Am7 D7 | Abm7 Db7 | Cmaj7 | Cmaj7")],
         band=dict(drums="swing", bass="walk", guitar="comp", other="mutedtrumpet:head-solo"),
         knobs=dict(lead_db=1, tension=0.35, variation=0.2, drift=0.01), seed=111),

    # -------------------------------------------------------------- modal
    dict(id="so-what", title="So What", standard=True, style="modal", meter=4,
         key="D minor", bpm=136, choruses=2,
         form=[("A", " | ".join(["Dm7"] * 8)), ("A", " | ".join(["Dm7"] * 8)),
               ("B", " | ".join(["Ebm7"] * 8)), ("A", " | ".join(["Dm7"] * 8))],
         band=dict(drums="swing", bass="walk", piano="quartal", other="tenor:solo"),
         knobs=dict(lead_db=4, tension=0.5, variation=0.0, drift=0.01, minor=True), seed=112),

    # ---------------------------------------------------------------- bossa
    dict(id="blue-bossa", title="Blue Bossa", standard=True, style="bossa", meter=4,
         key="C minor", bpm=140, choruses=5,
         form=[("A", "Cm7 | Cm7 | Fm7 | Fm7 | Dm7b5 | G7b9 | Cm7 | Cm7 | "
                     "Ebm7 | Ab7 | Dbmaj7 | Dbmaj7 | Dm7b5 | G7b9 | Cm7 | Dm7b5 G7b9")],
         band=dict(drums="bossa", bass="bossa", guitar="bossa", other="flute:head-solo"),
         knobs=dict(lead_db=2, tension=0.35, variation=0.25, drift=0.005, minor=True), seed=113),
    dict(id="ipanema", title="The Girl from Ipanema", standard=True, style="bossa", meter=4,
         key="F major", bpm=128, choruses=2,
         form=[("A", "Fmaj7 | Fmaj7 | G7 | G7 | Gm7 | Gb7 | Fmaj7 | Gb7"),
               ("A", "Fmaj7 | Fmaj7 | G7 | G7 | Gm7 | Gb7 | Fmaj7 | Fmaj7"),
               ("B", "Gbmaj7 | Gbmaj7 | B7 | B7 | F#m7 | F#m7 | D7 | D7 | Gm7 | Gm7 | Eb7 | Eb7 | Am7 | D7b9 | Gm7 | C7b9"),
               ("A", "Fmaj7 | Fmaj7 | G7 | G7 | Gm7 | Gb7 | Fmaj7 | Gb7")],
         band=dict(drums="bossa", bass="bossa", guitar="bossa", piano="sparse", vocals="lead"),
         knobs=dict(lead_db=3, tension=0.3, variation=0.15, drift=0.005), seed=114),
    dict(id="bossa-mi", title="Bossa en mi", standard=False, style="bossa", meter=4,
         key="E major", bpm=150, choruses=4,
         form=[("A", "Emaj7 | C#m7 | F#m7 | B7 | G#m7 | Gdim7 | F#m7 | F7 | "
                     "Emaj7 | E7 | Amaj7 | Am6 | G#m7 | C#7b9 | F#m7 B7 | Emaj7")],
         band=dict(drums="bossa", bass="bossa", guitar="bossa", piano="comp", other="tenor:head-solo"),
         knobs=dict(lead_db=2, tension=0.35, variation=0.3, drift=0.005), seed=115),

    # --------------------------------------------------------------- ballads
    dict(id="ballade-mib", title="Ballade en mi bémol", standard=False, style="ballad", meter=4,
         key="Eb major", bpm=64, choruses=2,
         form=[("A", "Ebmaj7 | Cm7 F7 | Fm7 Bb7 | Gm7 C7 | Fm7 E7 | Ebmaj7 Ab7 | Dm7b5 G7b9 | Cm7 B7 | "
                     "Bbm7 Eb7 | Abmaj7 Db7 | Gm7 C7 | Fm7 Bb7 | Gm7 Gb7 | Fm7 E7 | Ebmaj7 C7 | Fm7 Bb7")],
         band=dict(drums="brushes", bass="two", piano="ballad", other="tenor:head"),
         knobs=dict(lead_db=5, tension=0.45, variation=0.3, drift=0.03), seed=116),
    dict(id="ballade-cuivres", title="Ballade pour cuivres en ré bémol", standard=False, style="ballad", meter=4,
         key="Db major", bpm=72, choruses=2,
         form=[("A", "Dbmaj7 | Bbm7 | Ebm7 Ab7 | Fm7 Bb7 | Ebm7 | A7 Ab7 | Dbmaj7 Bb7 | Ebm7 Ab7 | "
                     "Gbmaj7 | Gbm6 | Fm7 | Bb7b9 | Ebm7 | Ab7 | Dbmaj7 | Ebm7 Ab7")],
         band=dict(drums="brushes", bass="two", other="section", piano="sparse"),
         knobs=dict(lead_db=0, tension=0.35, variation=0.3, drift=0.03), seed=117),
    dict(id="feuilles-mortes", title="Autumn Leaves", standard=True, style="swing", meter=4,
         key="G minor", bpm=128, choruses=2,
         form=[("A", "Cm7 | F7 | Bbmaj7 | Ebmaj7 | Am7b5 | D7 | Gm6 | Gm6"),
               ("A", "Cm7 | F7 | Bbmaj7 | Ebmaj7 | Am7b5 | D7 | Gm6 | Gm6"),
               ("B", "Am7b5 | D7 | Gm6 | Gm6 | Cm7 | F7 | Bbmaj7 | Ebmaj7"),
               ("C", "Am7b5 | D7b9 | Gm7 C7 | Fm7 Bb7 | Am7b5 | D7b9 | Gm6 | Gm6")],
         band=dict(drums="swing", bass="walk", vocals="pad"),
         knobs=dict(lead_db=0, tension=0.3, variation=0.25, drift=0.015, minor=True), seed=118),
    dict(id="chorale-voix", title="Choral pour voix en sol", standard=False, style="ballad", meter=4,
         key="G major", bpm=80, choruses=2,
         form=[("A", "Gmaj7 | Em7 | Am7 | D7 | Bm7 | E7 | Am7 | D7b9 | "
                     "Gmaj7 | G7 | Cmaj7 | Cm6 | Bm7 E7 | Am7 D7 | G6 | Am7 D7")],
         band=dict(drums="brushes", bass="two", vocals="pad", guitar="sparse"),
         knobs=dict(lead_db=0, tension=0.3, variation=0.3, drift=0.02), seed=119),

    # ---------------------------------------------------------------- waltzes
    dict(id="valse-sib", title="Valse en si bémol", standard=False, style="waltz", meter=3,
         key="Bb major", bpm=156, choruses=4,
         form=[("A", "Bbmaj7 | Gm7 | Cm7 | F7 | Dm7 | G7 | Cm7 | F7 | "
                     "Fm7 | Bb7 | Ebmaj7 | Ab7 | Dm7 | G7b9 | Cm7 | F7")],
         band=dict(drums="waltz", bass="walk", piano="comp", other="vibes:head-solo"),
         knobs=dict(lead_db=1, tension=0.35, variation=0.3, drift=0.01), seed=120),
    dict(id="valse-cliche-re", title="Valse mineure en ré (cliché)", standard=False, style="waltz", meter=3,
         key="D minor", bpm=132, choruses=3,
         form=[("A", "Dm | Dm(maj7) | Dm7 | Dm6 | Gm | Gm(maj7) | Gm7 | Gm6 | "
                     "Em7b5 | A7b9 | Dm7 | Bb7 | Em7b5 | A7b9 | Dm6 | A7b9")],
         band=dict(drums="waltz", bass="pedal", piano="comp", other="clarinet:head-solo"),
         knobs=dict(lead_db=2, tension=0.3, variation=0.2, drift=0.01, minor=True), seed=121),

    # -------------------------------------------- traditional jazz (old records)
    dict(id="saints", title="When the Saints Go Marching In", standard=True, style="trad", meter=4,
         key="Bb major", bpm=184, choruses=6,
         form=[("A", "Bb | Bb | Bb | Bb | Bb | Bb | F7 | F7 | Bb | Bb7 | Eb | Ebm | Bb/F | F7 | Bb | Bb")],
         band=dict(drums="trad", bass="tuba", guitar="banjo", piano="stride", other="dixie"),
         knobs=dict(lead_db=2, tension=0.25, variation=0.2, drift=0.02), seed=122),
    dict(id="st-louis", title="St. Louis Blues", standard=True, style="trad", meter=4,
         key="G major", bpm=132, choruses=2,
         form=[("A", "G | C7 | G | G7 | C7 | C7 | G | G | D7 | D7 | G | G"),
               ("B", "Gm | D7 | D7 | Gm | Gm | D7 | D7 | Gm | Gm | D7 | D7 | Gm | Cm | Gm | D7 | Gm"),
               ("A", "G | C7 | G | G7 | C7 | C7 | G | G | D7 | D7 | G | G")],
         band=dict(drums="trad", bass="tuba", guitar="banjo", other="dixie"),
         knobs=dict(lead_db=2, tension=0.25, variation=0.15, drift=0.025), seed=123),
    dict(id="georgia", title="Sweet Georgia Brown", standard=True, style="trad", meter=4,
         key="F major", bpm=196, choruses=3,
         form=[("A", "D7 | D7 | G7 | G7 | C7 | C7 | F | F"),
               ("B", "D7 | D7 | G7 | G7 | Am | E7 | Am | E7"),
               ("A", "D7 | D7 | G7 | G7 | C7 | C7 | F | F"),
               ("C", "Dm | A7 | Dm | A7 | F | D7 | G7 C7 | F")],
         band=dict(drums="trad", bass="walk", guitar="four", piano="stride", other="clarinet:solo"),
         knobs=dict(lead_db=3, tension=0.3, variation=0.2, drift=0.02), seed=124),
    dict(id="bill-bailey", title="Bill Bailey", standard=True, style="trad", meter=4,
         key="Bb major", bpm=176, choruses=4,
         form=[("A", "Bb | Bb | Bb | F7 | F7 | F7 | F7 | Bb | Bb | Bb7 | Eb | Edim7 | Bb/F | F7 | Bb | Bb")],
         band=dict(drums="trad", bass="tuba", guitar="banjo", other="dixie"),
         knobs=dict(lead_db=3, tension=0.25, variation=0.2, drift=0.025), seed=125),
]
