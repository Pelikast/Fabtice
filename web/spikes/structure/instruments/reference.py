"""Reference values for the app's unit tests (`app/src/structure/instruments/fixtures/`).

Usage: python reference.py DATA_DIR
Writes:
  reference.json  the test signals (built by the same formula in `signals.ts`), their 16 kHz
                  resampling by the bench (scipy) at a few indices, and CED-Tiny's group scores on them;
  decisions.json  mean group scores of bench excerpts and the bench's answer (`analyse.decide`),
                  for the parity test of `decide.ts`.
"""

import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import analyse  # noqa: E402
import bench  # noqa: E402
import models  # noqa: E402

OUT = HERE.parents[3] / "app" / "src" / "structure" / "instruments" / "fixtures"
SR = 44100
NOTES = [220.0, 246.94, 261.63, 293.66, 329.63, 293.66, 261.63, 246.94]


def signal(kind, seconds=6.0):
    """Same formula as `signals.ts#testSignal` (float64 throughout)."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    note = np.minimum((t / 0.5).astype(int), 10**9) % len(NOTES)
    f = np.array(NOTES)[note]
    if kind == "silence":
        return np.zeros(n)
    if kind == "reed":
        f = f * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * t))
        phase = 2 * np.pi * np.cumsum(f) / SR
        x = sum((1.0 / h) * (1 if h % 2 else 0.35) * np.sin(h * phase) for h in range(1, 13))
        return 0.3 * x
    if kind == "plucked":
        phase = 2 * np.pi * np.cumsum(f) / SR
        age = t - 0.5 * np.floor(t / 0.5)
        x = sum(np.exp(-age * (3 + 2 * h)) / h * np.sin(h * phase) for h in range(1, 9))
        return 0.4 * x
    raise ValueError(kind)


def main():
    data = Path(sys.argv[1])
    tagger = models.Tagger(data, "ced-tiny", threads=2)
    OUT.mkdir(parents=True, exist_ok=True)
    ref = dict(sampleRate=SR, seconds=6.0, groups=models.GROUP_NAMES, signals={})
    for kind in ["reed", "plucked", "silence"]:
        x = signal(kind).astype(np.float32)
        y = bench.to16k(x, SR)
        peak = np.max(np.abs(y))
        if peak > 0:
            y = y / peak * 0.5
        idx = list(range(1000, len(y), 7919))[:12]
        g = tagger.groups(tagger.raw(y)) if peak > 0 else None
        ref["signals"][kind] = dict(
            input=[float(round(v, 7)) for v in x[[100, 5000, 44100, 200000]]],
            resampled_index=idx,
            resampled=[float(round(v, 6)) for v in y[idx]],
            scores=None if g is None else [round(float(v), 5) for v in g.mean(axis=0)],
        )
    (OUT / "reference.json").write_text(json.dumps(ref, indent=1) + "\n")

    rows = []
    for set_, step in (("urmp", 9), ("synth", 13), ("irmas", 11)):
        groups, items = analyse.load(data, set_, "ced-tiny")
        for it in items[::step]:
            m = np.round(np.asarray(it["scores"]).mean(axis=0), 5)  # decided on what is written
            a, c = analyse.decide(m[None, :], groups)
            rows.append(dict(set=set_, truth=it["truth"], cond=it["cond"],
                             scores={k: float(m[groups.index(k)]) for k in groups},
                             answer=a, confidence=round(c, 5)))
    (OUT / "decisions.json").write_text(json.dumps(rows, separators=(",", ":")) + "\n")
    print(len(rows), "decisions")


if __name__ == "__main__":
    main()
