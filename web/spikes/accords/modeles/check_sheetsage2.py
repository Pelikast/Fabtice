"""Check the SheetSage2 graphs (convert_sheetsage2.py) against the authors' PyTorch model, with
ONNX Runtime (CPU) reading the weights from slices of the authors' files.

    python check_sheetsage2.py <SheetSage2 snapshot> <MERT snapshot> <graphs dir> [--frames 2000]

Writes the slices next to the graphs (as ONNX Runtime wants external files), then compares on a
short random mel (the graphs take any length; the app always gives 30 000 mel frames):
encoder memory, cross keys and values, and the decoder logits over a few steps with the cache.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from transformers import AutoModel


def write_slices(graphs: Path, files: dict[str, Path], manifest: dict) -> None:
    infos = [*manifest["parts"], manifest["cross"], manifest["step"]]
    for info in infos:
        for s in info["slices"]:
            out = graphs / s["name"]
            if out.exists() and out.stat().st_size == s["end"] - s["start"]:
                continue
            with open(files[s["file"]], "rb") as f:
                f.seek(s["start"])
                out.write_bytes(f.read(s["end"] - s["start"]))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("ss2", type=Path)
    ap.add_argument("mert", type=Path)
    ap.add_argument("graphs", type=Path)
    ap.add_argument("--frames", type=int, default=2000)
    a = ap.parse_args()
    manifest = json.loads((a.graphs / "sheetsage2-manifest.json").read_text())
    write_slices(a.graphs, {"mert": a.mert / "model.safetensors", "ss2": a.ss2 / "model.safetensors"}, manifest)

    torch.manual_seed(0)
    model = AutoModel.from_pretrained(str(a.ss2), trust_remote_code=True, torch_dtype=torch.float32)
    enc = model.encoder
    mel = torch.randn(1, a.frames, 128)
    with torch.no_grad():
        hidden = enc.subsampling_module(mel)
        w = torch.softmax(model.layer_weight, 0)
        mixed = hidden * w[0]
        pos = enc.embed_positions(hidden)
        for wt, layer in zip(w[1:], enc.layers):
            hidden = layer(hidden, pos)
            mixed = mixed + hidden * wt
        memory = model.encoder_projection(mixed)

    so = ort.SessionOptions()
    so.intra_op_num_threads = 4
    feeds = {"mel": mel.numpy()}
    x = None
    for k, info in enumerate(manifest["parts"]):
        s = ort.InferenceSession(str(a.graphs / info["graph"]), so, providers=["CPUExecutionProvider"])
        out = s.run(None, feeds)
        if len(out) == 2:
            feeds = {"hidden": out[0], "mixed": out[1]}
        else:
            x = out[0]
        del s
    d = np.abs(x - memory.numpy()).max()
    print(f"encoder memory  max |diff| {d:.2e}  (scale {np.abs(memory.numpy()).max():.2f})")

    cross = ort.InferenceSession(str(a.graphs / "sheetsage2-cross.onnx"), so, providers=["CPUExecutionProvider"])
    ckv = cross.run(None, {"memory": memory.numpy()})
    step = ort.InferenceSession(str(a.graphs / "sheetsage2-step.onnx"), so, providers=["CPUExecutionProvider"])
    tok = model.tokenizer
    prefix = tok.prompt_prefix(tok.normalize_prompts(("timestamp", "chord_full")))
    if prefix[-1] == tok.eos_token:
        prefix = prefix[:-1]
    # Reference: the HF decoder with its cache, greedy over 12 steps.
    ids = torch.tensor([prefix])
    ref_logits, past = model.decode(memory, ids, use_cache=True)
    seq = list(prefix)
    refs = [ref_logits[0, -1].numpy()]
    for _ in range(12):
        nxt = int(refs[-1].argmax())
        seq.append(nxt)
        lg, past = model.decode(memory, torch.tensor([[nxt]]), use_cache=True, past_key_values=past)
        refs.append(lg[0, -1].numpy())
    # ONNX: dummy first cache entry, masked out.
    hd = 64
    selfkv = [np.zeros((1, 8, 1, hd), np.float32) for _ in range(12)]
    n = len(prefix)
    mask = np.zeros((1, 1, n, 1 + n), np.float32)
    mask[..., 0] = -np.inf
    for i in range(n):
        mask[0, 0, i, 2 + i :] = -np.inf
    names = [i.name for i in step.get_inputs()]
    def run(ids_, pos_, mask_, kv):
        f = {"ids": np.array([ids_], np.int64), "positions": np.array([pos_], np.int64), "mask": mask_}
        for nm, v in zip(names[3:15], kv):
            f[nm] = v
        for nm, v in zip(names[15:], ckv):
            f[nm] = v
        o = step.run(None, f)
        return o[0][0], o[1:]
    lg, selfkv = run(prefix, list(range(n)), mask, selfkv)
    outs = [lg]
    for j in range(12):
        P = selfkv[0].shape[2]
        m = np.zeros((1, 1, 1, P + 1), np.float32)
        m[..., 0] = -np.inf
        lg, selfkv = run([seq[n + j]], [n + j], m, selfkv)
        outs.append(lg)
    d = max(np.abs(o - r).max() for o, r in zip(outs, refs))
    same = all(int(o.argmax()) == int(r.argmax()) for o, r in zip(outs, refs))
    print(f"decoder logits  max |diff| {d:.2e}  same greedy tokens: {same}")


if __name__ == "__main__":
    main()
