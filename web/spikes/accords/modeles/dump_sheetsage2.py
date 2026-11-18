"""SheetSage2's chords on the bench corpus, with the authors' PyTorch code, for the bench variants
(`banc/variantes/sheetsage2*.ts`): for each mix, the decoded events (time of each chord the model
writes) and, at each chord, the model's probabilities over its 361 chord labels (softmax of the
grammar-masked logits restricted to the chord tokens), exactly what the app's own decoding
(`app/src/analysis/engine/sheetsage2.ts`) gives from the ONNX graphs.

    python dump_sheetsage2.py <SheetSage2 snapshot> <corpus dir> <out dir> [--only id,...]

One JSON per file: <out>/<id>.<condition>.json. Pieces of the bench are shorter than one model
window (300 s): one window each, no stitching.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import torch
from transformers import AutoModel

PROMPTS = ("timestamp", "chord_full")


def load(path: Path) -> torch.Tensor:
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-i", str(path), "-vn", "-ac", "1", "-ar", "24000", "-f", "f32le", "pipe:1"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    return torch.from_numpy(np.frombuffer(raw, dtype="<f4").copy())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("snap")
    ap.add_argument("corpus", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--only", default="")
    ap.add_argument("--threads", type=int, default=4)
    a = ap.parse_args()
    torch.set_num_threads(a.threads)
    a.out.mkdir(parents=True, exist_ok=True)
    model = AutoModel.from_pretrained(a.snap, trust_remote_code=True, torch_dtype=torch.float32)
    tok = model.tokenizer
    from importlib import import_module
    pkg = type(model).__module__.rsplit(".", 1)[0]
    mod = import_module(pkg + ".generation_sheetsage2")
    audio_mod = import_module(pkg + ".audio_sheetsage2")
    prompts = tok.normalize_prompts(PROMPTS)
    only = set(filter(None, a.only.split(",")))
    files = sorted(a.corpus.glob("*/*/mix.flac"))
    for f in files:
        pid, cond = f.parent.parent.name, f.parent.name
        if only and pid not in only:
            continue
        out = a.out / f"{pid}.{cond}.json"
        if out.exists():
            continue
        t0 = time.time()
        wave = load(f)
        duration = len(wave) / 24000
        segment = audio_mod.slice_audio(wave, 0.0, 300.0)[None]
        chord_steps = []

        def cb(position, ids, logits, masked):
            chord_steps.append(masked[0, tok.full_chord_token_start : tok.full_chord_token_end].clone())

        tokens = mod.constrained_prompt_generate(model, segment, prompts, model.max_output_seq_len, autocast_dtype=None,
                                                 stop_time_seconds=duration, step_callback=cb)
        toks = tokens.tolist()
        prefix_len = len(tok.prompt_prefix(prompts)) - (1 if tok.prompt_prefix(prompts)[-1] == tok.eos_token else 0)
        decoded, _ = mod.decode_generated_tokens(tok, tokens, pid)
        lookup = mod.event_time_map(decoded, 300.0)
        # The step that produced each generated token (callback index = token index - prefix_len).
        chords = []
        for i, t in enumerate(toks[prefix_len:]):
            if tok.full_chord_token_start <= t < tok.full_chord_token_end:
                chords.append({"step": i, "label": tok.full_chord_labels[t - tok.full_chord_token_start],
                               "probs": torch.softmax(chord_steps[i].float(), 0).numpy().round(5).tolist()})
        events = []
        for e in decoded["events"]:
            ev = {"subbeat": e["subbeat"], "time": float(lookup(e["subbeat"]))}
            if "chord" in e["values"]:
                ev["chord"] = e["values"]["chord"]
            events.append(ev)
        out.write_text(json.dumps({"id": pid, "condition": cond, "duration": duration, "tokens": toks, "events": events,
                                   "chords": chords, "seconds": round(time.time() - t0, 1)}))
        print(pid, cond, len(toks), "tokens", round(time.time() - t0, 1), "s", flush=True)


if __name__ == "__main__":
    main()
