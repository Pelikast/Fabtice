"""Halve an ONNX file by storing its large float32 weights as float16, with a Cast back to
float32 in front of the graph ("float16 storage, float32 compute": the arithmetic is
unchanged, only the weights are rounded). Then compare both graphs on the same inputs.

    python fp16_storage.py cache/tsumugi-chords.onnx cache/tsumugi-chords.fp16w.onnx
"""

from __future__ import annotations

import sys

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper


def convert(src: str, dst: str, min_size: int = 1024) -> None:
    m = onnx.load(src)
    g = m.graph
    casts, keep = [], []
    for init in g.initializer:
        if init.data_type == TensorProto.FLOAT and np.prod(init.dims) >= min_size:
            a = numpy_helper.to_array(init).astype(np.float16)
            h = numpy_helper.from_array(a, init.name + "__fp16")
            keep.append(h)
            casts.append(helper.make_node("Cast", [h.name], [init.name], to=TensorProto.FLOAT, name=init.name + "__cast"))
        else:
            keep.append(init)
    del g.initializer[:]
    g.initializer.extend(keep)
    nodes = list(g.node)
    del g.node[:]
    g.node.extend(casts + nodes)
    onnx.checker.check_model(m)
    onnx.save(m, dst)
    print(f"{dst}: {len(casts)} weights stored as float16")


def compare(a: str, b: str) -> None:
    import onnxruntime as ort

    sa = ort.InferenceSession(a, providers=["CPUExecutionProvider"])
    sb = ort.InferenceSession(b, providers=["CPUExecutionProvider"])
    rng = np.random.default_rng(0)
    feeds = {}
    for i in sa.get_inputs():
        shape = [d if isinstance(d, int) else 400 for d in i.shape]
        x = rng.standard_normal(shape).astype(np.float32) * 0.1
        feeds[i.name] = np.abs(x) if i.name == "cqt" else x
    ra, rb = sa.run(None, feeds), sb.run(None, feeds)
    for o, x, y in zip(sa.get_outputs(), ra, rb):
        am = f", argmax equal {np.mean(x.argmax(-1) == y.argmax(-1)):.4f}" if x.ndim >= 2 else ""
        print(f"  {o.name:10s} max |diff| {np.abs(x - y).max():.2e}{am}")


if __name__ == "__main__":
    convert(sys.argv[1], sys.argv[2])
    compare(sys.argv[1], sys.argv[2])
