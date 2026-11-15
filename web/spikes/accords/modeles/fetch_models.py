"""Download the candidates' files from their public location, at a pinned revision,
and check each against its SHA-256. Nothing here is ever committed: files land in
./cache/ (git-ignored).

    python fetch_models.py            # everything
    python fetch_models.py btc-large chordmini-2e1d
"""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"
HF = "https://huggingface.co/"
GH_RAW = "https://raw." + "githubusercontent.com/"

FILES: dict[str, dict] = {
    # The app's current model (for comparison).
    "crema": {
        "url": HF + "thebluescreen/crema-chords-onnx/resolve/302ae89e3ed7753fc8da9cb08274aff446d8fe47/crema_chords.onnx",
        "bytes": 2728454, "sha256": "3222e641f23f668caabb48498d8d4db258216753af8d1da2753da002eb786c1e"},
    # BTC (Park et al., ISMIR 2019), large vocabulary, ONNX by AudioWeb (fp16 storage).
    "btc-large": {
        "url": HF + "Andremi/audioweb-models/resolve/953d0a9e46fd364860c9413ee4c7a9aa4fbcae4b/analysis/btc_large_voca.onnx",
        "bytes": 6472890, "sha256": "3576d3a52628e130252af8b70378dbbd2f678efe27c9dd520930d671055bad2a"},
    "btc-meta": {
        "url": HF + "Andremi/audioweb-models/resolve/953d0a9e46fd364860c9413ee4c7a9aa4fbcae4b/analysis/btc_meta.json",
        "bytes": 4080, "sha256": "cd56da51912598d0dacd7113dbd93bf03ebc4d96ecd546dd99ecbe6184254add"},
    # ChordMini ChordNet 2E1D (Phan et al., 2026), ONNX by musetric (static [16, 108, 144]).
    "chordmini-2e1d": {
        "url": HF + "musetric/chordmini-onnx/resolve/8ab85fc0f61439900cd07ac21257a43eac57075c/chordnet.onnx",
        "bytes": 17080550, "sha256": "1faee8e1cf168300afe0f47517e76836ac200c3841b0fb430fad7dfea5ad6394"},
    "chordmini-config": {
        "url": HF + "musetric/chordmini-onnx/resolve/8ab85fc0f61439900cd07ac21257a43eac57075c/config.json",
        "bytes": 3009, "sha256": "1f26c11ebea51ec08f12e813eb213a729fa0ecc407ac7632dfdc7bad67e65aa4"},
    # Basic Pitch (Spotify, ICASSP 2022), as an independent bass / pitch-class cue.
    "basic-pitch": {
        "url": HF + "AEmotionStudio/basic-pitch-onnx-models/resolve/327fd8ccd2f0bb84cbe56b4a0e9d318398ddf763/nmp.onnx",
        "bytes": 230444, "sha256": "2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec"},
    # Jiang, Chen, Xia (ISMIR 2019) large-vocabulary model: 5 folds, PyTorch state dicts in the
    # official repository (MIT), at a pinned commit. Converted to ONNX by convert_jiang2019.py.
    **{f"jiang2019-s{i}": {
        "url": GH_RAW + "music-x-lab/ISMIR2019-Large-Vocabulary-Chord-Recognition/481f4ce703f8822b99f4037e9104ba1760e21ea3/"
               f"cache_data/joint_chord_net_ismir_naive_v1.0_reweight(0.0,10.0)_s{i}.best.sdict",
        "bytes": b, "sha256": h}
       for i, (b, h) in enumerate([
           (5746183, "921b42d5d1cf9ce1c0c0e45a74d409b8066e0acec46058ef74e24ee0fb540761"),
           (5746175, "bcb75859e0efa256696cf5da396b320093317b9b1d9560c304f46c25fe1f8b17"),
           (5746179, "acddf85c3fff29954c4877021177d72e2cba9f729ce80c1010f054c477bf3f61"),
           (5746175, "65d81a3ab73435aaaade586981b4cabdf57b8953d76052703e6968c32ef8421c"),
           (5746227, "5ff6b0ec85640e17a09a9b3de68c93fdd45adc24488e8fa9be5715c28d561122")])},
    # Tsumugi-Chords (anime-song, 2026): weights CC BY-NC 4.0, code MIT.
    "tsumugi-model": {
        "url": HF + "anime-song/Tsumugi-Chords/resolve/a6731e1eea7353773188421702ff67049a84ce7a/chord-model.safetensors",
        "bytes": 67647992, "sha256": "6b62daef6d164ca433486abdda1b74a5e513c48297a4f57e0e19fdf536c0ee0a"},
    "tsumugi-tables": {
        "url": HF + "anime-song/Tsumugi-Chords/resolve/a6731e1eea7353773188421702ff67049a84ce7a/semi_tables.npz",
        "bytes": 2156, "sha256": "c3d3fc2f38d79b617d27cc77f876792900b33f00d5e1741dd67f895450d3c1b9"},
    "tsumugi-bigram": {
        "url": HF + "anime-song/Tsumugi-Chords/resolve/a6731e1eea7353773188421702ff67049a84ce7a/chord_lm.npz",
        "bytes": 929808, "sha256": "a801c54a78401a464d8546ae5ffade6d59fcf9f51f3e2c83d939e9ebdf34ab0f"},
    "tsumugi-config": {
        "url": HF + "anime-song/Tsumugi-Chords/resolve/a6731e1eea7353773188421702ff67049a84ce7a/config.json",
        "bytes": 409, "sha256": "6f880e8ab651a456530b9432cee0dd8d894f5a6b6c0a099e929adf586f306880"},
}

# Code repositories cloned (shallow, pinned) by the runners that need upstream code.
REPOS = {
    "jiang2019": ("https://github.com/music-x-lab/ISMIR2019-Large-Vocabulary-Chord-Recognition",
                  "481f4ce703f8822b99f4037e9104ba1760e21ea3"),
    "tsumugi": ("https://github.com/anime-song/Tsumugi-Chords", None),
    "chordmini": ("https://github.com/ptnghia-j/ChordMini", None),
}


def _sha(path: Path) -> str:
    import hashlib

    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def fetch(name: str, spec: dict) -> Path:
    CACHE.mkdir(exist_ok=True)
    dest = CACHE / (name + Path(spec["url"].split("?")[0]).suffix)
    if not dest.exists() or dest.stat().st_size != spec["bytes"]:
        print(f"download {name} <- {spec['url']}", file=sys.stderr)
        tmp = dest.with_suffix(dest.suffix + ".part")
        urllib.request.urlretrieve(spec["url"], tmp)
        tmp.replace(dest)
    if dest.stat().st_size != spec["bytes"]:
        raise RuntimeError(f"{name}: {dest.stat().st_size} bytes, expected {spec['bytes']}")
    if spec.get("sha256") and _sha(dest) != spec["sha256"]:
        raise RuntimeError(f"{name}: SHA-256 mismatch")
    return dest


def main(names: list[str]) -> None:
    for n in names or FILES:
        p = fetch(n, FILES[n])
        print(f"{n:20s} {p.stat().st_size:>10d}  {_sha(p)}  {p.name}")


if __name__ == "__main__":
    main(sys.argv[1:])
