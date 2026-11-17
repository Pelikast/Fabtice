"""Real recordings for the bench, fetched from Hugging Face at pinned revisions (never committed).

- `urmp`: the separated tracks (AuSep) of URMP (University of Rochester Multi-Modal
  Music Performance dataset): real players, one instrument per track, recorded apart.
  Wind tracks (trumpet, trombone, saxophone, clarinet, flute) and some violin tracks.
  Two 10 s excerpts per track (the loudest stretches), alone and with the synthetic
  band at -12 dB, clean and through the « vieux disque » chain.
- `irmas`: the test part of IRMAS (excerpts of commercial recordings, all the
  instruments heard are labelled). Real mixes, harder than a separated track: used to
  see how often a wind is named where none plays, and whether a lone wind is named right.
"""

import io
import json
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

import bench
import render

URMP = dict(repo="Eredis02/URMP", rev="58177a0f0f816e621b3d5d304c5fd1a03c035a86")
IRMAS = dict(repo="Hibou-Foundation/irmas_ds_1", rev="3ce50b83bfc8aeb9d6ca0b40ed9764ffa6802f3b",
             files=["data/test-00000-of-00002.parquet", "data/test-00001-of-00002.parquet"],
             names="gac org pia voi gel flu sax vio tru cel".split())
URMP_CODES = {"tpt": "trumpet", "tbn": "trombone", "sax": "saxophone", "cl": "clarinet", "fl": "flute", "vn": "violin"}
IRMAS_CODES = {"gac": "guitar", "gel": "guitar", "org": "organ", "pia": "piano", "voi": "voice", "flu": "flute",
               "sax": "saxophone", "vio": "violin", "tru": "trumpet", "cel": "violin"}
HF = "https://huggingface.co/datasets/"


def get(url, path):
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        subprocess.run(["curl", "-sSfL", "--retry", "3", "-o", str(tmp), url], check=True)
        tmp.rename(path)
    return path


def urmp_files():
    import urllib.request
    with urllib.request.urlopen(f"https://huggingface.co/api/datasets/{URMP['repo']}/revision/{URMP['rev']}") as r:
        sib = [s["rfilename"] for s in json.load(r)["siblings"]]
    out, violins = [], 0
    for f in sorted(sib):
        if "/AuSep_" not in f:
            continue
        code = f.split("/")[-1].split("_")[2]
        if code not in URMP_CODES:
            continue
        if code == "vn":
            violins += 1
            if violins > 12:
                continue
        out.append((f, URMP_CODES[code]))
    return out


def loudest(x, sr, n, dur=10.0):
    """Start indices of the n loudest non-overlapping stretches of `dur` seconds."""
    w = int(dur * sr)
    if len(x) <= w:
        return [0]
    hop = sr
    e = np.array([np.mean(x[s: s + w] ** 2) for s in range(0, len(x) - w, hop)])
    picked = []
    for i in np.argsort(-e):
        s = int(i * hop)
        if all(abs(s - p) >= w for p in picked):
            picked.append(s)
        if len(picked) == n:
            break
    return picked


def bands(data):
    d = data / "synth"
    idx = json.loads((d / "index.json").read_text())
    return [d / f"{e['id']}_band.wav" for e in idx]


def urmp_items(data):
    band_files = bands(data)
    for k, (f, truth) in enumerate(urmp_files()):
        path = get(f"{HF}{URMP['repo']}/resolve/{URMP['rev']}/{f}", data / "real" / "urmp" / f)
        x, sr = bench.mono(path)
        band, bsr = bench.mono(band_files[k % len(band_files)])
        band = bench.to16k(band, bsr)
        for j, s in enumerate(loudest(x, sr, 2)):
            seg = x[s: s + int(10 * sr)]
            seg = seg / (np.max(np.abs(seg)) + 1e-9) * 0.5
            eid = f"{Path(f).stem}-{j}"
            for old in (False, True):
                y = bench.to16k(seg, sr)
                for bleed in (None, -12.0):
                    z = y
                    if bleed is not None:
                        b = band[: len(y)]
                        b = np.pad(b, (0, len(y) - len(b)))
                        z = y + b * render.db(render.active_db(y) + bleed - render.active_db(b))
                    if old:
                        z = old16(z, 7 * k + j)
                    cond = ("vieux" if old else "propre") + ("" if bleed is None else f"{int(bleed)}dB")
                    yield eid, truth, cond, z.astype(np.float32)


def old16(x16, seed):
    """The old-record chain runs at 44.1 kHz: up, through, back to 16 kHz."""
    from scipy import signal
    up = signal.resample_poly(x16, 441, 160).astype(np.float32)
    return bench.to16k(bench.old_record(up, seed), 44100)


def irmas_items(data):
    import pyarrow.parquet as pq
    for f in IRMAS["files"]:
        path = get(f"{HF}{IRMAS['repo']}/resolve/{IRMAS['rev']}/{f}", data / "real" / "irmas" / Path(f).name)
        t = pq.read_table(path)
        for i, (audio, labels) in enumerate(zip(t.column("audio").to_pylist(), t.column("labels").to_pylist())):
            x, sr = sf.read(io.BytesIO(audio["bytes"]), dtype="float32", always_2d=True)
            x = x.mean(axis=1)
            names = sorted({IRMAS_CODES[IRMAS["names"][k]] for k in labels})
            yield f"{Path(f).stem}-{i}", "+".join(names), "mix", bench.to16k(x, sr)


def items(data, which):
    return urmp_items(data) if which == "urmp" else irmas_items(data)
