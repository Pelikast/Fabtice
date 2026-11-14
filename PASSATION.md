# Passation — état du projet au 14 novembre 2026, lots 1 et 2 livrés

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
- **Un lot ne commence que sur son feu vert explicite.** Les lots 1 et 2 sont
  livrés ; le lot 3 attend son accord après ses essais du lot 2.
- **Publier demande son accord à chaque fois** : l'environnement refuse un
  push sur `main` tant qu'il ne l'a pas confirmé. Lui poser la question
  (publier ou non) quand la branche est verte sur les Mac de GitHub.
- Limites fermes : aucun contournement des protections de YouTube ; aucun
  secret, aucune information personnelle et aucun nom de modèle ou
  d'assistant dans le dépôt, qui est public.

## Ce qui existe

| Dossier | Contenu | État |
|---|---|---|
| `app/` | L'interface, commune au web et à l'app Mac : écran, frise du temps, moteur audio, import, stockage local, analyse, grille d'accords, export iReal Pro | lots 1 et 2 livrés |
| `desktop/` | App Mac Electron : sert l'interface, import d'un lien par yt-dlp, fenêtre de diagnostic | lots 1 et 2 livrés, deux téléchargements |
| `web/` | Site statique : la construction de `app/` y dépose `index.html` et `assets/` (non versionnés) | prêt, non déployé |
| `web/maquette/` | Maquette de l'écran principal, validée par le propriétaire | référence visuelle |
| `web/spikes/lecteur/` | Prototype du moteur de lecture (Signalsmith et Rubber Band) | sert encore pour le rendu « Appliquer » (lot 3) |
| `web/spikes/analyse/` | Tempo, mesures, tonalité, accordage, accords | porté dans `app/src/analysis/` ; sert de référence aux tests |
| `web/spikes/separation/` | Séparation des instruments dans le navigateur | prototype validé en qualité, trop lent |
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
  de boucle, traîne du limiteur). Rubber Band n'est pas porté : il reste dans
  le prototype pour le lot 3.
- **Import** (`src/import/`) : mp3, wav, aiff, m4a, flac (lecteur AIFF maison,
  Chromium ne le décode pas) ; lien par le pont de l'app Mac, avec
  installation de l'outil au premier usage et proposition de mise à jour.
  Limites : 20 minutes, 256 Mo par fichier.
- **Stockage** (`src/storage/`) : IndexedDB, un seul morceau gardé (document
  et octets d'origine), sauvegarde automatique 0,7 s après chaque changement,
  réouverture au lancement avec une limite de temps par étape. En cas d'échec
  le morceau est conservé et la fenêtre propose « Rouvrir » ou « Oublier ».
  Toute nouvelle donnée du projet doit entrer dans `ProjectDocument` (version
  2 depuis le lot 2) avec une migration, et dans `documentChanged`
  (`store/document.ts`), sinon elle n'est pas sauvegardée.
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
- Adresses utiles en développement : `?demo` (morceau synthétique déjà
  analysé), `?debug` (accès au magasin et au moteur par `window.__fabtice`),
  `?moteur=factice` (moteur sans son), `?analyse=reel` ou
  `factice|lente|instant|echec|aucune`. Avec `?debug`, `?demo` ou
  `?moteur=factice`, l'analyse est factice sauf `?analyse=reel`.
- Tests : `npm test` (près de 700 tests unitaires), puis après
  `npm run build` : `test:smoke`, `test:timeline`, `test:engine`,
  `test:import`, `test:chart`, `test:export`, `test:analysis` (Chromium ;
  ce dernier télécharge les outils d'analyse).

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
  outils d'analyse (`connect-src`, dans `src/protocol.js`).
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
  `FABTICE_E2E_ANALYSIS=1`, lancé par le workflow sans être bloquant).
- On ne peut pas lire les journaux GitHub depuis la session : la fabrication
  pousse son résultat sur la branche `ci-logs`
  (`git fetch origin ci-logs && git show FETCH_HEAD:STATUS.md`).
- App non signée (pas de compte développeur Apple) : étapes d'ouverture dans
  `desktop/README.md`.

### Prototypes encore utiles

- **Lecteur** (`web/spikes/lecteur/`) : Rubber Band 4.0 (GPL), mode R3, trop
  lourd en direct mais meilleur en justesse ; réservé au rendu « Appliquer »
  et à l'export (lot 3). Les moteurs sont compilés avec Zig (`engines/`), qui
  n'est pas installé ici : les binaires versionnés sont réutilisés.
- **Analyse** (`web/spikes/analyse/`) : le prototype d'origine, porté tel
  quel dans l'app. **Beat This!** (MIT, ONNX sur Hugging Face
  `nilsbc/beat-this-onnx`) et **CREMA** (BSD-2,
  `thebluescreen/crema-chords-onnx`). Justesse mesurée par le prototype :
  temps justes à 96 % sur le swing, 78 % sur les ballades et le latin, 95 %
  sur la pop ; fondamentale juste sur environ trois mesures sur quatre en
  jazz ; extensions peu fiables. Ces conversions appartiennent à des tiers :
  une copie sous un compte du projet reste à décider avec le propriétaire.
- **Séparation** (`web/spikes/separation/`) : ONNX Runtime Web, variante
  `ort.webgpu` ; trois paliers (BS-RoFormer SW, HTDemucs 6, SCNet). Mesures et
  problèmes : voir « Mesures de la phase 0 » dans `CLAUDE.md`. À traiter au
  lot 3 : vitesse, mémoire sur iPhone, repli sur le processeur en gardant le
  modèle.

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

## Plan de la v1

| Lot | Contenu | État |
|---|---|---|
| 1 | Socle, interface de la maquette, import (lien et fichier), lecteur avec boucle, tonalité, tempo, zoom, sous-grille ; app Mac en deux téléchargements | **livré, essayé par le propriétaire sur le Mac Intel, deux défauts corrigés** |
| 2 | Analyse, corrections à la main, affichage Grille d'accords, export iReal Pro | **livré, en attente de ses essais** |
| 3 | Séparation avec choix automatique du modèle, rendu « Appliquer », export audio | à lancer sur son feu vert |
| 4 | Métronome avancé, repères, réglages, projets `.fabtice`, version web hors ligne, finitions | |

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

## Lot 3 — à préparer après son accord

Séparation des instruments avec choix automatique du modèle, rendu
« Appliquer » (Rubber Band R3), export audio. Voir « Mesures de la phase 0 »
dans `CLAUDE.md` et le prototype `web/spikes/separation/` : la vitesse, la
mémoire et le repli sur le processeur en gardant le modèle sont les trois
problèmes à traiter. Le moteur et l'interface acceptent déjà plusieurs pistes.

## Points ouverts

- **Import par lien lent sur le Mac Intel** (une à deux minutes) : la cause
  n'est pas connue. On attend du propriétaire le texte du bouton « Copier le
  rapport du dernier import » (Aide → Diagnostic…), qui donne la durée de
  chaque étape. Deux pistes, non réalisées, selon ce qu'il montrera : un seul
  lancement de yt-dlp au lieu de deux, ou la version non auto-extractible de
  l'outil. Aucune ne doit contourner les protections de YouTube.
- Essais du lot 2 par le propriétaire, en particulier l'analyse sur de vrais
  enregistrements de jazz et l'ouverture de la grille dans iReal Pro.
- Quota Netlify épuisé jusqu'au 20 novembre ; trouver d'ici le lot 3 un moyen
  d'essayer sur l'iPhone sans le consommer.
- Compte développeur Apple (99 $ par an) à décider avant une diffusion
  publique, pour supprimer l'avertissement de macOS.
- Licences des modèles de séparation : le propriétaire a choisi de tout
  proposer, en connaissant le risque (voir `CLAUDE.md`).
