# Banc de mesure de la structure (étape 5, « Harmonie »)

L'étape 5 de la 1.0.0 ajoute trois choses à l'analyse (cahier, C10 et C14) :
les **modulations** (changements de tonalité qui durent), la **structure**
du morceau (longueur du chorus, lettres des sections et forme AABA…, intro
et outro, parties Thème / Solo numérotées, changement de soliste, instrument
du soliste, mode Jazz ou Pop) et la **« Grille complète simplifiée »**
(accord de consensus par mesure entre les reprises, familles d'accords
seulement, `%`, `[ … ]x2`, et la correspondance entre mesures jouées et
mesures écrites).

Avant d'écrire les détecteurs, il faut pouvoir **mesurer**. Ce banc fait
tourner les trois points d'entrée de l'app (`app/src/structure/index.ts` :
`detectKeyChanges`, `detectStructure`, `simplifyChart`) sur des morceaux
dont on connaît toutes les réponses, et compte ce qui est juste. Il ne
contient aucun détecteur : il note ceux de l'app (voir « Chiffres
actuels » : la structure et la grille simplifiée sont écrites, les
modulations pas encore).

Ce n'est pas une page du site : c'est un outil de travail en ligne de
commande, sur le modèle du banc des accords (`web/spikes/accords/`), dont il
réutilise le code sans le recopier (grilles, arrangeur, rendu FluidSynth,
vieux disque, réseaux de l'app dans Node).

## Le corpus (35 morceaux, notre propre travail)

Les grilles sont écrites pour le banc, sous forme de textes d'accords
(`corpus/pieces.py`). Certaines suivent l'harmonie courante de standards
connus et portent leur titre (*Autumn Leaves*, *I Got Rhythm*, *Satin Doll*,
*The Girl from Ipanema*, *Blue Bossa*, *So What*) : c'est notre lecture de
l'usage courant, pas une copie d'un recueil ; plusieurs viennent directement
des grilles du banc des accords. Aucun son du commerce, aucun recueil dans
le dépôt.

- **Formes** : AABA 32 (rhythm changes, Satin Doll, plusieurs grilles à
  nous, Ipanema avec son pont de 16 mesures), ABAC 32, AABC (*Autumn Leaves*,
  exactement l'exemple du cahier, et une autre en sol mineur), blues 12
  (majeur, mineur, chanté, à trois temps), 16 mesures, AAB (jazz
  traditionnel), une pièce d'un seul tenant (ABCD jouée une fois, rien à
  replier), avec ou sans intro, outro, tag (les dernières mesures reprises
  deux ou trois fois) ; 3/4 et 4/4.
- **Parties** : thème puis solos d'instruments DIFFÉRENTS (piano, guitare,
  contrebasse, batterie, trompette, ténor, alto, trombone, clarinette,
  flûte, vibraphone, voix), puis thème ; un long solo d'un seul instrument
  sur deux ou trois chorus (qui doit rester UN solo) ; des solos d'un
  demi-chorus (AA puis BA, par deux instruments) ; un thème chanté ou joué
  par un cuivre ; des échanges de quatre mesures (batterie / alto) ; un
  solo de basse (orchestre plus doux) et un solo de batterie (batterie
  seule).
- **Variations d'une reprise à l'autre** : extensions (G7, G13, G7♯5…),
  substitutions tritoniques, II ajouté devant une dominante, maj7 ↔ 6, et de
  temps en temps un accord qui change de famille (I → III, II → II7). La
  vérité suit ce qui est joué ; la grille simplifiée attendue est la grille
  écrite, en familles.
- **Modulations qui comptent** : pont dans un autre ton pendant 8 mesures
  (ballade façon « Body and Soul », pont en mi dans un morceau en do, *So
  What* en ré mineur / mi bémol mineur), dernier chorus un demi-ton plus
  haut, refrain pop qui monte d'un ton (« truck driver »).
- **Ce qui ne doit PAS compter** : va-et-vient avec le relatif mineur, un
  morceau plein de II-V de passage, une chaîne de II-V (quatre mesures par
  tonalité), un thème mineur avec un passage majeur de quatre mesures
  (*Blue Bossa*, et une grille à nous), le pont d'Ipanema (deux mesures par
  tonalité).
- **Pop** (5 morceaux) : intro, couplet, refrain, couplet, refrain, pont,
  solo de guitare, refrain, outro ; accords parfaits, phrases de 8 mesures,
  batterie droite, basse en croches.
- Tempos de 72 à 208 à la noire, tempo qui flotte légèrement.

La vérité de chaque morceau est dans `verites/<id>.json` (une ligne par
mesure) : temps de chaque mesure, accords joués, chorus, lettre de section,
partie, tonalité, qui mène et à quel niveau chaque piste sonne ; les parties
(type, numéro, instrument, mesures, lettres), les modulations (mesure,
tonalité), le mode, la grille simplifiée attendue (sections, mesures écrites
en familles, `%`, `times`, et pour chaque mesure jouée sa place dans la
grille écrite), la grille « connue » d'un chorus (comme un recueil la
donnerait) et les instruments de chaque piste. Les mêmes vérités, sans les
temps de chaque battue, sont dans `app/src/structure/bench/fixtures/corpus.json`
pour les tests de l'app.

```sh
python3 corpus/build.py            # réécrit verites/ et la copie pour l'app (déterministe)
python3 corpus/build.py --check    # vérifie que les fichiers gardés sont à jour
```

### Ce qui est idéalisé (à dire franchement)

- **Les pistes séparées sont des rendus parfaits** : chaque instrument est
  rendu à part, il n'y a aucune vraie séparation (ni fuite d'un instrument
  dans l'autre, sauf celle que le Tier S simule). Les chiffres « avec
  pistes » sont donc un plafond : la vraie séparation fera moins bien.
- **La reconnaissance des vents est simulée** (un tirage : bon instrument,
  « Vents » ou faux, avec des taux fixés), dans les deux tiers. Le petit
  modèle de l'agent C n'existe pas encore ; quand il existera, il faudra le
  faire tourner sur la piste « Autres » des rendus.
- **Le son est celui d'une banque General MIDI** (FluidSynth, *GeneralUser
  GS*) : propre, sans vrai jeu d'ensemble. Les mélodies et solos sont
  générés note à note (le thème est la même mélodie à chaque reprise d'une
  section, un solo ne se répète pas), ce qui rend « thème ou solo » plus
  facile qu'en vrai.
- **Les erreurs d'analyse du Tier S sont un modèle grossier** (voir
  `app/src/structure/bench/noise.ts`), pas une mesure des erreurs de l'app ;
  le Tier R, lui, prend la vraie analyse de l'app sur les rendus.
- Les grilles connues sont celles du corpus lui-même (la grille d'un chorus
  telle qu'écrite), trouvées « par le titre » sans erreur de titre.
- **Deux défauts des rendus**, trouvés en écrivant la structure (pas
  corrigés : il faudrait tout rendre et analyser de nouveau) :
  - le thème de la fin n'est **pas la même mélodie** que celui du début :
    l'arrangeur du banc des accords (`../accords/corpus/arrange.py`,
    `head`) tire un nouvel air à chaque appel, et le thème 2 est un autre
    appel que le thème 1 (dans un même thème, les reprises d'une section
    ne se ressemblent que si leurs accords sont les mêmes). La structure
    ne demande donc pas au thème de la fin de ressembler mélodiquement à
    celui du début ;
  - les **solos de contrebasse** sont muets dans les rendus (toutes les
    pistes à zéro sur ces mesures, par exemple `blues-solistes`, mesures
    72 à 84) : on ne peut pas les trouver dans le Tier R.
- **Numéros des solos** (corrigé dans le barème) : la vérité numérote tous
  les solos (Solo 1, Solo 2…), alors que l'app suit la décision du
  propriétaire (« Solo (Piano) », « Solo (Trompette) » sans numéro quand
  chaque soliste est nommé et ne revient pas). Le barème
  (`app/src/structure/bench/score.ts`) accepte désormais un numéro vide pour
  un soliste nommé qui ne joue qu'un solo dans le morceau.
- **Les reprises réharmonisées** (substitutions tritoniques, ii ajouté,
  maj7 ↔ 6…) gardent toujours, par construction, le livre comme consensus
  (`corpus/build.py`, `vary`) : le corpus ne contient aucun enregistrement
  qui s'écarte durablement du livre. Le prix de la grille connue dans ce cas
  est mesuré à part (voir « Jusqu'où cela tient »).

## Trois niveaux

### Tier S (symbolique, rapide, dans les tests de l'app)

Les détecteurs lisent un `HarmonyInput` construit à partir de la vérité, à
travers des **erreurs d'analyse simulées** :

| Niveau | Accords | Grille |
|---|---|---|
| `parfait` | la vérité | les vraies barres de mesure |
| `realiste` | ≈ 25 % faux ou manquants (la moitié des faux sont des confusions de famille, maj7 ↔ 7…, le reste relatif, quinte, triton, au hasard), quelques changements en trop, décalés d'un temps, extensions peu fiables, solos de batterie lus N.C. | une fois un temps perdu (toutes les barres suivantes décalées d'un temps), une barre manquée (deux mesures lues comme une) |
| `mauvais` | ≈ 45 % | deux décalages, trois barres manquées |

Chaque niveau se lit avec ou sans **indices audio** (`pistes` : niveau de
chaque piste séparée par mesure, timbre du mélange, reconnaissance des
vents ; `sans séparation` : le timbre seul ; `sans audio`) et avec ou sans
la **grille connue** du standard.

```sh
cd app
npx vitest run src/structure/bench.test.ts --silent=false            # sous-ensemble (16 morceaux), tableaux affichés, ~2 s
FABTICE_STRUCTURE_FULL=1 npx vitest run src/structure/bench.test.ts --silent=false   # tout le corpus, 2 tirages, écrit resultats/symbolique.md
```

Aucun seuil n'échoue tant que les détecteurs sont des souches : les seuils
sont dans `app/src/structure/bench/thresholds.ts` (vide), que les auteurs
des détecteurs relèvent au fur et à mesure. Le test vérifie aussi le banc
lui-même : un « oracle » qui lit les réponses dans la vérité
(`bench/oracle.ts`) doit avoir tout juste sur les cas sans erreur, exemple
*Autumn Leaves* compris.

### Tier R (rendus, analyse réelle de l'app)

Le corpus est rendu en audio, piste par piste et en mélange (FluidSynth,
comme le banc des accords), en version propre et, pour 9 morceaux, en
**vieux disque** (la chaîne du banc des accords). L'analyse de l'app tourne
dans Node sur le mélange (les réseaux de l'app, puis `resultFromOutputs`,
exactement comme le fait l'app : la variante `app` du banc des accords).
Les mesures sont construites à partir des temps détectés comme le fait la
grille (une barre tous les N temps depuis le premier temps détecté), chaque
accord dans la mesure où il commence ; les indices audio sont mesurés sur
les rendus **par le code de l'app** (`app/src/structure/evidence.ts` :
niveau de chaque piste par mesure, timbre du mélange en 8 bandes, mélodie
des pistes qui peuvent mener), la reconnaissance des vents est simulée.
Le tout est dans `banc/adapter.ts` (`barsFromAnalysis`, `measureEvidence`,
`harmonyInput`).

L'analyse de chaque morceau (temps, accords, tonalité, et les indices
mesurés par mesure) est gardée dans `analyses/<id>.<condition>.json`
(petits fichiers, tirés de nos propres rendus) : **on peut relancer le Tier
R sans rien rendre ni faire tourner les réseaux**.

```sh
cd web/spikes/structure
npm install
node banc/build.mjs                          # après toute modification du code
node dist/run.mjs                            # re-note depuis analyses/ : quelques secondes
node dist/run.mjs --only autumn-leaves --conditions disque --evidence stems --known false
node dist/run.mjs --measure                  # mesure de nouveau les indices sur les rendus (data/), garde l'analyse
node dist/run.mjs --fin                      # avec le modèle d'accords détaillé (analyses-fin/) : resultats/rendu-fin.md
```

**Modèle d'accords détaillé** (Tsumugi-Chords, celui des réglages avancés,
`banc/fin.ts`) : ce que fait le worker de l'app, dans Node (onnxruntime-web),
à partir des temps et de la tonalité de l'analyse standard. Ses analyses
sont dans `analyses-fin/` (16 rendus : *Autumn Leaves* propre et vieux
disque, et 13 autres morceaux courts, `blues-solistes` dans les deux
conditions). Les poids ne sont pas dans le dépôt (licence CC BY-NC 4.0) ;
pour en refaire : `FABTICE_TSUMUGI_WEIGHTS=<chemin de chord-model.safetensors>
node dist/run.mjs --fin --fin-analyse --only <morceaux>` (2,5 Go de mémoire,
environ 30 s par fenêtre de 30 s, soit le temps du morceau).

Pour tout refaire depuis le son (il faut Python 3.11 ou plus, `ffmpeg` et
`fluidsynth` ; ici `apt-get install fluidsynth`) :

```sh
python3 -m venv .venv && .venv/bin/pip install -r ../accords/requirements.txt
.venv/bin/python corpus/render_corpus.py --jobs 3     # ≈ 6 min, 2 Go dans data/corpus/
node banc/build.mjs && node dist/run.mjs --analyse    # les réseaux de l'app sur 147 min de son
```

Résultats : `resultats/rendu.md` (et `rendu.json`, les comptes bruts).

### Tier X (facultatif, local, pas fait)

Les vrais standards des recueils téléchargés par `../accords/recueils/`
(les sections viennent des grilles iReal), rendus de la même façon. Pas
écrit faute de temps : le Tier R couvre déjà les formes et les parties ; à
faire si les détecteurs ont besoin de plus de standards.

## Ce que veulent dire les chiffres

Toutes les réponses sont relues en secondes et ramenées aux barres de
mesure de la vérité : un cas dont la grille est fausse est noté sur ce que
la musique fait vraiment. « ±1 » veut dire à une mesure près.

| Mesure | Juste quand… |
|---|---|
| Longueur du chorus | l'écart le plus fréquent entre deux débuts de chorus (lus dans les lettres et la forme trouvées) est la bonne longueur (morceaux à forme jouée deux fois ou plus) |
| Limites de chorus, de sections, de parties | précision et rappel à une mesure près ; la mesure F des sections et des parties est moyennée par morceau |
| Lettres par paires | pour toutes les paires de mesures de la forme : « même lettre » dans la vérité et dans la réponse (mesure F) : insensible au nom des lettres |
| Forme exacte | la chaîne `form` (AABA) est la bonne |
| Intro, outro | le nombre de mesures des parties Intro (au début) et Outro (à la fin, tag compris) est exact (0 compris) |
| Type, numéro | la partie trouvée qui recouvre le plus chaque vraie partie a le bon type (thème, solo, intro, outro, couplet, refrain, pont), le bon numéro (vide lu comme 1) |
| Long solo non coupé | un solo d'un instrument sur deux chorus ou plus n'a aucune limite de partie à l'intérieur, et une partie en couvre 80 % |
| Solos voisins séparés | entre deux solos d'instruments différents, une limite à une mesure près |
| Instrument | avec pistes : piano, guitare, basse, batterie, voix exacts ; vents et vibraphone : exact, ou « Vents » (ni bon ni mauvais), ou **faux** (l'erreur qui coûte) ; sans séparation, toute partie nommée est comptée en faute |
| Modulations | une modulation trouvée à deux mesures près d'une vraie est juste ; précision, rappel, écart moyen, tonalité exacte ; et à part, **les fausses modulations sur les morceaux qui n'en ont pas** (le propriétaire préfère rien à une marque fausse) |
| Grille simplifiée (structure vraie) | `simplifyChart` reçoit la VRAIE structure (lettres, parties, modulations) placée sur les mesures du cas : accords écrits justes par temps au niveau de la famille (`%` déplié), nombre de sections (les deux conventions honnêtes sont acceptées : chaque lettre écrite une fois, AABA → A x2, B ; ou chaque suite de lettres, A x2, B, A), `times` exacts, et pour chaque mesure jouée la bonne section et la bonne mesure dans la section |
| Grille simplifiée (chaîne complète) | la même chose avec la structure détectée |
| *Autumn Leaves* | l'exemple du cahier : Intro `Bm` ; A `Em7 A7 Dmaj7 Gmaj7 / C#m7b5 F#7 Bm %` x2 ; B `C#m7b5 F#7 Bm % / Em7 A7 Dmaj7 Gmaj7` ; C `C#m7b5 F#7 | Bm Bb7 | Am7 G#7 / C#m7b5 F#7 Bm %` (deux accords dans les mesures 3 et 4 de C) ; et pour la chaîne complète la forme « Intro, Thème Chant (AABC), Solo Piano (AABC), Solo Trompette (AA), Thème Chant 2 (BC) » (sans séparation : sans nom d'instrument). Passe ou échoue, avec les raisons |

Remarque : les accords de l'exemple sont en si mineur / ré majeur (Em7 A7
Dmaj7 Gmaj7 C#m7b5 F#7 Bm) : c'est la tonalité du morceau du corpus.

## Pour les auteurs des détecteurs

```ts
import { buildCase, loadCorpus } from './bench/cases';           // un cas : HarmonyInput + vérité
import { runTierS, runInput, markdownReport } from './bench/run'; // faire tourner et noter
import { scoreStructure, scoreSimplified, METRICS } from './bench/score';

const rows = runTierS({ pieces: 'subset', levels: ['realiste'], evidence: ['stems'], known: [false] });
console.log(markdownReport(rows, 'essai'));
// des détecteurs candidats sans toucher index.ts :
runTierS({ detectors: { detectKeyChanges: mine, detectStructure, simplifyChart } });
```

- `buildCase(piece, { level, evidence, known, mode?, draw? })` →
  `{ input: HarmonyInput, piece, label }`.
- `runInput(piece, input, detectors?)` → réponses et comptes (c'est ce que
  le Tier R appelle avec ses propres entrées).
- `truthSimplifyInput(piece, input)` et `detectedSimplifyInput(input,
  structure, keyChanges, known)` : le `SimplifyInput` à partir de la vraie
  structure ou de la structure détectée (ce que fera `refresh.ts`).
- Seuils : `bench/thresholds.ts`.

## Ajouter un morceau

1. Écrire sa grille et son déroulé dans `corpus/pieces.py` (format expliqué
   en tête du fichier : sections, forme, plan des parties avec
   l'instrument qui mène, tonalité d'une section qui module, transposition
   `up` d'une partie, `subset`, conditions de rendu).
2. `python3 corpus/build.py` (vérités et copie pour l'app), puis
   `npx vitest run src/structure/bench.test.ts` dans `app/`.
3. Pour le Tier R : `.venv/bin/python corpus/render_corpus.py --only <id>`
   puis `node dist/run.mjs --only <id> --analyse` (écrit
   `analyses/<id>.<condition>.json`, à garder dans le dépôt).

## Chiffres actuels (structure, modulations et grille simplifiée de l'étape 5)

Les tableaux complets : `resultats/symbolique.md` (Tier S, tout le corpus,
deux tirages par niveau), `resultats/rendu.md` (Tier R) et
`resultats/rendu-fin.md` (Tier R avec le modèle d'accords détaillé). Les
chiffres tenus par `npm test` sont dans
`app/src/structure/bench/thresholds.ts` (deux blocs : les modulations,
mesurées sur le sous-ensemble ; la structure et la grille simplifiée, tenues
sur le sous-ensemble et sur tout le corpus).

Tier S, corpus entier (« pistes » = séparation idéale ; « + grille » = la
grille connue du standard trouvée par le titre) :

| Mesure | parfait | parfait + grille | realiste | realiste + grille | mauvais | mauvais + grille |
|---|---:|---:|---:|---:|---:|---:|
| Longueur du chorus exacte | 96,6 % | 100 % | 81,0 % | 96,6 % | 32,8 % | 93,1 % |
| Forme (AABA…) exacte | 96,6 % | 100 % | 79,3 % | 100 % | 41,4 % | 100 % |
| Lettres (paires de mesures) | 93,5 % | 95,2 % | 82,0 % | 89,6 % | 54,7 % | 83,2 % |
| Mode Jazz / Pop | 100 % | 100 % | 100 % | 100 % | 98,6 % | 98,6 % |
| Modulations : précision | 100 % | 100 % | 96,9 % | 97,6 % | 76,2 % | 80,0 % |
| Modulations : rappel | 100 % | 100 % | 64,6 % | 85,4 % | 33,3 % | 41,7 % |
| Limites de parties (F), pistes | 95,9 % | 96,6 % | 83,7 % | 87,2 % | 63,2 % | 77,3 % |
| Limites de parties (F), sans séparation | 86,4 % | 88,9 % | 70,7 % | 78,8 % | 49,9 % | 66,9 % |
| Type de partie, pistes | 97,9 % | 98,4 % | 82,4 % | 83,8 % | 66,8 % | 72,9 % |
| Numéro de partie, pistes | 94,4 % | 96,0 % | 69,9 % | 72,9 % | 54,0 % | 63,3 % |
| Long solo non coupé, pistes | 100 % | 100 % | 91,7 % | 97,2 % | 72,2 % | 83,3 % |
| Solos voisins séparés, pistes | 95,6 % | 95,6 % | 76,7 % | 78,9 % | 64,4 % | 71,1 % |
| Solos voisins séparés, sans séparation | 55,6 % | 55,6 % | 24,4 % | 28,9 % | 6,7 % | 13,3 % |
| Instrument juste (piano, guitare, basse, batterie, voix) | 96,1 % | 96,1 % | 91,6 % | 91,6 % | 65,6 % | 67,5 % |
| Instrument nommé faux | 0,9 % | 0,9 % | 4,8 % | 5,1 % | 12,0 % | 12,0 % |
| Instrument nommé sans séparation | 0 % | 0 % | 0 % | 0 % | 0 % | 0 % |
| Grille simplifiée, structure vraie : accords | 96,6 % | 99,4 % | 78,3 % | 87,7 % | 56,8 % | 73,3 % |
| Grille simplifiée, chaîne complète : accords | 88,9 % | 94,5 % | 51,9 % | 77,5 % | 17,9 % | 67,9 % |
| *Autumn Leaves* : grille écrite (structure vraie) | passe | passe | échoue | passe | échoue | échoue |
| *Autumn Leaves* : forme et grille (chaîne complète) | passe | passe | échoue | 1 tirage sur 2 | échoue | échoue |

Tier R, tous les rendus (35 propres, 9 vieux disques), modèle d'accords
standard, pistes séparées (rendus séparés, séparation parfaite) :

| Mesure | propre | propre + grille | vieux disque | vieux disque + grille |
|---|---:|---:|---:|---:|
| Longueur du chorus exacte | 82,8 % | 93,1 % | 75,0 % | 75,0 % |
| Forme exacte | 79,3 % | 93,1 % | 62,5 % | 75,0 % |
| Modulations : précision / rappel | 100 % / 58,3 % | 100 % / 66,7 % | – | – |
| Limites de parties (F), pistes | 88,0 % | 86,3 % | 71,5 % | 72,1 % |
| Limites de parties (F), sans séparation | 72,9 % | 76,7 % | 54,5 % | 65,8 % |
| Type de partie, pistes | 93,1 % | 87,8 % | 80,0 % | 82,0 % |
| Solos voisins séparés, pistes | 77,8 % | 75,6 % | 81,8 % | 81,8 % |
| Solos voisins séparés, sans séparation | 17,8 % | 22,2 % | 9,1 % | 27,3 % |
| Instrument juste, pistes | 84,4 % | 84,4 % | 95,0 % | 95,0 % |
| Instrument nommé faux | 6,6 % | 6,0 % | 4,8 % | 4,8 % |
| Grille simplifiée (structure vraie) : accords | 77,6 % | 93,4 % | 62,3 % | 78,1 % |
| Grille simplifiée (chaîne complète) : accords | 61,6 % | 70,5 % | 37,9 % | 57,9 % |
| *Autumn Leaves* : grille écrite / chaîne complète, pistes | échoue / échoue | **passe / passe** | échoue / échoue | **passe / passe** |
| *Autumn Leaves* : chaîne complète, sans séparation | échoue | échoue (le dernier thème lu « Solo ») | échoue | échoue (idem) |

Les deux modèles d'accords côte à côte, sur les 16 rendus que le modèle
détaillé a analysés (14 propres, 2 vieux disques ; pistes séparées) :

| Mesure | standard, propre | détaillé, propre | standard, vieux disque | détaillé, vieux disque |
|---|---:|---:|---:|---:|
| Accords de l'analyse justes (famille, par temps) | 62,8 % | **86,0 %** | 53,5 % | **81,0 %** |
| Longueur du chorus exacte (sans grille / + grille) | 66,7 % / 83,3 % | 75,0 % / 91,7 % | 100 % / 100 % | 100 % / 100 % |
| Forme exacte (sans grille / + grille) | 58,3 % / 83,3 % | 83,3 % / 91,7 % | 50 % / 100 % | 50 % / 100 % |
| Limites de parties (F), sans grille | 86,0 % | 88,7 % | 100 % | 100 % |
| Grille simplifiée, structure vraie (sans grille / + grille) | 72,6 % / 95,0 % | **92,9 % / 99,6 %** | 68,8 % / 98,8 % | 88,8 % / 100 % |
| Grille simplifiée, chaîne complète (sans grille / + grille) | 49,9 % / 67,4 % | 71,4 % / 63,5 % | 53,8 % / 98,8 % | 75,0 % / 100 % |
| *Autumn Leaves*, sans grille (erreurs relevées) | échoue (11) | échoue (5) | échoue (13) | échoue (8) |
| *Autumn Leaves*, + grille, pistes | passe | passe | passe | passe |

(Sur si peu de morceaux, un morceau fait plusieurs points. Une chose est à
regarder : avec le modèle détaillé, la chaîne complète des rendus propres
est plus basse avec la grille connue que sans, alors qu'elle monte avec le
modèle standard.)

Le banc lui-même est vérifié : l'oracle (`bench/oracle.ts`, réponses lues
dans la vérité) a 100 % partout sur les cas sans erreur du Tier S (test
automatique) et sur les vraies grilles détectées du Tier R
(`node dist/run.mjs --oracle`, qui écrit `resultats/rendu-oracle.md`, non
gardé).

Qualité de l'analyse réelle de l'app sur les rendus (Tier R, contexte des
chiffres) :

| Condition | Morceaux | Accords justes (famille, par temps) | Barres de mesure trouvées (±70 ms) |
|---|---:|---:|---:|
| propre | 35 | 67,7 % | 98,3 % |
| vieux disque | 9 | 53,5 % | 92,3 % |

Le niveau `realiste` du Tier S (≈ 70 % d'accords justes) est donc proche
de la condition propre, et `mauvais` (≈ 50 %) du vieux disque.

Temps : Tier S, sous-ensemble ≈ 2 s, corpus entier ≈ 4 s ; Tier R
re-noté depuis `analyses/` ≈ 1 s ; rendu ≈ 6 min (3 processus) ; analyse
de l'app sur tout le corpus ≈ 16 min (4 cœurs, sans carte graphique).

## Jusqu'où cela tient (bilan de l'étape 5)

Pour le propriétaire, brique par brique, ce que les chiffres ci-dessus
veulent dire. « Parfait », « réaliste », « mauvais » : les erreurs d'analyse
simulées du Tier S ; « propre » et « vieux disque » : la vraie analyse de
l'app sur nos rendus (Tier R).

- **Limites des choruses** (longueur et place). Sûres quand les accords sont
  bien lus (97 %), encore bonnes avec un accord sur quatre faux (81 %), mais
  plus du tout avec un sur deux (33 %) : la longueur du chorus se lit aux
  reprises de la grille, il faut qu'elles se ressemblent. La grille connue du
  standard, quand elle est dans les recueils, rattrape presque tout (93 à
  100 %). Sur les rendus : 83 % (propre), 75 % (vieux disque). Ce qui la
  trompe : deux sections presque pareilles (une valse ABAC lue en 16 mesures),
  une intro qui est la fin de la grille (blues), beaucoup de mesures perdues.
- **Lettres des sections** (AABA…). Mesure F par paires de mesures : 94 %,
  82 %, 55 % ; avec la grille connue 95 %, 90 %, 83 %. La forme exacte suit
  la longueur du chorus.
- **Thème ou solo.** Type de partie juste : 98 %, 82 %, 67 % (93 % sur les
  rendus propres). Le thème du début se reconnaît à sa mélodie qui revient à
  chaque A (piste séparée de la voix ou des vents) ; le thème de la fin à sa
  place et à son instrument (voir les défauts des rendus : sa mélodie n'y est
  pas celle du début). Sans séparation, la règle de position (un chorus de
  thème, deux pour un blues) fait l'essentiel.
- **Changement de soliste.** Avec les pistes séparées : 96 %, 77 %, 64 %
  (78 % sur les rendus). Sans séparation, seul le timbre du mélange peut le
  dire : 56 % au mieux, presque rien quand les accords sont mal lus. C'est la
  limite principale de l'app web sans séparation.
- **Instrument.** Jamais nommé sans séparation (0 % sur tous les cas, c'est
  une règle). Avec séparation : piano, guitare, basse, batterie, voix justes
  à 96 %, 92 %, 66 % (84 % sur les rendus), un instrument faux nommé dans
  1 %, 5 %, 12 % des parties (7 % sur les rendus). Les vents passent par le
  petit modèle de reconnaissance : sur le banc il est **simulé** (taux mesurés
  à part, `instruments/`) ; quand il hésite, l'app écrit « Solo (Vents) ».
  Deux vents l'un après l'autre se séparent par le modèle ou par un saut de
  niveau de la piste « Autres ».
- **Mode Jazz / Pop.** 100 %, 100 %, 99 % (100 % sur les rendus) : la part
  d'accords de septième suffit sur ce corpus ; un vrai morceau pop très
  jazzy, ou un jazz modal en triades, pourrait le tromper (le réglage
  « Mode » le corrige).
- **Modulations** (`keys.ts`, l'autre moitié de l'étape). Précision 100 %,
  97 %, 76 % ; rappel 100 %, 65 %, 33 % (86 % et 42 % avec la grille
  connue) ; aucune fausse modulation jusqu'au niveau réaliste. Rendus
  propres : précision 100 %, rappel 58 %.
- **Grille complète simplifiée.** Sur la structure vraie, accords écrits
  justes : 97 %, 78 %, 57 % ; avec la grille connue du standard **99 %, 88 %,
  73 %** (rendus propres : 78 % → **93 %** ; vieux disque : 62 % → 78 %).
  Avec le modèle d'accords détaillé, sans grille connue : 93 % (propre) et
  89 % (vieux disque) sur les 16 rendus qu'il a lus, contre 73 % et 69 %
  avec le modèle standard : le meilleur moyen de se passer du livre.
  La grille connue n'est utilisée que si elle colle au morceau (ressemblance
  nettement au-dessus du bruit de fond : 0,48 à 0,93 pour la bonne grille sur
  les rendus, 0,39 au plus pour une autre) et seulement là où la lecture est
  faible (voir `app/src/structure/simplify.ts`, étape 7). Son prix : quand
  l'enregistrement joue **toujours** un autre accord que le livre sur la même
  fondamentale (D7 au lieu de D△), la grille simplifiée écrit celui du livre
  tant qu'il n'est pas confirmé à la main une fois ; mesuré en changeant
  15 % des mesures du livre : 97 % → 82 % des accords justes (parfait), contre
  96 % sans livre. Une autre fondamentale jouée par plusieurs reprises est
  gardée (95,6 % contre 95,8 % sans livre). La grille mesure par mesure, elle,
  montre toujours ce qui a été entendu.
- **Autumn Leaves** (l'exemple du cahier, C14). Voir le tableau : passe sur
  la grille sans erreur dans toutes les configurations (chaîne complète
  comprise, sauf « sans audio »), sur les deux rendus avec la grille connue
  (pistes séparées : forme, parties et grille ; sans séparation, la grille
  passe mais la dernière partie est lue « Solo » au lieu de « Thème 2 »).
  Sans la grille connue, elle échoue sur les rendus à cause de l'analyse des
  accords, pas de la structure : la forme AABC et les cinq parties sont
  justes sur le rendu propre, mais l'analyse lit D7 pour D△, E7 pour Em7,
  F♯7 pour C♯m7♭5 et pour « Bm B♭7 », de la même façon à chaque reprise.
  Avec le modèle d'accords détaillé, il ne reste que 5 erreurs sur le rendu
  propre (Em7 lu E7, C♯m7♭5 lu C♯m7 et Em7, la mesure « Bm B♭7 » lue Bm
  seul) et 8 sur le vieux disque ; avec la grille connue, elle passe sur les
  deux rendus avec les deux modèles.

