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

# Graphes de SheetSage2 (version 1.0.2, à l'essai)

Le dossier `sheetsage2/` contient les graphes ONNX de SheetSage2 (m-a-p, 2026) **sans aucun
poids** : six morceaux de l'encodeur MERT-v2 (quatre couches chacun), le calcul des clés et
valeurs de l'attention croisée, et un pas du décodeur. Ils lisent des **tranches** des deux
fichiers des auteurs, téléchargés à la demande depuis leur page publique et jamais redistribués
par l'app :

- `model.safetensors` de https://huggingface.co/m-a-p/SheetSage2, révision
  `b83c3d79a6d98bcffaf8f9ed112c90aa887887bc` (228 738 564 octets, SHA-256
  `b235f68091a5f5b644000f2b5acb57d1e70432aca2b34ab1b9cf27236e1f4274`) : le décodeur et les
  adaptateurs de l'encodeur ;
- `model.safetensors` de https://huggingface.co/m-a-p/MERT-v2-FullSong, révision
  `d8ba1c745e733b3908ce6ad16ebeb17ac7600a42` (2 529 812 848 octets, SHA-256
  `e6dd2ab187d6dd62b6521cd7d8f932e237acf0c5757745a7232082e28391350d`) : l'encodeur.

Licence des poids : CC BY-NC 4.0 (usage non commercial), affichée avant le téléchargement. Les
auteurs ne donnent pas de licence pour leur code ; les graphes sont écrits ici, à partir de la
description de leur architecture, par `web/spikes/accords/modeles/convert_sheetsage2.py`, et
vérifiés contre leur modèle PyTorch par `check_sheetsage2.py` (écart de l'ordre de 10⁻⁶) puis,
avec le code de l'app, par `modeles/ts/ss2-parity.ts` (mêmes jetons que leur modèle).
`sheetsage2-manifest.json` donne, pour chaque graphe, sa taille, son SHA-256 (vérifié par l'app
avant usage) et les tranches de fichier qu'il lit. Le spectre d'entrée (log-mel) est calculé par
l'app (`engine/sheetsage2Mel.ts`), avec les constantes lues dans le fichier MERT-v2 lui-même.
