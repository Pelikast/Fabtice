# Passation — état du projet au 13 novembre 2026 et lot 1

Ce document sert à reprendre le projet dans une nouvelle session sans relire
l'historique. `CLAUDE.md` (cahier des charges, décisions, mesures) et
`DESIGN.md` (design validé) font référence ; ce fichier ajoute l'état des
lieux, les pièges déjà rencontrés et le plan.

## Rôles et façon de travailler

- La session principale **orchestre** : elle découpe, délègue à des agents
  (Opus 5.5 pour ce qui demande du jugement ou de la recherche, Sonnet 5.5
  pour l'exécution bien cadrée, effort adapté à chaque tâche), relit, vérifie
  et rend compte. Elle n'écrit elle-même que ce qui est trop petit pour être
  délégué. Le propriétaire veut **économiser son quota** : peu d'agents à la
  fois, des consignes précises, pas de travail refait.
- Le propriétaire est francophone et n'est pas développeur de métier : lui
  écrire en français simple, lui dire quoi tester et quoi recopier. Il juge à
  l'oreille et à l'œil ; il préfère la qualité à la vitesse.
- Ses appareils : MacBook M1 Pro 16 Go (macOS 27, Safari 27 et Chrome 157),
  iPhone 14 Pro Max, et un Mac Intel sous Monterey (celui de son père, 66 ans,
  guitariste de jazz, premier utilisateur visé) qui n'a encore rien testé.
- Chaque lot se termine par une version de l'app Mac qu'il télécharge depuis
  les « Releases » GitHub. Netlify ne se déploie que sur son clic, en fin de
  lot (voir `CLAUDE.md`, Conventions).
- Limites fermes : aucun contournement des protections de YouTube ; aucun
  secret ni nom de modèle d'IA dans le dépôt, qui est public.

## Ce qui existe

| Dossier | Contenu | État |
|---|---|---|
| `desktop/` | App Mac Electron : import d'un lien par yt-dlp, lecture, diagnostic | prototype validé sur le M1 |
| `web/maquette/` | Maquette de l'écran principal, validée par le propriétaire | référence visuelle, code réutilisable |
| `web/spikes/lecteur/` | Moteur de lecture multi-pistes | prototype validé à l'oreille |
| `web/spikes/analyse/` | Tempo, mesures, tonalité, accordage, accords | prototype livré, pas encore de retour d'écoute |
| `web/spikes/separation/` | Séparation des instruments dans le navigateur | prototype validé en qualité, trop lent |
| `.github/workflows/desktop-mac.yml` | Fabrication de l'app sur les Mac de GitHub | fonctionne |

### App Mac (`desktop/`)

- Electron **43.8.9**, dernière branche compatible macOS 12 (la 44 exige
  macOS 13). Chromium 150.
- yt-dlp n'est pas embarqué : le binaire officiel `yt-dlp_macos` est téléchargé
  dans le dossier de données de l'app, vérifié par SHA-256, avec nouvelles
  tentatives automatiques et proposition de mise à jour au lancement.
- Le moteur JavaScript exigé par yt-dlp est l'app elle-même :
  `--no-js-runtimes --js-runtimes node:<binaire de l'app>` avec
  `ELECTRON_RUN_AS_NODE=1`.
- Pas de ffmpeg : `--fixup never`, Chromium décode le m4a fragmenté tel quel.
  Extraction en deux temps (`-J` puis `--load-info-json`) ; refus des directs
  et des vidéos de plus de 20 minutes.
- Tests : unitaires et de bout en bout avec un faux yt-dlp (variable
  `FABTICE_YTDLP_PATH`), lancés sous `xvfb-run` ici et sur les Mac de GitHub.
- La fabrication publie une préversion sous l'étiquette `desktop-dev`. On ne
  peut pas lire les journaux GitHub depuis la session : la fabrication pousse
  donc son résultat sur la branche `ci-logs`
  (`git fetch origin ci-logs && git show FETCH_HEAD:STATUS.md`).
- App non signée (pas de compte développeur Apple) : étapes d'ouverture dans
  `desktop/README.md`.
- À faire au lot 1 : deux téléchargements séparés (puce Apple, Intel) au lieu
  de l'app universelle ; charger la vraie interface au lieu de la page de test.

### Moteur de lecture (`web/spikes/lecteur/`)

- Un seul AudioWorklet pour toutes les pistes ; le cœur (`src/core.js`) tourne
  aussi dans Node pour les tests. Les moteurs sont compilés depuis les sources
  avec Zig (`build.mjs`).
- **Signalsmith Stretch 1.3.2 (MIT)** pour le direct : 2 à 3,5 % d'un cœur par
  piste, retard fixe d'environ 150 ms quel que soit le réglage, donc pistes
  transposées et non transposées alignées. Version sans SIMD retenue.
- **Rubber Band 4.0 (GPL), mode R3** : trop lourd en direct, meilleure
  justesse ; réservé au rendu « Appliquer » et à l'export (lot 3).
- Boucle : repli côté entrée avec fondu de 20 ms, le moteur voit un signal
  continu. Métronome planifié en sortie d'après le retard du moteur.
- Mémoire : pistes en 16 bits par blocs dans un `SharedArrayBuffer`, pistes
  mono stockées une seule fois.
- Tests : 70 vérifications dans Node (`tests/checks.mjs`) et des vérifications
  dans Chromium (`tests/browser-checks.mjs`).
- Défauts connus à traiter : pas de limiteur sur le mélange ; pas de
  compensation de retard entre pistes avec Rubber Band ; mode compressé (Opus)
  non abouti ; le contexte audio doit être forcé à 48 kHz.

### Analyse (`web/spikes/analyse/`)

- Temps et premiers temps : **Beat This!** (MIT), fichiers ONNX chargés depuis
  Hugging Face (`nilsbc/beat-this-onnx`). Accords : **CREMA** (BSD-2),
  (`thebluescreen/crema-chords-onnx`), suivi d'un décodage calé sur les temps
  avec un a priori d'harmonie jazz. Métrique : choix automatique entre 3 et 4.
  Tonalité : profil de Krumhansl. Accordage : histogramme de pics spectraux.
- Exécution : ONNX Runtime Web 1.31.1 (WebAssembly), copié dans le dossier.
- Justesse mesurée : temps justes à 96 % sur le swing, 78 % sur les ballades et
  le latin, 95 % sur la pop ; fondamentale juste sur environ trois mesures sur
  quatre en jazz ; extensions peu fiables.
- Ces conversions appartiennent à des tiers : en prévoir une copie sous un
  compte du projet (lot 2).

### Séparation (`web/spikes/separation/`)

- ONNX Runtime Web 1.31.1, variante `ort.webgpu` ; transformées de Fourier en
  JavaScript ; modèles épinglés par adresse et SHA-256 dans `models.js`.
- Trois paliers : BS-RoFormer SW (6 pistes, 353 Mo, le meilleur), HTDemucs 6
  (56 Mo), SCNet (4 pistes, 13 Mo, seul modèle à licence claire).
- Mesures et problèmes : voir « Mesures de la phase 0 » dans `CLAUDE.md`.
  À traiter au lot 3 : vitesse (recouvrement, demi-précision, chemin natif
  dans l'app Mac), mémoire sur iPhone, repli sur le processeur en gardant le
  modèle.

## Pièges de l'environnement de travail

- Réseau limité : registres npm et PyPI, GitHub, `api.github.com` (sans
  authentification), `fabtice.netlify.app`, Hugging Face. Rien d'autre : ni
  YouTube, ni autres CDN. Copier les dépendances du navigateur dans le dépôt.
- Pas de carte graphique ni de sortie audio : vérifier par tests automatiques
  (Playwright et Chromium sont préinstallés, ne pas les réinstaller). Les
  vitesses mesurées ici ne valent pas pour les appareils du propriétaire.
- La commande `gh` n'a pas de jeton valide ; `git push` fonctionne. Le service
  d'authentification renvoie parfois une erreur 503 : attendre et réessayer.
  Pas plus d'une opération réseau git à la fois par agent.
- Agents isolés (worktrees) : ils exigent que `origin/main` existe en local
  (`git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'` puis
  `git fetch origin main`).
- La machine peut redémarrer et le quota peut couper un agent en plein travail :
  faire pousser le travail sur GitHub par petites étapes (cela ne déploie rien)
  et relancer un agent interrompu plutôt que d'en créer un neuf.
- L'app Mac ne peut être essayée que par le propriétaire ; ici, seuls les tests
  avec faux yt-dlp et la fabrication sur GitHub sont possibles.

## Plan de la v1

| Lot | Contenu | À la fin, le propriétaire peut |
|---|---|---|
| 1 | Socle, interface de la maquette, import (lien et fichier), lecteur avec boucle, tonalité, tempo, zoom, sous-grille ; app Mac en deux téléchargements | importer un morceau et le travailler en boucle |
| 2 | Analyse, corrections à la main, affichage Grille d'accords, export iReal Pro | voir et corriger la grille et les accords |
| 3 | Séparation avec choix automatique du modèle, rendu « Appliquer », export audio | isoler les instruments et exporter |
| 4 | Métronome avancé, repères, réglages, projets `.fabtice`, version web hors ligne, finitions | utiliser la v1 complète |

## Lot 1 — feu vert donné par le propriétaire le 13 novembre

### Résultat attendu

Une app Mac (deux téléchargements) et la même interface en version web, où
l'on peut : créer un morceau à partir d'un lien (app Mac) ou d'un fichier
audio ; voir sa forme d'onde dans l'interface de la maquette ; lire, mettre en
pause, se déplacer ; boucler une sélection ; changer la tonalité (demi-tons et
cents) et le tempo en direct ; zoomer (deux curseurs et Auto) ; afficher la
sous-grille (quatre valeurs et Triolets) ; activer le magnétisme ; choisir de
suivre ou non la tête de lecture.

Tant que l'analyse n'existe pas (lot 2), la grille de mesures repose sur un
tempo et un premier temps saisis à la main. L'onglet « Grille d'accords » peut
afficher un état vide. Une seule piste (le morceau entier) suffit, mais le
moteur et l'interface doivent déjà accepter plusieurs pistes.

### Choix techniques recommandés

L'orchestrateur peut s'en écarter s'il a une raison.

- Sources de l'interface dans un nouveau dossier (`app/`), TypeScript et Vite ;
  le résultat construit est servi à la racine de `web/`, à côté de
  `maquette/` et `spikes/` qui restent en place. Netlify et la fabrication de
  l'app Mac lancent chacun cette construction.
- React avec un petit magasin d'état, ou équivalent sobre. Feuilles de style
  écrites à la main à partir des jetons de `DESIGN.md` et du code de la
  maquette ; pas de bibliothèque de composants ni de Tailwind.
- Formes d'onde et grille sur canvas, à 60 images par seconde.
- Moteur audio repris du prototype `lecteur` (Signalsmith seul pour ce lot),
  contexte à 48 kHz, avec ses tests.
- L'app Mac sert l'interface avec les en-têtes d'isolation (COOP/COEP) et
  expose à la page une petite interface d'import par lien.
- Projet courant conservé localement pour être retrouvé à la réouverture ; le
  format `.fabtice` complet attend le lot 4.

### Découpage suggéré

1. Un agent Opus pose le socle : structure, construction, composants tirés de
   la maquette, modèle de données du projet et de la grille, interfaces entre
   l'écran, le moteur audio et l'app Mac.
2. Ensuite, deux agents Sonnet en parallèle : le moteur audio branché sur ces
   interfaces ; l'app Mac (chargement de l'interface, import par lien, deux
   téléchargements, fabrication).
3. Un agent d'intégration relie l'écran au moteur, puis l'orchestrateur vérifie
   sur captures d'écran et tests avant de donner le lien au propriétaire.

## Points ouverts

- Retour d'écoute du propriétaire sur la page d'analyse.
- Test de l'app sur le Mac Intel sous Monterey, prévu avec la version du lot 1.
- Quota Netlify épuisé jusqu'au 20 novembre ; trouver d'ici le lot 3 un moyen
  d'essayer sur l'iPhone sans le consommer.
- Compte développeur Apple (99 $ par an) à décider avant une diffusion
  publique, pour supprimer l'avertissement de macOS.
- Licences des modèles de séparation : le propriétaire a choisi de tout
  proposer, en connaissant le risque (voir `CLAUDE.md`).
