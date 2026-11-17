# Le format `.als` d'Ableton Live — recherche pour « Projet Ableton Live… » (C15.5)

Personne, ni ici ni chez le propriétaire, n'a Ableton Live : aucun fichier écrit
par Fabtice n'a été ouvert dans Live. Ce document dit ce qui est **établi par
une source** (un fichier enregistré par Live, ou une mesure publiée faite dans
Live), ce qui est **déduit**, et ce qui **n'est pas établi**, avec un degré de
confiance. Le code est dans ce dossier (`liveSet.ts`, `tempo.ts`…) ; ses tests
relisent le fichier avec trois lecteurs indépendants (voir « Vérifications »).

## En bref

- Un seul fichier ne peut pas servir Live 10, 11 et 12 à la fois sans
  compromis : Live ouvre les projets des versions plus anciennes et refuse les
  plus récents, et Live 10 ne retrouve ses fichiers audio que par un « alias »
  macOS que seule la machine où sont les fichiers peut fabriquer.
- L'écrivain sait donc écrire **deux schémas** du même projet :
  - **`live11`** (par défaut) : schéma de Live 11.0 (`11.0_433`). Live 11 et
    Live 12 l'ouvrent et retrouvent l'audio par son chemin relatif.
  - **`live10`** : schéma de Live 10.1 (`10.0_377`). Live 10 (et aussi 11 et
    12) l'ouvre, mais **dans Live 10 les clips s'ouvrent « manquants »** :
    il faut montrer une fois le dossier à Live (Gestionnaire de fichiers →
    rechercher). Tempo, signatures, repères et position des clips sont là.
- Le dossier de l'app contient les deux, plus le fichier MIDI et les pistes
  en WAV (le repli sûr demandé par le cahier), et un mode d'emploi : voir « Le
  dossier de l'app » à la fin.
- Confiance globale : **probable, pas prouvé**. Environ 7 chances sur 10 que
  le fichier `live11` s'ouvre du premier coup dans Live 11 et 12 avec tout en
  place ; si Live l'ouvre, le tempo et les repères sont justes à la
  microseconde (vérifié par un lecteur indépendant).

## Sources

Aucun fichier de ces projets n'est copié dans le dépôt. Les fichiers de
référence ont été téléchargés hors du dépôt (`/tmp`) et lus comme des données ;
le gabarit de Fabtice est écrit à la main en TypeScript à partir de la
structure décrite ici. Les projets d'exemple d'Ableton (non libres) n'ont pas
été utilisés.

| Source | Adresse | Licence | Ce qu'on en tire | Versions de Live |
|---|---|---|---|---|
| **abletoolz** 2.2.1 | PyPI `abletoolz` (github.com/elixirbeats/abletoolz) | MPL-2.0 | Lecteur et éditeur de sets. Contient **les schémas de Live eux-mêmes** (classes et membres de chaque `MinorVersion`, extraits de Live 12.4.7 Suite, 203 schémas jusqu'à Live 8) et un **recensement de 1 389 sets** enregistrés par Live 9.0.1 à 12.4.15 (attributs de la racine de chaque version, version où chaque élément apparaît). Mesures publiées : refus de Live sur un attribut inconnu, conteneur gzip, somme de contrôle des fichiers, résolution des chemins. | 9 à 12.4 |
| **ableton-als** 0.4.2 | npm `ableton-als` (github.com/kevinkirsten/ableton-als) | MIT | Lecteur, validateur de sets générés et convertisseur Live 12 → Live 10, **mesuré dans Live 10.1.43 et 12.4.3** : alias macOS de `FileRef/Data` indispensable à Live 10, refus d'un attribut inconnu, plantage sur une valeur hors plage, une case de clip par scène. Palette de couleurs. | 10.1, 12.4 |
| **dawtool** | github.com/offlinemark/dawtool | BSD-3-Clause (un fichier FL Studio en GPL-3.0, non utilisé) | Calcule le temps en secondes des repères à partir de l'automation de tempo, avec une réimplémentation de la ligne de temps de Live (exposé ADC 2020, 10 000 projets traités). **Le tempo lu par doubles-croches**. Fichiers de test enregistrés par Live 10.1.7, 10.1.9 et 12.0b16, dont un de 25 505 points de tempo en marches. | 8 à 12 |
| **DawVert** | github.com/SatyrDiamond/DawVert | GPL-3.0 | Convertisseur entre logiciels qui **écrit des `.als`** : il déclare `11.0_433` / « Ableton Live 11.0 », sans `SchemaChangeCount` ; lecture des clips non étirés (repères de boucle en secondes). | 11 |
| ableton-parser 1.1.0 | npm `ableton-parser` | ISC | Fichier de test `a.als` **enregistré par Live 10.1.7 avec deux clips audio non étirés dans l'arrangement** : la référence de structure de `live10`. | 10.1.7 |
| als-parser 1.2.0 | npm `als-parser` | ISC | Sets de Live 10.1.15, dont un échantillon enregistré dans le projet (`FileRef` de type projet). | 10.1.15 |
| pyableton 0.0.15 | PyPI `pyableton` | MIT | Sets de Live 11.1.5 et 11.3.3 : la référence de structure de `live11` (piste principale, scènes, ordre des éléments, automation de signature). | 11.1, 11.3 |
| buildable 0.4.0 | PyPI `buildable` | MIT | Sets de Live 12.0 (set par défaut, pistes audio) : la structure d'une piste audio récente. | 12.0 |
| Aide d'Ableton | help.ableton.com (articles « Setting exact BPM values… », « Scene Tempo and Time Signature ») | — | Tempo de 20 à 999 BPM ; signature : numérateur 1 à 99, dénominateur 1, 2, 4, 8 ou 16. **Lu à travers un moteur de recherche** : le site n'était pas joignable d'ici. | 10 à 12 |

Non joignables depuis cette machine : `www.ableton.com` et `help.ableton.com`
(noms refusés par le réseau de la session), `codeload.github.com` (archives des
dépôts) et l'API GitHub. Les fichiers de GitHub ont été lus un par un par
`raw.githubusercontent.com` ; PyPI et npm étaient joignables.

## Le conteneur

**Établi** (abletoolz, et tous les fichiers de référence) : un `.als` est un
flux gzip qui contient le document XML, avec le prologue
`<?xml version="1.0" encoding="UTF-8"?>` et un saut de ligne final. Live
l'indente avec des tabulations et écrit les éléments vides `<Tag Value="…" />`.
L'en-tête gzip de Live ne porte ni nom de fichier ni date
(`1f 8b 08 00 00 00 00 00 .. ff`) ; un octet d'options non nul (le nom de
fichier qu'ajoute l'outil `gzip`) fait refuser un clip `.alc` par le
navigateur de Live (abletoolz, mesuré). Fabtice écrit cet en-tête (`gzip.ts`),
avec `CompressionStream` quand il existe, sinon en blocs non compressés (un
gzip valide, plus gros).

## La racine et la version

```xml
<Ableton MajorVersion="5" MinorVersion="11.0_433" Creator="Ableton Live 11.0" Revision="9dc150af…">
```

- **Établi** (recensement d'abletoolz) : `MajorVersion` vaut 5 depuis Live 10 ;
  `MinorVersion` nomme le schéma (`10.0_370` pour 10.0, `10.0_377` pour 10.1,
  `11.0_433` pour 11.0, `11.0_436`, `11.0_11202`, `11.0_11300` pour 11.1 à 11.3,
  `12.0_12049`… pour 12) ; `SchemaChangeCount` compte les retouches d'un même
  schéma (Live 11.0.0 à 11.0.2 ne l'écrivaient pas) ; `Creator` et `Revision`
  sont la version et la révision du logiciel qui a enregistré.
- **Établi** (abletoolz : Live 12.4.7 embarque les 203 schémas jusqu'à Live 8 ;
  recensement de 1 389 sets) : un Live lit un set par le schéma que nomme son
  `MinorVersion`, donc **ouvre les sets des versions plus anciennes**, et
  **refuse ceux d'une version plus récente**.
- **Établi** (abletoolz, mesuré dans Live 11.3.42 ; ableton-als, mesuré dans
  Live 10) : Live **refuse tout le set pour un seul attribut ou élément qu'il ne
  connaît pas** (« Unknown attribute 'SelectedToolPanel' »), et pour une classe
  d'appareil inconnue. Il **tolère les membres absents** : des sets convertis
  sans certains éléments se sont ouverts dans Live 11.3.42 (abletoolz), et Live
  lui-même n'écrit pas les affectations clavier/MIDI vides (`KeyMidi…`). Une
  valeur hors plage dans un champ connu peut le faire planter à l'ouverture
  sans message (ableton-als, mesuré dans Live 10).
- Choix : la racine **exacte** que Live 11.0.0 écrivait (`live11`), ou celle de
  Live 10.1.0 (`10.0_377`, `SchemaChangeCount` 2, « Ableton Live 10.1 »,
  `live10`) : la plus ancienne de chaque version majeure, pour que toutes les
  mises à jour de cette version l'ouvrent, et rien n'est écrit qui soit
  apparu après elle (vérifié élément par élément, voir plus bas). `Creator`
  reprend le texte de Live (DawVert fait de même) car on ignore si Live le lit ;
  l'origine du fichier est dite dans la note du set (`Annotation` : « … —
  exporté par Fabtice (format à l'essai) »).
- **Déduit** (9 fichiers de référence, sans exception) :
  `OverwriteProtectionNumber` vaut la version majeure et mineure de Live
  (`0x0A01` = 2561 pour 10.1, `0x0B01` pour 11.1, `0x0C00` pour 12.0). Fabtice
  écrit `0x0B00` et `0x0A01`.

### Viser Live 10 : ce que cela implique

- Un fichier au schéma de Live 10 est le seul que Live 10 ouvre ; Live 11 et
  12 l'ouvrent aussi (ils le convertissent).
- **Établi** (ableton-als, mesuré dans Live 10.1.43, « deux essais dans Live »
  et 5 016 alias reproduits à l'octet) : Live 10 retrouve un fichier audio par
  l'**alias macOS** rangé dans `FileRef/Data`, pas par le chemin absolu ni par
  le chemin relatif. Sans alias, le set s'ouvre avec **tous les clips grisés**
  (`RelativePathType` 3 n'y change rien). L'alias contient des données du
  volume (date de création, identifiants) que seule la machine qui porte les
  fichiers connaît ; ableton-als ne sait le produire que pour un disque externe
  (`/Volumes/…`), le disque de démarrage n'ayant jamais été mesuré.
- Conséquence : le fichier `live10` s'ouvre dans Live 10 avec les clips
  « manquants » ; le Gestionnaire de fichiers de Live (« Rechercher » dans le
  dossier du projet) les retrouve par leur nom, leur taille et leur somme de
  contrôle, écrits dans `SearchHint`. **Non établi** : que cette recherche les
  retrouve du premier coup (c'est son rôle, rien ne l'a vérifié ici).
- Viser Live 10 pour les trois versions ferait perdre à Live 11 et 12 la
  résolution par chemin relatif (rien n'établit qu'une conversion par Live 11
  d'un `FileRef` sans alias retrouve le fichier) : c'est pourquoi `live11` est
  le fichier principal.
- Piste pour plus tard (phase 2 ou après) : dans l'app Mac, quand le dossier
  est sur un disque externe, l'alias pourrait être fabriqué (l'algorithme
  d'ableton-als est sous licence MIT) ; non fait, et non mesuré sur le disque
  de démarrage.

## Structure d'un set qui s'ouvre

Ce qu'écrit Fabtice, dans l'ordre de Live, comparé à des sets de Live 10.1.7
(`live10`), 11.1.5 (`live11`) et 12.0 (pistes audio). L'ordre exact est vérifié
par `check_structure.py`.

```
Ableton
└ LiveSet
  NextPointeeId · OverwriteProtectionNumber · LomId · LomIdView
  Tracks
    AudioTrack Id=…            (une par piste ; Id 10, 11…)
      … Name (EffectiveName, UserName) · Color (ColorIndex en Live 10) · …
      DeviceChain
        AutomationLanes · ClipEnvelopeChooserViewState
        AudioInputRouting · MidiInputRouting · AudioOutputRouting (« AudioOut/Master ») · MidiOutputRouting
        Mixer (On, Sends vide, Speaker, Pan, SplitStereoPanL/R, Volume, CrossFadeState…)
        MainSequencer
          ClipSlotList (8 cases vides : une par scène)
          Sample/ArrangerAutomation/Events
            AudioClip Id=0 Time=…  ← le clip de l'arrangement
          VolumeModulationTarget … SampleOffsetModulationTarget · Recorder
        FreezeSequencer (même forme, 8 cases)
        DeviceChain (Devices vide)
  MasterTrack
    AutomationEnvelopes/Envelopes
      AutomationEnvelope Id=0 → PointeeId = Mixer/Tempo/AutomationTarget/@Id      (FloatEvent…)
      AutomationEnvelope Id=1 → PointeeId = Mixer/TimeSignature/AutomationTarget/@Id (EnumEvent…)
    DeviceChain/Mixer : … Tempo · TimeSignature · GlobalGrooveAmount · CrossFade
                        TempoAutomationViewBottom · TempoAutomationViewTop
  PreHearTrack
  SendsPre (vide : aucune piste de retour)
  Scenes (8 Scene ; SceneNames en Live 10)
  Transport · SongMasterValues · … · Locators/Locators (Locator…) · … · ViewStates
```

- **Aucune piste de retour** : les `Sends` des mixeurs et `SendsPre` sont vides
  (les mixeurs de la piste principale et de pré-écoute ont `Sends` vide dans
  les sets de Live). Un set qui en a porte un `TrackSendHolder` par piste de
  retour dans chaque mixeur et un `SendPreBool` par piste de retour : plus de
  structure à tenir cohérente, d'où ce choix. **Non établi** : qu'un set sans
  aucune piste de retour soit une forme que Live écrit lui-même (on peut les
  supprimer toutes dans Live, mais aucun set de référence n'en est un).
- **Scènes** : huit, comme le set par défaut de Live. **Établi** (ableton-als,
  mesuré) : chaque liste de cases (`ClipSlotList` de chaque séquenceur) doit
  avoir exactement une case par scène, sinon Live plante à l'ouverture.
- **Identifiants. Établi** (abletoolz) : les `AutomationTarget`,
  `ModulationTarget`, `…ModulationTarget` et `Pointee` partagent un espace
  d'identifiants global, compté par `NextPointeeId` ; deux éléments au même
  identifiant font refuser le set. **Établi** (16 sets de référence sur 17) :
  dans les sets de Live, **tous** les `Id` du fichier, points d'automation
  compris, sont inférieurs à `NextPointeeId`, qui vaut souvent le plus grand
  plus un ; ableton-als en fait une règle. Fabtice prend tous ces identifiants
  à un même compteur à partir de 1 et écrit `NextPointeeId` = dernier + 1. Les
  `Id` des éléments d'une liste (cases, scènes, repères, marqueurs de warp,
  enveloppes, clips) sont 0, 1, 2… dans leur liste. Chaque `PointeeId` désigne
  un identifiant existant (vérifié).
- Éléments laissés de côté : ceux que Live lui-même n'écrit pas (affectations
  `KeyMidi…` vides, comme dans les sets de Live 10.1.7 et 11.1.5),
  `ResetNonautomatedMidiControllersOnClipStarts` (apparu en 11.0.10) et
  `MetronomeTickDuration` en Live 10 (apparu en 10.1.6). Le parcours des
  schémas ne trouve aucun autre membre absent.

## Le clip non étiré (Warp désactivé)

Référence : les deux clips non étirés du set de Live 10.1.7 (fichier de 43 080
échantillons à 44,1 kHz, soit 0,976 870 7 s, à 120 BPM).

- **Établi** (ce fichier, et le lecteur de DawVert) : `IsWarped` faux ; les
  repères de la boucle **comptent des secondes du fichier** :
  `LoopStart` 0, `LoopEnd` = `OutMarker` = `HiddenLoopEnd` = durée en secondes,
  `StartRelative` 0, `LoopOn` faux ; la place dans l'arrangement compte des
  temps (noires) : attribut `Time` = `CurrentStart` = début,
  `CurrentEnd` = fin (1,953 7 temps = 0,976 9 s à 120 BPM).
- **Établi** (abletoolz, règle du chargeur de Live : « Empty warp marker
  array ») : un clip audio doit garder des `WarpMarkers` même non étiré. Fabtice
  écrit les deux que Live écrit pour un clip neuf (0 s ↔ 0 temps,
  0,015 625 s ↔ 0,031 25 temps).
- `SampleRef/DefaultDuration` = nombre d'échantillons, `DefaultSampleRate` =
  48 000.
- **Déduit** : avec une courbe de tempo, Fabtice calcule `CurrentEnd` par la
  même courbe (le temps où se trouve « début + durée en secondes »), ce qui
  donne le bon résultat que Live garde la valeur écrite ou la recalcule.
  **Non établi** : laquelle des deux il fait.
- Tous les clips commencent à 0 (les pistes exportées sont alignées au début,
  `export/session/`) ; l'entrée accepte un autre début (`startQuarters`).
- **Non établi** (raisonnement) : la préférence « Auto-Warp Long Samples » ne
  joue qu'à l'import d'un fichier dans Live, pas à l'ouverture d'un set où le
  clip dit `IsWarped` faux.
- 48 kHz : **non vérifié ici** (pages d'Ableton injoignables) ; Live joue un
  fichier à une autre fréquence que la carte son en le rééchantillonnant à la
  volée, c'est son fonctionnement courant.

## Les fichiers audio (`FileRef`)

### Live 11 et 12 (`live11`)

```xml
<FileRef>
  <RelativePathType Value="3" />
  <RelativePath Value="Samples/Imported/01 Morceau.wav" />
  <Path Value="/Users/…/Samples/Imported/01 Morceau.wav" />   (vide si inconnu)
  <Type Value="1" /> <LivePackName Value="" /> <LivePackId Value="" />
  <OriginalFileSize Value="…" /> <OriginalCrc Value="…" />
</FileRef>
```

- **Établi** (abletoolz) : depuis Live 11, `Path` et `RelativePath` sont des
  chaînes, avec des `/` même sous Windows ; `RelativePathType` 3 = fichier du
  projet, cherché d'abord par `RelativePath` (observé : un `RelativePath`
  périmé à côté d'un nouveau `Path` fait charger l'ancien fichier), `Path`
  servant de repli.
- **Établi** (abletoolz, 64 184 références mesurées) : Live écrit lui-même
  `OriginalFileSize` 0 avec `OriginalCrc` 0 dans 6 038 cas : un fichier sans
  taille ni somme de contrôle est une forme que Live produit. Quand on les
  connaît, mieux vaut les écrire : **établi** (abletoolz, 1 268 fichiers de
  Live 9 à 12, tous concordants) : `OriginalCrc` est le CRC-16/UMTS (polynôme
  0x8005, sans réflexion, valeur initiale 0) des 16 384 premiers octets du
  fichier (`crc.ts`, `liveFileCrc()`).
- `LastModDate` : date de modification du fichier (secondes Unix) ; 0 si
  inconnue. **Non établi** : ce que Live fait d'une date fausse (ableton-als a
  mesuré que Live 10 ignore la date de création de l'alias, pas celle-ci).
- `Type` : 1, comme Live 11 l'écrit pour un échantillon (Live 10 écrit 2).
  Sens exact **non établi**.
- **Non établi — le point le plus incertain** : comment Live définit « le
  projet » quand le dossier n'a pas de sous-dossier `Ableton Project Info`
  (que Live crée à l'enregistrement, avec un fichier binaire `Project8_1.cfg`
  que Fabtice ne sait pas écrire). abletoolz suppose qu'un chemin de projet ne
  se résout que sous un dossier qui contient `Ableton Project Info`. D'où :
  dans l'app Mac, écrire aussi `Path` (le chemin absolu du fichier, connu au
  moment de l'export) ; dans l'app web, `Path` reste vide et le repli est la
  recherche du Gestionnaire de fichiers (le nom, la taille et la somme de
  contrôle y sont). À trancher en phase 2 : nommer le dossier « Titre
  Project » comme Live, et tester si un dossier `Ableton Project Info` vide
  aide (aucune source ne le dit).

### Live 10 (`live10`)

Forme d'un échantillon enregistré dans le projet par Live 10.1.15 :
`HasRelativePath` vrai, `RelativePathType` 3, `RelativePath` en éléments
`RelativePathElement Dir="Samples"`, `Dir="Imported"`, `Name` = nom du fichier,
`Type` 2, `Data` (l'alias, vide ici : voir plus haut), `RefersToFolder` faux,
`SearchHint` (`PathHint` = dossiers du chemin absolu s'il est connu,
`FileSize`, `Crc`, `MaxCrcSize` 16 384, `HasExtendedInfo`), `LivePackName`,
`LivePackId`. Établi : la même somme de contrôle de Live 9 à 12 (abletoolz).

## La courbe de tempo

- **Établi** (sets de Live 10, 11 et 12, dawtool, abletoolz) : le tempo est
  l'enveloppe d'automation de `MasterTrack/DeviceChain/Mixer/Tempo`, rangée
  dans `MasterTrack/AutomationEnvelopes` ; `EnvelopeTarget/PointeeId` vaut
  l'`Id` de `Tempo/AutomationTarget`. Les points sont des
  `<FloatEvent Id Time Value />`, `Time` en temps (noires), `Value` en BPM de
  noires. Le premier point est toujours à `Time` −63 072 000 et porte la
  valeur d'avant le premier vrai point ; `Tempo/Manual` porte aussi le tempo
  de départ (depuis Live 9.7 c'est la valeur que Live lit comme tempo du set).
- **Établi** (schéma de Live : `FloatEvent.Value` est un `Float`) : valeurs en
  flottant 32 bits.
- **Établi** (set de dawtool enregistré par Live 10.1.7 : 25 505 points en
  marches, 12 752 instants à deux points) : **une marche s'écrit par deux
  points au même temps** (ancienne valeur, puis nouvelle). Entre deux points
  différents, Live interpole linéairement (dawtool ; les points
  `CurveControl…` des courbes, apparus en Live 10.0.6, ne sont pas utilisés).
- **Établi par rétro-ingénierie** (dawtool, « TEMPO_QUANT = 16 ») : la ligne de
  temps de Live lit la courbe **par doubles-croches** : un changement placé
  entre deux doubles-croches ne prend effet qu'à la suivante.
- **Établi** (aide d'Ableton, lue par un moteur de recherche) : tempo de 20 à
  999 BPM. Une valeur hors plage est ramenée dans la plage et signalée
  (`tempo-clamped`).
- Ce que fait Fabtice (`tempo.ts`) : la courbe de l'export (un tempo par temps
  de la grille, `Session.beats`) devient des **marches posées sur des
  doubles-croches** uniquement. Ainsi la lecture linéaire et la lecture par
  doubles-croches donnent exactement la même chose, et chaque double-croche
  tombe à son temps exact. Un changement entre deux doubles-croches (un temps
  d'une mesure en x/32) est moyenné sur sa double-croche : exact sur les
  doubles-croches, écart signalé (`tempo-unaligned`) au milieu (quelques
  millisecondes pour un saut de tempo de 40 % ; bien moins pour les écarts
  réels d'un temps à l'autre). L'arrondi en 32 bits de chaque valeur est
  compensé sur la marche suivante : l'erreur ne s'accumule pas (moins d'une
  microseconde sur 4 000 temps, vérifié).
- Mesure d'attente : c'est le modèle de session (`export/session/`) qui la
  calcule (`leadIn`, tempo constant qui dure exactement le silence avant le
  premier temps, dans la plage demandée : donner `{ min: 20, max: 999 }` pour
  Live). L'écrivain la reçoit comme une marche comme les autres, sa signature
  comme un changement de signature.
- La vue du couloir de tempo (« Range Minimum / Maximum » de Live,
  `TempoAutomationViewBottom/Top`) est ajustée autour de la courbe.

## Les signatures rythmiques

- **Établi** (abletoolz, ableton-als « validé sur l'archive », set de Live
  11.1.5 avec 17 changements de signature) : enveloppe d'automation de
  `Mixer/TimeSignature`, points `<EnumEvent Id Time Value />`, premier point à
  −63 072 000. **Codage : `Value` = (numérateur − 1) + 99 × log2(dénominateur)**
  (4/4 = 201, 3/4 = 200, 6/8 = 302, 7/8 = 303, 1/4 = 198, 1/8 = 297 ; ces
  deux derniers relus dans le set de Live 11.1.5). `TimeSignature/Manual`
  porte la signature de départ.
- **Établi** (aide d'Ableton) : numérateur 1 à 99, dénominateur 1, 2, 4, 8 ou
  16. **Conséquence** : les signatures en /32 que permet Fabtice (1 à 64 sur
  4, 8, 16 ou 32) ne passent pas telles quelles : l'écrivain les refuse
  (`RangeError`), et la conversion depuis la session (`fromSession.ts`) les
  récrit sur 16 en gardant chaque barre de mesure à son temps : n pair →
  (n/2)/16, même durée ; n impair → n/16, deux fois plus long en noires, au
  tempo doublé (chaque temps reste à son instant) ; si le tempo doublé
  dépasse 999, k/16 avec k = n/2 arrondi en dessous, au tempo multiplié par
  2k/n (les barres à leur temps, les temps intérieurs un peu à côté : dit dans
  la fenêtre et le mode d'emploi). Les positions qui suivent se décalent sur la
  ligne de temps de Live (`quartersMap`) ; la numérotation des mesures ne change
  pas ; le fichier MIDI garde les signatures d'origine.
- **Non établi** : que Live accepte un changement de signature ailleurs que sur
  une barre de mesure de la signature précédente (le modèle de session les
  place toujours sur des barres).

## Les repères (accords et sections)

- **Établi** (sets de Live 10.1.9 et 12.0b16) :
  `LiveSet/Locators/Locators/Locator Id=…` avec `LomId`, `Time` (en temps),
  `Name`, `Annotation`, `IsSongStart`. Live ne les trie pas dans le fichier ;
  Fabtice les trie. L'attribut `Id` d'un repère existe depuis Live 10.1.0.
- Deux repères au même temps sont réunis en un seul (« A · Cm7 »), signalé
  (`locators-merged`) : rien n'établit que Live accepte deux repères au même
  endroit (l'interface ne le permet pas).
- Ce que les repères contiennent (accords seuls, section + accord, parties,
  modulations) se décide en phase 2.

## Différences entre Live 10, 11 et 12

D'après le recensement d'abletoolz et les sets de référence ; Fabtice n'écrit
que les colonnes 10 et 11 (Live 12 lit les deux).

| | Live 10 (`10.0_377`) | Live 11 (`11.0_433`) | Live 12 |
|---|---|---|---|
| `FileRef` | alias binaire `Data`, `RelativePathElement`, `SearchHint` | `Path` et `RelativePath` en texte, `OriginalFileSize`, `OriginalCrc` | idem 11 (+ `SourceHint` en 12.2) |
| Couleur | `ColorIndex` (piste décalée : 140 + indice) | `Color` (indice 0 à 69) | idem 11 |
| Scènes | `SceneNames/Scene Value=" 1"` | `Scenes/Scene` (nom, tempo, signature) | idem 11 |
| Actions de suivi d'un clip | `FollowTime`, `FollowActionA/B`, `FollowChanceA/B` (0 à 1) | `FollowAction` (…, chances 0 à 100) | idem 11 |
| Pistes | — | `TakeLanes`, `LinkedTrackGroupId`, `PreferredContentViewMode`, `IsContentSelectedInDocument` | + `TakeLanesListWrapper`, `IsTuned` |
| Appareils | — | `ModulationSourceCount`, `Pointee` | + modulations ComplexPro… |
| Piste principale | `MasterTrack` | `MasterTrack` | renommée `MainTrack` (sortie « AudioOut/Main ») |
| Clip maître du tempo | `IsSongTempoMaster` | `IsSongTempoMaster` | `IsSongTempoLeader` |

## Vérifications (tests)

- `ableton.test.ts` (toujours lancé ; la partie Python quand `python3` est
  là, comme sur la machine de fabrication Mac) : encodages, courbe de tempo
  (chaque temps de l'entrée à moins d'une microseconde), clip dont la fin est à
  la fin de l'audio, refus de ce que Live n'ouvrirait pas, et relecture du
  fichier par l'analyseur XML de Python (`check_structure.py`) pour les deux
  schémas : en-tête gzip de Live, racine exacte, ordre des éléments du set, des
  pistes, des clips et des `FileRef` comme Live les écrit, identifiants
  uniques et sous `NextPointeeId`, chaque `PointeeId` désigne quelque chose,
  une case par scène, clips non étirés avec repères de warp, enveloppes en
  marches sur des doubles-croches, repères triés.
- `ableton.reference.test.ts` (lancé à la main, voir son en-tête) : trois
  lecteurs indépendants.
  - **abletoolz** lit version, tempo, signatures, pistes et références de
    fichiers (trouvées dans le dossier du projet), applique la règle des
    repères de warp du chargeur de Live, et **parcourt chaque élément contre
    le schéma de Live lui-même** (`11.0_433` ou `10.0_377`) **et contre la
    version où le recensement l'a vu apparaître** : aucun membre non déclaré,
    rien de plus récent que 11.0.0 (ou 10.1.0) ; les seuls membres absents
    sont ceux que Live n'écrit pas non plus.
  - **dawtool** calcule le temps de chaque repère (un par temps de la grille)
    à travers sa réimplémentation de la ligne de temps de Live : écart maximal
    **0,13 µs** sur 109 temps (tempo variable à chaque temps, mesure d'attente,
    passage en 6/8 et en 7/8).
  - **ableton-als** : son validateur de sets générés ne trouve rien, ses règles
    d'identifiants et de cases par scène passent.
  - La somme de contrôle de Fabtice est identique à celle de `fastcrc`
    (CRC-16/UMTS) qu'utilise abletoolz.
- Comparaison de squelettes (hors dépôt) : le fichier `live10` a exactement la
  structure du set enregistré par Live 10.1.7, à l'exception des listes qui
  dépendent du contenu (repères, points, pistes de retour) et de
  `MetronomeTickDuration` (laissé de côté exprès).

## Établi, déduit, non établi — et confiance

| Point | Statut | Confiance |
|---|---|---|
| Conteneur gzip + XML, en-tête de Live | établi | très haute |
| Un Live ouvre les schémas plus anciens, refuse les plus récents | établi | très haute |
| Refus sur un élément ou attribut inconnu ; rien d'inconnu n'est écrit | établi + vérifié contre les schémas de Live | haute |
| Membres absents tolérés (on omet ce que Live omet) | établi (mesure dans Live 11.3.42, sets de Live) | haute |
| Identifiants, `NextPointeeId`, `PointeeId`, une case par scène | établi + vérifié | haute |
| Clip non étiré : repères en secondes, place en temps, repères de warp | établi (set de Live 10.1.7) | haute |
| `CurrentEnd` sous tempo variable | déduit | moyenne (sans conséquence si Live recalcule) |
| Tempo : enveloppe, premier point, marches à deux points, float32 | établi (sets de Live) | très haute |
| Tempo lu par doubles-croches | rétro-ingénierie (dawtool) | haute ; sans effet ici (marches sur doubles-croches) |
| Plage 20–999 BPM ; signatures 1–99 / 1, 2, 4, 8, 16 | aide d'Ableton (via recherche) | haute |
| Codage des signatures | établi (3 sources + set de Live) | très haute |
| Repères | établi (sets de Live) | très haute |
| Live 11/12 retrouve l'audio par `RelativePath` sans `Ableton Project Info` | **non établi** | moyenne ; haute avec `Path` (app Mac) |
| Live 10 : clips « manquants », retrouvés par la recherche | manquants : établi ; retrouvés : non établi | moyenne |
| Valeurs par défaut (vues, zoom, couleurs, routages « Ext. In ») | reprises des sets de Live | haute ; un écart ne gênerait que l'affichage |

**Confiance globale** : `live11` s'ouvrira probablement dans Live 11 et 12
(environ 7 chances sur 10 du premier coup, la principale inconnue étant un
détail de structure qu'aucun lecteur ne vérifie — une valeur que Live
n'attend pas) ; s'il s'ouvre, le tempo, les signatures, les repères et la
place des clips sont justes ; l'audio est retrouvé avec une confiance
moyenne à haute selon que `Path` est connu. `live10` s'ouvrira probablement
dans Live 10 avec les clips à retrouver. D'où « à l'essai », et le repli sûr
(fichier MIDI + pistes WAV) dans le même dossier.

## Le dossier de l'app (phase 2)

- **Nom** : « Titre (changements) Project », comme Live nomme le dossier d'un
  projet. Rien n'établit que Live en a besoin (il reconnaît un projet au
  sous-dossier `Ableton Project Info`, abletoolz), mais c'est la forme qu'un
  utilisateur de Live connaît, et les pistes sont là où Live range les
  fichiers importés d'un projet (`Samples/Imported/`). Pas de `Ableton Project
  Info` : son fichier `Project8_1.cfg` est un format binaire de Live, non
  écrit (pas inventé).
- **Contenu** : `Titre.als` (`live11`), `Titre (Live 10).als` (`live10`),
  `Samples/Imported/NN Nom.wav`, `Titre.mid`, `Lisez-moi.txt`.
- **Ce que les projets disent des fichiers** : chemin relatif ; taille et somme
  de contrôle de Live calculées sur le fichier écrit ; date (secondes Unix, à
  l'écriture) ; dans l'app Mac, le chemin complet du fichier (le dossier final
  est connu, « nom 2 » compris : `FolderTarget.fullPath`), dans `Path` (Live
  11/12) et `PathHint` (Live 10). Sur le web, le chemin complet est inconnu
  (l'archive est décompressée où l'utilisateur veut) : seul le chemin relatif,
  et le repli par le gestionnaire de fichiers de Live.
- **Repères** : les marqueurs du fichier MIDI, au même texte ASCII
  (« Theme 1 - [A] Bbmaj7 », « Cm7 »), et chaque tonalité (« Tonalité Bb »).
- **Session** : `buildSession(state, { tempoRange: { min: 20, max: 999 } })`.

### Relecture du dossier sorti de l'app (morceau de démonstration, +2 demi-tons, 90 %)

Le dossier produit par l'app web (`test:export-ableton`), décompressé, relu
hors du dépôt :

- **abletoolz** : versions 11.0.0 et 10.1.0 ; tempo 98,18 (la mesure
  d'attente) ; signatures 1/4 puis 4/4 ; quatre pistes audio ; les quatre
  fichiers « loads » (trouvés dans le dossier) avec leur taille et leur somme
  de contrôle ; parcours contre les schémas de Live : **aucun membre non
  déclaré, rien de plus récent que la version visée** (2 517 et 2 302 membres
  parcourus) ; seuls manquent ce que Live lui-même n'écrit pas.
- **dawtool** : les 25 repères d'accords et de sections, aux mêmes textes et
  dans le même ordre que les marqueurs du fichier MIDI (relu par `midi-file`),
  à **0,0005 ms** près au plus.
- **ableton-als** : son validateur ne trouve rien, pour les deux projets ;
  huit scènes, une case par scène, aucun identifiant en double.
- **fastcrc** : les sommes de contrôle écrites sont celles des fichiers.
- Le test Chromium vérifie en plus que chaque temps de la grille (99) tombe à
  moins d'une milliseconde sur la courbe de tempo relue des deux projets
  (écart maximal 0,0001 ms).

### Confiance mise à jour

Inchangée sur le format (environ 7 chances sur 10 que `Titre.als` s'ouvre du
premier coup dans Live 11 et 12) ; plus haute sur ce qui en dépend : les
fichiers écrits par l'app réelle passent les trois lecteurs indépendants, et
dans l'app Mac le chemin complet des fichiers est écrit, ce qui couvre
l'inconnue du dossier `Ableton Project Info`. Sur le web, l'audio dépend de
la recherche par chemin relatif (non établie) ou du gestionnaire de fichiers
de Live.
