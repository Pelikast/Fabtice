"""Reference values for the TypeScript port (tsumugi-features.ts), computed with the author's
own Python functions (tsumugi_chords.note_chords), on the app-detected beats and key of bench
files. Written to ../out/ts-fixtures/<id>.<condition>.json (not committed: derived from the
corpus).

    BANC_DATA=/home/user/banc/data python ts/make_fixtures.py satin:disque gs-01-jazz1-200-b:reel
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from corpus_list import DATA, corpus, sha  # noqa: E402
from run_tsumugi import ensure_src, read_info  # noqa: E402


def main(specs: list[str]) -> None:
    ensure_src()
    from tsumugi_chords.axis import RATE
    from tsumugi_chords.heads import FRAME_RATE
    from tsumugi_chords.note_chords import beat_features, key_features

    items = {x["id"]: x for x in corpus()}
    outdir = HERE.parent / "out" / "ts-fixtures"
    outdir.mkdir(parents=True, exist_ok=True)
    for spec in specs:
        pid, cond = spec.split(":")
        path = items[pid]["conditions"][cond]
        h = sha(path)
        grid = DATA / "modeles" / "app-grid" / f"{h}.json"
        import soundfile as sf

        duration = sf.info(path).duration
        samples = int(duration * RATE)
        info = read_info(str(grid), duration)
        per = RATE // FRAME_RATE
        frames = samples // per
        size, margin = 750, 125
        core = size - 2 * margin
        windows = []
        for kept in range(0, frames, core):
            start = min(max(0, kept - margin), max(0, frames - size))
            b = beat_features(info["beats"], info["downbeats"], start / FRAME_RATE, size)
            k = key_features(info["keys"], start / FRAME_RATE, size)
            windows.append({"start": start, "keepFrom": kept, "keepTo": min(kept + core, frames),
                            "beats": np.round(b, 7).ravel().tolist(), "keys": k.ravel().astype(int).tolist()})
        out = {"id": pid, "condition": cond, "audio": path, "samples": samples, "frames": frames,
               "beats": info["beats"], "downbeats": info["downbeats"], "keySpans": info["keys"], "windows": windows}
        (outdir / f"{pid}.{cond}.json").write_text(json.dumps(out))
        print(f"{pid}.{cond}: {len(windows)} windows", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1:])
