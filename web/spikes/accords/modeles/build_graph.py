"""Build the weight-free Tsumugi-Chords graph the app would ship, reproducibly, and freeze it.

    python build_graph.py            # build into cache/, check, and compare with tsumugi-graph.json
    python build_graph.py --freeze   # also (re)write tsumugi-graph.json (the frozen SHA-256)

Steps: the author's code at a pinned commit, the weights at a pinned revision (SHA-256
checked), torch / onnx at pinned versions (refused otherwise: another version may export
another graph), export without constant folding (convert_tsumugi.py --no-fold, with its
parity checks), then every weight pointed at the author's chord-model.safetensors
(external_weights.py). The result contains the architecture and the constant-Q kernels the
code computes, no weight.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "tsumugi-graph.json"
PINNED = {"torch": "2.15.0", "onnx": "1.23.2"}
LOCATION = "chord-model.safetensors"


def main(freeze: bool) -> None:
    import onnx
    import torch

    torch.set_num_threads(1)
    for name, mod in (("torch", torch), ("onnx", onnx)):
        v = mod.__version__.split("+")[0]
        if v != PINNED[name]:
            raise SystemExit(f"{name} {v}: the graph is frozen with {name} {PINNED[name]}")
    import convert_tsumugi
    import external_weights
    from common import model_file, sha256
    from fetch_models import FILES
    from run_tsumugi import REPO

    weights = model_file("tsumugi-model")
    full = HERE / "cache" / "tsumugi-chords.nofold.onnx"
    graph = HERE / "cache" / "tsumugi-chords.graph.onnx"
    convert_tsumugi.main(str(full), False)
    r = external_weights.externalize(str(full), str(weights), LOCATION, str(graph))
    if r["kept"] or r["matched"] != 221:
        raise SystemExit(f"not every weight was found in the original file: {r}")
    m = {
        "file": graph.name,
        "bytes": graph.stat().st_size,
        "sha256": sha256(graph),
        "weights": {"location": LOCATION, "url": FILES["tsumugi-model"]["url"], "bytes": FILES["tsumugi-model"]["bytes"],
                    "sha256": FILES["tsumugi-model"]["sha256"], "licence": "CC BY-NC 4.0"},
        "code": {"repository": REPO[0], "commit": REPO[1], "licence": "MIT"},
        "built_with": {"torch": torch.__version__, "onnx": onnx.__version__, "opset": 17},
        "inputs": {"wave": [1, 2, 768000], "beats": [1, 750, 11], "keys": [1, 750, 25]},
        "outputs": {"detail": [1, 750, 745], "bass": [1, 750, 13], "root": [1, 750, 13], "tones": [1, 750, 12], "boundary": [1, 750]},
    }
    print(json.dumps(m, indent=1))
    if freeze:
        MANIFEST.write_text(json.dumps(m, indent=1) + "\n")
        print(f"frozen in {MANIFEST.name}")
    elif MANIFEST.exists():
        ref = json.loads(MANIFEST.read_text())
        same = ref["sha256"] == m["sha256"]
        print("same graph as tsumugi-graph.json" if same else f"DIFFERENT from tsumugi-graph.json ({ref['sha256']})")
        if not same:
            sys.exit(1)


if __name__ == "__main__":
    main("--freeze" in sys.argv)
