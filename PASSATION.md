# Passation — état du projet au 14 novembre 2026, lot 1 livré

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
- **Un lot ne commence que sur son feu vert explicite.** Le lot 1 est livré ;
  le lot 2 attend son accord après ses essais.
- Limites fermes : aucun contournement des protections de YouTube ; aucun
  secret, aucune information personnelle et aucun nom de modèle ou
  d'assistant dans le dépôt, qui est public.

## Ce qui existe

| Dossier | Contenu | État |
|---|---|---|
| `app/` | L'interface, commune au web et à l'app Mac : écran, frise du temps, moteur audio, import, stockage local | lot 1 livré |
| `desktop/` | App Mac Electron : sert l'interface, import d'un lien par yt-dlp, fenêtre de diagnostic | lot 1 livré, deux téléchargements |
| `web/` | Site statique : la construction de `app/` y dépose `index.html` et `assets/` (non versionnés) | prêt, non déployé |
| `web/maquette/` | Maquette de l'écran principal, validée par le propriétaire | référence visuelle |
| `web/spikes/lecteur/` | Prototype du moteur de lecture (Signalsmith et Rubber Band) | sert encore pour le rendu « Appliquer » (lot 3) |
| `web/spikes/analyse/` | Tempo, mesures, tonalité, accordage, accords | prototype livré, pas encore de retour d'écoute |
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
  réouverture au lancement. Toute nouvelle donnée du projet doit entrer dans
  `ProjectDocument`, avec une migration si le format change.
- Adresses utiles en développement : `?demo` (morceau synthétique), `?debug`
  (accès au magasin et au moteur par `window.__fabtice`), `?moteur=factice`
  (moteur sans son, pour les tests d'écran).
- Tests : `npm test` (299 tests unitaires), puis après `npm run build` :
  `test:smoke`, `test:timeline`, `test:engine`, `test:import` (Chromium).

### App Mac (`desktop/`)

- Electron **43.8.9**, dernière branche compatible macOS 12 (la 44 exige
  macOS 13). Chromium 150.
- L'interface est servie par le protocole `fabtice://app/` avec les en-têtes
  d'isolation et une politique de sécurité stricte (`src/protocol.js`). La
  page de test d'origine reste disponible : menu Aide → « Diagnostic… ».
- Le pont `window.fabtice` (`src/preload.js`) n'a pas changé ; l'interface le
  type dans `app/src/platform/desktopBridge.ts`. Deux phrases du pont sont
  reconnues par leur début côté interface : elles sont dans `src/messages.js`
  et un test les fige.
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
  morceau retrouvé.
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
- **Analyse** (`web/spikes/analyse/`) : temps et premiers temps par
  **Beat This!** (MIT, ONNX sur Hugging Face `nilsbc/beat-this-onnx`) ; accords
  par **CREMA** (BSD-2, `thebluescreen/crema-chords-onnx`), suivi d'un
  décodage calé sur les temps avec un a priori d'harmonie jazz ; métrique 3 ou
  4 ; tonalité par profil de Krumhansl ; accordage par histogramme de pics.
  ONNX Runtime Web 1.31.1. Justesse mesurée : temps justes à 96 % sur le
  swing, 78 % sur les ballades et le latin, 95 % sur la pop ; fondamentale
  juste sur environ trois mesures sur quatre en jazz ; extensions peu fiables.
  Ces conversions appartiennent à des tiers : en prévoir une copie sous un
  compte du projet (lot 2).
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
- Tests de l'app Mac : Playwright peut rester bloqué s'il s'attache pendant le
  chargement de la première fenêtre. Les tests retiennent donc cette fenêtre
  (`FABTICE_HOLD_WINDOW`) et l'ouvrent une fois attachés.
- L'app Mac ne peut être essayée que par le propriétaire ; ici, seuls les tests
  avec faux yt-dlp et la fabrication sur GitHub sont possibles.

## Plan de la v1

| Lot | Contenu | État |
|---|---|---|
| 1 | Socle, interface de la maquette, import (lien et fichier), lecteur avec boucle, tonalité, tempo, zoom, sous-grille ; app Mac en deux téléchargements | **livré, en attente des essais du propriétaire** |
| 2 | Analyse, corrections à la main, affichage Grille d'accords, export iReal Pro | à lancer sur son feu vert |
| 3 | Séparation avec choix automatique du modèle, rendu « Appliquer », export audio | |
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

## Lot 2 — à préparer après son accord

Analyse (tempo, temps, premier temps, métrique, tonalité, accordage, accords)
à partir du prototype `web/spikes/analyse/`, corrections à la main, affichage
Grille d'accords, export iReal Pro. Points d'appui déjà en place :

- la carte de tempo (`app/src/model/tempoMap.ts`) accepte un tempo variable ;
- `rulerRows({ hasChords: true })` ajoute le rang des accords dans la règle ;
  son contenu reste à dessiner dans `timeline/drawing.ts` ;
- la notation des accords mineurs est déjà un réglage gardé ;
- les styles des accords de la maquette sont dans `app/src/styles/chords.css`.

## Points ouverts

- Retour d'écoute du propriétaire sur la page d'analyse (avant le lot 2).
- Essais du lot 1 sur le M1 et sur le Mac Intel sous Monterey.
- Quota Netlify épuisé jusqu'au 20 novembre ; trouver d'ici le lot 3 un moyen
  d'essayer sur l'iPhone sans le consommer.
- Compte développeur Apple (99 $ par an) à décider avant une diffusion
  publique, pour supprimer l'avertissement de macOS.
- Licences des modèles de séparation : le propriétaire a choisi de tout
  proposer, en connaissant le risque (voir `CLAUDE.md`).
