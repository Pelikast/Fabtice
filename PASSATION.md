# Passation — état du projet au 15 novembre 2026 : lots 1 à 3 publiés, retours du lot 3 et programme « accords » en cours

Ce document sert à reprendre le projet dans une nouvelle session sans relire
l'historique. `CLAUDE.md` (cahier des charges, décisions, mesures) et
`DESIGN.md` (design validé) font référence ; `app/README.md` décrit le code de
l'interface et ses contrats ; ce fichier ajoute l'état des lieux, les pièges
déjà rencontrés et le plan.

## Rôles et façon de travailler

- La session principale **orchestre** : elle découpe, délègue à des agents (un
  modèle fort pour ce qui demande du jugement ou de la recherche, un modèle
  plus léger pour l'exécution bien cadrée, effort adapté à chaque tâche),
  relit, vérifie et rend compte. Elle n'écrit elle-même que ce qui est trop
  petit pour être délégué. Le propriétaire veut **économiser son quota** : peu
  d'agents à la fois, des consignes précises, pas de travail refait.
- Le propriétaire est francophone et n'est pas développeur de métier : lui
  écrire en français simple, lui dire quoi tester et quoi recopier. Il juge à
  l'oreille et à l'œil ; il préfère la qualité à la vitesse.
- Ses appareils : MacBook M1 Pro 16 Go (macOS 27, Safari 27 et Chrome 157),
  iPhone 14 Pro Max, et un Mac Intel sous Monterey (celui de son père, 66 ans,
  guitariste de jazz, premier utilisateur visé) qui n'a encore rien testé.
- Chaque lot se termine par une version de l'app Mac qu'il télécharge depuis
  les « Releases » GitHub. Netlify ne se déploie que sur son clic, en fin de
  lot (voir `CLAUDE.md`, Conventions).
- **Un lot ne commence que sur son feu vert explicite.** Les lots 1 à 3 sont
  publiés et essayés par lui sur ses deux Mac. Il a donné son feu vert, dans
  cet ordre : corrections de ses retours, programme « accords », lot 4.
- **Nuit du 14 au 15 novembre** : il a demandé qu'on ne lui pose plus de
  question jusqu'à son réveil (« prends le reste des décisions tout seul ») et
  qu'une version publiée l'attende le matin pour ses deux Mac. Les décisions
  prises seules sont à lui rendre compte, clairement, dans le compte rendu.
- **Deux sessions travaillent** : la session d'origine (corrections des
  retours, fabrication sur les Mac de GitHub, publication) et une session
  neuve (programme « accords », puis lot 4). Règles entre elles : la session
  neuve ne pousse jamais sur `main` et ne lance pas la fabrication Mac (un
  lancement annule celui qui est en cours) ; quand une branche est finie et
  vérifiée chez elle, elle prévient la session d'origine, qui lance la
  fabrication et publie. C'est à la session d'origine que le propriétaire a
  donné l'accord de publier cette nuit.
- **Publier demande son accord à chaque fois** : l'environnement refuse un
  push sur `main` tant qu'il ne l'a pas confirmé. Lui poser la question
  (publier ou non) quand la branche est verte sur les Mac de GitHub.
- Limites fermes : aucun contournement des protections de YouTube ; aucun
  secret, aucune information personnelle et aucun nom de modèle ou
  d'assistant dans le dépôt, qui est public.

## Ce qui existe

| Dossier | Contenu | État |
|---|---|---|
| `app/` | L'interface, commune au web et à l'app Mac : écran, frise du temps, moteur audio, import, stockage local, analyse, grille d'accords, export iReal Pro, séparation des instruments, rendu « Appliquer », export audio | lots 1 à 3 livrés |
| `desktop/` | App Mac Electron : sert l'interface, import d'un lien par yt-dlp, enregistrement des fichiers exportés, fenêtre de diagnostic | lots 1 à 3 livrés, deux téléchargements |
| `web/` | Site statique : la construction de `app/` y dépose `index.html` et `assets/` (non versionnés) | prêt, non déployé |
| `web/maquette/` | Maquette de l'écran principal, validée par le propriétaire | référence visuelle |
| `web/spikes/lecteur/` | Prototype du moteur de lecture (Signalsmith et Rubber Band) | porté ; ses binaires Rubber Band servent au rendu « Appliquer » |
| `web/spikes/analyse/` | Tempo, mesures, tonalité, accordage, accords | porté dans `app/src/analysis/` ; sert de référence aux tests |
| `web/spikes/separation/` | Séparation des instruments dans le navigateur | porté dans `app/src/separation/` ; sert de référence à `test:separation-prototype` |
| `.github/workflows/desktop-mac.yml` | Vérifie l'interface, fabrique et teste les deux apps sur les Mac de GitHub | fonctionne |

### Interface (`app/`)

Le détail (organisation, commandes, contrats) est dans `app/README.md`. À
retenir :

- Vite, React et TypeScript strict, un magasin d'état (zustand), feuilles de
  style écrites à la main. `npm run build` construit dans `web/`,
  `npm run build:desktop` dans `desktop/ui/`.
- **Frise du temps** (`src/timeline/`) : défilement horizontal virtuel sur
  canvas, formes d'onde en deux tons, grille et sous-grille, boucle par
  sélection de mesures, tête de lecture, zoom, Auto, suivi. La tête de lecture
  ne passe jamais par React.
- **Moteur audio** (`src/audio/`) : un seul AudioWorklet, Signalsmith Stretch,
  contexte à 48 kHz, boucle, métronome, limiteur sur le mélange. Porté du
  prototype, avec quatre corrections (pause, position après déplacement, repli
  de boucle, traîne du limiteur). Depuis le lot 3, il joue aussi **tel quel**
  le rendu d'« Appliquer » (ni étirement ni transposition) tant que la
  tonalité et le tempo en direct sont ceux du rendu ; tout reste en temps
  source pour l'interface (position, boucle, clics).
- **Import** (`src/import/`) : mp3, wav, aiff, m4a, flac (lecteur AIFF maison,
  Chromium ne le décode pas) ; lien par le pont de l'app Mac, avec
  installation de l'outil au premier usage et proposition de mise à jour.
  Limites : 20 minutes, 256 Mo par fichier.
- **Stockage** (`src/storage/`) : IndexedDB, un seul morceau gardé (document
  et octets d'origine), sauvegarde automatique 0,7 s après chaque changement,
  réouverture au lancement avec une limite de temps par étape. En cas d'échec
  le morceau est conservé et la fenêtre propose « Rouvrir » ou « Oublier ».
  Toute nouvelle donnée du projet doit entrer dans `ProjectDocument` (version
  3 depuis le lot 3) avec une migration, et dans `documentChanged`
  (`store/document.ts`), sinon elle n'est pas sauvegardée. Les instruments
  séparés sont gardés dans la même base (version 2, magasins `pcm` et
  `pcmInfo`), en 16 bits, par blocs, et relus sans décodage.
- **Une seule copie de l'audio décodé** (`src/audio/pcm.ts`) : 16 bits en
  mémoire partagée, la même pour le moteur, la frise, l'analyse, la
  séparation, le rendu et l'export. Ne jamais garder de copie Float32 d'une
  piste entière : lire par plages (`readPcm`), écrire avec `PcmWriter`.
- **Analyse** (`src/analysis/`) : dans un Web Worker, avec ONNX Runtime Web
  1.31.1 servi par l'app. Temps et premiers temps par Beat This! (réseau
  léger `small0` : le complet lit le tempo à moitié sur le morceau d'essai),
  métrique 3 ou 4, tonalité, accordage, accords par CREMA puis décodage calé
  sur les temps avec l'a priori d'harmonie jazz. Les outils (17,8 Mo) se
  téléchargent au premier usage depuis Hugging Face, vérifiés par SHA-256 et
  gardés dans IndexedDB. L'analyse démarre seule après un import ; le
  résultat (`model/analysis.ts`) n'est jamais modifié, les corrections à la
  main vivent à part (`model/corrections.ts`) et ne sont jamais écrasées.
- **Harmonie** (`src/harmony/`) : vocabulaire d'accords, lecture d'un accord
  tapé, transposition avec la bonne écriture selon la tonalité, instruments
  en Ut, Si♭ et Mi♭, composant `<ChordSymbol>` conforme à `DESIGN.md`.
- **Grille d'accords** (`src/chart/`) : quatre mesures par ligne, clic pour
  se placer, glisser pour boucler, éditeur d'accord (y compris au clavier),
  lettres de section, correction de la tonalité, impression.
- **Règle des pistes** : rangée des accords et courbe du tempo analysé.
- **Export iReal Pro** (`src/export/`) : un fichier HTML contenant le lien
  `irealb://`, et « Ouvrir dans iReal Pro » dans l'app Mac. Le format et ses
  sources sont décrits dans `src/export/IREAL-FORMAT.md`.
- **Séparation** (`src/separation/`) : dans un Web Worker, ONNX Runtime Web,
  carte graphique (WebGPU) puis processeur **avec le même outil**. Trois
  outils dans `models.json` (BS-RoFormer SW, HTDemucs 6 sources, SCNet),
  choisis selon l'appareil (`device.ts`) ou à la main dans les réglages
  avancés. La liste est aussi lue à distance (fichier du dépôt, branche
  `main`), validée strictement, avec la copie embarquée en secours. Les
  outils se téléchargent depuis Hugging Face, vérifiés par SHA-256, dans une
  base à part. Les parties non demandées sont réunies dans « Autres ».
  « Copier le rapport » donne la vitesse réelle d'une séparation.
- **Rendu « Appliquer »** (`src/render/`) : Rubber Band R3 « finer » hors
  ligne dans des workers (jusqu'à trois pistes à la fois), longueur exacte,
  alignement mesuré et compensé, timbre conservé en option. Le rendu reste
  **en mémoire** (jamais gardé), avec un refus calme si l'appareil est trop
  petit ; tout changement de tonalité, de tempo ou de pistes le périme.
- **Export audio** (`src/export/audio/`) : le mélange tel qu'on l'entend ou
  les pistes à plein niveau en archive, morceau entier ou boucle, en WAV, MP3
  (LAME, 256 kbit/s) ou FLAC (libFLAC), encodeurs WebAssembly dans un worker.
  À une autre tonalité ou un autre tempo, l'export passe par le rendu.
- Adresses utiles en développement : `?demo` (morceau synthétique déjà
  analysé), `?debug` (accès au magasin et au moteur par `window.__fabtice`),
  `?moteur=factice` (moteur sans son), `?analyse=reel` ou
  `factice|lente|instant|echec|aucune`. Avec `?debug`, `?demo` ou
  `?moteur=factice`, l'analyse, la séparation et le rendu sont factices sauf
  `?analyse=reel`, `?separation=reel`, `?rendu=reel`. Démonstrations du lot
  3 : `?demo&separation=entier|faite|lente|repli|echec`, `&rendu=lent`,
  `&export=ouvert`.
- Tests : `npm test` (plus de 800 tests unitaires), puis après
  `npm run build` : `test:smoke`, `test:timeline`, `test:engine`,
  `test:import`, `test:chart`, `test:export`, `test:separation`,
  `test:export-audio`, `test:render`, `test:memory` (Chromium), et ceux qui
  téléchargent des outils : `test:analysis`, `test:separation-real`
  (une dizaine de minutes), `test:separation-prototype`.

### App Mac (`desktop/`)

- Electron **43.8.9**, dernière branche compatible macOS 12 (la 44 exige
  macOS 13). Chromium 150.
- L'interface est servie par le protocole `fabtice://app/` avec les en-têtes
  d'isolation et une politique de sécurité stricte (`src/protocol.js`). La
  page de test d'origine reste disponible : menu Aide → « Diagnostic… ».
- Le pont `window.fabtice` (`src/preload.js`) est typé côté interface dans
  `app/src/platform/desktopBridge.ts`. Deux phrases du pont sont reconnues
  par leur début côté interface : elles sont dans `src/messages.js` et un
  test les fige. Ajouts depuis le lot 1 : étapes d'import honnêtes
  (recherche, préparation, téléchargement avec un vrai pourcentage), rapport
  du dernier import (copiable depuis « Diagnostic… »), `openInIRealPro`.
- La politique de sécurité n'ouvre le réseau qu'à Hugging Face, pour les
  outils d'analyse et de séparation, et à `raw.githubusercontent.com`, pour
  la liste des outils de séparation (`connect-src`, dans `src/protocol.js`).
- Les fichiers exportés passent par la fenêtre d'enregistrement de macOS
  (`src/downloads.js`). Le rapport de la dernière séparation s'ajoute au
  rapport de « Diagnostic… ».
- yt-dlp n'est pas embarqué : le binaire officiel `yt-dlp_macos` est téléchargé
  dans le dossier de données de l'app, vérifié par SHA-256, avec nouvelles
  tentatives automatiques et proposition de mise à jour au lancement.
- Le moteur JavaScript exigé par yt-dlp est l'app elle-même :
  `--no-js-runtimes --js-runtimes node:<binaire de l'app>` avec
  `ELECTRON_RUN_AS_NODE=1`.
- Pas de ffmpeg : `--fixup never`, Chromium décode le m4a fragmenté tel quel.
  Extraction en deux temps (`-J` puis `--load-info-json`) ; refus des directs
  et des vidéos de plus de 20 minutes.
- **Deux téléchargements** : `Fabtice-mac-apple-silicon.dmg` et
  `Fabtice-mac-intel.dmg`, publiés sous l'étiquette `desktop-dev` quand `main`
  change dans `app/` ou `desktop/`.
- Tests : unitaires et de bout en bout avec un faux yt-dlp (variable
  `FABTICE_YTDLP_PATH`), lancés sous `xvfb-run` ici et sur les Mac de GitHub.
  `test/e2e/journey.test.js` rejoue le parcours complet dans l'app : lien,
  installation de l'outil, import, lecture, boucle, tonalité, relance et
  morceau retrouvé ; `real-size.test.js` le refait avec des morceaux de
  plusieurs Mo ; `analysis.test.js` fait une vraie analyse dans l'app (avec
  `FABTICE_E2E_ANALYSIS=1`) et `separation.test.js` une vraie séparation
  (`FABTICE_E2E_SEPARATION=1`), lancés par le workflow sans être bloquants ;
  `apply-render.test.js`, `audio-export.test.js` et
  `separated-storage.test.js` vérifient le rendu, l'export et les
  instruments gardés dans l'app.
- On ne peut pas lire les journaux GitHub depuis la session : la fabrication
  pousse son résultat sur la branche `ci-logs`
  (`git fetch origin ci-logs && git show FETCH_HEAD:STATUS.md`).
- App non signée (pas de compte développeur Apple) : étapes d'ouverture dans
  `desktop/README.md`.

### Prototypes encore utiles

- **Lecteur** (`web/spikes/lecteur/`) : Rubber Band 4.0 (GPL), mode R3, trop
  lourd en direct mais meilleur en justesse ; il sert au rendu « Appliquer »
  et à l'export. Les moteurs sont compilés avec Zig (`engines/`), qui n'est
  pas installé ici : le binaire versionné (sans SIMD) est réutilisé tel quel.
- **Analyse** (`web/spikes/analyse/`) : le prototype d'origine, porté tel
  quel dans l'app. **Beat This!** (MIT, ONNX sur Hugging Face
  `nilsbc/beat-this-onnx`) et **CREMA** (BSD-2,
  `thebluescreen/crema-chords-onnx`). Justesse mesurée par le prototype :
  temps justes à 96 % sur le swing, 78 % sur les ballades et le latin, 95 %
  sur la pop ; fondamentale juste sur environ trois mesures sur quatre en
  jazz ; extensions peu fiables. Ces conversions appartiennent à des tiers :
  une copie sous un compte du projet reste à décider avec le propriétaire.
- **Séparation** (`web/spikes/separation/`) : ONNX Runtime Web, variante
  `ort.webgpu` ; trois paliers (BS-RoFormer SW, HTDemucs 6, SCNet). Mesures :
  voir « Mesures de la phase 0 » dans `CLAUDE.md`. L'app donne les mêmes
  parties que ce prototype, au bruit de calcul près
  (`npm run test:separation-prototype`).

## Pièges de l'environnement de travail

- Réseau limité : registres npm et PyPI, GitHub, `api.github.com` (sans
  authentification), `fabtice.netlify.app`, Hugging Face. Rien d'autre : ni
  YouTube, ni autres CDN. Copier les dépendances du navigateur dans le dépôt.
- Pas de carte graphique ni de sortie audio : vérifier par tests automatiques
  (Playwright et Chromium sont préinstallés, ne pas les réinstaller). Les
  vitesses mesurées ici ne valent pas pour les appareils du propriétaire.
- `git push` fonctionne. Le service d'authentification renvoie parfois une
  erreur 503 : attendre et réessayer. Pas plus d'une opération réseau git à la
  fois par agent.
- **Travailler sur une branche** (`lot-N`), jamais directement sur `main` : un
  push sur `main` publie les téléchargements. Pour vérifier la fabrication
  sur Mac sans rien publier, lancer le workflow à la main sur la branche.
- Agents isolés (worktrees) : leur faire commencer par
  `git fetch origin lot-N && git checkout -B lot-N-<nom> origin/lot-N`, puis
  fusionner leurs branches dans `lot-N`. Leur donner des dossiers distincts.
- **Quota** : il se compte par fenêtres de cinq heures et peut couper un agent
  en plein travail. Faire pousser le travail par petites étapes ; à la
  reprise, relancer l'agent interrompu (son contexte est conservé) plutôt que
  d'en créer un neuf. Si le propriétaire annonce la limite, mettre en pause et
  programmer la reprise après la réinitialisation.
- Tests dans Chromium : `.frise[data-peaks="ready"]` est vrai aussi quand il
  n'y a aucune piste ; attendre d'abord que le magasin ait un projet.
  `npm run test:engine` se lance au premier plan (il se bloque en arrière-plan).
- **Tester avec des tailles réelles.** Le défaut le plus grave du lot 1 (un
  morceau gardé qui ne revenait jamais) ne se voyait qu'au-delà de quelques
  dizaines de Ko : tous les sons d'essai étaient minuscules. De plus, un
  contexte Playwright jetable garde IndexedDB en mémoire et ne reproduit pas
  ce genre de panne : utiliser un profil persistant, ou l'app Mac.
- Un agent qui laisse une tâche de fond ouverte se réveille et renvoie son
  rapport en boucle : l'arrêter une fois son travail fusionné.
- Tests de l'app Mac : Playwright peut rester bloqué s'il s'attache pendant le
  chargement de la première fenêtre. Les tests retiennent donc cette fenêtre
  (`FABTICE_HOLD_WINDOW`) et l'ouvrent une fois attachés.
- L'app Mac ne peut être essayée que par le propriétaire ; ici, seuls les tests
  avec faux yt-dlp et la fabrication sur GitHub sont possibles.
- Les vérifications qui mesurent la fluidité ou le temps (`test:timeline`,
  `test:engine`, la partie « 4 minutes » de `test:analysis`) échouent parfois
  quand plusieurs agents chargent la machine : les relancer au calme avant de
  chercher une panne.
- La somme des parties d'une séparation ne redonne pas le morceau (HTDemucs
  s'en écarte à −13 dB, comme dans le prototype) : ce n'est pas un test de
  portage. Comparer au prototype.

## Plan de la v1

| Lot | Contenu | État |
|---|---|---|
| 1 | Socle, interface de la maquette, import (lien et fichier), lecteur avec boucle, tonalité, tempo, zoom, sous-grille ; app Mac en deux téléchargements | **livré, essayé par le propriétaire sur le Mac Intel, deux défauts corrigés** |
| 2 | Analyse, corrections à la main, affichage Grille d'accords, export iReal Pro | **livré, en attente de ses essais** |
| 3 | Séparation avec choix automatique du modèle, rendu « Appliquer », export audio | **livré, en attente de ses essais** |
| 4 | Métronome avancé, repères, réglages, projets `.fabtice`, version web hors ligne, finitions | à lancer sur son feu vert |

## Lot 1 — ce qui a été livré

On peut créer un morceau à partir d'un lien (app Mac) ou d'un fichier audio,
voir sa forme d'onde, lire, mettre en pause, se déplacer, boucler une
sélection de mesures, changer la tonalité (demi-tons et cents) et le tempo en
direct, zoomer (deux curseurs et Auto), afficher la sous-grille (quatre
valeurs et Triolets), activer le magnétisme, suivre ou non la tête de lecture,
activer un clic de métronome. Le morceau et ses réglages sont retrouvés à la
réouverture. La grille de mesures repose sur un tempo et un premier temps
saisis à la main (clic sur « Tempo » en tête de règle, avec « Battre le
tempo » et « Premier temps ici »).

Choix faits pendant le lot, à faire valider par le propriétaire s'il les
remarque :

- Quand on relâche une sélection de mesures, ou qu'on rallume la boucle, la
  tête de lecture va au début de la boucle si elle était en dehors.
- Le triangle de la tête de lecture est en haut de la règle et son filet
  traverse règle et pistes (dans la maquette, il commence en haut des pistes).
- « Exporter » est visible mais inactif (lot 3). La fenêtre « Nouveau morceau »
  ne propose ni séparation ni ouverture d'un projet existant (lots 3 et 4).
- Tant que le tempo du morceau n'est pas saisi, le réglage de tempo parle en
  pourcentage ; ensuite en battements par minute.
- Chaque forme d'onde est mise à l'échelle sur sa propre crête : les niveaux
  relatifs entre pistes ne se lisent pas sur le dessin.
- L'extraction d'un lien ne peut pas être interrompue : la fenêtre le dit et
  ne montre pas de bouton « Annuler » pendant cette étape.

Limites connues :

- Un seul morceau est gardé ; en importer un autre remplace le précédent.
- Un changement fait moins d'une seconde avant de quitter peut ne pas être
  gardé (sauvegarde différée de 0,7 s).
- Mémoire : environ 22 Mo par minute de stéréo pour le dessin, plus la copie
  du moteur. Un long morceau sur téléphone peut dépasser la mémoire.
- La position affichée ne retranche pas le retard propre de la sortie audio.
- Non essayé : Safari et Firefox pour le stockage, les gestes de pincement de
  Safari, le Mac Intel, l'iPhone.
- La version web n'est pas déployée : elle attend un déploiement Netlify
  déclenché par le propriétaire.

## Lot 2 — ce qui a été livré

Après un import, l'analyse démarre seule : tempo et temps, mesures, métrique,
tonalité, accordage, accords. Le morceau reste jouable pendant ce temps. Les
accords et la courbe de tempo apparaissent au-dessus des pistes, et
l'affichage Grille d'accords montre la grille façon Real Book. Tout se
corrige à la main : premier temps, temps par mesure, tempo doublé ou divisé
(panneau « Tempo »), tonalité (clic sur « Tonalité de … »), accordage (panneau
du réglage fin : « Ramener à 440 »), chaque accord (clic dessus, ou au
clavier), lettres de section. La grille suit la tonalité choisie et s'affiche
pour un instrument en Ut, Si♭ ou Mi♭. « Exporter » propose la grille pour
iReal Pro et l'impression.

Choix faits pendant le lot, à lui faire valider :

- Une mesure où l'accord continue porte le signe de répétition, pas l'accord
  réécrit.
- Le demi-diminué s'écrit « m7♭5 », pas « ø ».
- Un accord douteux est en encre douce, souligné en pointillé ; un clic
  propose « C'est le bon accord » et les autres lectures de l'analyse.
- Le choix Ut, Si♭ ou Mi♭ est gardé avec le morceau, pas comme préférence de
  l'appareil.
- Sur la grille : un clic sur l'accord l'édite, un clic ailleurs dans la
  mesure y place la tête de lecture. Sur écran tactile, la sélection d'une
  boucle se fait en restant appuyé puis en glissant.
- Chaque correction s'applique aussitôt, sans bouton « Annuler » général ;
  « Revenir à l'analyse » existe mesure par mesure.
- La levée (avant le premier temps) est une mesure « 0 », seule sur sa ligne.

Limites connues :

- L'analyse demande environ 1 Go de mémoire pendant quelques secondes : sans
  doute trop pour un téléphone (non essayé).
- Les outils d'analyse sont hébergés par des tiers sur Hugging Face.
- L'export iReal Pro n'a pu être vérifié qu'avec trois lecteurs libres du
  format, pas avec iReal Pro lui-même : c'est au propriétaire de l'essayer.
  La levée y devient une mesure entière ; pas de reprises ni de codas.
- L'impression n'a été vérifiée que dans Chromium.
- Pas de détection automatique des sections.

## Lot 3 — ce qui a été livré

À l'import (case décochée par défaut, avec une estimation de l'attente) ou
plus tard (« Séparer les instruments » sous les pistes), le morceau est séparé
en instruments : voix, batterie, basse, guitare, piano, autres, selon l'outil.
La séparation tourne en arrière-plan, le morceau reste jouable ; les
instruments sont gardés sur l'appareil et reviennent à la réouverture ;
« Revenir au morceau entier » et « Revoir les instruments » échangent les deux
jeux de pistes sans recalcul. Quand la tonalité ou le tempo diffèrent de
l'original, « Appliquer » recalcule les pistes avec Rubber Band derrière un
écran d'attente annulable, puis le lecteur joue ce rendu tel quel.
« Exporter » → « Le son… » fabrique le mélange, les pistes ou la boucle en
WAV, MP3 ou FLAC, à la tonalité et au tempo choisis.

Choix faits pendant le lot, à lui faire valider :

- Les instruments non cochés sont réunis dans une piste « Autres ».
- Les pistes exportées séparément sont à plein niveau (muet, solo et volume
  ignorés) ; le mélange est exporté tel qu'on l'entend.
- Une seule qualité par format : MP3 à 256 kbit/s constant, FLAC 16 bits.
- Le rendu « Appliquer » vit **en mémoire**, pas dans des fichiers
  temporaires comme l'écrit `CLAUDE.md` : un AudioWorklet ne lit pas de
  fichier. Il n'est jamais gardé ; à la réouverture il est à refaire.
- En quittant le rendu appliqué (nouveau réglage), la préécoute s'entend
  0,2 à 0,35 s plus tard, sans coupure ni clic.
- L'app Mac lit la liste des outils sur `raw.githubusercontent.com`.
- « Vents » et les séparations détaillées (batterie détaillée, saxophone)
  n'apparaissent pas : aucun outil de la liste ne les fournit. Les ajouter
  demandera un outil, une entrée `kind: 'detail'` et un document version 4.

Limites connues :

- **Le chemin par la carte graphique n'a tourné qu'une fois**, dans l'app
  sur le Mac à puce Apple de GitHub, avec SCNet (20 s par segment sur cette
  machine virtuelle ; le Mac Intel de GitHub n'a pas de carte utilisable et
  passe par le processeur, 16 s par segment). Ni HTDemucs ni BS-RoFormer n'y
  ont tourné. Tous les cas d'échec repassent sur le processeur avec le même
  outil ; à essayer sur le M1 du propriétaire, qui doit renvoyer « Copier le
  rapport ».
- Sur le processeur, ici : SCNet 2 fois la durée du morceau, HTDemucs 2,7
  fois, BS-RoFormer 17,7 fois ; mémoire de pointe +1,5 Go, +2,9 Go, +4,7 Go.
  Les vitesses de `models.json` pour HTDemucs et SCNet sont des estimations.
- **iPhone non résolu** : SCNet demande plus de 1,3 Go à lui seul (segment
  fixe de 11 s). Il faudrait une autre conversion ou un outil plus léger.
- « Appliquer » est long sur un gros morceau : ici 15 à 20 s de calcul par
  minute de piste stéréo et par worker (sept pistes de cinq minutes : 5 à 6
  minutes avec trois workers). À mesurer sur ses Mac. Pistes possibles :
  ne rendre que la boucle, ou que les pistes audibles.
- Alignement du rendu : chaque clic à moins de 2 ms, sauf à demi-vitesse
  (pire écart 4 ms, la grille de Rubber Band).
- Une archive exportée de plus de 4 Go est refusée (pas de ZIP64).
- La vraie fenêtre d'enregistrement de macOS n'a pas pu être essayée ici.
- Les 29 Mo du calcul graphique d'ONNX Runtime s'ajoutent à l'app (chargés
  seulement pour une séparation).

## Retours du propriétaire sur le lot 3 (14 novembre) et corrections

Il a essayé la version publiée sur le Mac Intel et sur le M1 : « globalement un
vrai succès ». Ses mesures de séparation sont dans `CLAUDE.md` (« Essais du
propriétaire ») et dans `app/src/separation/models.json`. Ses demandes, toutes
inscrites dans `CLAUDE.md` :

| Demande | Ce qui a été fait (fusionné dans `retours-lot-3`, publié le 15 novembre) |
|---|---|
| Le clic droit ne fait rien dans l'app Mac | menu Couper, Copier, Coller, Tout sélectionner dans les champs, Copier sur un texte sélectionné (`desktop/src/context-menu.js`) |
| Le magnétisme doit aussi valoir pour les boucles | sélection et bords de boucle calés sur la sous-grille, libres sans magnétisme (`app/src/grid/loops.ts`) ; lecture « 2.2 à 4.3 (4e double) » (`grid/loopText.ts`) ; la boucle était déjà gardée en secondes : pas de nouvelle version du document |
| « Appliquer » → « Appliquer meilleure qualité » | fait, sur deux lignes ; état « meilleure qualité appliquée » |
| Fausse variation de tempo brève, puis grille décalée d'un temps | réparation des temps (`app/src/analysis/engine/repair.ts`) et une seule phase de mesure pour tout le morceau ; `ANALYSER_VERSION` 2 |
| Deux accords dans une mesure : le second au milieu | chaque accord à la place de son temps (`app/src/chart/fit.ts`) ; « Place dans la mesure » dans l'éditeur d'accord |
| Imprimer la grille avec options, export PDF | bouton « Imprimer » dans l'en-tête de la grille, fenêtre (portrait ou paysage, telle quelle ou sur une page), PDF écrit par le processus principal dans l'app Mac (`desktop/src/printing.js`) |
| Accords : un sur deux faux | programme « accords », ci-dessous |

À savoir sur ces corrections :

- Avec le magnétisme, on ne sélectionne plus des mesures entières d'office :
  on glisse d'une barre de mesure à une autre (ce sont des lignes de la
  sous-grille). Quand la grille est corrigée ensuite, la boucle reste sur la
  même musique ; seule sa lecture en mesures change.
- L'ancienne impression (`window.print()`) gelait la fenêtre dans l'app
  (constaté sur la version Linux d'essai) : c'est sans doute pourquoi le
  propriétaire ne l'avait pas trouvée utilisable.
- Sur une mesure étroite (téléphone), trois ou quatre accords passent sur
  deux rangées plutôt que de devenir illisibles.
- Une analyse déjà gardée n'est jamais refaite seule : « Analyser de
  nouveau » (et « Revenir à l'analyse » d'abord si la grille a été corrigée
  à la main). Limites de la réparation des temps : un point d'orgue d'exactement
  deux ou trois temps sans premiers temps clairs peut être comblé ; un rubato
  fort et rapide peut être mal compté ; non essayé sur son enregistrement de
  1945 (inaccessible d'ici).
- Non vérifiable ici : la vraie fenêtre d'impression de macOS, un vrai clic
  droit sur un Mac. L'export mp3 n'a pas encore été essayé par lui.

## Programme « accords » (feu vert donné, à faire avant le lot 4)

Le but et les quatre moyens retenus sont dans `CLAUDE.md` (périmètre, point 4),
avec les nuances du propriétaire : les lire avant tout. Ce qui est décidé :

- **Mesurer avant de changer.** Il n'existe pas encore de banc de mesure sur
  de vrais enregistrements : le prototype ne mesurait que des morceaux
  synthétiques. Premier travail : un banc reproductible dans
  `web/spikes/accords/` (morceaux à réponse connue, les plus réalistes
  possible, y compris un son « vieux disque » : mono, bande étroite, bruit),
  la mesure du pipeline actuel, puis chaque moyen mesuré seul et combiné. Les
  enregistrements du propriétaire ne sont pas accessibles d'ici (pas d'accès
  à YouTube, et aucun contournement).
- **Instruments séparés** : après une séparation, les accords se recalculent
  sans batterie ; la voix est écartée sauf si elle porte l'harmonie ; les
  pistes qui portent l'harmonie sont choisies morceau par morceau ; la basse
  est un indice fort de la fondamentale, pas une règle.
- **Reprises** : indice souple, jamais une recopie.
- **Recueils iReal Pro** : pas dans le dépôt. L'app propose à l'ouverture de
  les télécharger en un clic, avec une phrase d'explication. Dans l'app Mac
  c'est le processus principal qui télécharge (une page ne peut pas lire un
  autre site) ; la version web proposera au moins l'import d'un fichier. Les
  adresses vont dans une liste distante, comme celle des modèles, pour pouvoir
  les corriger sans nouvelle version. La grille retrouvée par le titre (les
  titres venus d'un lien sont bruités) s'aligne sur les mesures et la
  tonalité, sert d'a priori et entre dans la fiabilité ; elle ne remplace pas
  ce qui est entendu.
- **Autres modèles** : chercher (Hugging Face, GitHub), vérifier licence,
  taille et conversion, mesurer sur le banc ; ceux qui valent mieux sont
  proposés dans les réglages avancés, comme les modèles de séparation.
- Toute correction faite à la main par l'utilisateur reste intouchable.
- La branche `retours-tempo` modifie `app/src/analysis/**` : partir de
  `retours-lot-3` une fois cette branche fusionnée (ou de `main` après la
  publication) avant de toucher à ce dossier.

### Avancement du programme « accords » (branche `accords`)

Tenu à jour à chaque étape fusionnée. Sous-branches : `accords-banc`,
`accords-modeles`, `accords-recueils`, `accords-recueils-app`, `accords-structure`,
`accords-ecoute` (fusionnées jusqu'à l'étape A).

- **Banc de mesure** (`web/spikes/accords/`, voir son `README.md`) : 25
  morceaux de jazz fabriqués (son propre et « vieux disque », instruments
  séparés, reprises réharmonisées) et 24 prises réelles de guitare (GuitarSet,
  CC BY 4.0). Rien d'audio dans le dépôt : `./preparer.sh` refabrique tout.
  Chiffre de départ (fondamentale et couleur justes, par temps) : 57 % en son
  propre, **49 % en vieux disque**, 70 % et 64 % sur la guitare réelle. La
  grille de mesures n'y est pour rien (un point de mieux avec la vraie
  grille). Erreurs dominantes : confusion ii–V (Dm7 lu G7), deuxième accord
  d'une mesure manqué deux fois sur trois, septièmes simplifiées, tonalité
  prise à la dominante. Aucun enregistrement de jazz ancien annoté n'est
  téléchargeable d'ici (JAAH : audio commercial).
- **Recueils iReal Pro** (`app/src/standards/`, `app/README.md` « Grilles de
  standards ») : lecteur du format (Jazz 1460 lu en entier), recherche par
  titre bruité, transposition, liste distante `collections.json`,
  téléchargement en un clic (processus principal dans l'app Mac, appel du pont
  `standardsFetchText` limité à une liste d'hôtes), bibliothèque gardée dans
  IndexedDB (`fabtice-standards`), proposition dans « Nouveau morceau » et
  dans Réglages avancés, import d'un fichier. **Les adresses officielles
  (irealpro.com, forum) n'ont pas pu être vérifiées d'ici** (hôtes bloqués) :
  elles sont marquées `verified: false` ; des copies publiques sur GitHub
  (jazz 1460, latin, blues, pop, country) servent de secours et fonctionnent.
  Brésil 220, Dixieland et jazz manouche n'ont pas de copie : import d'un
  fichier. À faire valider par le propriétaire : garder ou non ces copies
  tenues par des tiers.
- **Étape A, dans l'app** (`ANALYSER_VERSION` 3 ; `engine/analyse.ts` et
  `engine/chart.ts`, le seul point d'entrée du worker et de la variante `app`
  du banc) : indice de basse pris dans le grave du morceau (40–300 Hz),
  reprises de la forme (`engine/repeats.ts`), grille connue retrouvée par le
  titre du morceau et **vérifiée contre l'enregistrement** avant d'être crue
  (`engine/knownChart.ts`, candidats préparés par
  `standards/forAnalysis.ts`), le tout réuni comme indices souples
  (`engine/evidence.ts`), puis fiabilité étalonnée (`engine/reliability.ts`) :
  « douteux » veut dire « plus probablement faux que juste ». Le panneau
  d'analyse dit ce qui a servi (grille connue, forme, basse).
  Banc, fondamentale et couleur justes par temps, tout le corpus : son propre
  57 → 71 %, vieux disque 49 → 61 %, guitare réelle 70 → 70 %, guitare façon
  vieux disque 64 → 67 % ; deuxième accord d'une mesure manqué 64 → 34 % et
  66 → 49 % ; un peu plus d'accords en trop (11 → 17 %, 13 → 15 %) ; tonalité
  68 → 84 % et 60 → 76 %. Sur la moitié de contrôle : 56 → 70 % et 47 → 59 %.
- **Limites connues de l'étape A** : le banc décode l'audio avec ffmpeg,
  l'app avec Chromium ; sur un vieux disque instable la grille de temps peut
  différer et une bonne grille connue être refusée de peu (vu sur Blue Bossa
  façon vieux disque : alors rien ne change, et corriger les mesures à la
  main puis « Analyser de nouveau » la fait accepter). Une grille iReal qui
  diffère de ce qui est joué peut coûter quelques points (St. Louis Blues).
  Le seuil de refus a été relevé après avoir vu un cas de la moitié de
  contrôle. La fiabilité n'a pas encore été réétalonnée avec l'indice de
  basse. Seulement 11 standards dans le banc, tous fabriqués.
- **Instruments séparés : mesurés deux fois, pas branchés.** Avec des
  instruments parfaits le gain existe (vieux disque, quatre morceaux : 73 →
  79 %). Avec la vraie séparation il se perd presque entièrement : HTDemucs
  6 sources fait pire que sans instruments (70 %) — basse presque vide,
  parties mal étiquetées ; **BS-RoFormer SW**, le modèle du M1, sépare bien
  mieux les vieux disques mais ne donne que 75 % (+2 points : trois morceaux
  en hausse de 3 à 4 points, le swing chargé en baisse de 2), et en son
  propre +1 point avec un morceau qui en perd 15 (les voix harmonisées partent
  dans « Autres », seule la voix principale reste dans « Voix »). La basse
  séparée d'un vieux disque est trop faible pour servir : la lire dans le
  grave du morceau entier reste meilleur. Petit échantillon (quatre morceaux,
  le calcul prend 7 à 11 fois la durée ici). Détail :
  `web/spikes/accords/resultats/separation-reelle/` (`bs-roformer.md`).
  Pour aller plus loin : 8 à 12 vieux disques de plus, l'essai avec le modèle
  détaillé, et ne brancher que si le gain atteint 3 points sans qu'aucun
  morceau ne s'effondre (câblage décrit dans ce compte rendu : choix des
  parties qui portent l'harmonie, remix sans batterie ni soliste, basse lue
  dans le grave du morceau). Le moyen 1 de `CLAUDE.md` reste ouvert, et le
  propriétaire y tient.
- **Étape 2 : un second modèle d'accords, au choix** (Réglages → Réglages
  avancés → « Modèle d'accords » : « Rapide : CREMA », par défaut, ou
  « Détaillé : Tsumugi-Chords »). Préférence de l'appareil
  (`analysis/chordModel.ts`), pas du projet. Le modèle rapide passe toujours
  d'abord (temps, mesures, tonalité, et repli immédiat) ; le modèle détaillé
  écoute ensuite par fenêtres de 30 s et ses lectures remplacent celles du
  modèle rapide avant l'étape A, qui s'applique telle quelle
  (`engine/tsumugi.ts`, `engine/tsumugiFeatures.ts`). Ses poids (68 Mo,
  licence CC BY-NC 4.0, non commerciale) se téléchargent depuis Hugging Face
  à la demande ; l'app n'embarque que la description du réseau, sans aucun
  poids (`analysis/assets/`, 1,4 Mo, empreinte figée). Si le téléchargement,
  la mémoire ou l'ouverture du réseau échouent, les accords du modèle rapide
  sont gardés et le panneau le dit.
  Banc (22 morceaux, fondamentale et couleur) : son propre 67 → 88 %, vieux
  disque 55 → 79 %, guitare réelle façon vieux disque 77 → 86 % ; **guitare
  réelle en son propre : 84 → 79 %, une perte**. Basse 63–78 → 86–92 %,
  accord complet en son propre 34 → 65 %, deuxième accord manqué 40–54 →
  15–28 %. Coût mesuré ici (quatre cœurs chargés) : environ 30 s par fenêtre
  de 30 s, soit 6 minutes pour 4 minutes de musique ; 3 Go de mémoire en
  pointe pour le navigateur ou l'app : pas pour un téléphone. À mesurer sur
  les Mac du propriétaire.
  Limites : les morceaux fabriqués peuvent flatter un modèle entraîné sur de
  la musique de studio ; la fiabilité (« douteux ») n'a pas été réétalonnée
  pour ce modèle et signale moins d'erreurs ; après une correction de la
  grille, les lectures gardées du modèle détaillé sont réemployées (une
  nouvelle analyse complète les refait). Les modèles légers essayés (Jiang
  2019, BTC, ChordMini) n'apportent rien de fiable : détail dans
  `web/spikes/accords/modeles/RECHERCHE.md`.
- **Reste à faire dans le programme « accords »** : élargir la mesure des
  instruments séparés avec BS-RoFormer (voir plus haut) ; réétalonner la fiabilité avec l'indice
  de basse et pour le modèle détaillé ; proposer les extensions du modèle
  détaillé comme suggestions ; faire décoder le son du banc comme le
  navigateur pour que ses chiffres soient exactement ceux de l'app.

## Lot 4 (feu vert donné, après le programme « accords »)

Métronome avancé (métriques composées, temps forts et faibles par métrique,
décompte avant la boucle, accélération progressive), repères (boucles et
sections nommées, sauvegardées), réglages, projets `.fabtice` (ouvrir un projet
existant au lancement, en créer un), version web hors ligne (PWA), finitions.
À savoir : la forme d'une boucle a pu changer avec `retours-boucles` (les
repères s'appuient dessus) ; le document a pu changer de version ; les 29 Mo
du calcul graphique et les outils téléchargés comptent pour le hors-ligne.

## Lot 4 — métronome et repères : ce qui est livré, choix faits, limites

**Livré (branche `lot-4-etape-1`, document version 4).** « Clic » reste
l'interrupteur ; un petit bouton à côté ouvre le panneau Métronome : volume,
décompte d'une ou deux mesures, mesure (2/4 à 7/4, 5/8, 6/8, 7/8, 9/8, 12/8)
et regroupement (7/8 en 2+2+3, 2+3+2 ou 3+2+2 ; 5/x en 3+2 ou 2+3). Repliés :
temps forts et faibles (accentué, normal, faible, muet, par temps) et
accélération progressive de la boucle (départ, gain, toutes les n boucles,
jusqu'à ; palier affiché dans le panneau et sous le tempo ; « Recommencer »).
Repères : bouton signet après la boucle dans le transport ; garder la boucle
sous un nom, la rappeler d'un appui, renommer, ordonner, supprimer ; les
sections sont les lettres de la grille d'accords (une seule notion), listées,
bouclées, ajoutées « ici », renommées, supprimées ; une rangée « Repères »
apparaît dans la règle quand il y en a, et un clic y rappelle une boucle ou
boucle une section. Le document passe en version 4 (`metronome`, `markers`),
avec migration ; les morceaux des versions 1 à 3 se rouvrent à l'identique.

**Choix faits, à faire valider par le propriétaire.** Le décompte se joue à
chaque appui sur Lecture, depuis la tête de lecture, jamais à chaque reprise ;
il suit la grille, au tempo de la mesure qui suit et au tempo joué.
L'accélération est en % du tempo réglé, n'agit que si la boucle est active,
change de palier à la reprise et reste à l'objectif ; elle se joue en qualité
de prévisualisation, le rendu « Appliquer meilleure qualité » revenant de
lui-même quand un palier retombe sur son tempo. Changer la mesure dans le
panneau corrige la grille ; le tempo s'affiche par temps ressenti (noire
pointée en 6/8). Le volume et le décompte suivent d'un morceau à l'autre ; le
reste est propre au morceau. Corrigé au passage dans le moteur : un clic
perdu de temps en temps à la reprise d'une boucle qui commence sur un temps,
et une rampe de tempo inutile au démarrage.

**Limites.** Seule la métrique de la mesure 1 se règle depuis le panneau ; pas
de saisie libre d'une métrique ; la rangée Repères n'est que dans l'affichage
Pistes ; rien n'a été écouté à l'oreille ici. À essayer par le propriétaire :
le son des trois clics, le décompte et l'accélération sur un vrai morceau, la
lisibilité du panneau sur iPhone.

## Lot 4 — projets `.fab`, hors ligne, réglages : ce qui est livré, choix faits, limites

**Livré (décisions du propriétaire du 15 novembre, voir `CLAUDE.md`).**
- *Projets `.fab`.* Un seul fichier qui garde tout : le morceau tel
  qu'importé, octet pour octet ; le document (version 5) ; **toutes** les
  séparations, une par outil ; le dernier rendu « meilleure qualité ». Ces
  pistes sont en FLAC 16 bits sans perte (libFLAC pour l'encodage, un
  décodeur TypeScript à nous pour la lecture, exact à l'échantillon, qui
  écrit directement dans les blocs 16 bits partagés). Format :
  `app/src/project/FORMAT.md` (`formatVersion` 2 ; l'ancien `.fabtice`, jamais
  publié, n'est pas relu).
- *Ouvrir un projet.* Depuis « Nouveau morceau », en déposant le fichier sur
  la fenêtre, et dans l'app Mac par double-clic, « Ouvrir avec » et les
  **projets récents** (dans la fenêtre, dans Fichier → Ouvrir un projet
  récent, et dans le Dock). Tout est vérifié avant de remplacer le morceau ;
  un fichier abîmé ou trop récent est refusé calmement.
- *Plusieurs séparations.* Refaire une séparation avec un autre outil met la
  précédente de côté ; avec le même outil, elle remplace la sienne. On passe
  de l'une à l'autre sans recalcul (panneau des instruments, « Séparations
  gardées », ou Réglages avancés), chacune avec ses réglages de pistes ;
  chacune se libère seule (« Place sur cet appareil »).
- *Le dernier rendu « Appliquer meilleure qualité » est gardé* avec le
  morceau (appareil et `.fab`), un seul à la fois : il est réentendu dès que
  tonalité, tempo et pistes sont les siens ; un nouveau le remplace, jamais
  l'original ni les séparations.
- *Hors ligne et réglages* : service worker écrit à la main, manifeste,
  icônes tirées du logo (jamais dans l'app Mac) ; taille, source et licence
  des outils ; « Place sur cet appareil ».

**Choix faits, à faire valider par le propriétaire.**
- **Sur l'appareil, les pistes restent en blocs 16 bits, pas en FLAC**
  (mesuré : 4 minutes à six instruments, 277 Mo relus en 1 s, contre 162 Mo
  en FLAC à décoder en 6 s ; 12 minutes, 830 Mo en 3,4 s contre 477 Mo et
  20 s). La réouverture rapide a primé ; le FLAC sert au fichier qu'on garde
  et qu'on envoie. S'il préfère la place à la vitesse, le décodeur existe.
- L'original reste tel qu'importé (un mp3 reste un mp3).
- Plus de case « sans les instruments » : le projet les contient toujours.
- Sur le web, pas de liste de projets récents (seul Chrome le permettrait,
  avec une autorisation à chaque réouverture) : « Rouvrir » pour le morceau
  gardé et le sélecteur de fichiers.
- Un seul morceau gardé sur l'appareil ; les gros fichiers de calcul sont
  gardés hors ligne au premier usage seulement.

**Limites.** N'ont pas pu être essayés ici : les vraies fenêtres de macOS, le
menu des projets récents et le Dock, le double-clic dans le Finder et l'icône
du type, l'installation de la version web sur iPhone ou dans Safari, le
service worker sur Netlify. **Au premier déploiement Netlify, vérifier
d'abord le hors-ligne et les en-têtes d'isolation.** Un projet de 20 minutes
à plusieurs séparations (plus de 1 Go) n'a pas été mesuré dans un
navigateur. Enregistrer un `.fab` prend du temps pour un long morceau
(environ 30 s pour 12 minutes à six instruments ici, pourcentage affiché).

## Sortie audio rendue au système (retours du 15 novembre)

Sur le Mac Intel, le son de tout le Mac s'est bloqué après que Fabtice était
resté ouvert longtemps sans jouer (service audio de macOS figé, redémarrage
nécessaire). **La cause n'est pas prouvée** et ne peut pas être reproduite
ici. Hypothèses, de la plus à la moins probable : panne de macOS 12 autour
d'une veille ou d'un changement de sortie pendant que Fabtice gardait un flux
ouvert ; contexte audio resté en marche par une course au démarrage (ce que
le code permettait : c'est un fait) ; lecteur de la fenêtre Diagnostic jamais
fermé (un fait aussi, s'il y avait importé un lien) ; manque de mémoire
pendant un calcul ; panne de macOS sans rapport avec l'app.

Désormais le moteur (`app/src/audio/WorkletEngine.ts`) met le contexte en
sommeil 0,4 s après une pause et le **ferme après 45 s sans lecture** ; il le
ferme aussi à la mise en veille du Mac, à la sortie de veille, à l'écran
verrouillé sans lecture, à un changement de périphérique audio (la lecture
est mise en pause, sans reprise automatique), à la page masquée sans lecture
et à la page quittée (`audio/deviceLifecycle.ts`,
`desktop/src/power-events.js`). La lecture suivante rouvre tout sans que rien
ne change (pistes, séparations, rendu appliqué ou gardé, boucle, tonalité,
tempo, métronome, accélération, position), avec environ 50 à 100 ms de plus
au démarrage (mesuré ici, pas sur ses Mac). Un contexte qui ne démarre pas,
ou un moteur qui ne publie plus sa position, est refait **une fois** ; au
second échec, un message calme s'affiche et « Lecture » reste disponible. Le
**journal audio** (200 événements datés, gardé après un redémarrage) se copie
depuis Aide → Diagnostic… (« Copier le journal audio », inclus dans « Copier
le diagnostic ») et, sur le web, depuis les réglages avancés. L'app n'empêche
jamais la mise en veille (un test le vérifie). Corrigé au passage dans le
moteur : un déplacement demandé pendant le fondu de 8 ms d'une pause était
perdu si la lecture suivait aussitôt.

En cas de nouveau blocage, à dire au propriétaire : copier le journal audio
(il survit au redémarrage) ; pour retrouver le son sans redémarrer, Moniteur
d'activité → `coreaudiod` → Forcer à quitter ; noter si le Mac avait dormi ou
si un écran, un casque ou des écouteurs avaient changé.

## Points ouverts

- **Import par lien lent sur le Mac Intel** (une à deux minutes) : la cause
  n'est pas connue. On attend du propriétaire le texte du bouton « Copier le
  rapport du dernier import » (Aide → Diagnostic…), qui donne la durée de
  chaque étape. Deux pistes, non réalisées, selon ce qu'il montrera : un seul
  lancement de yt-dlp au lieu de deux, ou la version non auto-extractible de
  l'outil. Aucune ne doit contourner les protections de YouTube.
- Essais du lot 2 par le propriétaire, en particulier l'analyse sur de vrais
  enregistrements de jazz et l'ouverture de la grille dans iReal Pro.
- Essais du lot 3 par le propriétaire : une séparation sur le M1 (Chrome,
  Safari, app Mac) et sur le Mac Intel, avec le texte de « Copier le
  rapport » ; l'attente d'« Appliquer » ; l'écoute d'un MP3 exporté ; la
  fenêtre d'enregistrement de l'app Mac.
- Selon ses mesures : calcul natif dans l'app Mac pour la séparation si le
  navigateur reste trop lent ; outil plus léger pour le téléphone.
- Quota Netlify épuisé jusqu'au 20 novembre : la version web n'est pas
  déployée, rien n'a donc pu être essayé sur l'iPhone.
- Compte développeur Apple (99 $ par an) à décider avant une diffusion
  publique, pour supprimer l'avertissement de macOS.
- Licences des modèles de séparation : le propriétaire a choisi de tout
  proposer, en connaissant le risque (voir `CLAUDE.md`).
