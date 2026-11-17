# Reconnaissance des instruments à vent (étape 5, « Harmonie »)

Quand un solo est joué par un vent, la séparation le range avec les autres
dans la piste « Autres » : aucun modèle de séparation n'a de piste « vents ».
Un petit modèle dit lequel mène dans un extrait de cette piste : trompette,
trombone, saxophone, clarinette ou flûte. **Dans le doute, l'app écrit
« Solo (Vents) »** : un nom d'instrument faux est l'erreur qui coûte.

Ce dossier est le banc qui a servi à choisir le modèle et le seuil. Le code de
l'app est dans `app/src/structure/instruments/`.

## Le choix : CED-Tiny

| | |
|---|---|
| Modèle | CED-Tiny (Dinkel et al., « CED: Consistent ensemble distillation for audio tagging », 2023), petit transformeur entraîné sur AudioSet |
| Fichier | `model.onnx` du dépôt des auteurs, https://huggingface.co/mispeech/ced-tiny, révision `ace276d29dd0bb3f3517b0fa8cf300738c409019` |
| Taille | 6 681 767 octets (poids en 8 bits ; l'extraction des bandes de fréquence est dans le graphe) |
| SHA-256 | `3890f227660be71886ff48633d11a731993e0206db8a486781412c28a0873435` |
| Licence | Apache-2.0, code (https://github.com/RicherMans/CED) et poids |
| Entrée, sortie | échantillons mono à 16 kHz `[1, n]` ; 527 scores AudioSet (sigmoïdes) |
| Hôte | Hugging Face (déjà autorisé par l'app Mac, `desktop/src/protocol.js`) |

Le fichier public se charge tel quel dans onnxruntime-web : **rien à publier
par le propriétaire.**

L'app regroupe les classes AudioSet qui l'intéressent (`model.ts`, et
`models.py#GROUPS` ici) : Trumpet, Trombone, Saxophone, Clarinet, Flute ; les
familles « Brass instrument » et « Wind instrument » ; et, pour ne pas nommer
un vent là où joue autre chose : piano, guitare, vibraphone, violon (cordes
frottées), orgue, voix.

### Les candidats

| Candidat | Taille | Licence | Pourquoi |
|---|---|---|---|
| **CED-Tiny** (`mispeech/ced-tiny`, ONNX des auteurs) | 6,7 Mo | Apache-2.0 | **retenu** : le meilleur sur les vrais enregistrements, petit, fichier public utilisable tel quel |
| YAMNet (`audiojs/yamnet`, ONNX en float16) | 7,5 Mo | Apache-2.0 (Google) | mesuré, battu : nomme moitié moins de vents justes, se trompe davantage sous le vieux disque (ci-dessous) ; demande en plus le calcul des bandes en TypeScript |
| EfficientAT mn10 (`Chris-Kode/efficientat-mn10-as-onnx`) | 20,2 Mo | MIT | trois fois trop gros pour « quelques mégaoctets » ; non mesuré |
| EfficientAT mn04 (`Sky-Kim/com.sky.sentis.efficientat-mn04`) | 8,4 Mo | MIT | format Unity Sentis, illisible par onnxruntime-web |
| EfficientAT mn04/mn05 d'origine | 4 à 5 Mo | MIT | seulement en PyTorch, sur GitHub : il faudrait convertir et publier un fichier (bloquant) |
| PANNs Cnn6, MobileNetV2 (`nicofarr/panns_*`, safetensors) | 21 à 24 Mo | code MIT, poids CC BY 4.0 à l'origine | trop gros ; LeeNet11 (3 Mo) est trop faible sur AudioSet |
| CED-Tiny en int8 de sherpa-onnx (`k2-fsa/...ced-tiny...`) | 6,1 Mo | non indiquée sur le dépôt | doublon de celui des auteurs, licence moins claire |
| AST, PaSST, CLAP, classifieurs wav2vec2 ou ViT d'instruments | 66 à 380 Mo | divers | bien trop gros (et « pas de gros modèle généraliste ») |
| Modèles Essentia d'instruments | — | CC BY-NC-SA | licence exclue |
| Entraîner une petite tête nous-mêmes | quelques ko | — | écarté : aucune donnée libre de solos de vents réels joignable d'ici (Medley-solos-DB, CC BY, est sur Zenodo ; NSynth, CC BY, ne donne que la famille ; IRMAS et URMP ne sont pas libres d'usage) |

## Les mesures

Trois jeux, aucun son dans le dépôt (tout est téléchargé ou fabriqué par les
scripts) :

1. **Solos synthétiques** (`synth.py`) : une ligne improvisée (croches
   swing, silences, notes tenues) de 10 s par instrument et par graine, six
   graines, rendue par FluidSynth avec la banque libre GeneralUser GS 2.0.3
   (celle du banc des accords) : trompette ouverte et bouchée, trombone,
   saxophones soprano, alto, ténor, baryton, clarinette, flûte ; et piano,
   guitare jazz, vibraphone, violon, orgue, voix (« oohs »). L'accompagnement
   (piano, contrebasse, cymbale) est rendu à part et mélangé à −18, −12 et
   −6 dB sous le soliste pour imiter ce qui reste dans « Autres » ; chaque
   mélange existe aussi en **vieux disque** (la chaîne du banc des accords :
   bande étroite, pleurage, souffle, craquements, saturation).
2. **URMP** (`real.py`, `Eredis02/URMP` sur Hugging Face, révision
   `58177a0f…`) : les pistes séparées de vrais musiciens enregistrés à part
   (Université de Rochester ; licence non indiquée sur le dépôt, jeu diffusé
   pour la recherche). 22 trompettes, 8 trombones, 11 saxophones,
   10 clarinettes, 18 flûtes, 12 violons ; les deux passages de 10 s les plus
   forts de chaque piste ; seuls, avec l'accompagnement synthétique à −12 dB,
   propres et en vieux disque. C'est la condition la plus proche d'une piste
   « Autres » réelle.
3. **IRMAS**, partie test (`Hibou-Foundation/irmas_ds_1`, révision
   `3ce50b83…` ; licence non commerciale, utilisé seulement pour mesurer) :
   241 extraits de disques du commerce, tous les instruments entendus notés.
   Ce sont des **mélanges complets**, plus durs qu'une piste séparée : ils
   montrent surtout si un vent est nommé là où il n'y en a pas.

Le seuil retenu (`decide.ts#DECISION`, `analyse.py#RULE`) : le groupe le plus
fort est nommé si **son avance sur le deuxième** (1 − deuxième / premier)
atteint **0,7** et si son score atteint 0,3 ; sinon c'est « Vents » quand le
premier est un vent. Piano, guitare et voix concourent mais ne sont jamais
nommés ici (ils ont leur propre piste séparée, et sous le vieux disque la
guitare et la voix sont lues comme du piano) ; vibraphone, violon et orgue
peuvent l'être avec une avance de 0,75.

### Ce que donne CED-Tiny avec ce seuil

« Faux » : part des réponses nommées dont le nom est faux (vents et autres).
« Justes » : part des extraits de vents dont l'instrument est nommé juste.

| Jeu, condition | Justes (vents) | « Vents » | Faux parmi les nommés |
|---|---|---|---|
| URMP propre | 79 % | 19 % | 0,7 % |
| URMP + accompagnement −12 dB | 70 % | 26 % | 4,0 % |
| URMP vieux disque | 76 % | 20 % | 3,9 % |
| URMP vieux disque + accompagnement −12 dB | 63 % | 35 % | 3,0 % |
| Synthétique propre (sans accompagnement) | 57 % | 39 % | 6,8 % |
| Synthétique + accompagnement −12 dB | 70 % | 22 % | 7,5 % |
| Synthétique + accompagnement −6 dB | 69 % | 24 % | 8,3 % |
| Synthétique vieux disque | 44 % | 46 % | 7,9 % |
| Synthétique vieux disque −18 dB | 37 % | 54 % | 12,5 % |
| Synthétique vieux disque −12 dB | 28 % | 65 % | 8,0 % |
| Synthétique vieux disque −6 dB | 17 % | 78 % | 6,2 % |
| IRMAS (mélanges) | 22 vents justes sur 43 extraits avec un vent, 12 « Vents » | — | **0 faux** sur 27 nommés ; aucun vent ni « Vents » sur les 198 extraits sans vent |

L'objectif (au plus 10 % de faux parmi les nommés dans la condition réaliste
la plus dure) est tenu sur les vrais musiciens (URMP en vieux disque : 3 à
4 %) et presque partout sur le synthétique ; il ne l'est pas sur un cas
synthétique (vieux disque −18 dB : 12,5 %, 4 erreurs sur 32).

**Toutes** les erreurs de nom du jeu synthétique, toutes conditions
confondues, sont : trompette **bouchée** lue saxophone (20), saxophone ténor
lu clarinette (3), voix « oohs » lue flûte (2). Sur URMP : saxophone lu
trompette (3 en vieux disque), trompette lue trombone (1), saxophone lu
flûte (1), flûte lue trompette (1).

Matrice de confusion, URMP en vieux disque (lignes : vérité ; colonnes :
réponse ; « rien » : pas de réponse) :

```
          tpt  tbn  sax  cla  flu  vln VENTS rien
trompette  39    1    .    .    .    .    4    .
trombone    .   13    .    .    .    .    3    .
saxophone   3    .    4    .    1    .   13    1
clarinette  .    .    .   15    .    .    5    .
flûte       .    .    .    .   34    .    2    .
violon      .    .    .    .    .   18    4    2
```

Matrice, synthétique avec accompagnement à −12 dB :

```
          tpt  tbn  sax  cla  flu  vib  vln VENTS rien
trompette   5    .    4    .    .    .    .    3    .   (les 4 « sax » : trompette bouchée)
trombone    .    2    .    .    .    .    .    4    .
saxophone   .    .   19    .    .    .    .    5    .
clarinette  .    .    .    6    .    .    .    .    .
flûte       .    .    .    .    6    .    .    .    .
piano       .    .    .    .    .    .    .    .    6
guitare     .    .    .    .    .    .    .    .    6
vibraphone  .    .    .    .    .    5    .    .    1
violon      .    .    .    .    .    .    6    .    .
orgue       .    .    .    .    .    .    .    .    6
voix        .    .    .    .    .    .    .    4    2
```

### La courbe du seuil

Vents nommés justes / faux parmi les nommés (%), selon l'avance demandée
(avec piano, guitare et voix jamais nommés) :

| Seuil | URMP propre | URMP vieux | URMP vieux −12 dB | Synth. −12 dB | Synth. vieux | Synth. vieux −12 dB | Synth. vieux −6 dB |
|---|---|---|---|---|---|---|---|
| 0,30 | 86 / 5 | 83 / 5 | 81 / 5 | 76 / 13 | 56 / 31 | 48 / 32 | 41 / 36 |
| 0,50 | 84 / 3 | 80 / 4 | 77 / 4 | 76 / 9 | 56 / 23 | 39 / 22 | 33 / 23 |
| 0,60 | 83 / 3 | 78 / 4 | 74 / 3 | 74 / 7 | 52 / 17 | 35 / 13 | 24 / 10 |
| **0,70** | **79 / 1** | **76 / 4** | **63 / 3** | **70 / 8** | **44 / 8** | **28 / 8** | **17 / 6** |
| 0,80 | 69 / 0 | 70 / 2 | 36 / 0 | 63 / 8 | 33 / 7 | 15 / 6 | 2 / 0 |
| 0,90 | 57 / 0 | 51 / 0 | 4 / 0 | 41 / 3 | 19 / 11 | 4 / 0 | 2 / 0 |

0,7 est le premier seuil où le vieux disque synthétique passe sous 10 % de
faux ; au-delà, l'app ne nomme presque plus rien dès qu'il y a de
l'accompagnement.

### YAMNet, avec la même règle

| Condition | Justes (vents) | Faux parmi les nommés |
|---|---|---|
| URMP propre | 73 % | 0 % |
| URMP + accompagnement −12 dB | 40 % | 0 % |
| URMP vieux disque | 59 % | 9,0 % (et 75 % des violons dits « Vents ») |
| Synthétique vieux disque | 30 % | 24 % |
| IRMAS | 7 vents justes sur 43 | 0 faux |

### Vitesse et mémoire

- **onnxruntime-web 1.31.1, WebAssembly, un fil, dans Node sur cette
  machine** (4 cœurs partagés) : ouverture du modèle 0,45 s ; **240 à 290 ms
  par fenêtre de 10 s** ; le processus entier occupe environ 230 Mo. D'où un
  travailleur (worker) à part : un solo de 2 minutes, lu sur au plus
  12 fenêtres, coûte environ 3 s sans gêner l'interface.
- onnxruntime natif (Python, 2 fils) : 0,05 à 0,09 s par 10 s (YAMNet
  0,04 s).

## Limites

- **Trompette bouchée** (sourdine harmon, à la Miles Davis) : souvent lue
  saxophone sur le synthétique. Seul défaut systématique trouvé ; à
  surveiller sur de vrais disques.
- **Saxophone** : le plus souvent « Vents » sur les saxophones classiques
  d'URMP (son proche de la clarinette) ; mieux reconnu sur les saxophones
  jazz synthétiques (19 sur 24 avec accompagnement).
- Plus le disque est vieux et l'accompagnement fort, plus la réponse est
  « Vents » : c'est voulu.
- Les jeux réels n'ont pas de vieux disques de jazz authentiques (années
  1930 à 1950) : leur son est imité par la chaîne « vieux disque ». Le
  propriétaire jugera sur ses morceaux.
- Le modèle n'a pas de classe « cornet », « bugle » ni « cor » à part : un
  cornet sera « trompette » ou « Vents ».

## Refaire les mesures

Il faut Python 3.11 ou plus, `ffmpeg`, `fluidsynth`, et environ 2,5 Go de
place (URMP 1,2 Go, IRMAS 0,7 Go, rendus 0,1 Go).

```
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python synth.py data                  # solos synthétiques (FluidSynth)
.venv/bin/python bench.py data --set synth      # scores des deux modèles
.venv/bin/python bench.py data --set urmp       # télécharge URMP (pistes séparées)
.venv/bin/python bench.py data --set irmas      # télécharge IRMAS (test)
.venv/bin/python analyse.py data --set urmp --model ced-tiny --conf --curve
.venv/bin/python analyse.py data --set irmas --model ced-tiny
.venv/bin/python reference.py data              # valeurs de référence des tests de l'app
```

`data/` n'est jamais versé au dépôt. `reference.py` écrit
`app/src/structure/instruments/fixtures/` : les scores du modèle sur des
signaux de test (que les tests de l'app refabriquent) et 150 décisions du
banc, que `decide.ts` doit reproduire à l'identique.
