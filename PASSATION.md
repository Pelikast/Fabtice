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
- **Instruments séparés : pas branché, et à ne pas brancher tel quel.** Avec
  des instruments parfaits le gain est net (vieux disque : 66 → 77 % sur huit
  morceaux), mais avec la vraie séparation (HTDemucs 6 sources) il disparaît
  et le vieux disque fait pire (66 → 60 %) : la basse d'un vieux disque est
  presque vide après séparation, et les parties sont souvent mal étiquetées.
  Résultats : `web/spikes/accords/resultats/separation-reelle/`. À refaire
  avec BS-RoFormer (le modèle du M1) avant de conclure ; le moyen 1 de
  `CLAUDE.md` reste donc ouvert.
- **Autres modèles** (`web/spikes/accords/modeles/RECHERCHE.md`) : candidat
  sérieux, Tsumugi-Chords (poids CC BY-NC, 68 Mo, lent, 2 Go de mémoire) ;
  la mesure sur le banc a été interrompue (branche `accords-modeles`), à
  reprendre.

## Lot 4 (feu vert donné, après le programme « accords »)

Métronome avancé (métriques composées, temps forts et faibles par métrique,
décompte avant la boucle, accélération progressive), repères (boucles et
sections nommées, sauvegardées), réglages, projets `.fabtice` (ouvrir un projet
existant au lancement, en créer un), version web hors ligne (PWA), finitions.
À savoir : la forme d'une boucle a pu changer avec `retours-boucles` (les
repères s'appuient dessus) ; le document a pu changer de version ; les 29 Mo
du calcul graphique et les outils téléchargés comptent pour le hors-ligne.

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
