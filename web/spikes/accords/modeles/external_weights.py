"""Make an ONNX graph read its weights from the ORIGINAL weight file of the model's authors,
so that nobody has to host converted weights.

An ONNX initializer can live in an external file at a given offset and length ("external
data"). A .safetensors file is an 8-byte header size, a JSON header, then the raw little-
endian tensors: each tensor stored there unchanged (same dtype, same layout) can be read
directly from it. This script finds, for every initializer of the graph, a tensor of the
.safetensors file with exactly the same bytes, and points the initializer at it. What does
not match (constants computed by code, such as the constant-Q kernels, or weights the
exporter reshaped) stays inside the graph.

    python external_weights.py graph.onnx weights.safetensors chord-model.safetensors out.onnx

The app would then download `out.onnx` (the graph: architecture and code-derived constants,
our own work) and the authors' `chord-model.safetensors` from its public page, and give the
latter to onnxruntime-web as `externalData: [{ path: 'chord-model.safetensors', data }]`.
"""

from __future__ import annotations

import hashlib
import json
import struct
import sys
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, numpy_helper

DTYPES = {"F32": (TensorProto.FLOAT, 4), "F16": (TensorProto.FLOAT16, 2), "I64": (TensorProto.INT64, 8)}


def safetensors_index(path: Path) -> tuple[dict, int]:
    with open(path, "rb") as f:
        n = struct.unpack("<Q", f.read(8))[0]
        header = json.loads(f.read(n))
    header.pop("__metadata__", None)
    return header, 8 + n


def externalize(graph_path: str, weights_path: str, location: str, out_path: str) -> dict:
    header, base = safetensors_index(Path(weights_path))
    blob = Path(weights_path).read_bytes()
    by_hash: dict[tuple[int, str], tuple[int, int, str]] = {}
    for name, t in header.items():
        a, b = t["data_offsets"]
        by_hash[(DTYPES[t["dtype"]][0], hashlib.sha1(blob[base + a : base + b]).hexdigest())] = (base + a, b - a, name)
    m = onnx.load(graph_path)
    matched = kept = kept_bytes = matched_bytes = 0
    for init in m.graph.initializer:
        arr = numpy_helper.to_array(init)
        raw = np.ascontiguousarray(arr).astype(arr.dtype.newbyteorder("<")).tobytes()
        key = (init.data_type, hashlib.sha1(raw).hexdigest())
        if key in by_hash and arr.size > 1:
            off, length, _ = by_hash[key]
            init.ClearField("raw_data")
            for f in ("float_data", "int64_data", "int32_data", "double_data"):
                init.ClearField(f)
            init.data_location = TensorProto.EXTERNAL
            del init.external_data[:]
            for k, v in (("location", location), ("offset", str(off)), ("length", str(length))):
                e = init.external_data.add()
                e.key, e.value = k, v
            matched += 1
            matched_bytes += length
        else:
            kept += 1
            kept_bytes += len(raw)
    onnx.save(m, out_path)
    r = {"matched": matched, "matched_bytes": matched_bytes, "kept": kept, "kept_bytes": kept_bytes,
         "graph_bytes": Path(out_path).stat().st_size}
    print(json.dumps(r))
    return r


if __name__ == "__main__":
    externalize(*sys.argv[1:5])
