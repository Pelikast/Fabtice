# Fabtice — l'interface (`app/`)

Sources de l'interface, communes à l'app web et à l'app Mac : Vite, React et
TypeScript strict, un petit magasin d'état (zustand), des feuilles de style
écrites à la main d'après `DESIGN.md` et la maquette (`web/maquette/`). Pas de
bibliothèque de composants.

Ce document s'adresse à ceux qui reprennent le code : il décrit l'organisation,
les commandes et les **contrats** entre l'écran, le moteur audio, l'app Mac et
le stockage.

## Commandes

À lancer dans `app/` (Node 22.12 ou plus récent) :

| Commande | Effet |
|---|---|
| `npm ci` | installe les dépendances (versions figées par `package-lock.json`) |
| `npm run dev` | serveur de développement, avec les en-têtes d'isolation (COOP/COEP) |
| `npm run build` | construit dans `../web/` : `index.html` et `assets/` seulement ; `maquette/` et `spikes/` restent intacts |
| `npm run build:desktop` | même construction dans `../desktop/ui/` (vidé avant) |
| `npm run preview` | sert le résultat de `build`, avec les en-têtes d'isolation |
| `npm run typecheck` | vérification des types |
| `npm test` | tests unitaires (Vitest, dans Node) |
| `npm run test:smoke` | après `build` : vérifications dans Chromium (Playwright préinstallé) et captures d'écran dans un dossier temporaire (`FABTICE_SMOKE_OUT` pour le choisir) |
| `npm run test:import` | après `build` : import des cinq formats (sélecteur et glisser-déposer), rouverture du projet après rechargement, autosauvegarde, stockage en échec, import par lien contre un faux `window.fabtice`, coût d'un morceau de cinq minutes (captures dans `FABTICE_IMPORT_OUT`) |
| `npm run test:timeline` | après `build` : vérifications de la frise dans Chromium (formes d'onde, grille, boucle, défilement, zoom, suivi, téléphone, morceau de dix minutes) |
| `npm run test:engine` | après `build` (et, en option, `build:desktop`) : mesures du vrai moteur audio dans Chromium (tonalité, tempo, boucle, métronome, limiteur, charge) |

Les fichiers audio de test de `test:import` sont dans `tests/fixtures/` (quelques
dizaines de ko, tons synthétiques ; `make_fixtures.py` dit comment ils sont faits ;
le m4a est `desktop/test/fixtures/tone-dash.m4a`).

`?moteur=factice` force le moteur factice (aucun son) ; les tests d'interface
(`test:smoke`, `test:import`) l'utilisent. `?demo` à la fin de l'adresse (`http://localhost:5173/?demo`) ouvre un morceau
synthétique de quatre pistes, généré dans le code, sans fichier audio ;
`?demo&vue=grille` ouvre directement l'affichage Grille d'accords. En mode
démo, `window.__fabtice` donne accès au magasin, au moteur et aux actions ;
`?debug` donne le même accès sans morceau de démonstration (tests du navigateur).
Le morceau de démonstration n'est jamais gardé sur l'appareil.

Les fichiers construits (`web/index.html`, `web/assets/`, `desktop/ui/`) ne
sont pas versionnés. Netlify lance `npm ci && npm run build` dans `app/`.

## Organisation

```
src/
  main.tsx            démarrage : langue, préférences, branchement du moteur, ?demo,
                      réouverture du morceau gardé, vérification de l'outil d'import
  model/              types des données (projet, pistes, carte de tempo, document)
  grid/               calculs de grille, purs et testés : temps <-> mesures,
                      traits de mesure et de sous-grille, magnétisme, boucles,
                      clics du métronome, formats d'affichage, « Battre le tempo »
  store/              état de l'app (store.ts), actions (actions.ts), valeurs
                      dérivées (derived.ts), préférences, document de projet
  audio/              contrat du moteur (AudioEngine.ts), vrai moteur
                      (WorkletEngine.ts + worklet/), moteur factice
                      (MockEngine.ts), fabrique (index.ts), branchement au
                      magasin (connect.ts), registre de l'audio décodé,
                      stockage 16 bits partagé (storage.ts), binaire wasm
                      de Signalsmith et ses licences (wasm/)
  timeline/           TOUT ce qui se dessine le long du temps : formes d'onde,
                      grille, règle, boucle, tête de lecture, défilement, zoom
  components/         l'écran : barre du haut, en-têtes de pistes, transport,
                      outils d'affichage, fenêtres, affichage Grille d'accords
  ui/                 boucle d'animation, icônes, clavier, glisser-déposer
  import/             import d'un fichier ou d'un lien : lecture, décodage à 48 kHz
                      (Web Audio, lecteur AIFF et rééchantillonnage à nous), limites,
                      outil d'import de l'app Mac, contrôleur de la fenêtre
  platform/           l'app Mac vue depuis la page (window.fabtice)
  storage/            projet courant sur l'appareil : contrat, IndexedDB, gardien
                      (autosauvegarde), réouverture au lancement
  i18n/               tous les textes (fr.ts) et t()
  demo/               le morceau synthétique de ?demo
  styles/             jetons, base, une feuille par zone, téléphone
  assets/fonts/       polices (woff2) et leurs licences OFL
tests/                vérifications dans Chromium (smoke.mjs, timeline.mjs, import.mjs),
                      fichiers audio de test (fixtures/) et petit serveur
```

## Règles de fond

- **La position de lecture ne passe jamais par React.** Les vues la lisent avec
  `getEngine().getPosition()` dans `useFrame()` / `onFrame()`
  (`ui/frameLoop.ts`, une seule boucle `requestAnimationFrame` pour toute
  l'app) et écrivent directement dans le DOM ou un canvas. Exemple :
  `PositionReadout` dans `components/Transport.tsx`.
- **Tout changement d'état passe par `store/actions.ts`.** Les réglages
  (tonalité, tempo, boucle, mixage, métronome, carte de tempo) vont au magasin
  et `audio/connect.ts` les transmet au moteur ; les commandes de transport
  (lecture, pause, déplacement) vont directement au moteur, dont l'état revient
  au magasin (`transport.engine`).
- **Temps source.** Toutes les positions, bornes de boucle et clics sont en
  secondes dans l'enregistrement d'origine, quel que soit le tempo joué.
- **Textes.** Tous dans `i18n/fr.ts`, lus avec `t('clé', { param })`. Code et
  commentaires en anglais. Vocabulaire : « piste », « instrument »,
  « tonalité ».
- **Design.** `DESIGN.md` fait référence : une seule chose rouge (lecture et
  tête de lecture), filets de 1 px, grain du papier, cibles de 40 px,
  140 ms / 220 ms, `prefers-reduced-motion`. Les classes reprennent celles de
  la maquette.

## Modèle de données (`model/`, `store/store.ts`)

- `Project` : identifiant, titre, source (`file`, `link`, `demo`), durée, taux
  d'échantillonnage (48 kHz).
- `Track` : identifiant, nom, rôle de couleur (`morceau`, `voix`, `batterie`,
  `basse`, `guitare`, `piano`, `vents`, `autres` → `var(--<rôle>)`), muet,
  solo, volume, et une référence `AudioRef` vers son audio. Les échantillons
  eux-mêmes sont dans `audio/registry.ts` (`getAudio(track.audio.id)`).
- `TempoMap` (`model/tempoMap.ts`) : segments de tempo constant (temps, temps
  musical, BPM) et changements de métrique (mesure, numérateur, dénominateur).
  Prévue pour un tempo variable ; le lot 1 n'en crée qu'un segment, saisi à la
  main. Le temps 0 est le premier temps de la mesure 1. **Avant le premier
  temps (levée)**, le premier segment et la première métrique se prolongent :
  la mesure d'indice −1 s'affiche « 0 », la −2 « −1 », etc. (numéro affiché =
  indice + 1).
- `LoopState` (zone et marche/arrêt), `PlaybackSettings` (demi-tons −12…+12,
  cents −50…+50, tempo en rapport 0,25…2, métronome), `ViewSettings`
  (affichage, échelle en pixels par seconde, hauteur de piste, Auto,
  sous-grille 1/2/4/8, triolets, magnétisme, suivi), `AppSettings` (notation
  des accords mineurs).
- Le tempo cible affiché vient de `targetBpm()` (`store/derived.ts`) ; tant que
  le tempo du morceau n'est pas saisi, le transport parle en pourcentage.

## Contrats pour la suite

### Moteur audio — `src/audio/AudioEngine.ts`

Interface `AudioEngine` : `loadTracks`, `addTrack`, `removeTrack`, `clear`,
`play` (à appeler dans le geste de l'utilisateur la première fois), `pause`,
`seek`, `getPosition` (position **entendue**, appelée à chaque image : sans
allocation), `getDuration`, `setLoop`, `setTransposition(demi-tons, cents)`,
`setTempoRatio`, `setTrackMix`, `setMetronome`, `setClickTrack` (temps des
clics, calculés par `grid/lines.ts#metronomeClicks`), `on('state' | 'ended' |
'error')`, `dispose`. Pistes en Float32 par canal, à 48 kHz
(`ENGINE_SAMPLE_RATE`).

`MockEngine` l'implémente avec une horloge (aucun son) : avancée au rapport de
tempo, boucle, arrêt en fin de morceau, et `snapshot()` pour vérifier ce qu'il
a reçu. `createAudioEngine()` (`src/audio/index.ts`) renvoie le **vrai moteur**
(`WorkletEngine`) dans un navigateur, le moteur factice avec `?moteur=factice`
et hors navigateur (tests Node). Un navigateur qui ne peut pas faire tourner le
vrai moteur (pas d'AudioWorklet, pas d'isolation COOP/COEP donc pas de
`SharedArrayBuffer`) ne retombe **jamais** en silence sur le factice :
`loadTracks()` rejette, l'état passe à `error` avec le code `unsupported`
(texte prévu : `engine.errorUnsupported`, à brancher dans `Transport.tsx`).

#### Le vrai moteur (`WorkletEngine`)

- **Un seul AudioWorklet pour toutes les pistes** (`worklet/processor.ts`),
  moteur d'étirement **Signalsmith Stretch** seul (version sans SIMD, mesurée
  comme la bonne) : c'est la préécoute en direct. Rubber Band (rendu
  « Appliquer » et export) viendra au lot 3, hors de ce moteur.
- **Contexte forcé à 48 kHz** (`ENGINE_SAMPLE_RATE`) quel que soit le réglage de
  la machine ; créé (suspendu) par `loadTracks()`, **repris à l'intérieur de
  `play()`**, appelé de façon synchrone avant tout `await` : `play()` doit donc
  partir du geste de l'utilisateur. Après une pause le contexte est remis en
  sommeil au bout de 0,4 s (la tablette ne reste pas allumée) ; `play()` le
  réveille. Une interruption du système (appel, autre app) ramène le moteur à
  `ready` à la position où il était.
- **Mémoire** (conception du prototype) : pistes en blocs de 16 bits de 32 768
  images dans des `SharedArrayBuffer`, pistes mono (canaux identiques à un pas
  de 16 bits près) stockées une seule fois. Un morceau stéréo de 5 minutes
  pèse environ 58 Mo par piste dans le moteur, **en plus** des `Float32` du
  registre (`registry.ts`, 115 Mo par piste stéréo de 5 minutes) et des
  instances Signalsmith (environ 6 Mo de mémoire wasm par piste).
- **Boucle** : repli côté entrée avec fondu enchaîné de 20 ms ; l'étireur voit
  un signal continu (pas de clic, pas de dérive). Hors de la boucle (après un
  déplacement au-delà de sa fin), la lecture va jusqu'à la fin du morceau.
- **Métronome** : les clics viennent de `setClickTrack()` (temps source) ; ils
  ne sont pas étirés, et sont posés en sortie en tenant compte du retard du
  moteur (environ 150 ms, fixe, donc toutes les pistes transposées ou non
  restent alignées avec les clics).
- **Position** : `getPosition()` lit un bloc partagé que le worklet écrit à
  chaque quantum (128 images) : position **entendue** (retard du moteur et du
  limiteur retirés), prolongée jusqu'à l'image courante d'après l'horloge audio.
  Aucune allocation, aucun message. Après un déplacement ou un démarrage elle
  montre la cible tout de suite, puis avance (jamais en arrière). Hors lecture,
  c'est la position mémorisée côté page.
- **Limiteur de sécurité** sur le mélange : retard de 2 ms, signal intact (gain
  exactement 1) sous environ −1 dBFS (0,891), baisse de gain progressive,
  anticipée, au-dessus ; jamais d'écrêtage dur.
- **Pause** avec un fondu de 8 ms ; **fin de morceau** : événement `ended` une
  fois tout entendu, moteur `ready` à la fin ; `play()` repart de 0.
- Les pistes en sourdine ne sont pas calculées (la charge baisse).
- Hors contrat, utiles aux tests : `diagnostics()` (charge, pistes actives,
  modèle de retard), `memoryBytes()`, `debugNode`, `debugContext`.

**Fichiers servis par la construction.** `assets.ts` importe le worklet avec
`?worker&url` (Vite le construit en un fichier autonome `assets/processor-*.js`,
sans `import`) et le wasm avec `?url` (`assets/signalsmith-nosimd-*.wasm`),
tous deux relatifs au module (donc valables avec la base `./` de l'app Mac).
Le wasm est lu avec `fetch` puis ses **octets** sont postés au worklet : un
`WebAssembly.Module` ne peut pas être posté à un AudioWorklet dans Chromium.
Les textes des licences MIT de Signalsmith sont copiés dans `assets/`. Le
binaire a été compilé à partir de `web/spikes/lecteur/engines/src/signalsmith.cpp`
(voir `src/audio/wasm/SOURCES.md`) ; ne pas le recompiler sans nouvelles mesures.

**Tests.** `npm test` couvre le cœur dans Node avec le vrai wasm
(`worklet/*.test.ts`, `storage.test.ts`) ; `npm run test:engine` mesure le
moteur complet dans Chromium (enregistreur branché sur la sortie du worklet).

### App Mac — `src/platform/desktopBridge.ts`

Types exacts de `window.fabtice` tel que l'expose `desktop/src/preload.js`
(`systemInfo`, `ytdlpStatus`, `ytdlpCheck`, `ytdlpInstall`, `extract`,
`copyText`, `onYtdlpProgress`, `onExtractProgress`). `getDesktopBridge()`
renvoie l'objet dans l'app Mac, `null` sur le web ; la fenêtre « Nouveau
morceau » n'affiche le champ de lien que s'il est présent. Si l'API de l'app
Mac change, changer ces types avec elle.

L'interface construite (`desktop/ui/`) charge des modules JavaScript et a
besoin de l'isolation (COOP/COEP) : l'app Mac doit la servir par un protocole
qui envoie ces en-têtes, pas par `file://`.

### Stockage du projet — `src/storage/`

Un seul projet à la fois (lot 1) : le document du projet courant
(`ProjectDocument`, `model/document.ts`, produit par
`store/document.ts#toProjectDocument`) et les **octets audio d'origine** (le mp3,
le m4a… tel qu'importé). Le PCM décodé n'est jamais gardé : il est recalculé à
chaque ouverture, de façon déterministe. Les préférences de l'utilisateur
(notation, suivi, sous-grille, magnétisme) restent dans `localStorage`
(`store/preferences.ts`).

| Fichier | Rôle |
|---|---|
| `ProjectStorage.ts` | le contrat (`replaceCurrent`, `saveCurrent`, `loadCurrent`, `loadAudio`, `clearCurrent`, `requestPersistence`…) et `StorageError` (`unavailable`, `quota`, `corrupt`, `io`) |
| `indexedDb.ts` | l'implémentation : base `fabtice` v1, deux magasins, `project` (clé `current` : `{ schema, document }`) et `audio` (une entrée par `AudioRef.id` : `{ bytes, mimeType, fileName }`). `replaceCurrent` réécrit les deux dans **une seule transaction** : en cas d'échec, l'ancien projet reste entier. Les transactions sont validées tout de suite (`commit()`), sinon une page qui se ferme perdrait l'écriture |
| `documentFormat.ts` | lecture sûre : version du document (`MIGRATIONS`, vide pour l'instant ; une version **plus récente** est ignorée, jamais écrasée à la lecture), contrôle de la forme (sinon `corrupt`) ; `STORAGE_SCHEMA` pour l'enveloppe |
| `keeper.ts` | le gardien : `keepNewProject()` (à appeler quand un nouveau morceau est ouvert et jouable : demande le stockage persistant la première fois, écrit audio et document ensemble, remplace l'ancien projet) puis autosauvegarde de tout changement du document, **différée** (700 ms de calme, 5 s au plus pendant un geste continu), une écriture à la fois, jamais attendue par l'écran ; `flush()` à la fermeture (`pagehide`, onglet masqué). Rien n'est écrit pour un morceau dont l'audio n'est pas encore gardé, ni pour le morceau de démonstration |
| `restore.ts` | lancement : « Ouverture de « titre »… » (la fenêtre n'apparaît que si cela dure plus de 250 ms), décodage, `restoreProject()` (mêmes identifiants de projet, de piste et d'audio). Au moindre échec (audio absent, document abîmé, décodage, moteur) : le projet gardé est **oublié**, la fenêtre s'ouvre avec une phrase calme. Un marqueur dans `localStorage` pendant la réouverture évite la boucle si la page est tuée par le système (manque de mémoire sur téléphone) : au lancement suivant, pas de nouvel essai |
| `memoryStorage.ts` | même contrat en mémoire, avec pannes simulées (tests) |

**Quand l'appareil refuse** (navigation privée, stockage bloqué ou plein),
l'app continue de fonctionner : `ui.storageNotice` (`'unavailable'` ou `'full'`)
affiche une phrase calme, une seule fois (`components/StorageNotice.tsx`), et
l'ancien projet gardé est lui aussi oublié pour ne pas être rouvert à tort.

**Ce que la version finale doit respecter.** Après un import, la mémoire ne
garde que le PCM décodé (environ 22 Mo par minute en stéréo, dans
`audio/registry.ts`, lu par la frise et par le moteur) : les octets d'origine
sont libérés dès qu'ils sont écrits dans IndexedDB. Un nouveau morceau remplace l'ancien seulement une fois ouvert et jouable
(`openImportedPiece` résolu). Toute nouvelle donnée du projet doit entrer dans
`ProjectDocument` (et `MIGRATIONS` si le format change), sinon elle n'est pas
gardée.

### Import — `src/import/`

`importFromFile(file, { onProgress, signal })` et `importFromLink(lien, pont,
{ onProgress, signal })` rendent un `ImportedPiece` (titre, source, octets
d'origine, audio décodé à 48 kHz, une ou deux voies) ou rejettent avec une
`ImportError` (code → message dans `i18n/fr.ts`, `import.error.<code>`).

- **Fichier** : mp3, wav, aiff, m4a, flac. Lecture par morceaux avec progression
  (`reading`), puis `decode.ts` (`decoding`) : l'audio est décodé par Web Audio sur
  un `OfflineAudioContext` à 48 kHz (aucun geste de l'utilisateur requis) ;
  l'AIFF (non lu par Chromium) passe par `aiff.ts` (AIFF et AIFF-C, 8, 16, 24 et
  32 bits, « sowt », flottants) et `resample.ts` (polyphase, fenêtre de Kaiser).
  Plus de deux voies : mixage 5.1 vers stéréo, sinon les deux premières. Le
  format se reconnaît aussi au contenu (`detect.ts`), qui lit la durée dans
  l'en-tête quand c'est possible pour refuser un morceau trop long **avant** de
  décoder.
- **Limites** (`limits.ts`) : 20 minutes (comme le lien) et 256 Mo par fichier ;
  au-delà, `too-long` et `too-large`. Un fichier vide ou sans son : `empty-audio` ;
  abîmé ou pas vraiment audio : `decode-failed`. Raison d'être de ces limites :
  stéréo 20 minutes = 460 Mo décodés, plus la copie du fichier.
- **Lien** (app Mac seulement, par `getDesktopBridge()`), dans cet ordre : état de
  l'outil (`ytdlpStatus`) ; s'il manque, installation avec progression et une
  phrase d'explication (`installing`) ; extraction (`fetching-info`, puis
  `downloading` en pourcentage) ; si la réponse est `needsYtdlp`, installation et
  **une** nouvelle tentative ; octets décodés comme un fichier. Les refus du pont
  (direct, plus de 20 minutes) montrent sa phrase française sous le message
  général ; les autres échecs n'affichent rien de technique. Rien ne change à la
  façon d'appeler yt-dlp : on n'appelle que le pont.
- **Annulation** : l'extraction et le téléchargement de l'outil ne peuvent pas
  être interrompus (le pont n'a pas de moyen de le faire). La fenêtre ne propose
  « Annuler » que pour la lecture et le décodage (`isCancellablePhase`), sinon elle
  dit « Cette étape ne peut pas être interrompue ». Un seul import à la fois : une
  seconde demande (y compris un fichier déposé) est ignorée.
- **Mise à jour de l'outil** : au lancement (`checkToolUpdate`), si `ytdlpCheck`
  signale une version plus récente d'un outil installé, la fenêtre « Nouveau
  morceau » propose discrètement « Mettre à jour » (`ui.toolUpdate`) ; jamais de
  fenêtre bloquante.
- **Après le décodage**, `controller.ts` ouvre le morceau (`openImportedPiece`, une
  piste « morceau ») puis le fait garder (`keepNewProject`).

### Frise du temps — `src/timeline/`

Tout ce qui se dessine le long du temps, dans l'affichage Pistes : règle
(courbe de tempo, numéros de mesure, bande de boucle), formes d'onde, grille
et sous-grille, voile de boucle, tête de lecture, défilement, zoom, Auto,
suivi de la tête de lecture et interactions. L'accord (rang « Accords » de la
règle) n'est pas dessiné au lot 1 (`rulerRows({ hasChords: false })`).

**Mise en page.** La frise remplit la colonne de droite de `.plan`, dans le
défileur vertical `.travail`, qui ne défile **jamais** horizontalement : le
défilement horizontal est virtuel. Le commentaire en tête de `Timeline.tsx`
donne le contrat (hauteurs des rangs par `rulerRows()`, voies de
`view.trackHeight`, règle collée en haut).

**Fichiers.**

| Fichier | Rôle |
|---|---|
| `Timeline.tsx`, `timeline.css` | squelette React (règle, voies, bande, voile, tête, barre de défilement) ; React ne rend rien d'autre |
| `controller.ts` | cœur impératif : vue (`t0` = temps au bord gauche, `pps` = pixels par seconde), dessin, souris, toucher, molette, suivi, Auto |
| `drawing.ts` | dessin des canvas : grille, forme d'onde, règle (fonctions sans état) |
| `geometry.ts` | calculs purs et testés : zoom, Auto, suivi, éclaircissement des mesures, sélection de mesures |
| `peaks.ts`, `peakCache.ts` | pyramide de crêtes multi-résolution, calculée par tranches de 3 ms, mise en cache |
| `layout.ts` | hauteurs des rangs, partagées avec la colonne des en-têtes |

**Couches de dessin.** Règle : fonds des rangs (DOM), bande de boucle (DOM,
laiton plein), un canvas (courbe de tempo, traits et numéros de mesure), tête
de lecture (DOM). Voies : un canvas de grille sous toutes les voies (mesures à
26 % d'encre, sous-grille `--trait-fin`), un canvas par voie pour la forme
d'onde (l'opacité à 22 % d'une piste coupée est une transition CSS), le voile
de boucle (DOM) et la tête de lecture (DOM). Les canvas ont la taille de la vue
(nets à tout rapport de pixels) et ne sont redessinés que si ce qu'ils
montrent change : défilement, zoom, grille, pistes, boucle, taille. La tête de
lecture se déplace par `transform` dans la boucle d'animation commune, sans
aucun redessin ni rendu React.

**Formes d'onde.** `getAudio()` est lu une seule fois par piste pour bâtir la
pyramide (une case de 64 échantillons, puis des niveaux ×4 ; crête et énergie
par case). Le calcul se fait par tranches de 3 ms entre deux images, sans copie
de l'audio ; la forme d'onde se remplit de la gauche vers la droite. Deux tons
comme dans la maquette : crêtes à 38 %, corps (RMS) à 95 %. Chaque piste est
affichée à son propre niveau (sa crête la plus forte atteint la hauteur de la
voie, gain limité à 8) ; la courbe d'affichage est une puissance 0,8.

**Interactions.**

| Geste | Effet |
|---|---|
| clic (sans glisser) sur une voie ou dans la rangée Mesures | `seek()`, calé par `snapTime()` si le magnétisme est actif |
| glisser à la souris sur une voie ou dans Mesures | sélection de mesures entières, `setLoopRegion(loopFromBars(...))` en direct ; au relâchement, `enterLoop()` amène la tête de lecture au début de la boucle si elle était en dehors |
| glisser un bord de la boucle (règle ou voie) | ajuste la boucle mesure par mesure (au moins une mesure) ; même `enterLoop()` au relâchement |
| glisser dans la rangée Tempo | fait défiler (comme le doigt) |
| molette horizontale, balayage au pavé tactile | défilement horizontal |
| Maj + molette | défilement horizontal |
| Ctrl/⌘ + molette, pincement au pavé tactile (Safari : événements `gesture*`) | zoom horizontal autour du pointeur |
| barre de défilement fine sous les voies | glisser la poignée, cliquer la règle (une page), flèches, Début, Fin au clavier |
| tactile : un doigt sur les voies | défile (avec inertie) ; un tapotement place la tête |
| tactile : un doigt dans Mesures | sélectionne des mesures ; un tapotement place la tête |
| tactile : deux doigts | zoom horizontal autour des doigts |

La molette verticale reste au défileur vertical des pistes. Le zoom par les
curseurs, la molette ou le pincement garde en place la tête de lecture si elle
est visible, sinon le milieu de la vue.

**Auto** (`view.auto`) : tant qu'il est actif, la frise ajuste le morceau à la
largeur et les pistes à la hauteur sans débordement (`fitToView()`, bornes de
`view/zoom.ts`) et l'écrit par `applyAutoFit()` ; recalcul au
redimensionnement et quand les pistes changent. Sur téléphone (moins de
760 px), Auto est éteint et une mesure fait 86 px (`PHONE_BAR_WIDTH`) tant que
l'utilisateur n'a pas zoomé.

**Suivi** (`view.follow`) : en lecture, la page se tourne quand la tête atteint
le bord droit (28 px) ou revient en arrière (boucle), la tête se plaçant à 12 %
de la largeur. Le suivi attend pendant un geste, une inertie, et tant que
l'utilisateur a fait défiler la tête hors de la vue ; il reprend quand elle
redevient visible, à la lecture suivante ou après un déplacement. Suivi
éteint : la vue ne bouge jamais d'elle-même.

**Éclaircissement.** Quand les traits de mesure seraient à moins de 6 px, on
n'en garde qu'une sur 2, 4, 8… ; les numéros demandent 30 px et s'éclaircissent
de même (mesures 1, 5, 9… à une sur quatre). La sous-grille disparaît sous 5 px
(`isSubGridVisible`).

**Pour les tests et le débogage.** La racine `.frise` publie `data-t0`,
`data-pps`, `data-peaks` (`ready` quand toutes les crêtes sont calculées) et
`data-flush` (nombre de redessins, coût total et pire coût en ms).
`npm run test:timeline` (après `build`) lance les vérifications dans Chromium
(`TIMELINE_ONLY=desktop|stress|phone` pour une seule partie ;
`FABTICE_TIMELINE_OUT` pour le dossier des captures).

## Saisie de la grille (lot 1, sans analyse)

Le clic sur « Tempo » en tête de règle ouvre un panneau : tempo du morceau
(30–300), « Battre le tempo », temps par mesure (2–7, à la noire), « Premier
temps ici » (le premier temps de la mesure 1 à la position de lecture).
Tout passe par `setManualGrid()` et `setDownbeatAtPlayhead()`.
