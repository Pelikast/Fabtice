"""End-to-end parity of the TypeScript input side: run the Tsumugi ONNX graph on the audio
resampled by tsumugi-features.ts (dump-resampled.ts) and on the audio of the Python pipeline
(ffmpeg's resampler), both with the author's beat / key features, and compare the outputs.

    python ts/ts_parity.py satin:disque gs-01-jazz1-200-b:reel
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from common import load_audio  # noqa: E402
from corpus_list import DATA, corpus, sha  # noqa: E402
from run_tsumugi import ensure_src, onnx_song, read_info  # noqa: E402


def main(specs: list[str]) -> None:
    ensure_src()
    items = {x["id"]: x for x in corpus()}
    for spec in specs:
        pid, cond = spec.split(":")
        path = items[pid]["conditions"][cond]
        tmp = HERE.parent / "out" / f"ts-resampled.{pid}.{cond}.f32"
        tmp.parent.mkdir(exist_ok=True)
        subprocess.run(["node", "--experimental-strip-types", "--no-warnings", str(HERE / "dump-resampled.ts"), path, str(tmp)], check=True)
        ts = np.fromfile(tmp, dtype="<f4").reshape(2, -1)
        py = load_audio(path, 25600, channels=2)
        n = min(ts.shape[1], py.shape[1])
        snr = 10 * np.log10(np.sum(py[:, :n] ** 2) / max(1e-20, np.sum((py[:, :n] - ts[:, :n]) ** 2)))
        info = read_info(str(DATA / "modeles" / "app-grid" / f"{sha(path)}.json"), n / 25600)
        a = onnx_song(py[:, :n], info, 2)
        b = onnx_song(ts[:, :n], info, 2)
        agree = np.mean(a[0].argmax(1) == b[0].argmax(1))
        root = lambda d: np.where(d.argmax(1) == 744, -1, d.argmax(1) % 12)  # noqa: E731
        print(f"{pid}.{cond}: resampler SNR {snr:.1f} dB; detail argmax equal {agree:.4f}, root equal "
              f"{np.mean(root(a[0]) == root(b[0])):.4f}, bass equal {np.mean(a[1].argmax(1) == b[1].argmax(1)):.4f}, "
              f"max |diff| detail {np.abs(a[0] - b[0]).max():.3f}")


if __name__ == "__main__":
    main(sys.argv[1:])
