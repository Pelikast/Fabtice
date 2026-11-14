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
| `npm run test:export` | après `build` : le menu « Exporter », le fichier iReal Pro téléchargé par le navigateur, et son lien relu (par un lecteur écrit dans le test) et comparé aux accords de la grille, avec une transposition et un instrument réglés, un accord tapé à la main, une analyse qui se termine |
| `npm run test:engine` | après `build` (et, en option, `build:desktop`) : mesures du vrai moteur audio dans Chromium (tonalité, tempo, boucle, métronome, limiteur, charge ; sections 14 à 18 : le rendu d'« Appliquer » joué tel quel, passages préécoute/rendu, boucle, métronome, sept pistes) |
| `npm run test:analysis` | après `build` : le **vrai** analyseur dans Chromium (télécharge les outils d'analyse depuis Hugging Face : réseau nécessaire). Le morceau d'essai du prototype passe par l'interface et le résultat est comparé à ce qu'on en sait et à ce que le prototype trouve ; deuxième usage sans téléchargement ; le panneau d'état qui s'ouvre seul au premier téléchargement (il se referme seul à la fin de l'analyse, reste ouvert si l'utilisateur y a touché ou en cas d'erreur) ; annulation (panneau, nouvel import, pendant le téléchargement) ; réseau absent ; téléchargement abîmé (refusé, repris, refusé pour de bon) ; reprise d'un téléchargement interrompu ; lecture pendant l'analyse ; morceau de 4 minutes ; chiffres de durée, de mémoire et de plus longue tâche du fil principal. `FABTICE_ANALYSIS_ONLY=<nom>` n'en lance qu'une partie |
| `npm run test:separation` | après `build` : les écrans du lot 3 dans Chromium (séparation : fenêtre « Nouveau morceau », panneau, téléchargement, progression, repli, annulation, échec, pistes dans leurs teintes, morceau entier et retour, « Libérer la place » ; réglages avancés ; « Appliquer » ; « Exporter le son » avec un WAV et une archive téléchargés et relus) à 1280 × 800, 960 × 640 et 390 × 844 (dans la fenêtre, au-dessus du transport), puis des instruments de **taille réelle** gardés et rouverts après rechargement (profil persistant). `FABTICE_SEPARATION_OUT` pour les captures, `FABTICE_SEPARATION_ONLY=screens\|flows\|export\|storage` |
| `npm run test:memory` | après `build`, au premier plan : la mémoire d'un morceau de cinq minutes stéréo en une piste puis en sept, avec le vrai moteur ; puis le jeu « Appliquer » de ces sept pistes à 0,7 (taille, budget de l'appareil, libération) (chiffres affichés) |
| `npm run test:render` | après `build`, au premier plan : le vrai rendu (Rubber Band R3 dans un worker) dans Chromium : alignement d'un train de clics à plusieurs tempos et hauteurs, cinq minutes sans dérive, vitesse (secondes de calcul par minute stéréo, gain de plusieurs workers), annulation, binaire chargé au premier rendu seulement et licence servie ; puis « Appliquer » dans l'app avec le vrai moteur (progression réelle, rendu joué tel quel, retour à la préécoute, refus calme d'un appareil trop petit) à 1280 × 800 et 390 × 844. `FABTICE_RENDER_OUT` pour les captures, `FABTICE_RENDER_ONLY=renderer\|app`, `FABTICE_RENDER_QUICK=1` saute les cinq minutes |
| `npm run test:chart` | après `build` : la grille d'accords comparée à la maquette (même balisage des accords, mêmes tailles, sections, boucle, mesure en cours, instruments, états vide et « analyse en cours », téléphone), puis les gestes (clic, glisser, suivi), l'éditeur d'accord (toujours entier et dans la fenêtre, à 1280 × 800 et 960 × 640), tous les panneaux flottants (Tempo, analyse, réglages, Exporter, accord fin, tonalité : dans la fenêtre, au-dessus du transport, dernier bouton cliquable, à 1280 × 800, 1024 × 700 et 960 × 640 ; `ui/useFitPanel.ts` leur donne une hauteur maximale et un défilement propre quand la fenêtre est trop basse), la tonalité, les sections, le clavier, l'autosauvegarde (rechargement d'un morceau gardé), le toucher réel sur téléphone (390 × 844) et l'impression (feuille de style d'impression, PDF A4 et Letter lus avec `pdftotext`, sauts de page) ; panneaux de corrections et d'accordage ; captures de l'app, de la maquette et des pages imprimées dans `FABTICE_CHART_OUT` (`pdftotext`, `pdfinfo` et `pdftoppm` de poppler sont nécessaires pour la partie impression) |

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
| `?demo&separation=entier\|faite\|lente\|repli\|echec` | lot 3 : le morceau en une piste entière, pas encore séparé, déjà séparé, en cours (lent, premier téléchargement), avec repli sur le processeur, en échec |
| `?demo&rendu=lent`, `?demo&export=ouvert` | lot 3 : « Appliquer » assez lent pour voir l'attente (rendu factice) ; « Exporter le son » ouvert |
| `?rendu=reel`, `?rendu=factice` | lot 3 : le vrai rendu (Rubber Band) même sur une page de test (c'est ce que font `test:render` et le test de l'app Mac), ou le factice |

En mode démo, `window.__fabtice` donne accès au magasin, au moteur, aux actions
et, sous `lot2`, aux actions d'analyse, de grille et d'harmonie, sous `lot3` à la
séparation, au rendu, à l'export, au registre et au stockage ; `?debug` donne
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
                      corrections pures (edits.ts), gestes (gesture.ts, hit.ts,
                      useChartGestures.ts), éditeur (editor.ts, ChordEditor.tsx,
                      KeyEditor.tsx), clavier (stops.ts), suivi (useFollowLine.ts),
                      impression (print.ts), feuille et mesure en cours
  export/             représentation de la grille pour l'export, codage iReal Pro
                      (IREAL-FORMAT.md : le format et ses sources) ; audio/ : export
                      du son (lot 3 : plan, rendu, encodeurs, archive, remise)
  separation/         séparation des instruments (lot 3) : contrat, liste des outils
                      (models.json), choix selon l'appareil, séparateur factice, lancement
  render/             rendu hors ligne et « Appliquer » (lot 3) : contrat, rendu réel
                      (rubberband.ts + rubberband/ : worker, wasm, licence), rendu
                      factice, budget de mémoire, contrôleur
  store/              état de l'app (store.ts), actions (actions.ts), valeurs
                      dérivées (derived.ts), préférences, document de projet
  audio/              contrat du moteur (AudioEngine.ts), vrai moteur
                      (WorkletEngine.ts + worklet/), moteur factice
                      (MockEngine.ts), fabrique (index.ts), branchement au
                      magasin (connect.ts), registre de l'audio décodé, forme
                      16 bits partagée unique (pcm.ts, storage.ts), binaire wasm
                      de Signalsmith et ses licences (wasm/) ; la lecture du rendu
                      d'« Appliquer » (worklet/core.ts)
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
tests/                vérifications dans Chromium (smoke.mjs, timeline.mjs, import.mjs, chart.mjs, export.mjs),
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

**Autosauvegarde** : `storage/keeper.ts` utilise `store/document.ts#documentChanged`,
qui donne la liste complète (analyse et corrections comprises) : une correction
d'accord, de tonalité ou de section est gardée comme le reste. `test:chart`
le vérifie (correction, rechargement, correction retrouvée).

### Lot 3 : le socle (document version 3)

Le socle du lot 3 est en place : modèle et document v3, une seule copie de
l'audio décodé, stockage des instruments séparés, trois contrats avec chacun
un remplaçant factice branché sur l'écran, écrans de la séparation, de
« Appliquer » et de « Exporter le son », réglages avancés, `test:separation` et
`test:memory`. Trois chantiers suivent, chacun dans son dossier (plus bas).

#### Modèle

| Donnée | Où | Contenu |
|---|---|---|
| Pistes jouées | `AppState.tracks` (inchangé) | toujours les pistes **affichées et jouées** : le morceau entier, ou les instruments séparés. Une piste séparée porte `stem` (`model/separation.ts#StemId` : `vocals`, `drums`, `bass`, `guitar`, `piano`, `winds`, `other`, et les parties détaillées `kick`, `snare`, `hihat`, `toms`, `cymbals`, `saxophone`, `brass`) et `audio.origin: 'separated'` ; sa couleur vient de `STEM_ROLE` (les teintes de `DESIGN.md`, une partie détaillée prend celle de sa famille) |
| Séparation | `AppState.separation`, `model/separation.ts#SeparationState` | `result` (dernière séparation finie : identifiant, outil et son SHA-256, carte graphique ou processeur, repli, parties données, parties gardées, dates, durée du calcul, durée du morceau ; `null` = jamais séparé ou place libérée), `showing` (`whole` ou `instruments`), `aside` : **l'autre jeu de pistes, avec son mixage**. C'est ce qui permet « Revenir au morceau entier » et « Revoir les instruments » sans rien recalculer : les deux jeux s'échangent. Invariants (vérifiés à la lecture) : sans résultat, le morceau entier est affiché et rien n'est de côté ; avec un résultat, un des deux jeux est le morceau entier, l'autre les instruments |
| Séparation en cours | `AppState.separationRun` (non gardé) | `idle`, `running` (outil, étape `download`/`prepare`/`separate`/`finish`, carte graphique ou processeur, `fellBack`), `error` (code). Fraction, temps restant et octets téléchargés : `separation/progress.ts` (petit magasin à part, comme l'analyse) |
| Rendu « Appliquer » | `AppState.render`, `model/render.ts` (non gardé) | `none`, `rendering`, `applied`, `error`, chacun avec la cible (`RenderTarget` : demi-tons, cents, tempo, formants, pistes) ; un rendu dont la cible n'est plus celle de l'état est périmé. Ce que l'écran montre : `render/controller.ts#selectApplyState` (`original`, `preview`, `rendering`, `applied`). Les fichiers rendus ne sont **jamais gardés** |
| Préférences d'export | `AppState.exportPrefs`, `model/audioExport.ts` | quoi (`mix`, `tracks`), durée (`whole`, `loop`), format (`wav`, `mp3`, `flac`) ; gardées avec le morceau |
| Réglages avancés | `AppState.settings.advanced`, `model/project.ts#AdvancedSettings` | outil de séparation (`auto` ou l'identifiant d'un outil de la liste) et « Conserver le timbre » (formants). **Par appareil** (`localStorage`, `store/preferences.ts`), pas par morceau : le bon outil dépend de la machine, le timbre est une habitude |
| Choix de la fenêtre « Nouveau morceau » | `AppState.ui.importStems` | les instruments cochés (aucun par défaut) ; la séparation démarre seule quand le morceau importé peut jouer, puis la liste est vidée |

**Document version 3** (`model/document.ts`) : `separation` et `exportPrefs` en
plus ; `tracks` contient les pistes affichées, `separation.aside` l'autre jeu.
Migration 2 → 3 (`storage/documentFormat.ts#MIGRATIONS`) : jamais séparé,
préférences d'export par défaut. À la lecture : la séparation et les pistes
doivent se relire exactement (sinon `corrupt`, comme les corrections), une
préférence d'export illisible redevient celle par défaut.
`store/document.ts#documentChanged` suit `separation` et `exportPrefs` (pas les
états de calcul) : l'autosauvegarde les garde.

**Actions** : `store/separationActions.ts` (`toggleImportStem`,
`applySeparation`, `showWholePiece`, `showInstruments`, `dropSeparation`,
`setSeparationModel`, `setFormants`, `setSeparationRun`, `stemName`…). Changer
de jeu ne recharge jamais le moteur : les pistes de l'autre jeu sont ajoutées
(`addTrack`, alignées à 0) puis les anciennes retirées ; la position et la
lecture continuent. `store/exportActions.ts` : la fenêtre d'export et ses
préférences.

#### Une seule copie de l'audio décodé (`audio/pcm.ts`)

Jusqu'au lot 2, chaque piste était gardée deux fois : en Float32 dans le
registre (formes d'onde, analyse) **et** en 16 bits dans le moteur. Désormais
le registre (`audio/registry.ts`) ne garde que la forme 16 bits du moteur,
`PcmAudio` : blocs de 32 768 images en `SharedArrayBuffer` (mémoire ordinaire si
la page n'est pas isolée), deux canaux égaux gardés une fois. **Le moteur reçoit
ces mêmes blocs** (`EngineTrack.pcm`, `engineTrack()`), sans copie : la mémoire
partagée est partagée avec le fil audio, pas copiée. La frise lit les blocs
(`timeline/peaks.ts`), l'analyse reçoit une copie Float32 mono **passagère**
(`pcmToMono`, le mélange `(g + d) / 2` qu'elle faisait déjà), la séparation, le
rendu et l'export lisent par plages (`readPcm`) ou font une copie passagère
(`pcmToChannels`) puis la lâchent. L'ouverture d'un morceau convertit par
tranches (`pcmFromChannelsInSlices` : aucune tâche longue, 50 ms au plus pour un
morceau de quatre minutes contre 270 ms d'un bloc), la réouverture d'un coup,
une piste à la fois, pendant « Ouverture… ». 16 bits, c'est la précision que le
moteur a toujours jouée (96 dB), sous le bruit des mp3, m4a et vieux disques.
Pour écrire progressivement (séparateur, rendu) : `PcmWriter`. Après une
séparation, le morceau entier reste en mémoire à côté des instruments (une piste
de plus, 58 Mo pour cinq minutes) : l'analyse l'écoute, et le retour au morceau
entier est immédiat.

Mesures (`npm run test:memory`, Chromium sans carte graphique, vrai moteur,
mémoire résidente de tous les processus Chromium, avant → après ouverture) :

| Morceau | Avant (lot 2) | Après (lot 3) | Échantillons Float32 / 16 bits |
|---|---|---|---|
| 5 min stéréo, 1 piste | +272 Mo | +166 Mo | 110 / 55 Mo |
| 5 min stéréo, 7 pistes | +1 250 Mo | +485 Mo | 769 / 385 Mo |

#### Où restent les instruments séparés (`storage/`)

**IndexedDB**, base `fabtice` passée en version 2 : deux magasins de plus,
`pcm` (blocs de 16 morceaux de 32 768 images, 1 Mo par canal, clé `[audioId,
bloc]`) et `pcmInfo` (une fiche par piste, écrite **en dernier** : une écriture
interrompue ne laisse rien de lisible, jamais une demi-piste). Contrat :
`ProjectStorage.saveTrackAudio`, `loadTrackAudio` (relue directement en mémoire
partagée, prête pour le moteur, sans décodage), `deleteTrackAudio`,
`pruneTrackAudio` (restes d'une écriture coupée, balayés à la réouverture),
`trackAudioUsage` (place prise). Un nouveau morceau (`replaceCurrent`) et
« Oublier » (`clearCurrent`) effacent aussi les instruments. Les octets
d'origine du morceau restent gardés comme avant (le morceau entier se décode à
nouveau). Le séparateur écrit les instruments **avant** que le document ne les
cite (`separation/runner.ts`) ; le morceau de démonstration et un morceau pas
encore gardé n'écrivent rien.

Pourquoi pas le système de fichiers privé de l'origine : IndexedDB est le
magasin que l'app utilise déjà partout où elle tourne (pages http(s), origine
`fabtice://app` de l'app Mac, workers), avec le même quota et la même
« persistance » ; un seul endroit à vider quand un morceau en remplace un autre ;
les flux d'écriture du système de fichiers privé sont arrivés tard dans Safari.
Vérifié dans l'app Mac par `desktop/test/e2e/separated-storage.test.js` (deux
pistes stéréo de 2 min 30, 58 Mo, écrites, app quittée et relancée, relues à
l'échantillon près en mémoire partagée, puis effacées ; mesuré ici : 57,7 Mo
écrits en 2,0 s, relus en 0,1 s après la relance. Le même test écrit un fichier de
même taille dans le système de fichiers privé : il marche aussi sur cette
origine et revient après la relance ; le choix d'IndexedDB tient aux raisons
ci-dessus, pas à une panne de l'autre),
et dans Chromium avec un profil persistant par `test:separation` (morceau de
2 min 30, six pistes, rechargement, puis « Libérer la place »).

**Réouverture** (`storage/restore.ts`, dans le même parcours qui ne bloque
jamais et ne détruit jamais) : l'original est relu et décodé, puis les
instruments sont relus tels quels (étape « Lecture des instruments
séparés… », limite `RESTORE_LIMITS.instrument`). S'il en manque un (effacé par
le navigateur, abîmé, trop lent), le morceau s'ouvre **entier**, le résumé de
séparation est abandonné et une phrase calme le dit
(`separation.lostAtRestore`) : le morceau, lui, n'est jamais perdu.

#### Contrats pour les trois chantiers suivants

##### Séparateur — `src/separation/`

| Fichier | Rôle |
|---|---|
| `types.ts` | le contrat : `Separator` (`separate(request)`, `isCached`, `toolsUsage`, `forgetTools`), `SeparationRequest` (audio `PcmAudio`, outil, `backend: 'auto' \| 'cpu'`, `onProgress`, `onTrack` facultatif, `signal`), `SeparationProgress` (étape, fraction qui ne recule jamais, **temps restant mesuré**, octets, carte graphique ou processeur, `fellBack`), `SeparationOutput`, `SeparationError` (`cancelled`, `download-failed`, `unsupported`, `memory`, `unknown-model`, `failed`), `SeparationModelSpec`, `DeviceProfile`, `ModelChoice` |
| `models.json` | **la liste des outils**, gardée dans ce dépôt : les trois paliers du prototype (BS-RoFormer SW, HTDemucs 6 sources, SCNet), adresse figée, taille, SHA-256 (identiques au prototype, un test le vérifie), page source, licence connue en français, `licenceUnclear`, vitesses (mesurées ou estimées, dit), mémoire, réglages du prototype (`config`, opaque pour l'app) |
| `models.ts` | lecture de la liste : copie embarquée, et au lancement `refreshModelList()` va chercher `models.json` à son adresse brute publique (`REMOTE_MODEL_LIST_URL`, branche `main`), avec une limite de temps ; **validation stricte** (`validateModelList` : https, hôte autorisé `huggingface.co`, révision de 40 caractères, SHA-256, taille, parties connues ; un document qui échoue est ignoré en entier, jamais à moitié). Une liste distante vide est valable : tous les outils sont retirés. Pas de requête sur les adresses de test et de démonstration, ni depuis la machine elle-même (développement, vérifications), sauf `?outils=distant` |
| `device.ts` | **choix automatique, pur et testé** : `assessDevice` (téléphone, navigateur, puce graphique, mémoire, cœurs), `chooseModel` (téléphone → le plus léger ; Safari → processeur, le meilleur outil sur puce Apple ; puce Apple ailleurs → le meilleur sur la carte graphique ; autre puce ou aucune → l'outil équilibré ; un outil que la mémoire ne tient pas est sauté), `resolveModel` (le réglage avancé gagne tant que son outil est dans la liste), `estimateSeconds` (vitesse de la liste × durée, plus lent avec peu de cœurs) ; `probeDevice()` (WebGPU, mémoire) une fois par page |
| `mock.ts` | `MockSeparator` : copies filtrées par bandes (graves pour la basse, médium pour la voix…), au rythme voulu, avec premier téléchargement, repli sur le processeur, annulation et erreurs ; le panneau dit « Outil d'essai » quand il est en service |
| `index.ts` | la fabrique `getSeparator()` (aujourd'hui toujours le factice ; `?separation=lente\|instant\|repli\|echec`), `SEPARATION_TOOLS_DB` |
| `runner.ts` | lancement (`startSeparation({ stems })`, `startAutoSeparation` après un import), annulation, rassemblement des parties non demandées dans « Autres » (`gatherParts`), écriture sur l'appareil puis mise en place, `freeSeparatedTracks`, `separationUsage` |
| `progress.ts`, `useChoice.ts` | progression fine ; l'outil et l'estimation pour l'écran (`formatWait`, `formatSize`) |

**Ce que l'agent de la séparation doit construire** : un `OnnxSeparator`
(fichiers à lui dans `src/separation/`, branché dans `index.ts` comme le vrai
analyseur l'est dans `analysis/index.ts` : le vrai par défaut dans un
navigateur, le factice dans Node, sur `?demo` et les adresses de test), porté
du prototype `web/spikes/separation/` (paliers, STFT, découpage en tranches,
recouvrement), dans un **Web Worker** (ONNX Runtime Web, variante WebGPU puis
WebAssembly, fichiers servis par l'app comme pour l'analyse). Exigences du
contrat : lire l'audio par plages et ne pas le garder ; rendre chaque partie en
`PcmAudio` de même longueur (48 kHz, rééchantillonnage aller et retour à sa
charge) ; progression régulière avec un **temps restant honnête** ; au premier
échec de la carte graphique, continuer **avec le même outil** sur le
processeur et le dire tout de suite (`fellBack`), jamais changer d'outil seul ;
annulation rapide qui libère la mémoire (terminer le worker) ; mémoire basse
sur téléphone (la page de l'iPhone a été fermée par le système avec SCNet :
tranches courtes, rien en double). Téléchargement : réutiliser
`analysis/models/download.ts` (reprise, SHA-256) avec
`openModelStore(SEPARATION_TOOLS_DB)` (une base à part, pour que la place des
outils se montre et se libère à part) et traduire `AnalysisError` en
`SeparationError` ; `toolsUsage`/`forgetTools` lisent et vident cette base.
Mesurer sur le morceau d'essai et noter les vitesses réelles dans
`models.json` (`speed`, `measured: true`). Les séparations détaillées
(batterie détaillée, saxophone) : une entrée `kind: 'detail'` avec `input` dans
la liste, **seulement si un outil existe** ; leur mise en place (une piste
remplacée par ses parties) demandera un document v4. **L'app Mac** : sa
politique de sécurité (`desktop/src/protocol.js`, `connect-src`) doit ouvrir
`https://raw.githubusercontent.com` pour la liste distante (aujourd'hui l'app
Mac utilise la copie embarquée), et rien d'autre ne change pour les outils
(Hugging Face est déjà ouvert).

##### Rendu hors ligne et « Appliquer » — `src/render/`

**Fait** (rendu réel, lecteur du rendu, mémoire, écran). Rubber Band R3
« finer » rend les pistes hors ligne dans des workers, le moteur joue le rendu
tel quel, et tout se vérifie par des mesures : `npm test` (Node, vrai wasm),
`npm run test:render` et `npm run test:engine` (Chromium), `npm run test:memory`,
et dans l'app Mac `desktop/test/e2e/apply-render.test.js`.

| Fichier | Rôle |
|---|---|
| `types.ts` | le contrat : `OfflineRenderer.render(request)` → `PcmAudio` ; `RenderRequest` (audio, demi-tons, cents, rapport de tempo, formants, plage en temps source facultative, progression, annulation), `supportsFormants`, `parallel` (combien de rendus à la fois valent la peine), `RenderError`. La sortie dure **exactement** `round(images de la plage / tempo)`, est **alignée** (l'image k correspond au temps source `début + k × tempo / 48 000`), commence et finit sans clic |
| `rubberband.ts` | `RubberBandRenderer` : côté page. Lit l'audio **par blocs de 16 384 images** (`readPcm`) et les transfère au worker (au plus trois en vol, le worker en accuse réception : un rendu lent n'entasse rien), écrit la sortie qui revient avec `PcmWriter` ; jamais une copie Float32 d'une piste entière. Un piste stockée une seule fois (mono, ou deux canaux égaux : le cas du jazz ancien) n'est calculée qu'**une fois** (moitié moins de calcul). Un worker par rendu, terminé à la fin ou à l'annulation (la mémoire d'une instance WebAssembly ne se rend que comme cela) : annulation en moins d'une milliseconde mesurée |
| `rubberband/` | `worker.ts` (le worker : récupère le binaire sur l'origine de l'app, au premier rendu seulement), `job.ts` (le travail du worker, séparé de sa plomberie pour les tests Node), `protocol.ts`, `stretcher.ts` (Rubber Band hors ligne : flux d'entrée, silence derrière la fin jusqu'à la dernière image voulue, retard mesuré, fondus de bord), `rubberband-nosimd.wasm` (**le binaire du prototype tel quel**), `LICENSE-rubberband-GPL.txt` (copiée dans `assets/` à la construction), `SOURCES.md`, `testing.ts` |
| `budget.ts` | ce que l'appareil peut tenir (voir « Mémoire ») et combien de pistes rendre à la fois |
| `mock.ts` | `MockRenderer` : grains fenêtrés superposés, sans rééchantillonnage : durées et alignement justes, ni transposition ni timbre |
| `index.ts` | la fabrique `getRenderer()` : **le vrai rendu dans un navigateur**, le factice dans Node, sur `?demo`, `?debug`, `?moteur=factice`, `?rendu=lent` (à voir : l'attente) ; `?rendu=reel` force le vrai sur une page de test, `?rendu=factice` le factice (comme `analysis/index.ts`) |
| `controller.ts` | « Appliquer » : refuse d'emblée ce que l'appareil ne tiendrait pas (`memory`), rend les pistes affichées **les plus longues d'abord, `renderer.parallel` à la fois** (progression comptée en images : le travail y est proportionnel), la première erreur arrête les autres, garde **la seule copie** du rendu (16 bits partagés) et la donne au moteur ; tout changement de tonalité, tempo, formants ou pistes le périme : il est lâché aussitôt, retour à la préécoute ; `appliedAudioFor` (l'export s'en sert quand il correspond) |

**Ajout au contrat du moteur** (`audio/AudioEngine.ts`, rétrocompatible) :
`setRenderedTracks(set | null)` et `isRenderedInUse()`. Un `RenderedSet` donne,
pour chaque piste chargée, l'audio rendu et les réglages qu'il contient
(demi-tons, cents, tempo). Le moteur le fait entendre **tel quel** (ni étirement
ni transposition) seulement tant que ses réglages en direct sont ceux du jeu et
qu'il couvre toutes les pistes ; sinon il joue la préécoute. **Tout reste en
temps source** pour l'interface : position, déplacement, boucle, clics, durée ;
correspondance linéaire (image rendue k = temps source `k × tempo / 48 000`).
Mixage, boucle (fondu au repli), métronome et limiteur comme en préécoute.
`loadTracks()` et `clear()` lâchent le jeu, `removeTrack()` retire l'entrée de la
piste. `MockEngine` l'implémente (`snapshot().rendered`), `WorkletEngine` aussi
(voir « Le lecteur du rendu » ; `renderedBytes()` donne la mémoire du jeu).

**Le binaire est celui du prototype, sans recompilation.** Son interface
(`fe_*`) est celle du temps réel (`OptionProcessRealTime`, R3 « finer »,
`OptionPitchHighConsistency`), mais elle porte tout ce qu'un rendu hors ligne
demande : échelle de hauteur (demi-tons et cents ensemble), rapport de temps,
option de timbre (`fe_set` : formants conservés ou déplacés, avant la première
image), et la recette d'alignement de Rubber Band (`fe_reset` donne le début de
silence préféré et retire le retard de démarrage). Le mode hors ligne
d'origine (`OptionProcessOffline`, `study()`) n'est pas atteignable par cette
interface ; il n'a pas semblé nécessaire (voir « Alignement »), et sa
compilation demanderait Zig et de nouvelles mesures. La variante SIMD (509 Ko)
n'est pas livrée : mesurée sur 30 s de mono, 2,7 s contre 3,1 s sans SIMD, 4,4 s
contre 4,1 s selon le réglage : dans le bruit, pour un fichier de plus. Le
binaire (486 Ko) n'est demandé que **quand « Appliquer » (ou un export)
démarre**, par le worker, sur l'origine de l'app (`fabtice://app` : vérifié
sous sa politique de sécurité), et sa licence GPL (Rubber Band est
GPL-2.0-or-later, compatible avec ce projet) est servie à côté.

**Alignement : ce qui est mesuré.** Au rapport 1 et sans transposition le
binaire tombe juste (0,07 ms). Ailleurs son retard de démarrage est faux de
plusieurs millisecondes (jusqu'à −10 ms à 0,5 fois le tempo et +7 demi-tons),
toujours du même montant pour les mêmes réglages et **sans dérive** le long d'un
fichier. `measureDelay` mesure ce retard sur un court signal de clics (11
clics, 3 s, 0,4 s de calcul, gardé pour la vie de la page) et le rendu décale
sa sortie d'autant (images retirées, ou silence devant). Reste la gigue propre
à Rubber Band (sa grille de sauts de 128 à 256 images, soit 2,7 à 5,3 ms) : on
ne peut pas l'enlever. Un train de clics de 20 s (un clic toutes les 0,27 s,
bruit de 1 ms), rendu dans Chromium, position de chaque clic contre sa place
(`npm run test:render`, erreur du premier au dernier clic, pire écart) :

| Tempo | −3 demi-tons | +2 | +7 |
|---|---|---|---|
| 0,5 | 97 % à ±2 ms, pire 2,2 ms | 90 % à ±2 ms, **pire 4,2 ms** | 99 % à ±2 ms, pire 2,6 ms |
| 0,7 | pire 0,6 ms | pire 1,1 ms | pire 1,4 ms |
| 1,25 | pire 1,1 ms | pire 0,3 ms | pire 0,3 ms |

Donc **±2 ms pour tous les clics aux tempos 0,7 et 1,25, pas à 0,5** : là, un
clic sur dix s'écarte de plus (jusqu'à 4,2 ms mesurés) ; c'est le pas de
l'algorithme, pas un retard. Cinq minutes (155 clics, tempo 0,7, +2 demi-tons,
mono, 35 s de calcul) : moyenne des 20 premiers clics −0,22 ms, des 20 derniers
−0,19 ms (dérive 0,03 ms), pire 1,24 ms, longueur exacte. 

**Justesse et timbre.** Hauteur à moins de 5 cents sur un sinus (+7 demi-tons ; −5 à 0,7 ;
+2 et 30 cents à 1,25 ; −40 cents ; +3 et 50 cents à 0,8 : test Node) ; les cents sont
pris en compte. « Conserver le timbre » (formants) ne change le résultat que
demandé : deux rendus sans sont identiques, avec, la fréquence moyenne d'une
voix synthétique reste à 15 % de l'origine à +7 demi-tons, contre +30 % ou plus
sans. Il coûte un tiers de calcul en plus (24,7 à 25,9 s contre 19 à 21 s par
minute stéréo à 0,7). Sans clic : la sortie démarre et finit en douceur ; sur
une plage prise **dans** l'audio (export de boucle) l'audio d'avant et d'après
(170 ms) nourrit le moteur pour que son démarrage ne soit pas dans ce qu'on
garde, plus un fondu de 2 ms au bord. Image stéréo : les deux canaux passent
ensemble dans une seule instance (un son à gauche reste à gauche, niveaux et
phase tiennent, vérifié).

**Vitesse (ce poste, Xeon virtuel à 4 cœurs, 2,1 GHz : ne dit rien des autres
machines).** Une minute d'audio **stéréo**, un worker, +2 demi-tons : **15 à 16
secondes à tempo 1, 19 à 21 secondes à 0,7**. Une piste stockée une fois (mono)
en demande la moitié. Quatre pistes stéréo d'une minute à 0,7 : 78 à 86 s avec un
worker, 41 à 55 s avec deux (1,5 à 1,9 fois plus vite), 54 à 57 s avec trois,
47 à 51 s avec quatre : au-delà de deux, rien de net ici (la machine partage
sa mémoire entre les cœurs). `renderParallelism()` : un worker par cœur moins
un, trois au plus, un seul sur téléphone. **Sept pistes stéréo de cinq minutes
demanderaient ici de l'ordre de dix minutes de calcul, cinq à six avec deux
ou trois workers** (la moitié en mono) : l'attente d'« Appliquer » est longue
sur une grosse pièce, avec une estimation du temps restant sur l'écran ; elle
n'a pas été mesurée sur un Mac.

**Le lecteur du rendu (`audio/worklet/core.ts`, `WorkletEngine.ts`).**
`setRenderedTracks` envoie au fil audio **les blocs mêmes de la page**
(mémoire partagée, rien n'est copié) ; `isRenderedInUse()` dit ce qu'on
entend. Le lecteur a deux curseurs : celui de la préécoute (ce qui est
**donné** aux étireurs, en avance de leur latence) et celui du rendu (ce qui est
**lu**, donc entendu : pas de latence). Le rendu est lu tel quel, une image
rendue par image de sortie, à la position `source / rapport` ; position, boucle,
clics et durée restent en temps source. Il est utilisé tant que la tonalité
(demi-tons et cents) et le tempo vivants sont exactement ceux du jeu (le lissage
du tempo est fini) et que le jeu couvre toutes les pistes. Mixage, sourdine, solo,
volume, boucle (même fondu de 20 ms au repli), métronome et limiteur sont ceux de
la préécoute ; la préécoute elle-même, sans jeu utilisable, est **identique au
bit près** (test : deux lecteurs, avec et sans jeu inutilisable, même sortie).
`loadTracks()`, `clear()` et `removeTrack()` lâchent ce qu'ils doivent ; une piste
ajoutée n'a pas de rendu, donc le jeu cesse d'être entendu jusqu'à un nouveau.
- *Préécoute → rendu* : immédiat, au même endroit entendu, fondu enchaîné de
  15 ms (puissances égales).
- *Rendu → préécoute* : **différent de ce que la spécification dit**, voir plus
  bas : les étireurs doivent être nourris depuis la position entendue et
  mettent leur latence (152 ms à vitesse normale, 340 ms à 0,25 fois, mesurées)
  avant de sonner ; le rendu continue, à son propre tempo, pendant ce temps
  (0,17 s vers un tempo de 0,9 ou 1, 0,22 s vers 0,5), puis fondu de 15 ms ;
  le curseur des étireurs est calculé pour que leur son et le rendu se
  retrouvent à la même position (le lissage du tempo est pris en compte :
  l'écart entre les deux au moment du fondu est de 0,7 ms, contre 6 ms avant ce
  calcul).
- Le métronome suit le chemin le plus entendu : au changement, les clics pas
  encore commencés sont oubliés et placés de nouveau d'après la nouvelle
  position (aucun clic perdu ni doublé, mesuré sur quatre allers-retours).

Mesures (`npm test` : `audio/worklet/core.test.ts`, 13 vérifications du rendu ;
`npm run test:engine`, sections 14 à 18, vrai moteur dans Chromium) :
- le rendu est joué **échantillon pour échantillon** (écart au rendu 1,5 e-5,
  l'arrondi 16 bits), retardé du seul limiteur ;
- position entendue (`getPosition`) contre la fréquence d'un glissando qui dit
  la seconde source entendue, avant, pendant et après les deux passages : 1 à 3
  ms d'écart en régime, 5 à 9 ms au plus aux passages (les instants où les deux
  rendus sont mélangés pendant 15 ms ne sont pas comparés : une fréquence lue
  sur 43 ms n'y veut rien dire) ; la position rapportée ne saute jamais (entre
  deux relevés distants de moins de 20 ms, elle avance de ce que l'horloge dit à
  12 ms près au pire sur plusieurs essais, le plus souvent à 1 ou 2 ms ; un saut
  de la latence du moteur serait de 152 ms) ;
- pas de discontinuité : le plus grand pas d'échantillon reste à **1,3 à 1,4
  fois** celui d'un sinus stable de 2 kHz (un clic serait bien plus), dans les
  deux sens (seuil du test : 1,5) ;
- boucle : 100 tours à 0,7 dans Node, 14 en réel : chaque repère revient
  exactement un tour plus tard (écart ≤ 0,02 ms, tour moyen juste à 0 µs sur 13
  tours), la position reste dans la boucle ;
- métronome à 0,7 : chaque clic tombe sur le battement du rendu (même espacement
  à 0,02 ms) ;
- processeur, sept pistes stéréo, métronome : **rendu 1,0 à 1,4 % du budget d'un
  quantum, préécoute 23 à 26 %** (Node 1,0–1,2 contre 23,4–23,6 ; Chromium 1,4
  contre 26,1) : environ vingt fois moins ;
- sept pistes stéréo de 120 s lues en rendu : aucun quantum hors budget, aucun
  trou (plus longue suite d'échantillons nuls : 1), aucune sous-alimentation.

**Mémoire : le rendu vit en mémoire, pas dans des fichiers temporaires.**
Un jeu appliqué est une copie de plus des pistes **à la vitesse jouée** (16 bits,
en mémoire partagée : le moteur lit les blocs de la page, sans copie) : à 0,7 fois
le tempo, 1,43 fois la taille des sources. Mesuré avec sept pistes stéréo de
cinq minutes (`npm run test:memory`) : sources 385 Mo, jeu appliqué **550 Mo**
(1,43), mémoire résidente de Chromium +638 Mo à la pose du jeu (le test construit
aussi les pistes en Float32 une à une) ; lâché, le moteur n'en tient plus aucun
octet. Pourquoi pas des fichiers temporaires (la question ouverte du lot) : le
lecteur lit des blocs de 64 Ko dans la mémoire partagée du fil audio, au quantum ;
il n'y a pas de lecture de fichier possible dans un AudioWorklet, il faudrait un
second flux fait de messages, des tampons de préchargement, et rater un
quantum se paie par un trou sonore, pour garder des octets que l'appareil sait
déjà tenir ; et IndexedDB (la seule place disponible partout, y compris
`fabtice://app`) relirait les blocs par des promesses. En contrepartie un
**budget** (`budget.ts`) refuse calmement ce qui ne tiendrait pas : un dixième de
`navigator.deviceMemory` quand il est donné (un quinzième sur téléphone, entre
128 Mo et 1,5 Go), sinon 768 Mo sur ordinateur et 192 Mo sur téléphone (la page
d'un iPhone 14 Pro Max a été fermée par le système pendant une séparation). Sept
pistes stéréo de cinq minutes à 0,7 (550 Mo) passent sur un ordinateur de 8 Go ;
elles ne passeraient pas sur un téléphone ; à 0,25 fois le tempo elles
demandent 1,5 Go. Le refus se fait **avant tout calcul** : « Cet appareil ne peut
pas contenir le rendu de qualité de ce morceau ; la préécoute continue. »
Le même texte sert si la mémoire manque pendant le calcul (une erreur de
mémoire du worker ou de la page). Rien ne plante la page : un jeu refusé n'est
simplement pas construit.

**L'écran** (`components/ApplyRender.tsx`, inchangé dans son principe) :
progression **réelle** (la part des images rendues, qui ne recule pas), le
temps restant une fois le rythme connu (cinq secondes, 3 %), « Annuler » (le
worker est terminé aussitôt), la phrase du refus ou de l'échec avec « Compris »,
jamais la braise. Vérifié à 1280 × 800 et 390 × 844 (captures de `test:render`).

**Écarts avec la spécification.**
1. *Rendu → préécoute pas instantané* : voir plus haut. La préécoute en direct
   suit un changement de tonalité ou de tempo sans attendre parce que ses
   étireurs tournent déjà ; revenus du rendu ils ne tournent plus et leur latence
   (152 ms à vitesse normale) est incompressible avec le binaire actuel (`outputSeek` de
   Signalsmith, qui la supprimerait au prix d'un pic de calcul, n'est pas exporté
   par le wasm). Le **nouveau réglage s'entend donc 0,17 s (vers 0,9 ou 1) à 0,22 s (vers 0,5), jusqu'à 0,35 s (0,25 fois) après le geste**
   (ancien rendu entre-temps), sans arrêt ni clic ni saut de position. Un
   changement continu (curseur) ne paie ce délai qu'une fois.
2. *Même tonalité = mêmes demi-tons et cents au centième* : le moteur compare la
   hauteur totale (`demi-tons + cents / 100`), pas la paire ; (1, −50) et (0, +50)
   sont le même son et le même jeu. `MockEngine` compare les paires.
3. *±2 ms pour tous les clics* : tenu à 0,7 et 1,25, **pas à 0,5** (voir plus
   haut).
4. *Rubber Band hors ligne (`OptionProcessOffline`)* : non utilisé, voir plus haut.

**Ce qui reste.**
- Mesurer sur un **Mac** (M1, et Intel sous Monterey, jamais essayé) la vitesse
  du rendu et le parallélisme ; sept pistes de cinq minutes demandent des
  minutes ici. Pistes : ne rendre d'abord que ce qui s'entend (solo, sourdine),
  rendre en tâche de fond pendant que la préécoute joue, regrouper les pistes
  mono.
- Le temps restant est une règle de trois sur la part déjà faite ; pas calibré.
- Le mode hors ligne de Rubber Band ou un plus petit pas (`WindowShort`) pour
  descendre la gigue sous ±2 ms à 0,5 : demande de recompiler.
- Le rendu n'est pas gardé : un jeu appliqué ne survit pas à un rechargement ou à
  un changement de pistes (voulu).
- Safari : le worker de module, WebAssembly et la mémoire partagée viennent d'être
  essayés dans Chromium seulement.

##### Export audio — `src/export/audio/`

| Fichier | Rôle |
|---|---|
| `types.ts` | le contrat : `AudioEncoder.encode(PcmAudio, { onProgress, signal })` → `Blob` (lecture par blocs, jamais une copie Float32 entière), `ExportPlan` (format, plage, tonalité, tempo, formants, fichiers et leurs pistes avec leur gain, archive), `ExportError` (`cancelled`, `nothing`, `encoder-missing`, `memory`, `failed`) |
| `plan.ts` | ce qu'on fabrique, pur et testé : **le mélange tel qu'on l'entend** (muet, solo et volumes compris) en un fichier, ou **les pistes séparément, chacune à son plein niveau** (muet, solo et volume ignorés : une piste séparée est une matière première ; on coche celles qu'on veut) en une archive ; le morceau entier ou la boucle ; noms de fichiers lisibles (« Blues du dimanche – Basse – boucle (+2 demi-tons, tempo 80 %).wav ») |
| `run.ts` | rend chaque piste par le rendu hors ligne (ou reprend le rendu appliqué s'il correspond, ou copie la plage telle quelle à la tonalité et au tempo d'origine), mélange dans un seul accumulateur (une piste rendue à la fois en mémoire), baisse le tout uniformément si le mélange dépasse la pleine échelle (jamais d'écrêtage), encode, met en archive |
| `encoders.ts`, `wav.ts` | le registre des encodeurs (`registerEncoder`) ; WAV 16 bits, écrit directement depuis les blocs 16 bits. MP3 et FLAC sont affichés « bientôt » tant qu'ils manquent |
| `zip.ts` | archive ZIP sans compression (l'audio ne se compresse guère), noms UTF-8, CRC lu par tranches (le fichier reste un `Blob`) |
| `deliver.ts` | remise : un lien normal vers le fichier (`download`), comme pour iReal Pro ; le navigateur l'enregistre, l'app Mac en fait un vrai téléchargement |

**Ce que l'agent de l'export doit construire** : les encodeurs MP3 et FLAC
(portages WebAssembly d'encodeurs libres, chargés au premier usage, dans un
worker, licences jointes), enregistrés par `registerEncoder` ; vérifier la
remise du fichier dans l'app Mac (dialogue d'enregistrement d'Electron) avec un
test de bout en bout ; mesurer la mémoire d'un export de sept pistes de cinq
minutes (le WAV de sept pistes en archive pèse environ 400 Mo) et, s'il le
faut, écrire par morceaux (flux) plutôt qu'en `Blob` entier.

#### Écrans

| Où | Quoi |
|---|---|
| Fenêtre « Nouveau morceau » (`NewPieceDialog.tsx`, `ImportStems`) | « Instruments à séparer » comme la maquette : les instruments que **l'outil en service** fournit (BS-RoFormer SW : six ; SCNet : quatre ; « Vents » n'apparaît que si un outil le donne), aucun coché ; coché : estimation honnête (« environ 14 min pour un morceau de quatre minutes, sur cet appareil »), les non cochés vont dans « Autres » ; « Aller plus loin : batterie détaillée, saxophone… » dit qu'aucun outil détaillé n'est proposé tant que la liste n'en a pas |
| Sous les en-têtes de pistes (`SeparationEntry`) ; menu « ⋯ » sur téléphone | « Séparer les instruments » (« Séparer » sur téléphone), puis « Instruments » |
| Barre du haut (`SeparationStatus`) | « Séparation · 34 % », ou « Séparation interrompue » ; ouvre le panneau |
| Panneau « Instruments » (`SeparationPanel.tsx`) | outil, estimation (« estimation, pas encore mesurée » quand c'est le cas), premier téléchargement (taille, hôte, page source, licence connue, et pour une licence floue : Fabtice ne distribue pas ces poids), instruments voulus, « Séparer » ; pendant : étape, jauge, temps restant, carte graphique ou processeur, **avis calme du repli** (filet de laiton), « Annuler » ; après : outil et durée, « Revenir au morceau entier » / « Revoir les instruments », place prise sur l'appareil (instruments, outils), « Libérer la place » (confirmé), « Séparer de nouveau » |
| Réglages (`SettingsPopover.tsx`) | « Réglages avancés », replié : outil de séparation (« Automatique : Le plus fin », et pourquoi), « Conserver le timbre » |
| Transport (`ApplyRender.tsx`) | « Appliquer » quand la tonalité ou le tempo diffèrent de l'original et que le rendu n'est pas en place ; écran d'attente court (« Calcul des pistes… », jauge, « Annuler ») ; une fois appliqué, « rendu appliqué », discret (pointillé, encre douce) ; jamais la braise |
| « Exporter » → « Le son… » (`ExportAudioDialog.tsx`) | quoi, durée (avec les mesures de la boucle), format, rappel de la tonalité et du tempo, « Exporter », progression, « Enregistrer « nom » » |

Tous les panneaux sont vérifiés dans la fenêtre et au-dessus du transport à
1280 × 800, 960 × 640 et 390 × 844 (`test:separation`, `ui/useFitPanel.ts`).

Adresses de démonstration du lot 3 (le morceau de démonstration en **une**
piste entière d'abord) : `?demo&separation=entier` (pas encore séparé),
`=faite` (déjà séparé), `=lente` (séparation lente avec premier
téléchargement), `=repli` (la carte graphique « lâche », le processeur
continue), `=echec` ; `&rendu=lent` (voir l'attente d'« Appliquer ») ;
`&export=ouvert`. `window.__fabtice.lot3` (avec `?demo` et `?debug`) donne la
séparation, le rendu, l'export, le registre, le format 16 bits et le stockage.

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

Tout est en place : la feuille fidèle à la maquette, et ce qu'un musicien fait
dessus. Les parties pures sont testées dans Node (Vitest), le reste dans
Chromium (`npm run test:chart`).

**Fichiers.**

| Fichier | Rôle |
|---|---|
| `layout.ts`, `edits.ts` | mise en page et corrections pures (accords en vigueur, mesures, répétition « 𝄎 », sections et doubles barres, lignes de quatre mesures ; réécriture d'une mesure entière, retour à l'analyse, `hasBarEdit`, `mergedEntries`) |
| `ChartSheet.tsx` | la feuille : en-tête (titre, tonalité, métrique, tempo, choix Ut / Si♭ / Mi♭) et états vide, « analyse en cours », échec, aucun accord |
| `ChartGrid.tsx` | les mesures et tout ce qui se fait dessus : gestes, clavier, suivi, éditeur |
| `gesture.ts` | les gestes de la souris et du doigt comme une petite machine à états pure (clic, glisser, appui long) |
| `hit.ts` | quelle mesure est sous un point, même dans l'espace entre deux lignes ou au-delà de la dernière ; sélection d'une mesure à l'autre, dans les deux sens |
| `useChartGestures.ts` | branche les événements du pointeur sur `gesture.ts` et en applique les effets (`seek`, `setLoopRegion(loopFromBars(…))`, `enterLoop()`) ; défilement automatique en bord de feuille pendant un glisser |
| `stops.ts` | les arrêts du clavier (chaque accord, et la zone d'accord d'une mesure sans accord) et les déplacements aux flèches |
| `editor.ts`, `editorPlacement.ts`, `ChordEditor.tsx` | l'état de l'éditeur, ce qu'un clic change à un accord (`patchChord`), la place de la fenêtre (fonction pure), la fenêtre elle-même |
| `KeyEditor.tsx` | la correction de la tonalité depuis « Tonalité de … » |
| `useFollowLine.ts` | « Suivre la tête de lecture » sur la feuille |
| `print.ts`, `../styles/print.css` | « Imprimer la grille » |

**Gestes** (comme dans la frise des pistes) :

| Geste | Effet |
|---|---|
| clic sur une mesure (hors accord) | `seek()` au début de la mesure |
| clic sur un accord, ou sur la zone d'accord d'une mesure vide ou en répétition | ouvre l'éditeur d'accord ; la tête de lecture ne bouge pas |
| clic sur la lettre d'une section | ouvre l'éditeur sur le champ de la section |
| glisser à la souris sur des mesures (dans les deux sens, d'une ligne à l'autre ; on peut commencer sur un accord) | sélection en direct : `setLoopRegion(loopFromBars(…))` ; au relâchement `enterLoop()` ; la feuille défile seule quand on approche son bord haut ou bas |
| doigt : un tapotement | comme le clic (mesure : tête de lecture ; accord : éditeur) |
| doigt : glisser | fait défiler la feuille (le navigateur) ; rien n'est sélectionné |
| doigt : **appui long (0,42 s) puis glisser** | sélectionne : l'appui long prend la mesure sous le doigt (le voile de laiton dit que c'est pris), glisser prolonge, lever termine (`enterLoop()`) |
| clavier : flèches, Début, Fin | passent d'accord en accord (haut et bas : même colonne, ligne voisine) ; un seul arrêt avec Tab pour toute la feuille |
| clavier : Entrée | ouvre l'éditeur, curseur dans le champ de saisie |
| clavier : une lettre A–G ou N | ouvre l'éditeur avec la lettre dans le champ ; on tape le symbole (`Bbm7`, `F7b9`, `C-7`, `Ebmaj7`, `N.C.`), Entrée l'applique, ferme l'éditeur et passe à l'accord suivant |
| clavier : Échap | ferme l'éditeur ; le focus revient sur l'accord |

*Pourquoi l'appui long pour sélectionner au doigt.* Au doigt, glisser doit faire
défiler la feuille (c'est ce qu'on attend d'une page). Sélectionner par un
simple glisser ferait boucler des mesures à chaque défilement. L'appui long
est le geste que le système lui-même utilise pour « prendre » quelque chose ;
un tapotement est trop court (moins de 0,42 s) et un défilement bouge avant
(plus de 10 px) : aucun des deux ne peut le déclencher par erreur. Sur un
écran tactile, une ligne d'aide sous le titre le dit (`.aide-doigt`, affichée
seulement si `(pointer: coarse)`).

**L'éditeur d'accord** (`ChordEditor.tsx`) : une petite fenêtre accrochée à la
mesure. Sa place est choisie par une fonction pure (`editorPlacement.ts`, testée),
toujours avec la fenêtre entière et la mesure dans la partie visible de la feuille,
au-dessus du transport : sous la mesure, sinon au-dessus, sinon à côté (à droite
puis à gauche), sinon sous la mesure après avoir fait défiler la feuille ; en
dernier recours (fenêtre très basse, « Extension et basse » déplié), la fenêtre
reçoit une hauteur maximale et défile à l'intérieur, à côté de la mesure. Elle est
recalculée à l'ouverture, au changement de mesure, quand elle change de taille et
quand la fenêtre de l'app change de taille. Sur téléphone (moins de 760 px) un panneau qui
monte du bas de l'écran, la mesure restant visible au-dessus. Chaque choix
s'applique aussitôt (pas de bouton « Valider »), par les actions de
`store/harmonyActions.ts`. Champs, de haut en bas :

- *Mesure N*, les onglets 1, 2… quand la mesure a plusieurs accords, l'accord
  tel qu'écrit, la croix ;
- si l'accord est douteux : « Fabtice hésite sur cet accord. », **« C'est le bon
  accord »** (`confirmBar`) et, s'il y en a, « Ou peut-être : » avec les autres
  lectures de l'analyse (`alternatives`) ;
- « Taper un accord : B♭m7, F7♭9… » : champ lu par `parseChord` (en tonalité et
  instrument **affichés**), `writeChordText` ; un symbole illisible reçoit une
  phrase calme et rien ne change ;
- **Note** : les douze notes, orthographiées pour la tonalité affichée ;
- **Nature de l'accord** : les seize qualités du modèle, écrites comme sur la
  grille (triangle pour le majeur 7, « m » ou « – » selon le réglage), sur la
  note choisie ;
- « Extension et basse » (replié) : les onze extensions (plusieurs possibles,
  dans l'ordre d'une grille) et la note de basse ;
- « Pas d'accord (N.C.) », « Deux accords dans la mesure » (`splitBar`) ou « Un
  seul accord pour la mesure » (`mergeBar`, garde l'accord choisi), « Retirer
  cet accord » (`removeChord`), « Revenir à l'analyse » (`resetBar`, seulement
  pour une mesure écrite à la main) ;
- **Lettre de section** : A, B, C, D, un nom libre (12 signes au plus : « Intro »,
  « Solo »…), « Retirer la lettre » (`setSection`).

Ce qui est tapé ou choisi est en tonalité et instrument **affichés** et gardé
en Ut dans la tonalité d'origine (`untransposeForStorage`,
`replaceDisplayedChord`, `setDisplayedKey`). Une mesure où l'accord continue
(signe de répétition) s'ouvre sur l'accord qui continue ; le premier choix en
fait un accord écrit. La mesure en cours de correction est cernée d'un filet
d'encre (jamais la braise).

**La tonalité** : le clic sur « Tonalité de … » ouvre une petite fenêtre
(majeur / mineur, douze notes, `setDisplayedKey`) et, quand elle a été corrigée,
« Revenir à la tonalité de l'analyse (…) » ; choisir à nouveau la tonalité
trouvée n'est pas une correction.

**Suivi** : `view.follow` est le réglage « Suivre la tête de lecture ». En
lecture la feuille défile en douceur (380 ms, sans animation si
`prefers-reduced-motion`) pour garder la ligne jouée et la suivante en vue
(`followTarget`). Elle ne lutte jamais : molette, doigt, touches ou barre de
défilement suspendent le suivi (et une grâce de 1,2 s), qui reprend quand la
ligne jouée est de nouveau visible, à la lecture suivante ou après un
déplacement fait sur la grille.

**Impression** (`print.ts`, `styles/print.css`) : « Imprimer la grille » (menu
« Exporter », et menu « ⋯ » du téléphone) passe à l'affichage Grille si besoin,
attend la mise en page et les polices, appelle `window.print()` puis rend
l'affichage à `afterprint`. La feuille d'impression ne laisse que `.feuille` :
papier blanc, titre, tonalité telle qu'affichée (avec « pour instrument en
Si♭ » hors Ut), métrique, tempo, lettres de section, accords dans la même
typographie, quatre mesures par ligne, saut de page seulement entre deux
lignes (`break-inside: avoid`) ; ni voile de boucle, ni filet de la mesure en
cours, ni style « douteux », ni barre du haut, transport, éditeur. Le format du
papier (A4 ou US Letter) est celui du navigateur : les marges sont dans
`@page`, rien ne dépend de la taille. `test:chart` imprime en PDF (A4 et
Letter), lit le texte, compte les pages et vérifie que chaque page tient des
lignes entières. Le PDF liste deux fois ♭ et ♯ (ils sont tracés avec un contour,
`.alt` dans `chords.css`) : c'est un effet de la couche de texte, pas du dessin.

**Coutures encore utiles** : chaque mesure porte `data-mesure` (indice), chaque
accord `data-accord` et `data-stop` (`mesure:rang`, -1 pour la zone d'accord
d'une mesure sans accord) ; la boucle d'animation ne passe jamais par React
(`usePlayheadBar`, `useFollowLine`).

**Ce qui manque** : pas d'annulation d'une série de corrections (seulement
« Revenir à l'analyse » mesure par mesure et `resetChordCorrections`) ; pas de
copie d'une mesure ni de plusieurs mesures à la fois ; pas de poignées pour
ajuster les bords de la boucle sur la grille (la frise des pistes les a) ; pas
d'en-tête ni de numéro de page à l'impression ; une mesure de trois accords ou
plus se corrige accord par accord (onglets) mais ne se découpe pas davantage.

#### Frise du temps — `src/timeline/`

- **Fait** : le rang « Accords » de la règle et la courbe de tempo mesure par
  mesure (détail dans « Frise du temps » plus bas). Le rang existe quand
  `selectHasChords(state)` est vrai ; `rulerRows({ hasChords })` donne les
  hauteurs à la colonne des en-têtes (`components/RulerHeads.tsx`) comme à la
  frise, si bien que rien ne bouge quand une analyse se termine et que le rang
  apparaît.
- **Temps analysés** : `barLines`, `subGridLines`, `snapTime`, `loopFromBars`,
  `barsOfRange`, `metronomeClicks` donnent les bonnes lignes sur une carte
  variable ; `test:timeline` le vérifie sur `?demo` (lignes de mesure sur les
  temps analysés, clic calé sur un temps analysé, sélection de mesures dans le
  rang des accords). Seule correction faite dans la frise : l'échelle du
  téléphone (86 px par mesure) part du tempo nominal de la carte, non du tempo
  de son premier temps.

#### Export iReal Pro — `src/export/`

- **Fait** : `chartForExport(state)` rend une représentation pure de la grille
  (`ExportChart` : titre, tonalité écrite, métrique, tempo, mesures avec section,
  double barre, changement de métrique, accords au temps près, répétition,
  dernière mesure), en Ut **dans la tonalité jouée** (transposition du transport
  appliquée ; l'instrument non : iReal Pro transpose lui-même).
  `exportToIRealPro(chart)` (pur) en fait le lien `irealb://` (et l'ancien lien
  `irealbook://`), la page HTML qui le porte (une phrase en français) et le nom
  du fichier (celui du morceau). `IREAL_EXPORT_READY` est vrai.
- **Le format** est décrit, avec ses sources (dépôts, licences), dans
  `src/export/IREAL-FORMAT.md` (en anglais) : champs du lien, mélange des 50
  caractères, cellules (une par temps), sections, mesures qui continuent
  (`x`, barres obliques `p`), N.C., vocabulaire d'accords et ce qu'iReal Pro ne
  sait pas écrire (l'approximation choisie, dite). À lire avant de toucher au
  codage.
- **Fichiers** : `ireal.ts` (champs, chaîne de la grille, mélange, lien, page),
  `irealChords.ts` (la table des qualités d'iReal Pro et la correspondance avec
  le vocabulaire de l'app : elle sert au codage et, dans les tests, au
  décodage), `export.css` (les entrées du menu), `chartExport.ts`.
- **Tests** : `ireal.test.ts` écrit des grilles et les relit avec un lecteur
  indépendant (`src/test/irealDecoder.ts` : son propre mélange, son propre
  découpage, une grammaire des qualités plutôt que la table) : le morceau de
  démonstration, 2/4 à 7/4, deux et quatre accords par mesure, levée, N.C.,
  répétitions, changement de métrique, 300 mesures, des grilles de toutes les
  tailles autour des 50 caractères du mélange, chaque qualité avec chaque
  extension, des titres étranges. `ireal.reference.test.ts` relit les mêmes liens
  avec des lecteurs publiés, **sans les ajouter à l'app** : il ne fait rien
  tant qu'on ne lui indique pas où ils sont (voir son en-tête :
  `IREAL_REFERENCE_DIR`, `IREAL_REFERENCE_PYTHON`) ; `npm test` le saute.
- **Remise à l'utilisateur** : « Grille pour iReal Pro » est un **lien normal** vers
  la page enregistrée sous le nom du morceau (le navigateur l'enregistre ; dans
  l'app Mac c'est un vrai téléchargement). Dans l'app Mac, « Ouvrir dans iReal Pro »
  s'y ajoute : `window.fabtice.openInIRealPro(lien)`, typée dans
  `platform/desktopBridge.ts` (facultative : une app Mac plus ancienne ne l'a
  pas). Elle n'accepte que `irealb://` et 200 000 caractères au plus
  (`desktop/src/ireal-link.js`).
- **Reste à faire** : rien pour l'export lui-même. Seul le propriétaire peut
  dire comment son iReal Pro importe le fichier (voir « ce qu'il reste à
  vérifier » dans `IREAL-FORMAT.md`) ; les répétitions et les fins numérotées
  ne sont pas écrites (la grille n'en a pas).

#### Le menu « Exporter » et les panneaux

« Exporter » est un petit menu (`components/ExportMenu.tsx`) : « Grille pour
iReal Pro » (un lien vers le fichier ; « Ouvrir dans iReal Pro » en plus dans l'app
Mac), « Imprimer la grille » (disponible, voir plus haut), « Le son : mélange,
pistes ou boucle… » (lot 3 : ouvre « Exporter le son »). Sur téléphone la barre du haut n'a pas la place du menu : ses
entrées sont reprises dans le menu « ⋯ » (`SettingsPopover`, `ExportItems`). Le
panneau « Tempo et mesures » (`components/GridPanel.tsx`) garde la
saisie du lot 1 et gagne : tempo ÷ 2 et × 2, premier temps un temps plus tôt ou
plus tard (de part et d'autre de « Premier temps ici »), l'origine de la grille,
« Revenir à l'analyse », « Analyser de nouveau ». Le panneau de l'accord fin
(Tonalité) dit à quel La l'enregistrement est accordé et propose « Ramener à
440 » (les cents du transport) ou « Laisser tel quel ». Le transport écrit la
tonalité comme la maquette : « A♭ · original », « A♭ → D♭ ».

### Moteur audio — `src/audio/AudioEngine.ts`

Interface `AudioEngine` : `loadTracks`, `addTrack`, `removeTrack`, `clear`,
`setRenderedTracks` et `isRenderedInUse` (lot 3, « Appliquer » : voir « Rendu hors
ligne et « Appliquer » » plus haut),
`play` (à appeler dans le geste de l'utilisateur la première fois), `pause`,
`seek`, `getPosition` (position **entendue**, appelée à chaque image : sans
allocation), `getDuration`, `setLoop`, `setTransposition(demi-tons, cents)`,
`setTempoRatio`, `setTrackMix`, `setMetronome`, `setClickTrack` (temps des
clics, calculés par `grid/lines.ts#metronomeClicks`), `on('state' | 'ended' |
'error')`, `dispose`. Pistes à 48 kHz (`ENGINE_SAMPLE_RATE`), données soit par
`pcm` (la forme 16 bits du registre, utilisée telle quelle, sans copie : c'est ce
que l'app passe depuis le lot 3), soit par `channels` (Float32 par canal,
converti une fois : tests).

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
  « Appliquer » et export) est **hors de ce moteur**, dans des workers ; ce moteur
  sait en revanche **jouer le rendu tel quel** (lot 3 : voir « Rendu hors ligne et
  « Appliquer » » plus haut, `setRenderedTracks`).
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
  pèse environ 58 Mo par piste ; depuis le lot 3 ce sont **les blocs du
  registre eux-mêmes** (`audio/pcm.ts`), plus de copie Float32 à côté. S'y
  ajoutent les instances Signalsmith (environ 6 Mo de mémoire wasm par piste).
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
`copyText`, `onYtdlpProgress`, `onExtractProgress`, et `openInIRealPro`, facultative : elle
ouvre un lien `irealb://` avec le système, rien d'autre). `getDesktopBridge()`
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
`store/document.ts#toProjectDocument`), les **octets audio d'origine** (le mp3,
le m4a… tel qu'importé) et, depuis le lot 3, les **instruments séparés** en 16
bits (voir « Où restent les instruments séparés »). Le PCM décodé de l'original
n'est jamais gardé : il est recalculé à chaque ouverture, de façon déterministe. Les préférences de l'utilisateur
(notation, suivi, sous-grille, magnétisme) restent dans `localStorage`
(`store/preferences.ts`).

| Fichier | Rôle |
|---|---|
| `ProjectStorage.ts` | le contrat (`replaceCurrent`, `saveCurrent`, `loadCurrent`, `loadAudio`, `clearCurrent`, `requestPersistence`…, et pour les instruments séparés `saveTrackAudio`, `loadTrackAudio`, `deleteTrackAudio`, `pruneTrackAudio`, `trackAudioUsage`) et `StorageError` (`unavailable`, `quota`, `corrupt`, `io`) |
| `indexedDb.ts` | l'implémentation : base `fabtice` v2, quatre magasins, `project` (clé `current` : `{ schema, document }`), `audio` (une entrée par `AudioRef.id` : `{ bytes, mimeType, fileName }`), `pcm` et `pcmInfo` (les instruments séparés, lot 3). `replaceCurrent` réécrit les deux dans **une seule transaction** : en cas d'échec, l'ancien projet reste entier. Les transactions sont validées tout de suite (`commit()`), sinon une page qui se ferme perdrait l'écriture |
| `documentFormat.ts` | lecture sûre : version du document (`MIGRATIONS` : de 1, lot 1, à 2, lot 2, puis à 3, lot 3 ; une version **plus récente** est ignorée, jamais écrasée à la lecture), contrôle de la forme (sinon `corrupt`) ; `STORAGE_SCHEMA` pour l'enveloppe |
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
garde que le PCM décodé, une seule fois (environ 11 Mo par minute en stéréo 16
bits, dans `audio/registry.ts`, lu par la frise et partagé avec le moteur) : les octets d'origine
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
suivi de la tête de lecture et interactions. Le rang « Accords » s'affiche dès que le morceau a des accords (analysés ou écrits à la main).

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
| `chordRow.ts` | rang des accords, fonctions pures et testées : quels accords s'écrivent (un accord répété n'est pas réécrit), où (au temps, 9 px après la barre) et lequel garder quand on dézoome |
| `chordMarkup.ts`, `chordLayer.ts` | le balisage d'un accord (identique à `<ChordSymbol>`, vérifié par `chordMarkup.test.ts`) et le DOM du rang : une étiquette par accord visible, déplacée par `transform`, gardée par clé |

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

**Rang des accords.** Les accords viennent de `selectChartBars` (ceux de la
grille d'accords : mêmes accords, mêmes corrections) et s'écrivent par
`selectDisplayContext` (transposition, instrument, « m » ou « – »), avec le
balisage et les styles de `<ChordSymbol>` (`styles/chords.css`) : triangle,
extensions en exposant, altérations serrées ; un accord douteux est à l'encre
douce, pointillé dessous. Ce sont des éléments DOM positionnés (`translate3d`)
pour la seule partie visible, dans `.frise-accords` : pendant la lecture sans
défilement, aucun élément n'est créé, retiré ni touché (vérifié). Un accord est
posé 9 px après la barre qui le commence (6 px pour un accord au milieu de la
mesure, qui se range à son temps ou juste après le précédent, et s'efface
s'il gênerait l'accord de la mesure suivante : celui du temps 1 est prioritaire) ;
une mesure à deux accords les écrit à 14,5 px, comme la maquette. Un accord qui
répète le précédent n'est pas réécrit. **Taille d'abord, éclaircissement ensuite** :
quand les mesures se resserrent, *toute* la rangée s'écrit plus petit d'un coup
(18, puis 16, puis 14,5 px, la taille d'une mesure à deux accords, plancher
toujours lisible ; classes `taille-1` et `taille-2`, mêmes balisage et styles que
la grille) avant d'abandonner le moindre accord. Seulement si la plus petite
taille ne tient pas non plus, comme les numéros de mesure, une étiquette toutes les
2, 4, 8… mesures (la plus petite foulée qui laisse sa place à l'étiquette la plus
large), chaque étiquette étant alors l'accord en vigueur sur la barre gardée. La
taille et la foulée (`chooseRowSize` dans `chordRow.ts`) ne dépendent que du zoom,
de la mesure la plus étroite *du morceau* et de l'étiquette la plus large *du
morceau* (jamais de ce qui défile : pas de scintillement) ; à un zoom confortable
rien ne change (18 px). Les traits de mesure du rang suivent la même foulée, pour
ne jamais couper une étiquette. `data-chord-size`, `data-chord-labels` et
`data-chord-stride` sur `.frise` servent aux vérifications.

**Courbe de tempo.** Un point par mesure (tempo moyen de la mesure, posé au
milieu de la mesure) tiré de `grid/tempoCurve.ts`, relié par une courbe lisse
d'encre fine, au-dessus d'un pointillé au tempo nominal ; un petit point sur les
mesures qui ont 24 px de place. L'échelle est celle du morceau entier, calculée
une fois par carte (elle ne bouge pas en défilant). Un tempo constant est une
droite au milieu du rang, sans points. L'en-tête lit « Tempo · ≈ N » quand le
tempo varie.

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
(`TIMELINE_ONLY=desktop|chords|stress|phone` pour une seule partie ;
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
