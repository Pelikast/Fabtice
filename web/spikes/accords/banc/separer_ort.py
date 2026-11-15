"""Runs one ONNX network for banc/separer.ts, on the processor.

The Node side does everything else with the app's own code (reading at
48 kHz, resampling, normalisation, segments, STFT, overlap-add): this process
only runs the network on the tensors it is handed, so that the separation is
the app's, at native speed.

Protocol on stdin / stdout, repeated: a 4-byte little-endian length, a JSON
header {"inputs": [[name, [dims]], ...]}, then the float32 data of each input
in that order. The answer: the same framing, {"outputs": [[name, [dims]], ...]}
and the float32 data. Usage: python3 -I separer_ort.py <model.onnx> [threads]
"""

import json
import struct
import sys

import numpy as np
import onnxruntime as ort


def read_exact(f, n):
    buf = bytearray()
    while len(buf) < n:
        chunk = f.read(n - len(buf))
        if not chunk:
            return None
        buf += chunk
    return bytes(buf)


def main():
    model = sys.argv[1]
    threads = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    so = ort.SessionOptions()
    so.intra_op_num_threads = threads
    sess = ort.InferenceSession(model, so, providers=["CPUExecutionProvider"])
    out_names = [o.name for o in sess.get_outputs()]
    stdin = sys.stdin.buffer
    stdout = sys.stdout.buffer
    while True:
        head = read_exact(stdin, 4)
        if head is None:
            return
        (n,) = struct.unpack("<I", head)
        meta = json.loads(read_exact(stdin, n))
        feeds = {}
        for name, dims in meta["inputs"]:
            count = int(np.prod(dims))
            feeds[name] = np.frombuffer(read_exact(stdin, 4 * count), dtype="<f4").reshape(dims)
        res = sess.run(out_names, feeds)
        header = json.dumps({"outputs": [[k, list(v.shape)] for k, v in zip(out_names, res)]}).encode()
        stdout.write(struct.pack("<I", len(header)))
        stdout.write(header)
        for v in res:
            stdout.write(np.ascontiguousarray(v, dtype="<f4").tobytes())
        stdout.flush()


if __name__ == "__main__":
    main()
