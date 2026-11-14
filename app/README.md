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
| `npm run test:import` | après `build` : import des cinq formats (sélecteur et glisser-déposer), rouverture du projet après rechargement (dont des morceaux de **taille réelle**, 0,5 à 32 Mo, dans un profil de navigateur persistant), morceau gardé mais impossible à rouvrir (offre « Rouvrir » / « Oublier »), autosauvegarde, stockage en échec, import par lien contre un faux `window.fabtice`, coût d'un morceau de cinq minutes (captures dans `FABTICE_IMPORT_OUT`) |
| `npm run test:timeline` | après `build` : vérifications de la frise dans Chromium (formes d'onde, grille, boucle, défilement, zoom, suivi, téléphone, morceau de dix minutes) |
| `npm run test:engine` | après `build` (et, en option, `build:desktop`) : mesures du vrai moteur audio dans Chromium (tonalité, tempo, boucle, métronome, limiteur, charge) |
| `npm run test:analysis` | après `build` : le **vrai** analyseur dans Chromium (télécharge les outils d'analyse depuis Hugging Face : réseau nécessaire). Le morceau d'essai du prototype passe par l'interface et le résultat est comparé à ce qu'on en sait et à ce que le prototype trouve ; deuxième usage sans téléchargement ; annulation (panneau, nouvel import, pendant le téléchargement) ; réseau absent ; téléchargement abîmé (refusé, repris, refusé pour de bon) ; reprise d'un téléchargement interrompu ; lecture pendant l'analyse ; morceau de 4 minutes ; chiffres de durée, de mémoire et de plus longue tâche du fil principal. `FABTICE_ANALYSIS_ONLY=<nom>` n'en lance qu'une partie |
| `npm run test:chart` | après `build` : la grille d'accords comparée à la maquette (même balisage des accords, mêmes tailles, sections, boucle, mesure en cours, instruments, états vides et « analyse en cours », téléphone), panneaux de corrections et d'accordage ; captures de l'app et de la maquette côte à côte dans `FABTICE_CHART_OUT` |

Les fichiers audio de test de `test:import` sont dans `tests/fixtures/` (quelques
dizaines de ko, tons synthétiques ; `make_fixtures.py` dit comment ils sont faits ;
le m4a est `desktop/test/fixtures/tone-dash.m4a`).

`?moteur=factice` force le moteur factice (aucun son) ; les tests d'interface
(`test:smoke`, `test:import`, `test:chart`) l'utilisent. `?demo` à la fin de l'adresse (`http://localhost:5173/?demo`) ouvre un morceau
synthétique de quatre pistes, généré dans le code, sans fichier audio, **déjà
analysé** : tempo qui bouge un peu à partir de la mesure 5, grille d'accords de
la maquette (un accord douteux mesure 12, deux accords mesure 15), sections A,
B, A « posées à la main », enregistrement accordé un peu haut (+18 cents).
Variantes :

| Adresse | Effet |
|---|---|
| `?demo&vue=grille` | ouvre directement l'affichage Grille d'accords |
| `?demo&analyse=lente` | pas encore analysé : l'analyse (factice) tourne lentement, avec un premier « téléchargement » des outils |
| `?demo&analyse=instant` | pas encore analysé : l'analyse (factice) se fait aussitôt |
| `?demo&analyse=echec` | l'analyse (factice) échoue |
| `?demo&analyse=aucune` | le morceau du lot 1 : 110 BPM fixe saisi à la main, pas d'analyse automatique (les vérifications de la frise s'en servent) |

En mode démo, `window.__fabtice` donne accès au magasin, au moteur, aux actions
et, sous `lot2`, aux actions d'analyse, de grille et d'harmonie ; `?debug` donne
le même accès (sans `lot2`) sans morceau de démonstration (tests du navigateur).
Le morceau de démonstration n'est jamais gardé sur l'appareil.

**Quel analyseur ?** Dans un navigateur, le **vrai** analyseur est celui par
défaut. Le factice (`MockAnalyzer`, l'extrait du prototype) sert dans Node (tests
unitaires), dans un navigateur qui ne sait pas faire tourner un worker, et sur les
adresses des suites de tests et de la démo : `?analyse=factice|lente|instant|echec`,
`?demo` (qui pose le sien), et les pages de test, c'est-à-dire `?moteur=factice` ou
`?debug`, **sauf** `?analyse=reel`, qui demande le vrai (c'est ce que font
`test:analysis` et le test de bout en bout de l'app Mac). Raison : les suites
existantes importent des fichiers à longueur de temps et ne doivent ni télécharger
des outils ni charger la machine. `?modele=complet` choisit le grand réseau
Beat This! (83 Mo) au lieu du léger (10 Mo), pour comparer.

Les fichiers construits (`web/index.html`, `web/assets/`, `desktop/ui/`) ne
sont pas versionnés. Netlify lance `npm ci && npm run build` dans `app/`.

## Organisation

```
src/
  main.tsx            démarrage : langue, préférences, branchement du moteur, ?demo,
                      réouverture du morceau gardé, vérification de l'outil d'import
  model/              types des données (projet, pistes, carte de tempo, document,
                      harmonie, résultat d'analyse, corrections à la main)
  grid/               calculs de grille, purs et testés : temps <-> mesures,
                      traits de mesure et de sous-grille, magnétisme, boucles,
                      clics du métronome, formats d'affichage, « Battre le tempo »,
                      carte de tempo à partir de temps analysés, corrections
                      (× 2, ÷ 2, premier temps), courbe de tempo par mesure
  harmony/            accords et tonalités, purs et testés : vocabulaire, lecture
                      (saisie et étiquettes Harte), orthographe par degré,
                      transposition, instruments ; composant <ChordSymbol>
  analysis/           contrat de l'analyseur, analyseur factice, vrai analyseur
                      (fabtice.ts + worker/ + engine/ + models/), lancement
                      automatique et état (runner.ts), progression fine
  chart/              affichage Grille d'accords : mise en page pure (layout.ts),
                      corrections pures (edits.ts), feuille, mesure en cours
  export/             représentation de la grille pour l'export, contrat iReal Pro,
                      impression
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
tests/                vérifications dans Chromium (smoke.mjs, timeline.mjs, import.mjs, chart.mjs),
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
  sous-grille 1/2/4/8, triolets, magnétisme, suivi, instrument de la grille), `AppSettings` (notation
  des accords mineurs).
- Le tempo cible affiché vient de `targetBpm()` (`store/derived.ts`) ; tant que
  le tempo du morceau n'est pas saisi, le transport parle en pourcentage.

### Lot 2 : analyse, corrections, harmonie (document version 2)

Principe : **ce que l'analyse a produit et ce que l'utilisateur a changé sont
rangés à part**, si bien que « pas encore analysé », « analysé » et « corrigé à
la main » se distinguent toujours, et qu'une nouvelle analyse n'écrase jamais
une correction sans qu'on le demande. Tout est stocké **en temps source
(secondes)**, jamais en mesures : un accord ou une section reste sur la musique
quand on corrige la grille ; l'affichage le pose sur le temps (accord) ou la
barre de mesure (section) les plus proches de la grille en vigueur.

| Donnée | Où | Contenu |
|---|---|---|
| Résultat d'analyse | `AppState.analysis`, `model/analysis.ts#AnalysisResult` | tel qu'il est sorti, jamais modifié : temps analysés (`beats.times`, indice du premier temps, métrique et sa sûreté), tonalité (tonique, mode, sûreté, autres lectures), accordage (écart à La 440 en cents, sûreté), accords (`time`, accord ou `null` pour N.C., sûreté, `doubtful`, autres lectures), analyseur et modèles, date. `null` = pas encore analysé |
| Grille en vigueur | `AppState.tempoMap` (inchangé, lu par le moteur et la frise) | son `origin` dit qui l'a faite : `default` (personne), `manual` (panneau du lot 1, tempo fixe), `analysis` (temps analysés, un segment par temps : `grid/beats.ts#tempoMapFromBeats`), `corrected` (temps analysés corrigés à la main : × 2, ÷ 2, premier temps, métrique). Les temps analysés restent dans le résultat : « Revenir à l'analyse » est toujours possible |
| Corrections | `AppState.corrections`, `model/corrections.ts#Corrections` | tonalité choisie (`key`, `null` = celle de l'analyse), accordage corrigé (`tuningCents`), offre d'accordage refusée, accords écrits à la main (`chords` : temps et accord), plages réécrites à la main (`handSpans` : là, l'analyse est masquée), lettres de section (`sections` : temps de la barre et texte) |
| Instrument | `view.instrument` (`ut`, `sib`, `mib`) | affichage seul, gardé avec le morceau |
| État de l'analyse | `AppState.analysisRun` (non gardé) | `idle`, `running` (projet, étape), `error` (code). La progression fine (fraction, octets téléchargés) est dans un petit magasin à part, `analysis/progress.ts`, pour ne pas réveiller tout l'écran (ni l'autosauvegarde, qui attend que le magasin se calme) plusieurs fois par seconde |

Un accord (`model/harmony.ts#ChordSymbol`) : fondamentale (classe de hauteur
0–11, sans orthographe), qualité (les quatorze du décodeur du prototype, mêmes
noms, plus `7sus4` et `aug7`), extensions (`b9`, `9`, `#11`, `13`, `alt`… :
suggestions quand elles viennent de l'analyse), basse. L'orthographe se fait à
l'affichage, par degré dans la tonalité (`harmony/pitch.ts`) : tonalités en
bémols en bémols, en dièses en dièses, ♭2 ♭3 ♯4 ♭6 ♭7 pour les degrés
chromatiques, septième diminuée de passage en degré haussé (C, C♯°7, Dm7), jamais
de double altération ni de C♭, F♭, E♯, B♯ (le nom simple à la place).

Les accords sont gardés **en Ut, dans la tonalité d'origine**. La transposition
(demi-tons du transport) et l'instrument (Si♭ : une seconde majeure au-dessus ;
Mi♭ : une sixte majeure au-dessus) ne servent qu'à l'affichage et à l'export :
`harmony/display.ts#displayContext`, `store/chartSelectors.ts#selectDisplayContext`.

**Ce qui est en vigueur** se lit par `store/chartSelectors.ts` : `keyInForce`,
`tuningInForce`, `tuningOffer` (proposer de ramener à 440), `selectChords` (accords
de l'analyse hors des plages réécrites, plus les accords à la main, posés sur la
grille en vigueur), `selectChartBars` (toutes les mesures de la grille),
`selectBarChords(s, n)` (« les accords de la mesure n tels qu'affichés » : accords
gardés et contexte d'affichage pour les écrire), `selectAnalysisStatus`,
`selectHasCorrections`. Sélecteurs mémorisés ; dans un composant, ne sélectionner
que des valeurs stables (un nouvel objet à chaque appel fait boucler React).

**Actions** (nouveaux fichiers ; `actions.ts` n'a gagné que la remise à zéro de
l'analyse et des corrections à l'ouverture d'un morceau) :

| Fichier | Actions |
|---|---|
| `store/analysisActions.ts` | `applyAnalysis(result, { replaceCorrections })` : la grille analysée remplace la grille en vigueur sauf si l'utilisateur en a fait une (`manual`, `corrected`) ; rien de ce qui est fait à la main n'est touché, sauf demande expresse (alors seules les sections restent). `setAnalysisRun` |
| `store/gridActions.ts` | `doubleTheTempo`, `halveTheTempo`, `moveDownbeat(±1)`, `setBeatsPerBar`, `placeDownbeatAtPlayhead` (sur des temps analysés : le temps le plus proche devient le premier temps), `resetGridToAnalysis`, `gridCorrectionsAvailable` |
| `store/harmonyActions.ts` | `setBarChords(mesure, [{ beatInBar, chord }])` (toute correction d'accord réécrit la mesure entière), `replaceChord`, `splitBar`, `removeChord`, `confirmBar` (l'accord douteux est validé), `resetBar` (rendre la mesure à l'analyse), `resetChordCorrections`, `setKey`, `setTuningCorrection`, `compensateTuning`, `dismissTuningOffer`, `setSection`, `setInstrument`, `resetHarmonyCorrections`, `untransposeForStorage` (un accord tapé tel qu'affiché, ramené en Ut dans la tonalité d'origine) |

**Document version 2** (`model/document.ts`) : `analysis` et `corrections` en plus,
origine de grille `corrected`, `view.instrument`. La migration 1 → 2
(`storage/documentFormat.ts#MIGRATIONS`) ouvre un morceau du lot 1 comme « pas
encore analysé », sa grille gardée telle quelle. À la lecture, un résultat
d'analyse abîmé ou d'une version inconnue est **abandonné** (il se recalcule) :
un morceau n'est jamais perdu pour lui ; les corrections, elles, doivent se
relire exactement, sinon le document est `corrupt`.

**À brancher à la fusion** : l'autosauvegarde (`storage/keeper.ts`, fonction
`changed`) ne connaît pas encore `analysis` ni `corrections`. Elle doit utiliser
`store/document.ts#documentChanged`, qui donne la liste complète ; sinon une
correction d'accord, de tonalité ou de section n'est gardée qu'au prochain autre
changement (le résultat d'une analyse, lui, part avec le changement de grille
qui l'accompagne).

## Contrats pour la suite

### Lot 2 : ce qui existe et ce qui reste, par chantier

Le socle du lot 2 est en place : modèle et document v2, module `harmony/`,
magasin et actions, contrats ci-dessous, `?demo` analysé, `test:chart`. Quatre
chantiers suivent, chacun dans son dossier.

#### Analyseur — `src/analysis/`

- **Contrat** (`analysis/types.ts`) : `Analyzer.analyse(request)` reçoit l'audio
  décodé à 48 kHz (`channels`, `sampleRate`, `audioId`), éventuellement la grille
  et la tonalité de l'utilisateur (`grid`, `key` : il doit alors les garder et ne
  décoder que les accords dessus, le « regrid » du prototype), `onProgress`
  (étapes `download`, `prepare`, `tuning`, `beats`, `chords`, `finish`, fraction
  qui ne recule jamais, octets téléchargés) et `signal` (annulation : rejeter
  vite avec `AnalysisError('cancelled')`). Il rend un `AnalysisResult` complet ou
  rejette avec un `AnalysisError` (`download-failed`, `unsupported`, `memory`,
  `no-music`, `failed`). `models()` donne la liste des modèles (nom, rôle en
  français, adresse, hébergeur, licence, taille, déjà en cache ou non) :
  l'interface l'affiche au premier téléchargement.
- **Le vrai analyseur** (porté du prototype `web/spikes/analyse/`, mêmes
  algorithmes et mêmes constantes ; ce qui n'est pas porté : les deux autres
  post-traitements des temps du prototype, `dbn` et `joint`, que le réglage par
  défaut n'emploie pas) :
  - `analysis/fabtice.ts` (`FabticeAnalyzer`, côté fil principal, léger) : mélange
    le morceau en mono par tranches (le moteur ne voit jamais son audio touché),
    le **transfère** à un Web Worker, traduit ses messages en progression (une
    fraction pour tout, qui ne recule jamais, poids des étapes mesurés ; un
    battement régulier pendant le réseau d'accords, qui ne donne pas de nouvelles),
    termine le worker à la fin ou à l'annulation (la mémoire de WebAssembly ne se
    rend que comme cela). **Un worker par analyse.** Annuler rejette tout de suite
    avec `cancelled`, demande au worker de s'arrêter et le termine après 300 ms ; le
    worker peut mettre quelques secondes à disparaître s'il est au milieu d'un calcul,
    sans que l'écran l'attende. Une nouvelle analyse peut démarrer aussitôt.
    Les sorties des réseaux (quelques Mo) sont gardées pour l'audio qui vient d'être
    analysé : redemandée avec `grid` ou `key` (la grille ou la tonalité de
    l'utilisateur), l'analyse ne refait que le décodage, dans un nouveau worker, sans
    renvoyer l'audio.
  - `analysis/worker/analysis.worker.ts` (module worker, assemblé par Vite) :
    télécharge et vérifie les outils, ouvre les trois sessions ONNX Runtime Web
    (WebAssembly ; **fils** quand la page est isolée, jusqu'à 4, un seul sinon),
    ramène l'audio à 22,05 kHz (Beat This!) et 44,1 kHz (CREMA) par le
    rééchantillonneur du prototype, lance les réseaux, libère les sessions, décode
    la grille, la tonalité et les accords, traduit en `AnalysisResult`.
    L'annulation est lue entre deux morceaux de travail (les boucles rendent la
    main à la boucle d'événements) et pendant le téléchargement (abandon du `fetch`).
  - `analysis/engine/` : les calculs, **purs** (sans navigateur, testés dans Node) :
    `fft`, `resample`, `tuning` (accordage), `beats` (log-mel, réseau en tranches de
    30 s, pics, probabilité de premier temps), `meter` (métrique 3 ou 4 : HMM sur la
    probabilité de premier temps, a priori 3 : 0,2 et 4 : 0,6), `chords` (CREMA, mise
    en commun par temps), `decode` (décodage calé sur les temps avec l'a priori de
    l'harmonie jazz, confiance, extensions suggérées, basse), `key` (profils de
    Krumhansl), `pipeline` (l'enchaînement), `result` (la traduction vers le modèle :
    « sus4 + 7 » devient la qualité `7sus4`, « sus2 + 7 » est abandonné, `doubtful`
    quand la moyenne géométrique de la probabilité du réseau est < 0,35, premier
    temps = premier temps numéroté 1 ; la tonalité et la grille de l'utilisateur sont
    gardées telles quelles, avec une sûreté de 1). `engine/fixtures/` : les entrées
    déterministes et `make-fixtures.mjs`, qui fait tourner **les fonctions du
    prototype** dessus et écrit `prototype-values.json` ; les tests comparent le port
    à ces valeurs.
  - `analysis/models.ts` : la liste des fichiers, avec adresse (révision figée),
    taille, licence et SHA-256, identique à celle du prototype (un test le vérifie).
    `analysis/models/store.ts` : où ils restent ; `analysis/models/download.ts` :
    comment ils arrivent.
- **Quel réseau Beat This! ?** Le **léger** (`small0`, 10,5 Mo), pour tout le monde.
  Le prototype propose aussi le complet (`final0`, 83 Mo) et on aurait pu le
  préférer sur ordinateur « parce que la qualité prime » ; mesuré ici, c'est
  l'inverse sur le morceau d'essai : le complet lit le tempo à moitié (40 temps
  trouvés sur 80) dès qu'on joue à 1 fois la vitesse et au-delà (et à 0,85 fois :
  mélange des deux) ; il n'est bon qu'à 0,7 fois. Le léger trouve environ 96 % des
  temps à toutes les vitesses essayées (0,7 à 1,3 fois). Il pèse 8 fois moins à
  télécharger, tourne presque deux fois plus vite, et c'est la configuration dont
  le prototype a relevé les justesses. `?modele=complet` essaie le grand ; un
  réglage avancé pourra l'offrir (une seule pièce d'essai : à confirmer sur de
  vrais enregistrements).
- **Téléchargement des outils** : au premier usage (première analyse), depuis les
  dépôts publics de Hugging Face, **à la révision figée** du prototype ; 17,8 Mo
  pour les trois fichiers. Chaque fichier est vérifié par son SHA-256 avant usage
  (et à chaque lecture depuis l'appareil : une copie abîmée est jetée et
  retéléchargée) ; un fichier complet qui ne correspond pas est **refusé, jamais
  gardé**, et repris du début ; trois essais au plus (attentes de 0,8 s puis 1,6 s),
  puis `download-failed` (« Les outils d'analyse n'ont pas pu être téléchargés.
  Vérifiez votre connexion… le morceau reste jouable » : l'analyse se relance par
  « Analyser de nouveau »). Progression réelle en octets sur tous les fichiers à
  télécharger. **Reprise** : le fichier est écrit par morceaux de 2 Mo ; après une
  coupure (ou une page fermée) l'essai suivant demande la suite (`Range`) ; si le
  serveur ignore la plage, le fichier recommence. Le hub répond aux requêtes avec
  `Range` depuis une autre origine (vérifié dans Chromium).
- **Où ils restent, et pourquoi** : **IndexedDB**, base `fabtice-analysis-tools`
  (fichiers complets et morceaux de téléchargement), pas le Cache Storage du
  prototype : IndexedDB est le seul stockage qui se comporte de la même façon dans
  toutes les situations de l'app, pages http(s) et origine `fabtice://app` de l'app
  Mac (**vérifié dans l'app**, test de bout en bout), dans une page et dans un
  worker. Si IndexedDB est inutilisable (stockage bloqué, fenêtre privée), l'analyse
  marche quand même : les fichiers restent en mémoire le temps de la page.
- **Assemblage** : `onnxruntime-web` 1.31.1 (version exacte, comme dans le
  prototype), variante `ort.wasm.min.mjs` (alias dans `vite.config.ts`), dont les
  deux fichiers WebAssembly (`ort-wasm-simd-threaded.mjs` et `.wasm`, 14,8 Mo,
  importés avec `?url`) sont servis **par l'app elle-même**, jamais par un CDN ; la
  licence (MIT) part avec. Serveur de développement, `npm run build` et
  `npm run build:desktop` (base relative, protocole `fabtice://`) : même code. Dans
  l'app Mac, la politique de sécurité n'ouvre que `https://huggingface.co` et
  `https://*.cdn.hf.co` (voir `desktop/src/protocol.js`).
- **Mesures** (cette machine, 4 cœurs, sans carte graphique, Chromium ; elles ne
  valent pas pour les appareils du propriétaire) : morceau d'essai de 37,6 s, outils
  déjà là, **6 à 13 s** selon la charge de la machine (le chargement des réseaux en prend 2) ; morceau de 4
  minutes, **19 à 26 s** ; mémoire du navigateur **+1 Go** pendant le réseau de
  temps (indépendant de la durée : il travaille par tranches de 30 s ; rendue 5 s
  après la fin), c'est ce que ONNX Runtime réserve pour ce réseau ; plus longue
  tâche du fil principal **< 100 ms** ; lire le morceau pendant l'analyse ne gêne pas
  le moteur audio (aucun quantum hors budget). Justesse sur le morceau d'essai :
  96,3 % des temps (précision 93,9 %), 19 premiers temps sur 20, 4/4, Si majeur,
  accordage 30,5 cents (connu : 30), fondamentale juste 84,2 % du temps,
  fondamentale et qualité 74,3 % : **les chiffres du prototype, à l'identique**.
  Mémoire sur iPhone : non mesurée ici ; 1 Go de plus pendant le réseau de temps est
  beaucoup pour un téléphone (voir PASSATION : la page y a été fermée par le système
  pendant la séparation). Un manque de mémoire est annoncé (`memory`) quand le
  navigateur le dit, mais une page fermée de force par le système ne peut pas l'être.
- **Reste à faire** : décider de l'hébergement des conversions ONNX (copie sous un
  compte du projet, voir PASSATION) ; mesurer la mémoire sur iPhone et, si besoin,
  rogner (tranches plus courtes pour le réseau de temps, au prix d'un autre
  résultat) ; un réglage avancé pour le grand réseau de temps ; les extensions
  d'accord et la basse restent des suggestions (peu fiables, mesuré).

#### Grille d'accords — `src/chart/`

- **Ce qui existe** : la mise en page pure et testée (`chart/layout.ts` :
  accords en vigueur, mesures, répétition « 𝄎 », sections et doubles barres,
  lignes de quatre mesures, ligne de levée, boucle, mesure en cours) ; les
  corrections pures (`chart/edits.ts`) ; la feuille en lecture seule
  (`chart/ChartSheet.tsx`, fidèle à la maquette : `.feuille`, `.grille`, `.case`,
  `.section`, `.numero`, `.deux`, `.double`, `.dans-boucle`, `.jouee`) avec
  l'en-tête (titre, tonalité affichée, métrique, tempo) et le choix Ut / Si♭ /
  Mi♭ ; le filet braise de la mesure en cours, mené par la boucle d'animation
  (`chart/usePlayheadBar.ts`, jamais par React) ; les états vide, « analyse en
  cours », échec, aucun accord ; le téléphone.
- **Coutures** : chaque mesure porte `data-mesure` (indice) et chaque accord
  `data-accord` (rang dans la mesure) et `data-origine` (`analysis` ou `manual`) ;
  `ChartGrid` accepte `onBarPointerDown` et `onChordClick` (non branchés) ; un
  accord qui ne commence pas sur la barre reçoit `--debut` (fraction de la mesure).
- **Reste à faire** : les gestes (clic sur une mesure = `seek` au début de la
  mesure, glisser sur des mesures = `setLoopRegion(loopFromBars(…))` puis
  `enterLoop()`, comme dans la frise ; les cases deviennent alors des boutons) ;
  l'éditeur d'accord au clic (champ lu par `parseChord`, propositions tirées de
  `alternatives`, `replaceChord` / `splitBar` / `removeChord` / `confirmBar` /
  `resetBar`, accord tapé tel qu'affiché puis `untransposeForStorage`) ; la pose
  des lettres de section (`setSection`) ; la correction de la tonalité (menu des
  24 tonalités : `allKeys`, `keyNameFr`, `setKey`) ; l'impression
  (`export/index.ts#printChart`, styles d'impression, puis `PRINT_READY = true`) ;
  suivre la mesure en cours en lecture (défilement, réglage « Suivre ») ; les
  entrées « Exporter » dans le menu du téléphone.

#### Frise du temps — `src/timeline/` (seulement ceci)

- **Rang des accords** : l'afficher quand `selectHasChords(state)` est vrai
  (`rulerRows({ hasChords })`, aujourd'hui `false` en dur dans `Timeline.tsx`,
  `controller.ts` et `components/RulerHeads.tsx`, qui a déjà `ChordsHead`). Lire
  `selectChartBars(state)` (mesures, accords avec `beatInBar`, `repeat`, sections)
  ou `selectChords(state)` (chaque accord et son temps `beat` sur la grille ;
  position x par `beatToTime(tempoMap, beat)`), et `selectDisplayContext(state)`
  pour l'écrire (`displayChord(chord, ctx).parts` : fondamentale, qualité ou
  triangle, extensions, basse ; ou `displayChordText`). Styles de la maquette :
  `.accord`, `.accord.deux` (18 px et 14,5 px). Les accords douteux à l'encre
  douce, comme dans la grille. Redessiner quand `analysis`, `corrections`,
  `tempoMap`, `playback.semitones`, `view.instrument` ou
  `settings.minorNotation` changent.
- **Courbe de tempo** : une carte analysée a un segment **par temps** ; dessinée
  segment par segment (comme aujourd'hui), elle tremble et porte un point à
  chaque temps. Dessiner `grid/tempoCurve.ts#tempoCurve(map, t0, t1)` (un point
  par mesure, tempo moyen de la mesure) avec `curveRange()` pour l'échelle, et la
  ligne pointillée au tempo nominal (`nominalBpm`, mémorisé par carte).
- **Temps analysés** : `barLines`, `subGridLines`, `snapTime`, `loopFromBars`,
  `barsOfRange`, `metronomeClicks` donnent déjà les bonnes lignes sur une carte
  variable (tests sur les vrais temps de `demo-swing.json`,
  `grid/beats.test.ts`). L'effacement de la sous-grille se décide sur le tempo
  le plus rapide de la carte (`maxBpm`).

#### Export iReal Pro — `src/export/`

- **Ce qui existe** : `chartForExport(state)` rend une représentation pure de la
  grille (`ExportChart` : titre, tonalité écrite, métrique, tempo, `repeats:
  'none'`, mesures avec section, double barre, changement de métrique, accords
  au temps près, répétition, dernière mesure), en Ut **dans la tonalité jouée**
  (transposition du transport appliquée ; l'instrument non : iReal Pro
  transpose lui-même). Le contrat `exportToIRealPro(chart): IRealExport` (lien
  `irealb://`, page HTML qui le porte, nom de fichier) lève
  `ExportNotReadyError`. Le menu « Exporter » montre « bientôt » tant que
  `IREAL_EXPORT_READY` est faux ; ensuite il enregistre la page HTML
  (`components/ExportMenu.tsx`).
- **Reste à faire** : le codage iReal (vocabulaire d'accords, cellules,
  sections, métrique, style par défaut, chaîne du lien), ses tests, la remise à
  l'utilisateur (page à ouvrir, lien à copier, app Mac), puis
  `IREAL_EXPORT_READY = true`.

#### Le menu « Exporter » et les panneaux

« Exporter » est un petit menu (`components/ExportMenu.tsx`) : « Grille pour
iReal Pro » et « Imprimer la grille » (« bientôt »), l'audio visible mais inactif
(lot 3). Le panneau « Tempo et mesures » (`components/GridPanel.tsx`) garde la
saisie du lot 1 et gagne : tempo ÷ 2 et × 2, premier temps un temps plus tôt ou
plus tard (de part et d'autre de « Premier temps ici »), l'origine de la grille,
« Revenir à l'analyse », « Analyser de nouveau ». Le panneau de l'accord fin
(Tonalité) dit à quel La l'enregistrement est accordé et propose « Ramener à
440 » (les cents du transport) ou « Laisser tel quel ». Le transport écrit la
tonalité comme la maquette : « A♭ · original », « A♭ → D♭ ».

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
renvoie l'objet dans l'app Mac, `null` sur le web. Pendant `extract`, le pont envoie
`{ phase: 'info' }` (recherche), `{ phase: 'prepare', meta }` (le téléchargement va
démarrer, rien à mesurer) puis `{ phase: 'download', percent, receivedBytes, totalBytes,
speedBps }` **seulement** quand yt-dlp a écrit une vraie ligne de progression (`percent`
est `null` si la taille totale est inconnue). `lastImportReport()` (facultatif) rend le
rapport du dernier import fait depuis l'interface, pour la fenêtre de diagnostic ; la fenêtre « Nouveau
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
| `documentFormat.ts` | lecture sûre : version du document (`MIGRATIONS` : de 1, lot 1, à 2, lot 2 ; une version **plus récente** est ignorée, jamais écrasée à la lecture), contrôle de la forme (sinon `corrupt`) ; `STORAGE_SCHEMA` pour l'enveloppe |
| `keeper.ts` | le gardien : `keepNewProject()` (à appeler quand un nouveau morceau est ouvert et jouable : demande le stockage persistant la première fois, écrit audio et document ensemble, remplace l'ancien projet) puis autosauvegarde de tout changement du document, **différée** (700 ms de calme, 5 s au plus pendant un geste continu), une écriture à la fois, jamais attendue par l'écran ; `flush()` à la fermeture (`pagehide`, onglet masqué). Rien n'est écrit pour un morceau dont l'audio n'est pas encore gardé, ni pour le morceau de démonstration. La file d'écritures **ne rejette jamais** (un travail qui échoue n'empoisonne pas les suivants) et une écriture qui ne répond pas au bout de 2 minutes est abandonnée avec l'avis habituel |
| `restore.ts` | lancement : « Ouverture de « titre »… » (la fenêtre n'apparaît que si cela dure plus de 250 ms) avec **l'étape en cours** (lecture du morceau gardé, préparation du son, mise en place des pistes), puis `restoreProject()` (mêmes identifiants de projet, de piste et d'audio). **Chaque étape a sa limite de temps généreuse** (`RESTORE_LIMITS` : document 20 s, lecture 60 s, décodage 3 min par piste, moteur 60 s) : une réouverture n'attend jamais indéfiniment. **Au moindre échec ou dépassement, le morceau gardé est CONSERVÉ** : la fenêtre « Nouveau morceau » s'ouvre avec une phrase calme et propose « Rouvrir « titre » » et, plus discret, « Oublier ce morceau » (confirmé par une seconde question). Un marqueur dans `localStorage` pendant la réouverture couvre une page tuée par le système (manque de mémoire sur téléphone) : au lancement suivant il n'y a **pas de nouvel essai automatique**, la même proposition s'affiche, jusqu'à ce que l'utilisateur choisisse. « Rouvrir » (`reopenKept`) ignore ce marqueur ; « Oublier » (`forgetKept`) supprime le document, l'audio et le marqueur. Un nouvel import réussi remplace le morceau gardé et retire la proposition (`ui.reopenOffer`) |
| `timeout.ts` | `withTimeout()` et `StepTimeout` : une limite de temps pour une étape qui pourrait ne jamais répondre |
| `memoryStorage.ts` | même contrat en mémoire, avec pannes simulées (tests) |

**Lire une grosse valeur.** Le navigateur garde à part les valeurs de plusieurs dizaines de ko
(un morceau entier) et peut les livrer **après** la fin de la transaction qui les a demandées. Une
lecture prend donc son résultat quand **sa propre requête** réussit (`onsuccess`), jamais à
`oncomplete` (lire `request.result` à ce moment-là lève une exception dans un gestionnaire
d'événement et la promesse ne se règle jamais : c'est ce qui empêchait un morceau gardé de
revenir). Les tests des quatre étages : `indexedDb.test.ts` (fausse base qui livre après la
transaction), les tests du bureau `desktop/test/e2e/real-size.test.js` (morceaux de plusieurs Mo,
fichier et lien) et `tests/import.mjs` (0,5, 6 et 32 Mo avec un **profil persistant** : un contexte
jetable garde sa base en mémoire, où les grosses valeurs ne sont jamais mises à part). Toute
nouvelle lecture ou écriture du stockage doit être essayée avec des données de taille réelle.

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
  phrase d'explication (`installing`) ; extraction (`fetching-info` : recherche du morceau ; `starting-download` :
  préparation du téléchargement, sans aucun chiffre ; puis `downloading` avec un vrai pourcentage, ou
  la quantité reçue quand la taille totale est inconnue) ; si la réponse est `needsYtdlp`, installation et
  **une** nouvelle tentative ; octets décodés comme un fichier. Les refus du pont
  (direct, plus de 20 minutes) montrent sa phrase française sous le message
  général ; les autres échecs n'affichent rien de technique. Rien ne change à la
  façon d'appeler yt-dlp : on n'appelle que le pont.
- **Une fenêtre qui dit vrai** (`components/NewPieceDialog.tsx`) : jamais de « 0 % »
  figé. Tant que rien ne se mesure (recherche du morceau, démarrage de l'outil, qui
  peut prendre une minute sur un vieux Mac), la jauge est indéterminée et aucun chiffre
  n'est affiché ; au premier vrai message de téléchargement, soit « NN % », soit
  « 12,4 Mo reçus » si la taille totale est inconnue (`import/amount.ts`). Après environ
  dix secondes sans aucune nouvelle (`QUIET_NOTE_DELAY_MS`), une phrase rassurante : « Sur
  certains Mac, cette étape peut durer une à deux minutes. Fabtice n'est pas bloqué. »
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
règle) n’est pas encore dessiné (`rulerRows({ hasChords: false })`) : voir « Lot 2 », plus haut, pour ce que la frise doit lire.

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

## Saisie et correction de la grille

Le clic sur « Tempo » en tête de règle ouvre un panneau : tempo du morceau
(30–300), « Battre le tempo », temps par mesure (2–7, à la noire), tempo ÷ 2 et
× 2, « Premier temps ici » (le premier temps de la mesure 1 à la position de
lecture) entre « un temps plus tôt » et « un temps plus tard », puis l'origine
de la grille, « Revenir à l'analyse » et « Analyser de nouveau ». Saisir ou
battre un tempo fait une grille fixe (`setManualGrid`, lot 1), qui remplace les
temps analysés ; les autres corrections gardent les temps analysés et n'en
changent que la numérotation (`store/gridActions.ts`, `grid/corrections.ts`).
