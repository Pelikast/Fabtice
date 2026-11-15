# Recherche de meilleurs modèles d'accords

État au 15 novembre 2026. But : trouver des modèles de reconnaissance d'accords
meilleurs que CREMA (le modèle actuel), surtout pour le jazz (septièmes,
extensions, basse et renversements), qui tournent sur l'appareil de
l'utilisateur avec onnxruntime-web, et les proposer comme choix dans les
réglages avancés.

Rien ici n'est encore mesuré sur le banc de mesure (`web/spikes/accords/`,
en préparation) : les chiffres ci-dessous viennent d'un seul morceau de
démonstration synthétique (`web/spikes/analyse/demo/demo-swing.mp3`, 37 s,
accordé à +30 cents). Ils donnent un ordre de grandeur, pas un classement
définitif.

## En bref

1. **Tsumugi-Chords** est de loin le plus prometteur : il nomme la fondamentale,
   la couleur (62 qualités, avec 9, 11, 13 et altérations) **et la note de
   basse**, ce qui répond exactement aux défauts relevés par le propriétaire.
   Sur la démonstration, 95 % de fondamentales justes image par image contre
   84 % pour CREMA, et son propre décodeur retrouve presque toute la grille,
   extensions comprises. Poids sous licence non commerciale (CC BY-NC 4.0),
   ce que le propriétaire accepte. Pas de fichier ONNX public, mais nous avons
   trouvé comment **éviter d'héberger quoi que ce soit** : l'app télécharge
   le fichier de poids original de l'auteur, et un petit fichier « graphe »
   (1,4 Mo, sans aucun poids) qui sait le lire. Coût : lourd, environ 1,5 à
   2,6 fois la durée du morceau sur le processeur ici (moins sur un Mac à puce
   Apple, carte graphique pas encore essayée).
2. **CREMA** (actuel) reste un bon modèle léger, et ses erreurs sont
   différentes de celles des autres : il est utile en combinaison.
3. **Jiang et al. 2019** (vocabulaire étendu, basse) : moins bon seul, mais
   **complémentaire de CREMA** (le mélange des deux fait mieux que chacun).
   Conversion ONNX faite ici ; il faudrait l'héberger, ou réécrire son
   analyse du son en JavaScript.
4. **BTC grand vocabulaire** et **ChordMini** : ONNX publics, immédiatement
   utilisables et très rapides, mais moins bons que CREMA sur la
   démonstration. À garder pour le banc et la combinaison.
5. **Basic Pitch** n'est pas un modèle d'accords : indice indépendant de la
   note de basse, à n'utiliser que regroupé par temps ou par mesure.

Aucun de ces modèles n'a été entraîné sur du jazz ancien (tous sur de la pop,
du rock ou de la J-pop). Le banc dira lequel tient le mieux sur le « vieux
disque ».

## Tableau des candidats

« Utilisable tel quel » : un fichier ONNX existe déjà à un emplacement public
(adresse figée par une révision, taille et empreinte SHA-256 ci-dessous ; les
mêmes valeurs sont dans `fetch_models.py`).

| Modèle | Licence du code | Licence des poids | Taille | Entrée | Vocabulaire | ONNX public | Coût dans le navigateur (processeur) | Données d'entraînement |
|---|---|---|---|---|---|---|---|---|
| **Tsumugi-Chords** (anime-song, 2026) | MIT | **CC BY-NC 4.0** (non commercial) | 16,9 M paramètres, 67,6 Mo (float32) | stéréo 25,6 kHz ; temps, premiers temps et tonalité fournis par nous | 12 fondamentales × 62 qualités + N (745), basse (13), fondamentale (13), notes de l'accord (12), changements d'accord ; 25 images/s | **non** ; conversion faite ici, exacte | 1,55 à 2,6 × la durée (4 fils / 1 fil, WASM, cette machine) ; ~2 Go de mémoire pour une fenêtre de 30 s | 18 266 chansons transcrites en notes, 847 chansons annotées à la main, surtout J-pop et anime |
| **CREMA** (McFee et Bello 2017), actuel | BSD-2-Clause | BSD-2-Clause (conversion ONNX tierce) | 2,7 Mo | mono 44,1 kHz, analyse du son dans le graphe | 12 × 14 qualités + N, X ; basse, fondamentale, notes ; 10,8 images/s | oui (déjà dans l'app) | 0,005 × la durée | 1 217 chansons pop et rock |
| **Jiang, Chen et Xia 2019** (grand vocabulaire par décomposition) | MIT | MIT (poids dans le dépôt officiel), données d'entraînement non libres | 5 réseaux de 0,5 M paramètres ; ONNX 9,5 Mo (4,8 Mo en float16) | mono 22,05 kHz, « hybrid CQT » de librosa (36 cases par octave, 288 cases) | têtes séparées : triade (73), basse (13), septième, neuvième, onzième, treizième ; tout accord se compose (ici 625 accords, renversements compris) ; 43 images/s | **non** ; conversion faite ici | 0,05 à 0,16 × la durée | les mêmes 1 217 chansons pop et rock |
| **BTC grand vocabulaire** (Park et al. 2019) | MIT | MIT annoncée, mais entraîné sur Isophonics, Robbie Williams et UsPop2002 dont les conditions interdisent l'usage commercial : **flou** | 6,5 Mo (float16 stocké) | log-CQT librosa : 22,05 kHz, pas 2048, 144 cases, 24 par octave ; normalisation à faire côté JS | 12 × 14 qualités (les mêmes que l'app) + X, N ; 10,8 images/s | **oui** | 0,003 × la durée | ~ 500 chansons pop et rock (Isophonics, Robbie Williams, UsPop2002) |
| **ChordMini ChordNet 2E1D** (Phan et al. 2026) | MIT | MIT annoncée ; pseudo-étiquettes sur FMA, DALI, MAESTRO (non commercial) et un jeu annoté non publié : **flou** | 17 Mo | même log-CQT que BTC (sur tout le morceau) ; entrée figée [16, 108, 144] | comme BTC ; 10,8 images/s | **oui** | 0,006 × la durée | voir licence |
| **Basic Pitch** (Spotify 2022) — indice de basse | Apache-2.0 | Apache-2.0 | 0,23 Mo | mono 22,05 kHz, analyse du son dans le graphe | 88 notes (piano), 86 images/s | **oui** | 0,01 × la durée | instruments variés, notes |

Emplacements publics des fichiers utilisables tels quels :

| Fichier | Adresse (révision figée) | Octets | SHA-256 |
|---|---|---|---|
| BTC grand vocabulaire | `huggingface.co/Andremi/audioweb-models`, révision `953d0a9e46fd364860c9413ee4c7a9aa4fbcae4b`, `analysis/btc_large_voca.onnx` | 6 472 890 | `3576d3a52628e130252af8b70378dbbd2f678efe27c9dd520930d671055bad2a` |
| sa normalisation | même dépôt, `analysis/btc_meta.json` | 4 080 | `cd56da51912598d0dacd7113dbd93bf03ebc4d96ecd546dd99ecbe6184254add` |
| ChordMini 2E1D | `huggingface.co/musetric/chordmini-onnx`, révision `8ab85fc0f61439900cd07ac21257a43eac57075c`, `chordnet.onnx` | 17 080 550 | `1faee8e1cf168300afe0f47517e76836ac200c3841b0fb430fad7dfea5ad6394` |
| Basic Pitch | `huggingface.co/AEmotionStudio/basic-pitch-onnx-models`, révision `327fd8ccd2f0bb84cbe56b4a0e9d318398ddf763`, `nmp.onnx` (le même fichier est aussi chez `daserge/basic-pitch-onnx` et `Andremi/audioweb-models`) | 230 444 | `2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec` |
| Tsumugi-Chords, **poids originaux de l'auteur** | `huggingface.co/anime-song/Tsumugi-Chords`, révision `a6731e1eea7353773188421702ff67049a84ce7a`, `chord-model.safetensors` | 67 647 992 | `6b62daef6d164ca433486abdda1b74a5e513c48297a4f57e0e19fdf536c0ee0a` |
| Jiang 2019, poids originaux (PyTorch) | `github.com/music-x-lab/ISMIR2019-Large-Vocabulary-Chord-Recognition`, commit `481f4ce703f8822b99f4037e9104ba1760e21ea3`, `cache_data/…_s0.best.sdict` à `_s4` | ~5,7 Mo chacun | dans `fetch_models.py` |

### Écartés, et pourquoi

- **SheetSage2-Refined** (accords, temps, tonalité) : ses têtes d'accords
  ont besoin d'un encodeur de 2,7 Go. Trop lourd pour un navigateur.
  CC BY-NC 4.0.
- **Gros modèles « de fond »** (MOSS-Music 8B, OMAR-RQ du MTG, MERT…) :
  plusieurs gigaoctets, et sans tête d'accords publiée pour la plupart.
- **madmom** (deep chroma + CRF) : majeur et mineur seulement ; poids
  CC BY-NC-SA.
- **autochord** : 25 accords (majeur, mineur) et dépend d'un greffon Vamp
  (NNLS-Chroma) qu'on ne peut pas faire tourner dans un navigateur tel quel.
- **Omnizart** (accords) : TensorFlow, entraîné sur des sonates de
  Beethoven, petit vocabulaire.
- **Harmony Transformer**, **ChordFormer** : pas de poids publiés trouvés.
- **BTC-HCQT** : poids retirés par l'auteur, et pas meilleur que BTC.
- **BTC affiné « Magic Chords »** (`esysc69`), **alberto**, **betterchord**,
  **solitito** : majeur et mineur seulement, ou guitare seule.
- **btc-chords-GGUF** : mêmes poids que BTC, dans un format que
  onnxruntime ne lit pas.
- **NNLS-Chroma / Chordino** (GPL-2 ou ultérieure, traitement du signal
  sans apprentissage) : un « deuxième avis » bon marché possible, à porter en
  JavaScript. Pas fait : CREMA donne déjà ses propres notes de l'accord, qui
  jouent ce rôle.

## Premiers chiffres sur la démonstration

Score image par image (toutes les 10 ms), **argmax simple** : ni a priori
d'harmonie, ni regroupement par temps. « Fondamentale » : même fondamentale ;
« qualité » : même fondamentale et même qualité, une fois les deux ramenées
aux 14 qualités de l'app (les extensions sont ignorées) ; « maj/min » : même
fondamentale et même tierce ; « basse » : la sortie basse du modèle égale la
basse attendue (ici toujours la fondamentale).

| Modèle | Fondamentale | Qualité | maj/min | Basse | Calcul (× durée, Python natif) |
|---|---|---|---|---|---|
| CREMA, accordage non corrigé | 0,550 | 0,348 | 0,526 | 0,506 | 0,008 |
| CREMA, accordage corrigé (comme dans l'app) | 0,842 | 0,776 | 0,829 | 0,642 | 0,006 |
| BTC grand vocabulaire, corrigé | 0,672 | 0,600 | 0,662 | — | 0,014 |
| ChordMini 2E1D, corrigé | 0,597 | 0,561 | 0,574 | — | 0,020 |
| Jiang 2019 (accordage estimé par le modèle) | 0,792 | 0,430 | 0,756 | 0,761 | 0,087 |
| Tsumugi, sans temps ni tonalité, non corrigé | 0,922 | 0,902 | 0,907 | 0,905 | 0,31 (4 fils) |
| Tsumugi, temps et tonalité donnés, non corrigé | 0,948 | 0,937 | 0,942 | 0,948 | 0,30 (4 fils) |
| Tsumugi avec son propre décodeur | 0,944 | 0,944 | 0,944 | 0,944 | 0,35 |
| Basic Pitch, note la plus grave prise pour la fondamentale | 0,378 | — | — | 0,378 | 0,012 |

Remarques :

- Ici, Tsumugi a reçu les temps et la tonalité **de la vérité** ; dans l'app,
  il recevrait ceux de notre propre analyse (Beat This!, tonalité). Sans
  aucun temps, il reste devant (0,922). Sur le banc, il faudra lui donner nos
  temps, pas ceux de la vérité.
- Son décodeur sort, sur la démonstration : `BM7(9) Cdim7 C#m7(9) F#7(9)
  Em7(9) A7(9,13) BM7 D#m7 B7(9,13) E7(9,13) B7(#9) E7(9,13) B7(9,13) Em7(9)
  A7(9,13) BM7(9)`, pour une vérité identique sauf `F#7` (au lieu de
  `F#7(9)`) et un deuxième `BM7` (au lieu de `D#m7`, qui en est le
  renversement sans fondamentale). Les extensions sont justes.
- L'accordage à +30 cents ruine CREMA s'il n'est pas corrigé ; Tsumugi (36
  cases par octave) y résiste.
- La basse « vraie » du morceau est une walking bass : la note la plus grave
  n'est la fondamentale qu'une fois sur trois. Basic Pitch ne sert donc qu'en
  regroupant par temps fort.
- Pour chaque accord de la vérité, `segments.py` montre l'étiquette la plus
  fréquente de chaque modèle : tous trouvent la plupart des accords ; ils
  diffèrent surtout par le bruit image par image et les accords courts.

## Les erreurs se recoupent-elles ? (combinaison)

`sanity.py` donne, pour chaque paire de modèles, la part des erreurs de
fondamentale de l'un que l'autre commet aussi ; `combine.py` mélange les
probabilités (moyenne géométrique pondérée, ramenées aux 169 accords de
l'app). Sur la démonstration :

- les erreurs de Tsumugi ne sont partagées par CREMA qu'à 16 % ; celles de
  CREMA par Jiang à 31 % : **les erreurs sont assez indépendantes** ;
- au moins un modèle a la bonne fondamentale 99,9 % du temps ;
- mélanges (fondamentale / qualité) : CREMA + Jiang **0,898 / 0,782** (contre
  0,842 et 0,792 seuls) ; CREMA + Tsumugi sans temps 0,929 / 0,926 ;
  CREMA + Tsumugi avec temps 0,961 / 0,952 ; en revanche, ajouter BTC et
  ChordMini à CREMA fait baisser (0,833 puis 0,770) : un mélange à poids égaux
  n'est bon qu'entre modèles de niveau comparable. Les poids devront être
  appris sur le banc.

À mesurer sur le banc : le gain du mélange après le décodage par temps de
l'app (pas seulement en argmax), sur la version « vieux disque », et avec nos
temps.

## Ce qui tourne ici, et comment

Tout est dans ce dossier ; les poids et les sorties ne sont jamais versés au
dépôt (`.gitignore`) : `fetch_models.py` les retélécharge depuis leur
emplacement public et vérifie leur empreinte.

```
pip install -r requirements.txt            # Python 3.13 ; torch (processeur) pour Jiang et Tsumugi
python fetch_models.py                      # tout télécharger dans cache/
python run_onnx.py crema           son.wav out/son.crema.npz --tuning auto
python run_onnx.py btc-large       son.wav out/son.btc-large.npz --tuning auto
python run_onnx.py chordmini-2e1d  son.wav out/son.chordmini.npz --tuning auto
python run_jiang2019.py son.wav out/son.jiang2019.npz            # PyTorch, référence
python run_jiang2019.py --export cache/jiang2019.onnx            # conversion + vérification
python run_jiang2019.py son.wav out/son.jiang2019-onnx.npz --onnx
python run_tsumugi.py son.wav out/son.tsumugi.npz --info temps.json [--decoded out/son.tsumugi-dec.npz]
python convert_tsumugi.py cache/tsumugi-chords.onnx              # conversion + vérification
python run_tsumugi.py son.wav out/son.tsumugi-onnx.npz --info temps.json --onnx
python run_basicpitch.py son.wav out/son.basic-pitch.npz
python sanity.py vérité.json out/*.npz      # scores, erreurs partagées
python segments.py vérité.json out/*.npz    # étiquette par accord de la vérité
python combine.py vérité.json out/a.npz out/b.npz [--weights 1,2]
```

`temps.json` : `{"beats": [[temps en s, numéro du temps], …], "key": "B:major"}`
(le format de la vérité et de notre analyse), ou `none`.

Chaque script écrit un `.npz` de même forme (décrite en tête de
`common.py`) : `probs` [images × classes], `labels` (étiquettes Harte),
`hop` et `t0` (en secondes du son d'origine, même après correction de
l'accordage), et quand le modèle les donne `bass` [images × 13], `pitch`
[images × 12], plus le temps de calcul. Le banc pourra lire ces fichiers tels
quels, et `combine.to_app_vocab` les ramène aux 169 accords de l'app.

`wasm_bench.mjs` fait tourner chaque graphe dans onnxruntime-web 1.31.1 (la
version de l'app, moteur WASM) sous Node : tous les opérateurs se chargent, et
il donne le coût par 30 s de son.

## Notes de conversion

- **Jiang 2019** : export PyTorch → ONNX, opset 17, longueur variable,
  opérateurs ordinaires (Conv, InstanceNormalization, LSTM, MaxPool, Selu,
  Softmax…). Écart maximal avec PyTorch 7·10⁻⁵, mêmes argmax partout. La
  normalisation (InstanceNorm) porte sur tout le morceau : donner le morceau
  entier d'un coup (ou de longues fenêtres). Les poids peuvent être stockés
  en float16 (4,8 Mo, écart 4·10⁻⁴).
- **Tsumugi-Chords** : son analyse du son (CQT harmonique, phase, indices
  stéréo) utilise des nombres complexes, que l'export ONNX ne sait pas faire.
  Elle est réécrite **exactement** en nombres réels (le produit
  « STFT × spectre des atomes » devient une convolution à pas fixe ;
  l'angle de phase s'écrit avec Atan et Where, car ONNX n'a pas Atan2).
  Écart avec l'original : 2·10⁻⁶ en PyTorch, 4·10⁻⁴ en ONNX, mêmes argmax
  sur toutes les images, sur une fenêtre et sur le morceau entier. Graphe à
  entrée fixe (fenêtre de 30 s, lot de 1), opset 17, opérateurs ordinaires
  (Conv, ConvTranspose, LayerNormalization, InstanceNormalization, MatMul,
  Gemm, Softmax, Erf, Atan, Pad réfléchi…). 68,8 Mo en float32, 35,1 Mo en
  float16 stocké (calcul en float32, écart 2·10⁻⁵).
- **Sans hébergement** (`external_weights.py`, `wasm_external.mjs`) : un
  fichier `.safetensors` contient les poids bruts, en clair. Un graphe ONNX
  peut désigner ses poids « dans un fichier externe, à tel endroit ». Nous
  exportons donc le graphe sans pliage des constantes, et chaque poids pointe
  vers le tenseur identique du fichier de l'auteur : les 221 tenseurs de
  Tsumugi sont retrouvés, octet pour octet. Le graphe seul pèse 1,36 Mo
  (architecture et noyaux du CQT calculés par le code, aucun poids).
  L'app téléchargerait le fichier de l'auteur depuis Hugging Face (source et
  licence affichées, empreinte vérifiée) et le donnerait à onnxruntime-web
  (`externalData`). Vérifié dans onnxruntime-web (WASM) : sortie identique au
  fichier ONNX complet (écart 0). La même idée vaut pour les fichiers
  PyTorch récents (archives zip non compressées, comme les poids de
  ChordMini BTC « CL ») ; pour Jiang 2019 (ancien format PyTorch, et poids
  du LSTM réordonnés par l'export) c'est possible mais demande plus de
  travail.

## Ce que demanderait Tsumugi dans l'app

- **Fichiers** : le graphe (1,36 Mo, produit par `convert_tsumugi.py
  --no-fold` puis `external_weights.py`) livré avec l'app ou téléchargé, et
  les poids originaux de l'auteur (67,6 Mo) téléchargés à la demande.
  **Décision du propriétaire** : livrer ce graphe avec l'app (c'est notre
  travail, il ne contient aucun poids), ou le publier ailleurs.
- **Entrées, côté JS** : le son rééchantillonné à 25,6 kHz en stéréo (un
  morceau mono est dupliqué sur les deux voies, comme le fait l'auteur), en
  fenêtres de 30 s (768 000 échantillons) dont on garde les 20 s du milieu
  (la dernière fenêtre est calée sur la fin) ; pour chaque fenêtre, 11
  descripteurs de temps et 25 de tonalité à 25 images/s, calculés depuis nos
  temps, premiers temps et tonalité (fonctions `beat_features` et
  `key_features` de l'auteur, une soixantaine de lignes à porter).
- **Sorties** : 745 probabilités d'accords (fondamentale × 62 qualités), la
  basse, les notes de l'accord et les changements d'accord, à 25 images/s.
  Pour le décodage, deux voies : (a) ramener aux 169 accords de l'app et
  garder notre décodeur par temps et notre a priori jazz, en proposant les
  extensions et la basse comme suggestions ; (b) porter le décodeur
  semi-markovien de l'auteur (code MIT, ~700 lignes, avec ses tables : 2 Ko
  et 0,9 Mo, sous la licence des poids), qui gère déjà basse, extensions et
  reprises. À comparer sur le banc.
- **Coût** : 1,55 à 2,6 fois la durée du morceau sur le processeur de cette
  machine (4 cœurs) ; plutôt de l'ordre de la durée du morceau sur un Mac à
  puce Apple (à mesurer). La carte graphique (WebGPU) n'est pas essayée.
  Mémoire : ~2 Go au pic pour une fenêtre de 30 s en natif. **Trop lourd pour
  un téléphone en l'état** : sur iPhone, garder CREMA, ou essayer des
  fenêtres plus courtes (à mesurer, le modèle a appris sur 30 s).

## Risques et questions ouvertes

- Un seul morceau, synthétique : rien n'est encore prouvé. Le banc tranchera,
  surtout sur le son « vieux disque » (mono, bande étroite, bruit).
- Tsumugi a appris sur de la J-pop ; le jazz ancien est loin de ses
  exemples. Ses indices stéréo valent zéro sur un disque mono.
- Il a appris avec les temps et la tonalité d'un autre analyseur
  (SheetSage2-Refined) ; avec les nôtres, il peut perdre un peu. Une erreur
  de temps (tempo moitié, métrique) se propage aux accords.
- Licences : Tsumugi non commercial (accepté) ; BTC et ChordMini « MIT »
  annoncés sur des données non libres (flou) ; Jiang MIT. À afficher dans
  l'app, comme pour la séparation.
- Le graphe exporté dépend de la version de PyTorch : son empreinte change
  si on le refait. Il faudra figer l'outil et l'empreinte au moment de le
  livrer.
- BTC et ChordMini demandent un CQT identique à celui de librosa côté JS
  (ChordMini avertit : un CQT légèrement différent coûte ~1 % d'images).
  Jiang demande le « hybrid CQT » de librosa, plus délicat.

## Ce qui reste à mesurer sur le banc

1. Chaque candidat seul, sur les versions propres et « vieux disque », avec
   nos temps et notre tonalité, et après le décodage de l'app (par temps,
   avec l'a priori jazz).
2. Tsumugi avec son propre décodeur contre Tsumugi ramené à notre décodeur.
3. Les mélanges (CREMA + Tsumugi, CREMA + Jiang, CREMA + BTC) avec des poids
   appris, et leur gain réel.
4. La justesse de la basse (renversements) et des extensions, que seuls
   Tsumugi et Jiang donnent.
5. Le coût réel dans Chrome et Safari sur les Mac du propriétaire
   (processeur et carte graphique), et la mémoire.
6. Tsumugi avec des fenêtres plus courtes (pour la mémoire), et en float16
   stocké sur du vrai son.
