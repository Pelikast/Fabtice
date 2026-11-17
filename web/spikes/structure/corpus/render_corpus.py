"""Renders the structure corpus (Tier R): for every piece of verites/ whose
`render` lists conditions, the MIDI of each stem, the FluidSynth render of
each stem and of the mix (« propre »), and the old record version
(« disque ») with the chords bench's chain (web/spikes/accords/corpus/render.py).

    .venv/bin/python corpus/render_corpus.py                 # every piece to render
    .venv/bin/python corpus/render_corpus.py --only autumn-leaves --jobs 2

Output in data/corpus/<id>/<condition>/{mix,drums,bass,piano,guitar,other,vocals}.flac
and data/corpus/<id>/rendu.json (time scale of each condition: the old record turns a
little fast or slow, so its times are the truth's times x timeScale). Never committed.
Deterministic: seeds of the truth, pinned soundfont (SHA-256 checked).
"""

import argparse
import json
import subprocess
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1] / "accords" / "corpus"))

import render  # noqa: E402  (the chords bench's MIDI writer, FluidSynth call, old record chain)
from prepare import SOUNDFONT, sha256  # noqa: E402
from orchestra import STEM_DB, arrange  # noqa: E402

ROOT = HERE.parent
DATA = ROOT / "data"
CORPUS = DATA / "corpus"
VERITES = ROOT / "verites"


def soundfont():
    path = DATA / "soundfont" / "GeneralUser-GS.sf2"
    if path.exists() and sha256(path) == SOUNDFONT["sha256"]:
        return path
    shared = ROOT.parent / "accords" / "data" / "soundfont" / "GeneralUser-GS.sf2"
    path.parent.mkdir(parents=True, exist_ok=True)
    if shared.exists() and sha256(shared) == SOUNDFONT["sha256"]:
        path.write_bytes(shared.read_bytes())
        return path
    print(f"téléchargement de {SOUNDFONT['name']}…", flush=True)
    part = path.with_suffix(".part")
    subprocess.run(["curl", "-sSfL", "--retry", "3", "-o", str(part), SOUNDFONT["url"]], check=True)
    if sha256(part) != SOUNDFONT["sha256"]:
        raise SystemExit("soundfont: SHA-256 does not match")
    part.rename(path)
    return path


def write_flac(path, x):
    sf.write(str(path), np.clip(np.asarray(x, np.float32), -1, 1), render.SR, subtype="PCM_16", format="FLAC")


def build(truth, conditions, sf2):
    pid = truth["id"]
    out = CORPUS / pid
    meter = truth["meter"]
    beats = np.array(truth["beats"])
    start = beats[0]
    durs = np.diff(beats)
    beat_durs = np.concatenate([durs, np.full(8, durs[-1])])
    parts = arrange(truth)
    style = truth["style"]
    swing = render.swing_ratio(truth["bpm"]) if style in ("swing", "waltz", "shuffle", "ballad", "trad", "modal") else 0
    if style == "shuffle":
        swing = 2 / 3
    stems = sorted({p.stem for p in parts if p.notes})
    (out / "propre").mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        wavs = {}
        for stem in stems:
            mid = tmp / f"{stem}.mid"
            render.write_midi(mid, [p for p in parts if p.stem == stem and p.notes], beat_durs, swing, 0.0,
                              np.random.default_rng(truth["seed"] + stems.index(stem)))
            wav = tmp / f"{stem}.wav"
            render.fluidsynth(mid, wav, sf2, room=0.75 if style == "ballad" else 0.5)
            wavs[stem] = wav
        n = max(sf.info(str(w)).frames for w in wavs.values())
        audio = {s: render.load(w, n) for s, w in wavs.items()}
    for s in audio:
        audio[s] = audio[s] * render.db(STEM_DB.get(s, -6.0) - render.active_db(audio[s]))
    lead = int(round(start * render.SR))
    for s in audio:
        audio[s] = np.vstack([np.zeros((lead, 2), np.float32), audio[s]])
    mix = sum(audio.values())
    g = 0.89 / (np.max(np.abs(mix)) + 1e-9)
    write_flac(out / "propre" / "mix.flac", mix * g)
    for s, x in audio.items():
        write_flac(out / "propre" / f"{s}.flac", x * g)
    info = {"id": pid, "soundfont": SOUNDFONT["name"], "stems": stems,
            "conditions": {"propre": {"timeScale": 1.0}}}
    if "disque" in conditions:
        (out / "disque").mkdir(parents=True, exist_ok=True)
        rng = np.random.default_rng(truth["seed"] + 2000)
        strength = float(np.clip((0.85 if style == "trad" else 0.55) + rng.uniform(-0.2, 0.15), 0, 1))
        old = render.old_settings(rng, strength, 0.0)
        oseed = truth["seed"] + 3000
        y, time_scale = render.old_linear((mix * g).mean(axis=1), old, oseed)
        ymix, gain = render.old_finish(y, old, oseed)
        peak = max(1.0, np.max(np.abs(ymix)) / 0.98)
        write_flac(out / "disque" / "mix.flac", ymix / peak)
        for s, x in audio.items():
            ys, _ = render.old_linear((x * g).mean(axis=1), old, oseed)
            write_flac(out / "disque" / f"{s}.flac", ys * gain / peak)
        info["conditions"]["disque"] = {"timeScale": round(float(time_scale), 6)}
    (out / "rendu.json").write_text(json.dumps(info, indent=1))
    return pid


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--jobs", type=int, default=3)
    a = ap.parse_args()
    sf2 = soundfont()
    jobs = []
    for f in sorted(VERITES.glob("*.json")):
        t = json.loads(f.read_text())
        if a.only and t["id"] not in a.only.split(","):
            continue
        jobs.append((t, t["render"]))
    CORPUS.mkdir(parents=True, exist_ok=True)
    if a.jobs == 1:
        for t, c in jobs:
            print(" ", build(t, c, sf2), flush=True)
    else:
        with ProcessPoolExecutor(a.jobs) as ex:
            for pid in ex.map(build, [t for t, _ in jobs], [c for _, c in jobs], [sf2] * len(jobs)):
                print(" ", pid, flush=True)


if __name__ == "__main__":
    main()
