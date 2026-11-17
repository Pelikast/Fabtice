# Le fichier de projet `.fab`

Un projet Fabtice tient dans **un seul fichier** que l'on peut garder, copier,
envoyer et rouvrir : « Exporter » → « Enregistrer le projet… », puis « Ouvrir
un projet Fabtice » dans la fenêtre « Nouveau projet », un fichier déposé sur
la fenêtre, ou (app Mac) un double-clic dans le Finder, « Ouvrir avec », les
projets récents.

Code : `zip.ts` (le conteneur), `fileFormat.ts` (le format),
`../audio/flac/decode.ts` (le décodeur FLAC), `save.ts`, `saveFlow.ts` et
`open.ts` (l'app), `fromDesktop.ts` (l'app Mac). Tests : `fileFormat.test.ts`,
`projectFile.test.ts`, `../audio/flac/decode.test.ts`,
`tests/project-file.mjs`, `desktop/test/e2e/project-file.test.js`.

## En cinq lignes

1. Une archive **ZIP** ordinaire, fichiers **stockés tels quels** (méthode 0),
   noms en UTF-8 ; sans ZIP64, donc moins de 4 Go (refus calme au-delà).
2. Première entrée `mimetype`, contenu `application/x-fabtice` : les octets 30
   à 58 du fichier valent toujours `mimetypeapplication/x-fabtice` (la
   signature, comme pour les fichiers EPUB et OpenDocument).
3. `fabtice.json` : le manifeste, avec **`formatVersion`** (version de la
   disposition du fichier, **2** aujourd'hui) et la liste des sons.
4. `projet.json` : le document du projet (`ProjectDocument`, version 6
   aujourd'hui), exactement celui que l'app garde sur l'appareil, relu par le
   même lecteur (`storage/documentFormat.ts`) avec les mêmes migrations. Un
   fichier de la version publiée avant la 1.0.0 (document version 5) s'ouvre
   par la migration 5 → 6, sans rien perdre ; un fichier écrit aujourd'hui
   porte la version 6.
5. `audio/` : le fichier importé, **octet pour octet** (mp3, m4a, wav…) ;
   `separations/<outil>/<instrument>.flac` : **toutes** les séparations, une par
   outil ; `rendu/<piste>.flac` : le dernier rendu « meilleure qualité ». Ces
   pistes en **FLAC 16 bits, sans perte**, lisibles par n'importe quel lecteur.

## Les entrées, dans l'ordre

| Entrée | Contenu |
|---|---|
| `mimetype` | `application/x-fabtice`, en ASCII, sans fin de ligne |
| `fabtice.json` | le manifeste (ci-dessous) |
| `projet.json` | le document du projet (JSON) |
| `audio/<nom du fichier importé>` | les octets d'origine, jamais réencodés |
| `separations/<outil>/<instrument>.flac` | la séparation écoutée, puis les autres (« separations/HTDemucs 6 sources/Basse.flac ») |
| `rendu/<piste>.flac` | une piste par piste écoutée lors du rendu gardé |

Un nom déjà pris reçoit un numéro (`Voix 2.flac`). On peut ouvrir le fichier
avec n'importe quel outil d'archives (renommé en `.zip` au besoin) et en sortir
le morceau, les instruments ou le rendu.

**Pourquoi l'original reste tel quel** : c'est ce que l'utilisateur a importé
(un mp3 reste un mp3, plus petit qu'en FLAC) ; un wav ou un aiff d'origine
pourrait passer en FLAC, mais il ne se décode pas toujours à l'identique en
48 kHz et il faudrait garder ses octets d'origine à côté : la règle simple
« l'original tel qu'importé, le reste en FLAC » a été retenue.

## Le manifeste (`fabtice.json`)

```json
{
 "format": "fabtice",
 "formatVersion": 2,
 "documentVersion": 6,
 "title": "Blues du dimanche",
 "savedAt": "2026-11-15T08:00:00.000Z",
 "audio": [
  { "id": "<AudioRef.id>", "entry": "audio/Blues du dimanche.mp3", "fileName": "Blues du dimanche.mp3", "mimeType": "audio/mpeg", "bytes": 4210331 }
 ],
 "tracks": [
  { "id": "<AudioRef.id>", "kind": "separated", "entry": "separations/HTDemucs 6 sources/Basse.flac", "frames": 10703872, "sampleRate": 48000, "channelCount": 2, "mono": false },
  { "id": "<KeptRender.tracks[].audioId>", "kind": "render", "entry": "rendu/Basse.flac", "frames": 12592790, "sampleRate": 48000, "channelCount": 2, "mono": false }
 ]
}
```

- `id` relie chaque son au document : `Track.audio.id` pour l'original et les
  instruments (séparation écoutée, son jeu mis de côté, `separation.others`),
  `keptRender.tracks[].audioId` pour le rendu.
- Dans `projet.json`, `exportPrefs` garde les choix de la fenêtre « Audio… » :
  `what`, `range`, `format` (depuis le lot 3) et, depuis la 1.0.0, `waveRate`
  (44100, 48000, 88200 ou 96000), `waveBits` (16, 24 ou 32 = flottant),
  `mp3Kbps` (96, 128, 160, 192, 256 ou 320) et `separate` (booléen). Le numéro de
  version du document reste **6** : un fichier écrit avant ces quatre champs
  s'ouvre avec leurs valeurs par défaut (48000, 16, 320, vrai), et un champ
  illisible se remet seul à sa valeur par défaut, sans rien perdre d'autre.
- `mono: true` : les deux voies sont égales, le FLAC n'en a qu'une
  (`channelCount` dit ce que la séparation ou le rendu avait donné).
- Le nombre d'images, la fréquence et les 16 bits sont vérifiés en décodant.

## Écrire et lire sans tout tenir en mémoire

- **Écriture** (`writeProjectFile`) : chaque piste est d'abord encodée en FLAC
  par libFLAC (l'encodeur WebAssembly de l'export, niveau 5, dans des workers,
  trois pistes à la fois au plus), en `Blob` que le navigateur peut garder sur
  disque ; les pistes qui ne sont pas en mémoire sont lues sur l'appareil à leur
  tour. Puis l'archive sort par morceaux de 4 Mo vers un « puits » ; la CRC-32
  de chaque entrée est calculée au passage et écrite après elle (descripteur de
  données, bit 3). Selon l'endroit, le puits est un fichier ouvert en écriture
  (« Enregistrer » et « Enregistrer sous… » : poignée de Chromium, ou écriture
  sûre du processus principal de l'app Mac : fichier temporaire puis
  renommage), ou rassemble des `Blob` de 8 Mo remis par un lien (un
  téléchargement, dans Safari et Firefox).
- **Recopier ce qui n'a pas changé** (`WriteOptions.reuse`, `readReusableFile`) :
  un écrivain peut recopier **telles quelles**, depuis un fichier plus ancien du
  même projet, les entrées audio qui n'ont pas changé (même `id`, même sorte,
  même nombre d'images et même format ; pour l'original, même `id` et même
  taille ; la CRC est contrôlée pendant la copie), au lieu de les encoder de
  nouveau. Cela **ne change pas le format** : le fichier écrit a les mêmes
  entrées, le même manifeste et les mêmes règles qu'un fichier tout encodé, et
  un lecteur n'a rien à savoir de cette économie. Si une entrée recopiée ne se
  relit pas comme son manifeste le dit (`ReuseError`),
  l'écrivain recommence sans rien emprunter.
- **Lecture** (`openProjectFile`) : le répertoire central à la fin du fichier
  donne la place de chaque entrée ; `verify()` relit tout le fichier une fois
  par tranches de 4 Mo et contrôle chaque CRC **avant** que le morceau ouvert
  soit remplacé ; chaque piste FLAC est ensuite décodée par tranches
  (`../audio/flac/decode.ts`) directement dans les blocs 16 bits en mémoire
  partagée qu'utilise le moteur, jamais en Float32.
- Mesures (Node, un cœur, six instruments stéréo) : 4 min, 277 Mo de blocs →
  162 Mo de FLAC, écrit en 8,3 s, vérifié et décodé en 5,6 s ; 12 min, 830 Mo →
  477 Mo, 26,9 s et 19,7 s. Dans Chromium avec le vrai libFLAC en workers : une
  minute, sept instruments et trois pistes de rendu, 45 Mo au lieu de 104,
  préparé en 3,4 s.

## Fichier abîmé, fichier trop récent

| Cas | Ce que dit l'app |
|---|---|
| Pas une archive, une archive qui n'est pas un projet, ou un projet de la disposition 1 (jamais publiée) | « Ce fichier n'est pas un projet Fabtice. » |
| Coupé (copie ou téléchargement interrompu), CRC fausse, JSON illisible, document mal formé, son manquant, FLAC illisible | « Le fichier est incomplet ou abîmé… Le morceau que vous aviez reste tel quel. » |
| `formatVersion` plus grand que celui de l'app, ou document d'une version plus récente | « Ce projet a été enregistré par une version plus récente de Fabtice. Mettez Fabtice à jour… » |

Tout est vérifié **avant** de toucher au morceau ouvert : en cas d'échec, le
morceau ouvert et celui gardé sur l'appareil restent tels quels.

## Le document, version 6 (Fabtice 1.0.0)

Ce que la version 6 ajoute au document, tout à l'intérieur de `analysis` et de
`corrections` (aucun nouveau champ au premier niveau) :

| Champ | Contenu | Valeur d'un document plus ancien |
|---|---|---|
| `analysis.keyChanges` | les modulations trouvées par l'analyse (position en secondes de l'enregistrement, tonalité, confiance), croissantes et toutes après la position 0 ; la tonalité avant la première reste `analysis.key`. Remplie par la passe d'harmonie (`structure/refresh.ts`) | `[]` |
| `analysis.structure` | la structure trouvée : mode (`jazz`, `pop`), forme globale (« AABC », `''` si inconnue), lettres de section (position, lettre), parties (`id`, type, numéro, instrument, début, fin ; croissantes, sans chevauchement). Remplie par la passe d'harmonie ; `null` tant qu'elle n'a rien dit (ou si « Structure automatique du morceau » est décoché) | `null` |
| `analysis.version` | le résultat d'analyse passe à sa version 2 ; un résultat de version 1 est **gardé** (accords compris) et reçoit les deux champs ci-dessus | `1` → `2` |
| `corrections.keyChanges` | les modulations voulues par l'utilisateur, ou `null` pour suivre l'analyse ; dès qu'il en touche une, c'est **toute** la liste qui devient la sienne (même vide) ; la tonalité principale reste `corrections.key` | `null` |
| `corrections.structure` | la structure corrigée à la main : `mode` (`auto`, `jazz`, `pop`), `parts` (parties écrites ou corrigées à la main), `spans` (étendues dont les parties sont celles de l'utilisateur : les parties détectées qui y commencent sont cachées ; une étendue sans partie veut dire « pas de partie ici »), `lettersByHand` (les lettres de `corrections.sections` sont alors la liste entière en vigueur, même vide) | mode `auto`, `parts` et `spans` vides, `lettersByHand` faux |
| `corrections.tempoFixes[].kind` | une troisième sorte, `tapped` (« Correction de la courbe en tapant le tempo »), avec les tapes (`taps`, en secondes) et la fin du passage tapé (`end`) | — |
| `tempoMap.meters[].meter` | signature de 1 à 64 temps, sur 4, 8, 16 ou 32 (`model/tempoMap.ts#isValidMeter`) | ce qu'une version plus ancienne pouvait porter y est déjà |

Les lettres de section restent `corrections.sections`, comme avant. Ce qui est
fait à la main est relu exactement, ou le fichier est déclaré abîmé (parties et
étendues croissantes et sans chevauchement, identifiants de parties uniques) ;
ce que l'analyse a produit et qui serait abîmé est simplement oublié (l'analyse
se refait). Un document de version 5 s'ouvre avec `corrections.keyChanges` à
`null` et une structure à la main vide (`storage/documentFormat.ts`).

**Identifiants des parties détectées.** Un `id` de partie détectée est stable
d'un recalcul à l'autre (la passe d'harmonie se relance seule quand les accords
ou les mesures changent) : une partie retrouvée garde le sien, et c'est par cet
`id` que `corrections.structure` la désigne. Un identifiant qui ne désigne plus
aucune partie est simplement sans effet.

**Ce qui n'est pas enregistré.** La grille complète simplifiée (le dessin
écrit, ses places, la ligne de forme), l'affichage choisi dans la colonne
(complet, simplifié, une partie), la boucle d'une partie et les mesures de
l'audio qui servent à reconnaître la structure ne sont **jamais** dans le
fichier : tout cela se recalcule à partir de ce qui l'est (accords, lettres,
parties, modulations en vigueur). Rien de nouveau n'est donc à relire pour la
grille simplifiée, et le format reste à la version 6.

**Signatures mesure par mesure : « la noire reste la noire ».** Les changements
de signature sont `tempoMap.meters` (le premier à la mesure 0 ; les suivants
sont tous faits à la main, l'analyse n'en donne qu'une). Les temps de la carte
(`segments[].beat`, `segments[].bpm`, `meters[].beat`) comptent la valeur du
chiffre du bas de la **première** signature : des noires pour un morceau qui
commence en 4/4, des croches s'il commence en 6/8. Une mesure de n/d dure
n × d₀/d de ces temps (d₀ : chiffre du bas de la première signature) : une
croche dure la moitié d'une noire, une mesure de 6/8 dans un morceau en 4/4
dure trois noires (ses barres tombent sur les temps analysés), une de 7/16
1,75 noire, d'où un `meters[].beat` qui peut être fractionnaire. Les instants
ne bougent jamais quand on change une signature : seules les barres de mesure
se replacent. Changer le chiffre du bas de la première signature par
« Changer la signature rythmique » renumérote toute la carte (deux fois plus de
temps pour des croches, mêmes instants). Le choix d'une métrique pour tout le
morceau dans le panneau du métronome garde sa règle d'avant (le temps trouvé
par l'analyse devient la noire pointée en 6/8). Un morceau à une seule
signature s'écrit exactement comme avant.

## Faire évoluer le format

- Nouveau champ du projet : il va dans `ProjectDocument` (nouvelle version du
  document et sa migration dans `storage/documentFormat.ts#MIGRATIONS`) ; le
  fichier n'a pas à changer, et un fichier ancien se rouvre par la migration.
- Nouvelle sorte d'entrée ou nouveau manifeste : `PROJECT_FILE_VERSION` + 1 et
  un lecteur de l'ancienne disposition à côté du nouveau. Un fichier plus récent
  que l'app est refusé avec la phrase « mettez Fabtice à jour », jamais deviné.
- Plus de 4 Go un jour : passer au ZIP64 (nouvelle `formatVersion`).
