"""Real recordings with known chords: jazz and bossa nova comping from GuitarSet
(Xi, Bittner, Ye, Pauwels, Bello, ISMIR 2018; CC BY 4.0), as published on
Hugging Face at a pinned revision. Only the columns needed are read (range
requests: the microphone recording, the chords, the beats), about 0.6 GB in
all instead of 8 GB. Nothing is committed: the audio lands in data/corpus/.

    .venv/bin/python corpus/reel_guitarset.py

GuitarSet's chord labels are the chords as performed (inferred from the
notes played, then checked by hand), in Harte notation with degrees
(« G:(1,5,2,b7,4)/5 »). They are converted here to the app's vocabulary.
Each track is one pass of a short progression (no repeats), solo guitar.
"""

import hashlib
import io
import json
import re
import sys
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from httpfile import HttpFile  # noqa: E402
from harmony import Chord  # noqa: E402
import render  # noqa: E402

ROOT = HERE.parent
CORPUS = ROOT / "data" / "corpus"
REVISION = "4aca25487bef5cb0d2c4ec146218f9145402a776"
BASE = f"https://huggingface.co/datasets/jhartquist/guitarset/resolve/{REVISION}/data/train/"
FILES = [f"{i:04d}.parquet" for i in range(18)]
SOURCE = dict(name="GuitarSet 1.1.0 (jhartquist/guitarset on Hugging Face)", revision=REVISION,
              licence="CC BY 4.0", citation="Xi et al., GuitarSet: A Dataset for Guitar Transcription, ISMIR 2018")

PLAYERS = ["00", "01", "02", "03"]
PROGRESSIONS = ["Jazz1", "Jazz2", "Jazz3", "BN1", "BN2", "BN3"]

SHORTHAND = {
    "": (), "maj": (0, 4, 7), "min": (0, 3, 7), "dim": (0, 3, 6), "aug": (0, 4, 8),
    "maj7": (0, 4, 7, 11), "min7": (0, 3, 7, 10), "7": (0, 4, 7, 10), "dim7": (0, 3, 6, 9),
    "hdim7": (0, 3, 6, 10), "minmaj7": (0, 3, 7, 11), "maj6": (0, 4, 7, 9), "min6": (0, 3, 7, 9),
    "9": (0, 4, 7, 10, 2), "maj9": (0, 4, 7, 11, 2), "min9": (0, 3, 7, 10, 2), "sus2": (0, 2, 7),
    "sus4": (0, 5, 7), "11": (0, 4, 7, 10, 2, 5), "min11": (0, 3, 7, 10, 2, 5), "13": (0, 4, 7, 10, 2, 9),
    "maj13": (0, 4, 7, 11, 2, 9), "min13": (0, 3, 7, 10, 2, 9),
}
DEG = {"1": 0, "2": 2, "3": 4, "4": 5, "5": 7, "6": 9, "7": 11, "9": 2, "11": 5, "13": 9}


def degree(d):
    m = re.match(r"([b#]*)(\d+)$", d)
    s = DEG[m.group(2)]
    for ch in m.group(1):
        s += -1 if ch == "b" else 1
    return s % 12


def harte_to_chord(label):
    """Harte label with degrees -> Chord of the app's vocabulary (None for N)."""
    if label in ("N", "X"):
        return None
    m = re.match(r"([A-G][b#]*):?([a-z0-9]*)(?:\(([^)]*)\))?(?:/([b#]*\d+))?$", label)
    if not m:
        raise ValueError(label)
    name = m.group(1)
    root = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}[name[0]]
    for ch in name[1:]:
        root += -1 if ch == "b" else 1
    S = set(SHORTHAND[m.group(2)])
    for d in (m.group(3) or "").split(","):
        d = d.strip()
        if not d:
            continue
        if d.startswith("*"):
            S.discard(degree(d[1:]))
        else:
            S.add(degree(d))
    bass = (root + degree(m.group(4))) % 12 if m.group(4) else None
    ext = []
    if 4 in S:
        if 10 in S:
            q = "aug7" if (8 in S and 7 not in S) else "7"
            ext = [n for i, n in ((1, "b9"), (2, "9"), (3, "#9"), (6, "#11"), (9, "13")) if i in S]
            if 8 in S and q == "7":
                ext.append("b13")
        elif 11 in S:
            q = "maj7"
            ext = [n for i, n in ((2, "9"), (6, "#11"), (9, "13")) if i in S]
        elif 9 in S:
            q = "maj6"
            ext = ["9"] if 2 in S else []
        elif 8 in S and 7 not in S:
            q = "aug"
        else:
            q = "maj"
            ext = [n for i, n in ((2, "9"), (6, "#11")) if i in S]
    elif 3 in S:
        if 6 in S and 7 not in S:
            q = "dim7" if 9 in S else "hdim7" if 10 in S else "dim"
        elif 10 in S:
            q = "min7"
            ext = [n for i, n in ((2, "9"), (5, "11")) if i in S]
        elif 11 in S:
            q = "minmaj7"
        elif 9 in S:
            q = "min6"
            ext = ["9"] if 2 in S else []
        else:
            q = "min"
            ext = ["9"] if 2 in S else []
    elif 5 in S:
        q = "7sus4" if 10 in S else "sus4"
        ext = [n for i, n in ((2, "9"), (9, "13")) if i in S]
    elif 2 in S:
        q = "sus2"
    else:
        q = "maj"  # root and fifth only
    return Chord(root, q, ext, bass)


def wanted():
    out = set()
    for pl in PLAYERS:
        for k, pr in enumerate(PROGRESSIONS):
            out.add((pl, pr, (int(pl) + k) % 2))  # alternate slow / fast take
    return out


def main():
    CORPUS.mkdir(parents=True, exist_ok=True)
    want = wanted()
    done = 0
    for fname in FILES:
        f = HttpFile(BASE + fname)
        p = pq.ParquetFile(f)
        ids = p.read(columns=["track_id"]).column("track_id").to_pylist()
        # takes of each (player, progression), slow first
        rows_per_group = [p.metadata.row_group(i).num_rows for i in range(p.metadata.num_row_groups)]
        chosen = []
        for i, tid in enumerate(ids):
            m = re.match(r"(\d\d)_(\w+?\d)-(\d+)-([A-G][b#]?)_comp$", tid)
            if not m:
                continue
            pl, pr, bpm = m.group(1), m.group(2), int(m.group(3))
            takes = sorted(int(re.match(r"\d\d_\w+?\d-(\d+)-", t).group(1)) for t in ids if t.startswith(f"{pl}_{pr}-") and t.endswith("_comp"))
            if (pl, pr, takes.index(bpm) if bpm in takes else -1) in want:
                chosen.append(i)
        if not chosen:
            continue
        start = 0
        for g, n in enumerate(rows_per_group):
            rows = [i - start for i in chosen if start <= i < start + n]
            start += n
            if not rows:
                continue
            t = p.read_row_group(g, columns=["track_id", "key_mode", "tempo_bpm", "audio_mono_mic", "chords", "beats_s"]).to_pylist()
            for r in rows:
                write_track(t[r])
                done += 1
        print(f"  {fname}: {len(chosen)} morceaux ({f.fetched / 1e6:.0f} Mo lus)", flush=True)
    print(f"{done} enregistrements GuitarSet prêts.")


def write_track(row):
    tid = row["track_id"]
    pid = "gs-" + tid.lower().replace("_comp", "").replace("_", "-").replace("#", "d")
    out = CORPUS / pid
    (out / "reel").mkdir(parents=True, exist_ok=True)
    (out / "reel-disque").mkdir(parents=True, exist_ok=True)
    wav = row["audio_mono_mic"]["bytes"]
    (out / "reel" / "mix.wav").write_bytes(wav)
    x, sr = sf.read(io.BytesIO(wav), dtype="float32")
    if x.ndim == 2:
        x = x.mean(axis=1)
    assert sr == render.SR
    # old-record version of the real recording
    seed = int(hashlib.sha256(tid.encode()).hexdigest()[:8], 16)
    rng = np.random.default_rng(seed)
    old = render.old_settings(rng, 0.6)
    y, time_scale = render.old_linear(x, old, seed)
    ymix, _ = render.old_finish(y, old, seed)
    ymix = ymix / max(1.0, np.max(np.abs(ymix)) / 0.98)
    sf.write(str(out / "reel-disque" / "mix.flac"), ymix, render.SR, subtype="PCM_16", format="FLAC")

    beats = [float(b) for b in row["beats_s"]]
    chords = [(c["onset_s"], c["offset_s"], c["label"]) for c in row["chords"]]
    # the first downbeat: the beat closest to the first chord's onset
    down = int(np.argmin([abs(b - chords[0][0]) for b in beats]))
    period = float(np.median(np.diff(beats)))
    meter = 4
    bars = []
    for k in range(down, len(beats) - 1, meter):
        bb = beats[k:k + meter]
        if len(bb) < meter:
            break
        end = beats[k + meter] if k + meter < len(beats) else bb[-1] + period
        seq = []
        for j, b in enumerate(bb):
            e = bb[j + 1] if j + 1 < meter else end
            mid = (b + e) / 2
            lab = next((l for a, z, l in chords if a <= mid < z), None)
            c = harte_to_chord(lab) if lab else None
            if c is None:
                continue
            if not seq or seq[-1][1] != c:
                seq.append((j + 1, c))
        if not seq:
            continue
        bars.append(dict(index=len(bars), chorus=1, section="A", start=round(bb[0], 4), end=round(end, 4),
                         beats=[round(b, 4) for b in bb], chords=[dict(beat=b, **c.json()) for b, c in seq]))
    key_name, mode = row["key_mode"].split(":")
    tonic = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}[key_name[0]] + {"b": -1, "#": 1}.get(key_name[1:2], 0)
    prog = re.match(r"\d\d_(\w+?\d)", tid).group(1)
    truth = dict(
        id=pid, title=f"GuitarSet {prog} (guitariste {tid[:2]})", standard=False, source="guitarset",
        style="guitare-bossa" if prog.startswith("BN") else "guitare-jazz",
        key=dict(tonic=tonic % 12, mode=mode, name=f"{key_name} {mode}"), meter=meter, bpm=row["tempo_bpm"], choruses=1,
        beats=[round(b, 4) for b in beats[down:down + len(bars) * meter]], downbeat=0, duration=round(len(x) / sr, 3),
        bars=bars, sections=[dict(label="A", chorus=1, firstBar=0, lastBar=len(bars) - 1)],
        stems=["guitar"], harmonyStems=["guitar"], band=dict(guitar="comp"),
        labels=[dict(onset=round(a, 3), offset=round(z, 3), harte=l) for a, z, l in chords],
        conditions=dict(
            reel=dict(mix="reel/mix.wav", stems=dict(guitar="reel/mix.wav"), timeScale=1.0),
            **{"reel-disque": dict(mix="reel-disque/mix.flac", stems=dict(guitar="reel-disque/mix.flac"),
                                   timeScale=round(float(time_scale), 6),
                                   settings={k: (round(v, 4) if isinstance(v, float) else v) for k, v in old.items()})},
        ),
        origin=SOURCE, audioSha256=hashlib.sha256(wav).hexdigest(),
    )
    (out / "truth.json").write_text(json.dumps(truth, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
