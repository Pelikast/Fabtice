# Graphe du modèle d'accords détaillé (Tsumugi-Chords)

`tsumugi-chords.graph.onnx` (1 356 051 octets, SHA-256
`235901fcd3142a866d706aeba78df574fc0b0bc772f7eaa1d21f8885d5906977`) est le
graphe ONNX du modèle d'accords Tsumugi-Chords **sans aucun poids** :
l'architecture et les noyaux du CQT que le code calcule. Il lit les poids de
l'auteur, `chord-model.safetensors`, téléchargés à la demande depuis leur page
publique (https://huggingface.co/anime-song/Tsumugi-Chords, licence
CC BY-NC 4.0, usage non commercial) et jamais redistribués par l'app.

- Code d'origine : https://github.com/anime-song/Tsumugi-Chords, commit
  `755b1e2a3838853c66321dfe29a5fc2c7bf0c325`, licence MIT.
- Fabriqué par `web/spikes/accords/modeles/build_graph.py` (outils figés),
  qui le refait à l'identique ; provenance complète dans
  `tsumugi-chords.graph.json`. L'app vérifie son empreinte avant de s'en
  servir.
