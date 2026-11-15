"""Builds the synthetic corpus: for every piece of charts.py, the MIDI of each
stem, the FluidSynth render of each stem and of the mix (« propre »), the old
record version (« disque »), and the ground truth (truth.json).

    .venv/bin/python corpus/prepare.py            # everything
    .venv/bin/python corpus/prepare.py --only saints,satin

Deterministic: fixed seeds, pinned soundfont (SHA-256 checked). Output in
data/corpus/<id>/, never committed. The ground truth is also copied to
corpus/verites/<id>.json (committed: small, and our own work).
"""

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from arrange import KNOBS, Arranger, apply_pedals, choose_extensions, expand_form, tempo_map  # noqa: E402
from charts import PIECES  # noqa: E402
from harmony import LETTER, parse_chart  # noqa: E402
import render  # noqa: E402

ROOT = HERE.parent
DATA = ROOT / "data"
CORPUS = DATA / "corpus"
VERITES = HERE / "verites"

SOUNDFONT = dict(
    name="GeneralUser GS 2.0.3",
    url="https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/684543d5e5efaef08d02be50dcda8d552478fa60/GeneralUser-GS.sf2",
    sha256="9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe",
    licence="GeneralUser GS License v2.0 (use without restriction, including commercial)",
)

SHARP_KEYS = {("E", "major"), ("A", "major"), ("D", "major"), ("G", "major"), ("B", "major"),
              ("E", "minor"), ("B", "minor"), ("F#", "minor"), ("C#", "minor")}


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def soundfont():
    path = DATA / "soundfont" / "GeneralUser-GS.sf2"
    if path.exists() and sha256(path) == SOUNDFONT["sha256"]:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    print(f"téléchargement de {SOUNDFONT['name']}…", flush=True)
    part = path.with_suffix(".part")
    subprocess.run(["curl", "-sSfL", "--retry", "3", "-o", str(part), SOUNDFONT["url"]], check=True)
    if sha256(part) != SOUNDFONT["sha256"]:
        raise SystemExit("soundfont: SHA-256 does not match")
    part.rename(path)
    return path


def parse_key(text):
    name, mode = text.split()
    pc = (LETTER[name[0]] + {"b": -1, "#": 1}.get(name[1:2], 0)) % 12
    return pc, mode, name


def write_flac(path, x):
    x = np.asarray(x, np.float32)
    sf.write(str(path), np.clip(x, -1, 1), render.SR, subtype="PCM_16", format="FLAC")


def stem_levels(piece, knobs):
    """Target loudness of each stem, in dB (only the differences matter).
    A melody or solo in « other » / « vocals » gets lead_db on top."""
    band = piece["band"]
    lv = dict(drums=-8.0, bass=-5.0, piano=-6.0, guitar=-7.0, other=-4.0, vocals=-4.0)
    if band.get("guitar") in ("four", "banjo"):
        lv["guitar"] = -8.0
    if band.get("piano") == "sparse":
        lv["piano"] = -8.0
    other = band.get("other") or ""
    if ":" in other:
        lv["other"] = -6.0 + knobs["lead_db"]
    if other == "dixie":
        lv["other"] = -5.0 + knobs["lead_db"]
    if band.get("vocals") == "lead":
        lv["vocals"] = -6.0 + knobs["lead_db"]
    return lv


HARMONY_ROLES = {"comp", "sparse", "ballad", "quartal", "four", "bossa", "stride", "banjo"}


def build(piece, sf2):
    pid = piece["id"]
    out = CORPUS / pid
    if out.exists():
        shutil.rmtree(out)
    (out / "propre").mkdir(parents=True)
    (out / "disque").mkdir(parents=True)
    rng = np.random.default_rng(piece["seed"])
    knobs = dict(KNOBS)
    knobs.update(piece.get("knobs", {}))
    if "cents" not in piece.get("knobs", {}):
        r2 = np.random.default_rng(piece["seed"] + 1000)
        knobs["cents"] = float(np.round(r2.choice([-1, 1]) * r2.uniform(12, 45), 1)) if r2.random() < 0.4 else 0.0
    tonic, mode, tonic_name = parse_key(piece["key"])
    flats = (tonic_name, mode) not in SHARP_KEYS

    bars = expand_form(piece, parse_chart, rng, knobs, tonic)
    choose_extensions(bars, rng, knobs, piece["style"])
    apply_pedals(bars, piece, rng, knobs, tonic)
    arr = Arranger(piece, bars, rng, knobs, tonic)
    parts = arr.arrange()
    meter = piece["meter"]
    n_beats = len(bars) * meter
    beat_durs = tempo_map(n_beats + 8, piece["bpm"], knobs, rng)
    swing = render.swing_ratio(piece["bpm"]) if piece["style"] in ("swing", "waltz", "shuffle", "ballad", "trad", "modal") else 0
    if piece["style"] == "shuffle":
        swing = 2 / 3

    stems = sorted({p.stem for p in parts})
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        wavs = {}
        for stem in stems:
            mid = out / "propre" / f"{stem}.mid"
            render.write_midi(mid, [p for p in parts if p.stem == stem], beat_durs, swing, knobs["cents"],
                              np.random.default_rng(piece["seed"] + stems.index(stem)))
            wav = tmp / f"{stem}.wav"
            render.fluidsynth(mid, wav, sf2, room=0.75 if piece["style"] == "ballad" else 0.5)
            wavs[stem] = wav
        n = max(sf.info(str(w)).frames for w in wavs.values())
        audio = {s: render.load(w, n) for s, w in wavs.items()}
    # levels: every stem brought to a target loudness (active parts only), relative to the band
    levels = stem_levels(piece, knobs)
    for s in audio:
        audio[s] = audio[s] * render.db(levels.get(s, -6.0) - render.active_db(audio[s]))
    lead = int(render.LEAD_IN * render.SR)
    for s in audio:
        audio[s] = np.vstack([np.zeros((lead, 2), np.float32), audio[s]])
    mix = sum(audio.values())
    g = 0.89 / (np.max(np.abs(mix)) + 1e-9)
    write_flac(out / "propre" / "mix.flac", mix * g)
    for s, x in audio.items():
        write_flac(out / "propre" / f"{s}.flac", x * g)

    # old record: mono, linear chain on the mix and on each stem, then saturation and noise on the mix
    strength = float(np.clip((0.85 if piece["style"] == "trad" else 0.55) + rng.uniform(-0.2, 0.15), 0, 1))
    osr = np.random.default_rng(piece["seed"] + 2000)
    old = render.old_settings(osr, strength)
    oseed = piece["seed"] + 3000
    mono = (mix * g).mean(axis=1)
    y, time_scale = render.old_linear(mono, old, oseed)
    ymix, gain = render.old_finish(y, old, oseed)
    peak = max(1.0, np.max(np.abs(ymix)) / 0.98)
    write_flac(out / "disque" / "mix.flac", ymix / peak)
    for s, x in audio.items():
        ys, _ = render.old_linear((x * g).mean(axis=1), old, oseed)
        write_flac(out / "disque" / f"{s}.flac", ys * gain / peak)

    # ground truth
    t_beats = render.LEAD_IN + np.concatenate([[0.0], np.cumsum(beat_durs)])
    beats = [round(float(t), 4) for t in t_beats[:n_beats + 1]]
    truth_bars = []
    for bar in bars:
        b0 = bar.start
        truth_bars.append(dict(
            index=bar.index, chorus=bar.chorus, section=bar.section,
            start=beats[b0], end=beats[b0 + meter], beats=beats[b0:b0 + meter],
            chords=[dict(beat=b, **c.json(flats)) for b, c in bar.chords],
        ))
    sections = []
    for bar in bars:
        tag = (bar.chorus, bar.occurrence)
        if not sections or sections[-1]["_tag"] != tag:
            sections.append(dict(_tag=tag, label=bar.section, chorus=bar.chorus, firstBar=bar.index, lastBar=bar.index))
        sections[-1]["lastBar"] = bar.index
    for s in sections:
        s.pop("_tag")
    band = piece["band"]
    harmony_stems = sorted({st for st, role in [("piano", band.get("piano")), ("guitar", band.get("guitar"))] if role in HARMONY_ROLES}
                           | ({"other"} if band.get("other") in ("section", "dixie") else set())
                           | ({"vocals"} if band.get("vocals") == "pad" else set()))
    truth = dict(
        id=pid, title=piece["title"], standard=piece["standard"], source="synthese",
        style=piece["style"], key=dict(tonic=tonic, mode=mode, name=piece["key"]),
        meter=meter, bpm=piece["bpm"], choruses=piece["choruses"], tuningCents=knobs["cents"],
        beats=beats[:n_beats], downbeat=0, duration=round(n / render.SR + render.LEAD_IN, 3),
        bars=truth_bars, sections=sections,
        stems=stems, harmonyStems=harmony_stems, band=band,
        knobs={k: v for k, v in knobs.items()},
        conditions=dict(
            propre=dict(mix="propre/mix.flac", stems={s: f"propre/{s}.flac" for s in stems}, timeScale=1.0),
            disque=dict(mix="disque/mix.flac", stems={s: f"disque/{s}.flac" for s in stems},
                        timeScale=round(float(time_scale), 6), settings={k: (round(v, 4) if isinstance(v, float) else v) for k, v in old.items()}),
        ),
        soundfont=SOUNDFONT["name"],
    )
    text = json.dumps(truth, ensure_ascii=False, indent=1)
    (out / "truth.json").write_text(text)
    VERITES.mkdir(exist_ok=True)
    (VERITES / f"{pid}.json").write_text(text)
    return pid, {f"{c}/{f.name}": sha256(f) for c in ("propre", "disque") for f in sorted((out / c).glob("*.flac"))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--jobs", type=int, default=4)
    a = ap.parse_args()
    sf2 = soundfont()
    pieces = [p for p in PIECES if not a.only or p["id"] in a.only.split(",")]
    CORPUS.mkdir(parents=True, exist_ok=True)
    prints = {}
    if a.jobs == 1:
        results = (build(p, sf2) for p in pieces)
    else:
        ex = ProcessPoolExecutor(a.jobs)
        results = ex.map(build, pieces, [sf2] * len(pieces))
    for pid, h in results:
        print(f"  {pid}", flush=True)
        prints[pid] = h
    man = CORPUS / "empreintes.json"
    old = json.loads(man.read_text()) if man.exists() else {}
    old.update(prints)
    man.write_text(json.dumps(old, indent=1, sort_keys=True))


if __name__ == "__main__":
    main()
