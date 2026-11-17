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
- **Numéros des solos** : la vérité numérote tous les solos (Solo 1, Solo
  2…) ; l'app suit la décision du propriétaire (« Solo (Piano) », « Solo
  (Trompette) » sans numéro quand chaque soliste est nommé et ne revient
  pas ; des numéros sinon). La mesure « Numéro juste » compte donc ces
  solos nommés en faute à partir du deuxième : elle n'est pas à lire
  comme une erreur de l'app.

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
```

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

## Chiffres actuels (structure et grille simplifiée de l'étape 5)

Les tableaux complets : `resultats/symbolique.md` (Tier S, tout le corpus,
deux tirages par niveau) et `resultats/rendu.md` (Tier R). Les modulations
(`detectKeyChanges`) ne sont pas encore écrites : leurs lignes restent à 0
(aucune fausse modulation, aucune trouvée). Les chiffres tenus par `npm
test` sont dans `app/src/structure/bench/thresholds.ts`.

Tier S, corpus entier (« pistes » = séparation idéale ; « grille » = la
grille connue du standard trouvée par le titre) :

| Mesure | parfait | realiste | realiste + grille | mauvais | mauvais + grille |
|---|---:|---:|---:|---:|---:|
| Longueur du chorus exacte | 96,6 % | 81,0 % | 96,6 % | 32,8 % | 93,1 % |
| Forme (AABA…) exacte | 96,6 % | 79,3 % | 100 % | 41,4 % | 100 % |
| Lettres (paires de mesures) | 93,5 % | 82,0 % | 89,4 % | 54,5 % | 83,0 % |
| Mode Jazz / Pop | 100 % | 100 % | 100 % | 98,6 % | 98,6 % |
| Limites de parties (F), pistes | 95,9 % | 83,7 % | 87,2 % | 63,2 % | 77,4 % |
| Limites de parties (F), sans séparation | 86,4 % | 70,6 % | 79,2 % | 49,8 % | 67,3 % |
| Type de partie, pistes | 97,9 % | 82,4 % | 83,2 % | 66,8 % | 72,3 % |
| Solos voisins séparés, pistes | 95,6 % | 76,7 % | 78,9 % | 64,4 % | 71,1 % |
| Solos voisins séparés, sans séparation | 55,6 % | 24,4 % | 28,9 % | 6,7 % | 13,3 % |
| Long solo non coupé, pistes | 100 % | 91,7 % | 97,2 % | 72,2 % | 83,3 % |
| Instrument juste (piano, guitare, basse, batterie, voix) | 96,1 % | 91,6 % | 90,3 % | 65,6 % | 66,2 % |
| Instrument nommé faux | 0,9 % | 4,8 % | 5,1 % | 12,0 % | 12,0 % |
| Instrument nommé sans séparation | 0 % | 0 % | 0 % | 0 % | 0 % |
| Grille simplifiée, structure vraie : accords | 96,6 % | 78,4 % | 81,5 % | 56,9 % | 61,5 % |
| Grille simplifiée, structure vraie : mesure jouée → écrite | 100 % | 98,3 % | 98,3 % | 78,0 % | 78,0 % |
| Grille simplifiée, chaîne complète : accords | 85,5 % | 51,1 % | 70,3 % | 17,7 % | 55,2 % |
| *Autumn Leaves* (grille écrite / chaîne complète) | passe / passe | échoue | échoue | échoue | échoue |

Tier R (l'analyse réelle de l'app sur les rendus ; pistes = rendus
séparés, séparation parfaite) :

| Mesure | propre | propre + grille | vieux disque | vieux disque + grille |
|---|---:|---:|---:|---:|
| Longueur du chorus exacte | 82,8 % | 93,1 % | 75,0 % | 75,0 % |
| Forme exacte | 79,3 % | 93,1 % | 62,5 % | 75,0 % |
| Limites de parties (F), pistes | 88,0 % | 86,3 % | 71,5 % | 72,1 % |
| Limites de parties (F), sans séparation | 72,9 % | 77,1 % | 54,5 % | 65,8 % |
| Type de partie, pistes | 93,1 % | 87,2 % | 80,0 % | 82,0 % |
| Solos voisins séparés, pistes | 77,8 % | 75,6 % | 81,8 % | 81,8 % |
| Long solo non coupé, pistes | 61,1 % | 61,1 % | 50,0 % | 50,0 % |
| Instrument juste, pistes | 84,4 % | 83,1 % | 95,0 % | 95,0 % |
| Instrument nommé faux | 6,6 % | 6,0 % | 4,8 % | 4,8 % |
| Grille simplifiée (structure vraie) : accords | 77,5 % | 81,1 % | 62,7 % | 65,1 % |
| Grille simplifiée (chaîne complète) : accords | 59,6 % | 59,5 % | 37,9 % | 46,9 % |

*Autumn Leaves* : la grille écrite et la chaîne complète passent sur la
grille vraie (Tier S « parfait », avec ou sans grille connue, avec ou sans
séparation). Sur les rendus « propres » avec les pistes, la **structure**
est juste (forme AABC, parties à leur place) mais la **grille écrite
échoue** sur une dizaine d'accords : l'analyse des accords de l'app lit
D△ comme D7, se trompe sur C♯m7♭5 et Em7, et sur « Bm B♭7 » dans la
section C, de la même façon à chaque reprise. Le consensus ne peut pas
corriger une erreur répétée, et la grille connue ne pèse qu'une
demi-reprise. Sur le « vieux disque » sans grille connue, la forme est
lue AABA au lieu de AABC.

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
