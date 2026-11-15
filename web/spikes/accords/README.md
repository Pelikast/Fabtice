# Banc de mesure des accords

Le propriétaire a essayé l'app sur ses disques de jazz : la tonalité est bonne,
mais environ un accord sur deux est faux. Avant de changer quoi que ce soit à
l'analyse, il faut pouvoir **mesurer** : ce banc fait tourner l'analyse de
l'app sur des morceaux dont on connaît les accords, et compte ce qui est juste.

Ce n'est pas une page du site : c'est un outil de travail en ligne de
commande. Il fait tourner **le vrai code de l'app** (`app/src/analysis/engine/`,
les mêmes réseaux, à la même version, avec les mêmes réglages), hors du
navigateur, dans Node.

## Ce qu'il y a dedans

- **Des morceaux de synthèse** (25), écrits pour le banc : blues (majeur,
  mineur, « Parker », à trois temps, lent), anatole (rhythm changes), chaînes
  de II-V, vamp modal, bossas, ballades avec substitutions tritoniques et
  dominantes secondaires, valses, jazz traditionnel. Quelques-uns suivent
  l'harmonie de standards connus et portent leur vrai titre (*Autumn Leaves*,
  *Satin Doll*, *All the Things You Are*, *Blue Bossa*, *The Girl from
  Ipanema*, *So What*, *I Got Rhythm*) ou d'airs du domaine public (*When the
  Saints Go Marching In*, *St. Louis Blues*, *Sweet Georgia Brown*, *Bill
  Bailey*) : cela servira à essayer la recherche d'une grille connue par le
  titre. Les accords écrits sont notre propre lecture de l'usage courant,
  pas une copie d'un recueil.
  Chaque morceau dure de 1 à 2 min 30 et fait au moins deux grilles (sauf
  les plus longues formes, deux grilles exactement) : les reprises comptent.
  - Les parties sont générées note à note (`corpus/arrange.py`) : contrebasse
    qui marche (parfois sur la tierce ou la quinte au premier temps, notes
    d'approche chromatiques, pédale, renversements écrits), piano ou guitare
    en voicings sans fondamentale avec extensions, anticipations d'un
    demi-temps, batterie swing, bossa, balais, valse, shuffle ou « trad »,
    mélodie puis solo (ténor, alto, trompette, clarinette, flûte, vibraphone)
    avec tensions et notes de passage, parfois fort. Certains morceaux n'ont
    pas de piano : ce sont des cuivres harmonisés ou des voix (façon Four
    Freshmen) qui portent les accords. À partir de la deuxième grille,
    l'orchestre joue parfois une réharmonisation (substitution tritonique,
    II ajouté, diminué de passage, maj7 ↔ 6), et les extensions changent :
    la vérité suit ce qui est joué.
  - Tempos de 64 à 236 à la noire, plusieurs tonalités, 40 % des morceaux
    pas accordés à 440 Hz, tempo qui flotte légèrement (et qui accélère dans
    le jazz traditionnel).
  - Rendu par FluidSynth avec la banque de sons libre *GeneralUser GS 2.0.3*
    (téléchargée depuis GitHub à une révision figée, vérifiée par SHA-256).
  - **Chaque instrument est rendu à part** (`drums`, `bass`, `piano`, `guitar`,
    `other` pour les vents, `vocals`, mêmes noms que la séparation de l'app),
    en plus du mélange : on pourra essayer « les accords sur les instruments
    séparés » avec une séparation idéale.
  - Deux versions de chaque morceau : **propre**, et **vieux disque** (mono,
    bande étroite d'environ 150 à 5 000 Hz, souffle et craquements, pleurage
    et scintillement, légère saturation, écho de pièce qui fond les
    instruments, disque qui tourne un peu trop vite ou trop lentement). C'est
    le cas principal du propriétaire. Les instruments séparés de la version
    vieux disque ont le même traitement, sans le bruit ni la saturation.
- **De vrais enregistrements** (24) : l'accompagnement à la guitare de
  GuitarSet (jazz et bossa nova, quatre guitaristes, licence CC BY 4.0), pris
  sur Hugging Face à une révision figée. Seules les colonnes utiles sont lues
  (environ 200 Mo). Ce sont des grilles courtes (12 à 16 mesures, une seule
  fois), à la guitare seule ; les accords sont ceux réellement joués, notés
  par les auteurs. Chacun existe aussi en version vieux disque.
- Rien de tout cela n'est dans le dépôt : le son, la banque de sons, les
  outils d'analyse et les enregistrements sont recréés par la préparation, à
  l'identique (graines fixes, adresses figées). Seules les vérités des
  morceaux de synthèse (`corpus/verites/`, notre propre travail) sont
  gardées, pour qu'on puisse les lire.

### Vrais enregistrements cherchés et écartés

- **JAAH** (jazz ancien annoté, MTG) : les annotations sont sur GitHub mais
  sans licence déclarée (donc pas réutilisables), et le son vient de disques
  du commerce (Smithsonian), introuvable ici.
- **Jazz Trio Database, Filosax, ChoCo, AAM** : pas de son à la fois annoté
  en accords, sous licence utilisable et téléchargeable d'ici (Zenodo et
  archive.org ne sont pas accessibles).
- **Chords1217** (Hugging Face) : chansons du commerce, licence non
  commerciale et accès restreint : écarté.

## Préparer (une fois, environ 5 minutes)

Il faut Node 22 ou plus, Python 3.11 ou plus, `ffmpeg` et `fluidsynth`
(`apt install fluidsynth`, ou `brew install fluidsynth`). Puis, dans ce
dossier :

```sh
./preparer.sh
```

C'est-à-dire : `npm install`, un environnement Python local (`.venv`, voir
`requirements.txt`), `corpus/prepare.py` (les morceaux de synthèse, environ
2 minutes avec 4 cœurs, 1,3 Go dans `data/corpus/`), `corpus/reel_guitarset.py`
(les enregistrements GuitarSet) et l'assemblage du banc (`node banc/build.mjs`).
La préparation vérifie qu'elle redonne les mêmes fichiers : les empreintes
sont dans `data/corpus/empreintes.json`.

## Lancer

```sh
node banc/build.mjs                      # après toute modification du code
node dist/run.mjs --variant base         # tout le corpus, grille détectée et vraie grille
node dist/run.mjs --variant base --grid detected --conditions disque --only saints,satin
node dist/verif-demo.mjs                 # le morceau d'essai du prototype : mêmes chiffres que l'app
```

Les résultats vont dans `resultats/<variante>.json` et `resultats/<variante>.md`
(`--out <dossier>` pour les mettre ailleurs, `--dump` pour garder les accords
trouvés de chaque morceau dans `data/sorties/`).

**Temps.** La première fois, les réseaux tournent sur chaque fichier (environ
9 minutes pour tout le corpus sur 4 cœurs sans carte graphique, plus si la
machine est chargée). Leurs
sorties sont gardées dans `data/cache/`, rangées par empreinte du fichier
audio et des outils : ensuite, une variante qui ne change que le décodage
relit tout le corpus en quelques secondes (2 à 7 s). Une variante qui fait tourner les
réseaux sur les instruments séparés paie ces calculs une fois par fichier.

## Ajouter une variante

Une variante est un fichier `banc/variantes/<nom>.ts` dont l'export par défaut
est une fonction (contrat dans `banc/types.ts`) :

```ts
import type { Variant } from '../types';

const maVariante: Variant = async (input, ctx) => {
  // input.mixPath, input.stemPaths.bass, input.title, input.truthGrid (vraie grille, ou absent)…
  const { outputs, duration } = await ctx.networks(input.mixPath); // réseaux de l'app, en cache
  // … décoder autrement …
  return { chords: [{ time: 0, chord: { root: 0, quality: 'maj7', extensions: [], bass: null }, doubtful: false }], beats: { times, downbeat, beatsPerBar } };
};
export default maVariante;
```

- `chords` : comme `AnalysisResult.chords` de l'app (un accord commence à
  `time` et dure jusqu'au suivant ; `chord: null` = pas d'accord).
- `beats` (facultatif) : la grille utilisée, pour mesurer les temps.
- `ctx.networks(chemin)` rend les sorties des réseaux de l'app sur n'importe
  quel fichier (le mélange ou un instrument), calculées une fois puis
  gardées.
- Quand `input.truthGrid` est là (mode « vraie grille »), la variante doit
  décoder sur cette grille : c'est ce que fait l'app quand l'utilisateur a
  corrigé la grille. Cela sépare les erreurs d'accords des erreurs de temps.
- `input.meta` donne le style et les instruments présents (pas les
  réponses). Le titre est dans `input.title` (bruité dans la vraie vie).
- Puis `node banc/build.mjs && node dist/run.mjs --variant <nom>`.

`base` (`banc/variantes/base.ts`) est l'analyse actuelle de l'app, recopiée
pas à pas du worker (`decode()` dans `app/src/analysis/worker/analysis.worker.ts`).
`crema-brut` (`banc/variantes/crema-brut.ts`) est l'exemple le plus court :
la meilleure lecture du réseau sur chaque temps, sans décodage. Le banc
reproduit exactement les chiffres de l'app sur son morceau d'essai
(`node dist/verif-demo.mjs` : 96,3 % des temps, fondamentale 84,2 %,
fondamentale et qualité 74,3 %).

## Ce que veulent dire les chiffres

Chaque temps de chaque mesure compte une fois ; on lit l'accord trouvé au
milieu du temps et on le compare à l'accord écrit (« par mesure, pondéré par
les temps »). Une seconde mesure pondère par la durée (toutes les 50 ms).

| Colonne | Juste quand… |
|---|---|
| Fondamentale | la note qui nomme l'accord est la bonne |
| Famille | en plus, majeur / mineur / diminué / augmenté / suspendu est bon (7, maj7 et 6 sont « majeurs » ; m7, m6 « mineurs » ; m7b5 et dim7 « diminués ») |
| Couleur | en plus, la qualité exacte du vocabulaire de l'app est bonne (7, maj7, m7, m7b5, dim7, 6, m6, m(maj7), +, sus4, 7sus4…) : **le chiffre principal** |
| Complet | en plus, les extensions (9, 13, ♭9…) et la basse sont bonnes |
| Basse | la note la plus grave (basse d'un renversement, sinon la fondamentale) est bonne |
| Accords manqués | part des mesures à deux accords où un seul a été trouvé |
| Accords en trop | part des mesures à un accord où plusieurs ont été trouvés |
| Temps trouvés | temps à moins de 70 ms (mesure F, grille détectée seulement) |
| Premiers temps | premiers temps de mesure trouvés à moins de 70 ms |

Le rapport donne aussi les **types d'erreurs** (fondamentale à la quinte,
à la tierce, accord voisin c'est-à-dire décalé d'un temps, bonne
fondamentale mais septième fausse…), les confusions de qualité les plus
fréquentes, et l'utilité du signal **« douteux »** de l'app : combien de temps
sont marqués douteux, combien sont faux quand ils sont douteux et quand ils
ne le sont pas, et quelle part des erreurs est signalée.

## Mesure de référence : l'analyse actuelle (`base`)

Voir `resultats/base.md` (tableau complet, par style, types d'erreurs).

Mesuré sur le pipeline de la branche `accords` (avec la réparation des
temps, version d'analyseur 2), « couleur » = fondamentale + qualité exacte,
par temps :

| Son | Fondamentale (grille détectée) | Couleur (grille détectée) | Couleur (vraie grille) | Accords manqués |
|---|---|---|---|---|
| synthèse, son propre (25) | 70 % | 57 % | 58 % | 64 % |
| synthèse, vieux disque (25) | 61 % | **49 %** | 49 % | 66 % |
| GuitarSet, réel (24) | 85 % | 70 % | 71 % | — |
| GuitarSet, façon vieux disque (24) | 83 % | 64 % | 66 % | — |

Le banc retrouve bien ce que le propriétaire entend : sur le vieux disque
de synthèse, un accord sur deux est faux. Ce qu'on apprend :

- **Ce ne sont pas les temps.** Avec la vraie grille, les accords ne gagnent
  qu'un point : sur ce corpus la grille détectée est bonne (95 % des temps),
  l'erreur est dans la lecture des accords.
- **Le II-V est confondu.** L'erreur la plus fréquente est une fondamentale à
  la quinte ou à la quarte (un quart des erreurs) ; la confusion n° 1 est un
  m7 lu comme le 7 une quarte au-dessus (Dm7 lu G7), puis maj7 lu comme le 7
  une quinte au-dessus (Cmaj7 lu G7). Les voicings sans fondamentale et une
  basse qui marche brouillent la fondamentale.
- **Les changements à mi-mesure sont manqués** : deux fois sur trois, une
  mesure à deux accords n'en reçoit qu'un. Le décodage actuel n'apporte
  presque rien par rapport à la lecture brute du réseau temps par temps
  (variante de diagnostic `crema-brut` : même couleur à un point près, 36 %
  de changements manqués mais 38 % de mesures avec un accord en trop).
- **Qualités** : 7 lu comme accord parfait, m7 lu comme 7, m7 lu comme m,
  maj7 lu comme accord parfait : le réseau simplifie les septièmes. Les
  extensions sont presque toujours fausses (« complet » autour de 30 %).
- **Tonalité** : juste pour 68 % des morceaux de synthèse ; quand elle est
  fausse, c'est presque toujours la tonalité de la dominante (une quinte
  au-dessus) — et la tonalité guide ensuite le choix des accords.
- **Le signal « douteux »** a du sens (un accord douteux est faux 7 fois sur
  10, un accord sûr 3 à 4 fois sur 10) mais ne signale que 40 % des erreurs.
- Les styles les plus durs : modal (voicings en quartes), swing rapide,
  valses ; les plus faciles : ballades, jazz traditionnel à trois accords.

## Réglages de difficulté

Chaque morceau a ses réglages dans `corpus/charts.py` (`knobs`), expliqués en
tête de `corpus/arrange.py` ; ceux du vieux disque en tête de
`corpus/render.py` (`OLD_DEFAULTS`). Les principaux : `lead_db` (la mélodie
ou le solo plus fort que l'orchestre : c'est ce qui trompe le plus),
`tension` (part de tensions dans la mélodie et les voicings), `variation`
(réharmonisations d'une grille à l'autre), `bass_busy` (basse qui ne joue pas
la fondamentale au premier temps), `anticip` (accord joué un demi-temps
avant), `drift` et `accel` (tempo), `cents` (accordage). Pour le vieux
disque : bande passante, vitesse du disque, pleurage, écho, saturation,
souffle, craquements, avec une intensité par morceau (plus forte pour le
jazz traditionnel). Ces réglages n'ont pas été ajustés pour obtenir un
chiffre : ils sont fixés une fois pour toutes, et les changer change le
corpus (à noter dans les résultats).

## Limites

- **Ce ne sont pas les disques du propriétaire.** Les instruments de
  synthèse sont plus propres, plus réguliers et mieux séparés que de vrais
  musiciens dans un studio de 1945 ; la « vieille » version imite les défauts
  d'un disque, pas la prise de son d'époque. Un progrès sur ce banc est une
  bonne nouvelle, pas une preuve : il faudra toujours l'oreille du
  propriétaire.
- Les vrais enregistrements de GuitarSet sont de la guitare seule, propre,
  sur de courtes grilles jouées une seule fois : rien sur les reprises, ni
  sur un orchestre.
- Une seule banque de sons ; les « voix » sont des chœurs « Aah / Ooh ».
- Les instruments séparés sont **idéaux** (rendus à part) : une vraie
  séparation fera moins bien.
- La vérité note la mesure écrite : un accord anticipé d'un demi-temps par
  le pianiste compte encore sur le premier temps de la mesure suivante,
  comme sur une grille.
