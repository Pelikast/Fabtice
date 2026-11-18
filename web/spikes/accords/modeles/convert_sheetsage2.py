"""Convert SheetSage2 (m-a-p, 2026; code Apache-2.0? see its LICENSE; weights CC BY-NC 4.0) to ONNX
graphs that read the authors' own weight files, and check them against the original model.

SheetSage2 is an encoder-decoder: the MERT-v2-FullSong encoder (24 Conformer layers, 1024 wide,
2.5 GB in float32, its own repository) with low-rank adapters on the attention, then a 6-layer
BART decoder that writes the song as tokens (times, chords...). Nothing here changes the network;
the conversion only cuts it so that a browser can run it:

  - The log-mel front end is computed by the app (TypeScript, `sheetsage2Mel.ts`); the graphs
    start from the normalised mel frames [1, 30000, 128] of one 300 s window.
  - The encoder is cut into parts of a few layers (`--layers-per-part`), run one after the
    other, each created, run and released in turn: only one part's weights are in memory at a
    time. Each part reads its weights from a SLICE of the authors' files (offsets relative to
    the slice, written to the manifest), so the app never holds the 2.5 GB file at once.
  - The adapters are not merged: each attention projection computes x W^T + s (x A^T) B^T,
    exactly what the authors' merge gives, so that the weights stay the authors' bytes.
  - Self-attention is computed one head after the other (a data dependency chains the heads,
    so ONNX Runtime cannot run them side by side): a 300 s window has 7 500 frames, and all 16
    heads at once would need 3.6 GB of scores.
  - The decoder is one graph run token by token with its key/value cache as inputs and
    outputs, plus one graph that computes the cross-attention keys and values once per window.

    python convert_sheetsage2.py <SheetSage2 snapshot> <MERT-v2-FullSong snapshot> <out dir> [--check audio]

Writes <out>/sheetsage2-enc-<k>.onnx, sheetsage2-cross.onnx, sheetsage2-step.onnx and
<out>/sheetsage2-manifest.json (per graph: which file, which byte range, its SHA-256).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import numpy as np
import onnx
import torch
import torch.nn.functional as F
from onnx import TensorProto, numpy_helper
from safetensors.torch import load_file
from torch import nn

T_FRAMES = 7500  # 300 s at 25 Hz
MEL_FRAMES = 30000
WIDTH, HEADS, LAYERS = 1024, 16, 24
D_MODEL, D_HEADS, D_LAYERS = 512, 8, 6
LORA_SCALE = 128.0 / 64.0
PROJ = ("query_proj", "key_proj", "value_proj", "out_proj")


# ---------------------------------------------------------------- encoder, written for export


class Weights:
    """The two files' tensors by name, as torch tensors sharing nothing with the original model."""

    def __init__(self, mert: Path, ss2: Path):
        self.mert = load_file(str(mert))
        self.ss2 = load_file(str(ss2))


def lin(x, w, b=None):
    y = torch.matmul(x, w.t())
    return y + b if b is not None else y


def ln(x, w, b, eps):
    return F.layer_norm(x, (w.shape[0],), w, b, eps)


class Part(nn.Module):
    """Encoder layers [lo, hi): (hidden, mixed) -> (hidden, mixed); part 0 starts from the mel."""

    def __init__(self, W: Weights, lo: int, hi: int, first: bool, last: bool):
        super().__init__()
        self.lo, self.hi, self.first, self.last = lo, hi, first, last
        self.p = nn.ParameterDict()
        names = []
        for i in range(lo, hi):
            names += [k for k in W.mert if k.startswith(f"layers.{i}.")]
        if first:
            names += [k for k in W.mert if k.startswith("subsampling_module.")]
        for k in names:
            self.p[k.replace(".", "__")] = nn.Parameter(W.mert[k], requires_grad=False)
        self.a = nn.ParameterDict()
        for i in range(lo, hi):
            for n in PROJ:
                for ab in ("lora_A", "lora_B"):
                    k = f"adapter.layers.{i}.attn.{n}.{ab}.weight"
                    self.a[k.replace(".", "__")] = nn.Parameter(W.ss2[k], requires_grad=False)
        self.a["layer_weight"] = nn.Parameter(W.ss2["layer_weight"], requires_grad=False)
        if last:
            self.a["encoder_projection__weight"] = nn.Parameter(W.ss2["encoder_projection.weight"], requires_grad=False)
            self.a["encoder_projection__bias"] = nn.Parameter(W.ss2["encoder_projection.bias"], requires_grad=False)
        hd = WIDTH // HEADS
        self.register_buffer("inv_freq", 1.0 / (10000 ** (torch.arange(0, hd, 2, dtype=torch.float32) / hd)), persistent=False)

    def w(self, k):
        return self.p[k.replace(".", "__")]

    # -- subsampling (ConvNeXt blocks), as modeling_mert2.ConvNextBlock
    def convnext_layer(self, x, pre, dim):
        y = x.transpose(1, 2)
        y = F.conv1d(y, self.w(pre + "depthwise_block.1.weight"), self.w(pre + "depthwise_block.1.bias"), padding=3, groups=dim)
        y = y.transpose(1, 2)
        y = ln(y, self.w(pre + "pointwise_block.0.weight"), self.w(pre + "pointwise_block.0.bias"), 1e-6)
        y = lin(y, self.w(pre + "pointwise_block.1.weight"), self.w(pre + "pointwise_block.1.bias"))
        y = F.gelu(y)
        g, b = self.w(pre + "pointwise_block.3.weight"), self.w(pre + "pointwise_block.3.bias")
        mag = torch.sqrt((y * y).sum(dim=1, keepdim=True))
        y = g * (y * (mag / (mag.mean(dim=-1, keepdim=True) + 1e-6))) + b + y
        y = lin(y, self.w(pre + "pointwise_block.4.weight"), self.w(pre + "pointwise_block.4.bias"))
        return x + y

    def subsample(self, mel):
        chans, strides, depths = [128, 128, 512, 1024], (1, 2, 2), (3, 4, 5)
        x = mel
        for i in range(3):
            pre = f"subsampling_module.{i}."
            if chans[i] != chans[i + 1] or strides[i] > 1:
                x = ln(x, self.w(pre + "resampling_layer.0.weight"), self.w(pre + "resampling_layer.0.bias"), 1e-6)
                x = F.conv1d(x.transpose(1, 2), self.w(pre + "resampling_layer.2.weight"), self.w(pre + "resampling_layer.2.bias"), stride=strides[i]).transpose(1, 2)
            for j in range(depths[i]):
                x = self.convnext_layer(x, pre + f"convnext_layers.{j}.", chans[i + 1])
        return x

    def proj(self, x, i, n):
        base = f"layers.{i}.attn.{n}."
        A = self.a[f"adapter__layers__{i}__attn__{n}__lora_A__weight"]
        B = self.a[f"adapter__layers__{i}__attn__{n}__lora_B__weight"]
        return lin(x, self.w(base + "weight"), self.w(base + "bias")) + lin(lin(x, A), B) * LORA_SCALE

    def attention(self, x, i, cos, sin):
        T = x.shape[1]
        hd = WIDTH // HEADS
        q = self.proj(x, i, "query_proj").reshape(1, T, HEADS, hd)
        k = self.proj(x, i, "key_proj").reshape(1, T, HEADS, hd)
        v = self.proj(x, i, "value_proj").reshape(1, T, HEADS, hd)

        def rope(z):
            a, b = z[..., : hd // 2], z[..., hd // 2 :]
            return z * cos + torch.cat((-b, a), dim=-1) * sin

        q, k = rope(q), rope(k)
        scale = 1.0 / math.sqrt(hd)
        outs = []
        chain = None
        for h in range(HEADS):
            qh = q[:, :, h] * scale  # [1, T, hd]
            if chain is not None:
                qh = qh + chain  # zero, but makes head h wait for head h-1
            s = torch.matmul(qh, k[:, :, h].transpose(1, 2))
            o = torch.matmul(torch.softmax(s, dim=-1), v[:, :, h])
            outs.append(o)
            chain = o[:, :1, :1] * 0.0
        att = torch.stack(outs, dim=2).reshape(1, T, WIDTH)
        return self.proj(att, i, "out_proj")

    def conformer(self, x, i, cos, sin):
        p = f"layers.{i}."
        eps = 1e-5
        f1 = ln(x, self.w(p + "ffn1_layer_norm.weight"), self.w(p + "ffn1_layer_norm.bias"), eps)
        x = x + 0.5 * lin(F.gelu(lin(f1, self.w(p + "ffn1.w_1.weight"), self.w(p + "ffn1.w_1.bias"))), self.w(p + "ffn1.w_2.weight"), self.w(p + "ffn1.w_2.bias"))
        a = ln(x, self.w(p + "attn_layer_norm.weight"), self.w(p + "attn_layer_norm.bias"), eps)
        x = self.attention(a, i, cos, sin) + x
        c = ln(x, self.w(p + "conv_module.layer_norm.weight"), self.w(p + "conv_module.layer_norm.bias"), eps).transpose(1, 2)
        c = F.conv1d(c, self.w(p + "conv_module.conv_block.1.weight"))
        c = F.glu(c, dim=1)
        c = F.conv1d(c, self.w(p + "conv_module.conv_block.3.weight"), padding=15, groups=WIDTH)
        c = ln(c.transpose(1, 2), self.w(p + "conv_module.conv_block.4.1.weight"), self.w(p + "conv_module.conv_block.4.1.bias"), eps).transpose(1, 2)
        c = F.conv1d(F.gelu(c), self.w(p + "conv_module.conv_block.6.weight")).transpose(1, 2)
        x = c + x
        f2 = ln(x, self.w(p + "ffn2_layer_norm.weight"), self.w(p + "ffn2_layer_norm.bias"), eps)
        x = x + 0.5 * lin(F.gelu(lin(f2, self.w(p + "ffn2.w_1.weight"), self.w(p + "ffn2.w_1.bias"))), self.w(p + "ffn2.w_2.weight"), self.w(p + "ffn2.w_2.bias"))
        return ln(x, self.w(p + "final_layer_norm.weight"), self.w(p + "final_layer_norm.bias"), eps)

    def forward(self, a, b=None):
        weights = torch.softmax(self.a["layer_weight"], dim=0)
        if self.first:
            hidden = self.subsample(a)
            mixed = hidden * weights[0]
        else:
            hidden, mixed = a, b
        T = hidden.shape[1]
        pos = torch.arange(T, dtype=torch.float32, device=hidden.device)
        fr = pos[:, None] * self.inv_freq[None, :]
        ang = torch.cat((fr, fr), dim=-1)
        cos, sin = ang.cos()[None, :, None, :], ang.sin()[None, :, None, :]
        for i in range(self.lo, self.hi):
            hidden = self.conformer(hidden, i, cos, sin)
            mixed = mixed + hidden * weights[i + 1]
        if self.last:
            return lin(mixed, self.a["encoder_projection__weight"], self.a["encoder_projection__bias"])
        return hidden, mixed


# ---------------------------------------------------------------- decoder, written for export


class Cross(nn.Module):
    """memory [1, T, 512] -> the cross-attention keys and values of the 6 layers, [1, 8, T, 64] each."""

    def __init__(self, W: Weights):
        super().__init__()
        self.p = nn.ParameterDict({k.replace(".", "__"): nn.Parameter(v, requires_grad=False) for k, v in W.ss2.items() if ".encoder_attn.k_proj" in k or ".encoder_attn.v_proj" in k})

    def forward(self, memory):
        T = memory.shape[1]
        out = []
        for i in range(D_LAYERS):
            for n in ("k_proj", "v_proj"):
                pre = f"decoder__layers__{i}__encoder_attn__{n}__"
                y = lin(memory, self.p[pre + "weight"], self.p[pre + "bias"])
                out.append(y.reshape(1, T, D_HEADS, D_MODEL // D_HEADS).transpose(1, 2))
        return tuple(out)


class Step(nn.Module):
    """One decoder call on n new tokens, with the self-attention cache of the P tokens before.

    Inputs: ids [1, n] int64, positions [1, n] int64 (the tokens' indices in the sequence),
    mask [1, 1, n, P + n] additive (0 or -inf: causal, and the dummy first cache entry),
    then for each layer self k, v [1, 8, P, 64], then for each layer cross k, v [1, 8, T, 64].
    Outputs: logits of the LAST new token [1, V], then each layer's self k, v [1, 8, P + n, 64].
    """

    def __init__(self, W: Weights):
        super().__init__()
        keep = lambda k: k.startswith("decoder.") and ".encoder_attn.k_proj" not in k and ".encoder_attn.v_proj" not in k
        self.p = nn.ParameterDict({k.replace(".", "__"): nn.Parameter(v, requires_grad=False) for k, v in W.ss2.items() if keep(k)})
        self.emb = nn.Parameter(W.ss2["token_embedding.weight"], requires_grad=False)

    def w(self, k):
        return self.p[k.replace(".", "__")]

    def attn(self, x, pre, k, v, mask):
        n = x.shape[1]
        hd = D_MODEL // D_HEADS
        q = (lin(x, self.w(pre + "q_proj.weight"), self.w(pre + "q_proj.bias")) * hd**-0.5).reshape(1, n, D_HEADS, hd).transpose(1, 2)
        s = torch.matmul(q, k.transpose(2, 3))
        if mask is not None:
            s = s + mask
        o = torch.matmul(torch.softmax(s, dim=-1), v).transpose(1, 2).reshape(1, n, D_MODEL)
        return lin(o, self.w(pre + "out_proj.weight"), self.w(pre + "out_proj.bias"))

    def forward(self, ids, positions, mask, *kv):
        selfkv, crosskv = kv[: 2 * D_LAYERS], kv[2 * D_LAYERS :]
        n = ids.shape[1]
        hd = D_MODEL // D_HEADS
        x = F.embedding(ids, self.emb) + F.embedding(positions + 2, self.w("decoder.embed_positions.weight"))
        x = ln(x, self.w("decoder.layernorm_embedding.weight"), self.w("decoder.layernorm_embedding.bias"), 1e-5)
        new = []
        for i in range(D_LAYERS):
            p = f"decoder.layers.{i}."
            k_new = lin(x, self.w(p + "self_attn.k_proj.weight"), self.w(p + "self_attn.k_proj.bias")).reshape(1, n, D_HEADS, hd).transpose(1, 2)
            v_new = lin(x, self.w(p + "self_attn.v_proj.weight"), self.w(p + "self_attn.v_proj.bias")).reshape(1, n, D_HEADS, hd).transpose(1, 2)
            k = torch.cat((selfkv[2 * i], k_new), dim=2)
            v = torch.cat((selfkv[2 * i + 1], v_new), dim=2)
            new += [k, v]
            x = ln(x + self.attn(x, p + "self_attn.", k, v, mask), self.w(p + "self_attn_layer_norm.weight"), self.w(p + "self_attn_layer_norm.bias"), 1e-5)
            x = ln(x + self.attn(x, p + "encoder_attn.", crosskv[2 * i], crosskv[2 * i + 1], None), self.w(p + "encoder_attn_layer_norm.weight"), self.w(p + "encoder_attn_layer_norm.bias"), 1e-5)
            h = lin(F.gelu(lin(x, self.w(p + "fc1.weight"), self.w(p + "fc1.bias"))), self.w(p + "fc2.weight"), self.w(p + "fc2.bias"))
            x = ln(x + h, self.w(p + "final_layer_norm.weight"), self.w(p + "final_layer_norm.bias"), 1e-5)
        logits = torch.matmul(x[:, -1], self.emb.t())
        return (logits, *new)


# ---------------------------------------------------------------- external data


DT = {"F32": TensorProto.FLOAT}
GAP = 1 << 20


def st_index(path: Path):
    with open(path, "rb") as f:
        n = struct.unpack("<Q", f.read(8))[0]
        h = json.loads(f.read(n))
    h.pop("__metadata__", None)
    return h, 8 + n


def externalize(onnx_path: Path, sources: list[tuple[str, Path]]) -> dict:
    """Point every initializer whose bytes are a tensor of one of `sources` at it, with offsets
    relative to the smallest byte range of that file that holds all the tensors used."""

    m = onnx.load(str(onnx_path))
    index = {}
    for loc, path in sources:
        h, base = st_index(path)
        blob = path.read_bytes()
        for name, t in h.items():
            a, b = t["data_offsets"]
            key = (DT[t["dtype"]], hashlib.sha1(blob[base + a : base + b]).hexdigest())
            index[key] = (loc, base + a, b - a)
    uses: dict[str, list] = {}
    kept = 0
    for init in m.graph.initializer:
        arr = numpy_helper.to_array(init)
        if arr.size < 2:
            kept += 1
            continue
        raw = np.ascontiguousarray(arr).astype(arr.dtype.newbyteorder("<")).tobytes()
        key = (init.data_type, hashlib.sha1(raw).hexdigest())
        if key not in index:
            kept += 1
            continue
        loc, off, length = index[key]
        uses.setdefault(loc, []).append((init, off, length))
    # Contiguous slices of each file (a gap of at most GAP bytes is read along), each one a
    # separate external file for ONNX Runtime, named "<file>@<first byte>".
    slices = []
    for loc, items in uses.items():
        items.sort(key=lambda u: u[1])
        groups = []
        for it in items:
            if groups and it[1] - groups[-1][-1][1] - groups[-1][-1][2] <= GAP:
                groups[-1].append(it)
            else:
                groups.append([it])
        for g in groups:
            lo, hi = g[0][1], max(o + n for _, o, n in g)
            name = f"{loc}@{lo}"
            slices.append({"file": loc, "name": name, "start": lo, "end": hi})
            for init, off, length in g:
                init.ClearField("raw_data")
                for f in ("float_data", "int64_data", "int32_data", "double_data"):
                    init.ClearField(f)
                init.data_location = TensorProto.EXTERNAL
                del init.external_data[:]
                for k, v in (("location", name), ("offset", str(off - lo)), ("length", str(length))):
                    e = init.external_data.add()
                    e.key, e.value = k, v
    onnx.save(m, str(onnx_path))
    data = onnx_path.read_bytes()
    return {"graph": onnx_path.name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "slices": slices, "kept": kept}


def export(module, args, path: Path, inputs, outputs, dynamic):
    torch.onnx.export(module, args, str(path), input_names=inputs, output_names=outputs, dynamic_axes=dynamic,
                      opset_version=17, do_constant_folding=False, dynamo=False)


# ---------------------------------------------------------------- main


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("ss2", type=Path)
    ap.add_argument("mert", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--layers-per-part", type=int, default=4)
    ap.add_argument("--check", action="store_true", help="compare each graph with the original model on random input (short T)")
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    W = Weights(a.mert / "model.safetensors", a.ss2 / "model.safetensors")
    srcs = [("mert", a.mert / "model.safetensors"), ("ss2", a.ss2 / "model.safetensors")]
    manifest = {"parts": [], "layersPerPart": a.layers_per_part}
    n_parts = LAYERS // a.layers_per_part
    for k in range(n_parts):
        lo, hi = k * a.layers_per_part, (k + 1) * a.layers_per_part
        part = Part(W, lo, hi, k == 0, k == n_parts - 1).eval()
        path = a.out / f"sheetsage2-enc-{k}.onnx"
        if k == 0:
            args = (torch.zeros(1, 400, 128),)
            ins, dyn = ["mel"], {"mel": {1: "M"}}
        else:
            args = (torch.zeros(1, 100, WIDTH), torch.zeros(1, 100, WIDTH))
            ins, dyn = ["hidden", "mixed"], {"hidden": {1: "T"}, "mixed": {1: "T"}}
        outs = ["memory"] if k == n_parts - 1 else ["hidden_out", "mixed_out"]
        for o in outs:
            dyn[o] = {1: "T"}
        with torch.no_grad():
            export(part, args, path, ins, outs, dyn)
        info = externalize(path, srcs)
        info["layers"] = [lo, hi]
        manifest["parts"].append(info)
        print(json.dumps(info), flush=True)
        del part
    cross = Cross(W).eval()
    path = a.out / "sheetsage2-cross.onnx"
    outs = [f"cross_{i}_{kv}" for i in range(D_LAYERS) for kv in "kv"]
    with torch.no_grad():
        export(cross, (torch.zeros(1, 100, D_MODEL),), path, ["memory"], outs, {"memory": {1: "T"}, **{o: {2: "T"} for o in outs}})
    manifest["cross"] = externalize(path, srcs)
    print(json.dumps(manifest["cross"]), flush=True)
    step = Step(W).eval()
    path = a.out / "sheetsage2-step.onnx"
    hd = D_MODEL // D_HEADS
    selfn = [f"self_{i}_{kv}" for i in range(D_LAYERS) for kv in "kv"]
    crossn = [f"cross_{i}_{kv}" for i in range(D_LAYERS) for kv in "kv"]
    args = (torch.zeros(1, 3, dtype=torch.long), torch.arange(3)[None], torch.zeros(1, 1, 3, 4),
            *[torch.zeros(1, D_HEADS, 1, hd) for _ in selfn], *[torch.zeros(1, D_HEADS, 50, hd) for _ in crossn])
    outn = ["logits"] + [f"new_{s}" for s in selfn]
    dyn = {"ids": {1: "n"}, "positions": {1: "n"}, "mask": {2: "n", 3: "Pn"}, **{s: {2: "P"} for s in selfn}, **{c: {2: "T"} for c in crossn}, **{f"new_{s}": {2: "Pn"} for s in selfn}}
    with torch.no_grad():
        export(step, args, path, ["ids", "positions", "mask", *selfn, *crossn], outn, dyn)
    manifest["step"] = externalize(path, srcs)
    print(json.dumps(manifest["step"]), flush=True)
    (a.out / "sheetsage2-manifest.json").write_text(json.dumps(manifest, indent=1))


if __name__ == "__main__":
    main()
