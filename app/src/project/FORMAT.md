# Le fichier de projet `.fabtice`

Un projet Fabtice tient dans **un seul fichier** que l'on peut garder, copier,
envoyer et rouvrir : « Exporter » → « Enregistrer le projet… », puis « Ouvrir
un projet Fabtice » dans la fenêtre « Nouveau morceau », un fichier déposé sur
la fenêtre, ou (app Mac) un double-clic dans le Finder.

Code : `zip.ts` (le conteneur), `fileFormat.ts` (le format), `save.ts` et
`open.ts` (l'app), `fromDesktop.ts` (l'app Mac). Tests :
`fileFormat.test.ts`, `projectFile.test.ts`, `tests/project-file.mjs`,
`desktop/test/e2e/project-file.test.js`.

## En cinq lignes

1. Une archive **ZIP** ordinaire, fichiers **stockés tels quels** (méthode 0,
   sans compression), noms en UTF-8 ; sans ZIP64, donc moins de 4 Go.
2. Première entrée `mimetype`, contenu `application/x-fabtice` : les octets 30
   à 58 du fichier valent toujours `mimetypeapplication/x-fabtice` (la
   signature, comme pour les fichiers EPUB et OpenDocument).
3. `fabtice.json` : le manifeste, avec **`formatVersion`** (version de la
   disposition du fichier, 1 aujourd'hui) et la liste des sons qu'il contient.
4. `projet.json` : le document du projet (`ProjectDocument`, version 4
   aujourd'hui), exactement celui que l'app garde sur l'appareil, relu par le
   même lecteur (`storage/documentFormat.ts`) avec les mêmes migrations.
5. `audio/` : le fichier importé, **octet pour octet** (mp3, m4a, wav…) ;
   `instruments/` : chaque instrument séparé en **WAV 16 bits, 48 kHz**, lisible
   par n'importe quel lecteur.

## Les entrées, dans l'ordre

| Entrée | Contenu |
|---|---|
| `mimetype` | `application/x-fabtice`, en ASCII, sans fin de ligne |
| `fabtice.json` | le manifeste (ci-dessous) |
| `projet.json` | le document du projet (JSON) |
| `audio/<nom du fichier importé>` | les octets d'origine, jamais réencodés |
| `instruments/<nom de la piste>.wav` | un instrument séparé (« Basse.wav », « Voix.wav »…) |

Un nom déjà pris reçoit un préfixe (`audio/2-morceau.mp3`). On peut ouvrir le
fichier avec n'importe quel outil d'archives (renommé en `.zip` au besoin) et
en sortir le morceau ou les instruments.

## Le manifeste (`fabtice.json`)

```json
{
 "format": "fabtice",
 "formatVersion": 1,
 "documentVersion": 4,
 "title": "Blues du dimanche",
 "savedAt": "2026-11-15T08:00:00.000Z",
 "audio": [
  { "id": "<AudioRef.id>", "entry": "audio/Blues du dimanche.mp3", "fileName": "Blues du dimanche.mp3", "mimeType": "audio/mpeg", "bytes": 4210331 }
 ],
 "instruments": [
  { "id": "<AudioRef.id>", "entry": "instruments/Basse.wav", "frames": 10703872, "sampleRate": 48000, "channelCount": 2, "mono": false }
 ]
}
```

- `id` relie chaque son aux pistes du document (`Track.audio.id`), pour le
  morceau entier comme pour les instruments, montrés ou mis de côté
  (`separation.aside`).
- `mono: true` : les deux voies sont égales, le WAV n'en a qu'une
  (`channelCount` dit ce que la séparation avait donné).
- `bytes` et `frames` sont vérifiés contre l'archive avant de lire quoi que ce
  soit de gros.

## Avec ou sans les instruments séparés

Au moment d'enregistrer, une seule question, et seulement si le morceau est
séparé : « Avec les instruments séparés », **cochée par défaut**, avec ce
qu'ils ajoutent à la taille. Ils sont lourds (environ 11 Mo par minute et par
instrument stéréo) mais se rouvrent sans être recalculés, ce qui compte quand
une séparation a pris un quart d'heure. Sans eux, le document enregistré est
celui du morceau entier (`storage/restore.ts#wholePieceOf`) : on séparera de
nouveau après l'ouverture.

**Pourquoi pas de FLAC pour les instruments.** L'encodeur libFLAC de l'app
(`@audio/encode-flac`) n'a pas de décodeur : relire du FLAC passerait par le
décodeur du navigateur, qui rend une copie Float32 d'une piste entière (la
règle de mémoire de l'app l'interdit) et qu'on ne peut pas lire par tranches.
Le WAV 16 bits se lit et s'écrit par tranches, directement depuis et vers la
forme en mémoire (`audio/pcm.ts`), et tout lecteur l'ouvre. La taille est
annoncée avant d'enregistrer.

## Écrire et lire sans tout tenir en mémoire

- **Écriture** (`writeProjectFile`) : les octets sortent par morceaux de
  quelques Mo vers un « puits » ; la somme de contrôle CRC-32 de chaque entrée
  est calculée au passage et écrite après elle (descripteur de données, bit 3),
  donc rien n'est lu deux fois. Dans l'app, le puits rassemble des `Blob` de
  8 Mo (le navigateur peut les garder sur disque) et le fichier est remis par un
  lien : un téléchargement dans un navigateur, la fenêtre d'enregistrement de
  macOS dans l'app Mac. Taille calculée exactement avant d'écrire
  (`projectFileSize`) : au-delà de 4 Go, refus calme avant tout travail.
- **Lecture** (`openProjectFile`) : le répertoire central à la fin du fichier
  donne la place de chaque entrée ; chaque entrée est lue par tranches de 4 Mo
  depuis le fichier choisi (`Blob.slice`), ou depuis l'app Mac (pont
  `readProjectFile`, 16 Mo au plus par appel), et sa CRC est vérifiée en
  lisant. Les instruments vont directement dans les blocs 16 bits en mémoire
  partagée qu'utilise le moteur.
- Mesures (`fileFormat.test.ts`, Node) : un fichier de 319 Mo écrit en 1,3 s
  avec 34 Mo de mémoire de pointe ; relu en 2,8 s, la mémoire de pointe étant
  celle des échantillons relus (315 Mo) plus quelques Mo.

## Fichier abîmé, fichier trop récent

| Cas | Ce que dit l'app |
|---|---|
| Pas une archive, ou une archive qui n'est pas un projet | « Ce fichier n'est pas un projet Fabtice. » |
| Coupé (copie ou téléchargement interrompu), CRC fausse, JSON illisible, document mal formé, son manquant | « Le fichier est incomplet ou abîmé… Le morceau que vous aviez reste tel quel. » |
| `formatVersion` plus grand que celui de l'app, ou document d'une version plus récente | « Ce projet a été enregistré par une version plus récente de Fabtice. Mettez Fabtice à jour… » |
| Seul un instrument est abîmé | le morceau s'ouvre **entier**, une phrase calme le dit |

Tout est lu et vérifié **avant** de toucher au morceau ouvert : en cas
d'échec, le morceau ouvert et celui gardé sur l'appareil restent tels quels.

## Faire évoluer le format

- Nouveau champ du projet : il va dans `ProjectDocument` (nouvelle version du
  document et sa migration dans `storage/documentFormat.ts#MIGRATIONS`) ; le
  fichier n'a pas à changer, et un fichier ancien se rouvre par la migration.
- Nouvelle sorte d'entrée ou nouveau manifeste : `PROJECT_FILE_VERSION` + 1 et
  un lecteur de l'ancienne disposition à côté du nouveau. Un fichier plus récent
  que l'app est refusé avec la phrase « mettez Fabtice à jour », jamais deviné.
- Plus de 4 Go un jour : passer au ZIP64 (nouvelle `formatVersion`).
