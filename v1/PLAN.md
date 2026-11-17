# Fabtice 1.0.0 — plan de travail

Ce plan mène de la version publiée le 16 novembre 2026 à la **version 1.0.0**.
Le contenu demandé est dans `v1/CAHIER.md` (points C1 à C17) ; `CLAUDE.md`
reste la référence générale, `DESIGN.md` celle du dessin.

Le travail se fait en **sept étapes**, chacune dans une **session neuve** pour
économiser le contexte. Une session d'étape lit, dans cet ordre : `CLAUDE.md`
(chargé d'office), ce plan, `v1/CAHIER.md`, puis les bilans des étapes
précédentes (`v1/bilan-etape-N.md`). `PASSATION.md` et les `README.md` ne se
lisent que par parties, quand on en a besoin.

## État

| Étape | Contenu | État | Commit de fin sur `v1` |
|---|---|---|---|
| 1. Socle | C5, C11, C13 (données), C10 et C14 (données) | fait (`v1/bilan-etape-1.md`) | `2a52351` (code), puis le commit du bilan |
| 2. Interface | C1, C3, C4, C6, C7, C8, C9 | fait (`v1/bilan-etape-2.md`) | `483c401` (code), puis le commit du bilan |
| 3. Exports | C15 | fait (`v1/bilan-etape-3.md`) | `02eec3d` (code), puis le commit du bilan |
| 4. Tempo à la main | C12, C13 (fenêtre) | fait (`v1/bilan-etape-4.md`) | `dfb1535` (code), puis le commit du bilan |
| 5. Harmonie | C10, C14 | à faire | |
| 6. Machine | C2, C16, C17 (numéros, fabrication) | à faire | |
| 7. Finition | vérification complète, changelog, publication 1.0.0 | à faire | |

Chaque session d'étape met cette table à jour quand elle finit.

## Règles sans exception

- **Aucun déploiement Netlify.** Pousser ne publie rien sur le site ; on ne
  demande un déploiement au propriétaire qu'à la toute fin (étape 7). Tout se
  vérifie avec un serveur local, des tests, et l'app Mac sous `xvfb-run`.
- **Aucun contournement des protections de YouTube**, sous aucune forme.
- **Le dépôt est public** : aucun secret, aucune information personnelle sur
  le propriétaire, aucun nom de modèle ou d'assistant d'IA en dehors des
  lignes d'attribution des commits (dans les documents : « modèle fort »,
  « modèle léger », « session », « agent »).
- **Pousser par petites étapes** : la machine peut redémarrer et le quota peut
  couper un agent en plein travail. Un commit par sujet, poussé dès qu'il est
  vert (types et tests unitaires).
- **Jamais de push sur `main` avant l'étape 7**, et seulement avec l'accord
  explicite du propriétaire : un push sur `main` fabrique et publie l'app Mac.
  Tout va sur la branche **`v1`**.
- L'app ne redistribue ni poids de modèles ni recueils de grilles : elle les
  télécharge depuis leur emplacement public, en affichant source et licence.
- Code et commentaires en anglais ; interface et documents en français.
- Écrire au propriétaire en français simple, en le vouvoyant : il n'est pas
  développeur de métier.
- Les règles de l'analyse automatique du tempo sont figées (décision du 16
  novembre) : on n'y touche pas, sauf panne avérée.

## Organisation

### Sessions

- **Session d'origine** : elle a reçu la demande, écrit ce plan, et reste
  l'interlocuteur du propriétaire. Elle lance chaque session d'étape, relit
  son bilan, vérifie l'état de la branche et rend compte au propriétaire en
  quelques lignes. Son identifiant est donné dans la consigne de démarrage de
  chaque session d'étape.
- **Session d'étape** : elle orchestre son étape. Elle découpe, délègue à des
  agents, relit, vérifie elle-même, intègre dans `v1`. Elle n'écrit elle-même
  que ce qui est trop petit pour être délégué. À la fin : bilan, table d'état,
  changelog, fabrication verte sur les Mac de GitHub, puis **un message à la
  session d'origine** (commit de fin, état des tests, décisions prises seule,
  ce qui attend le propriétaire). Elle ne lance pas l'étape suivante.
- Une seule session d'étape travaille à la fois.

### Agents et effort

Le propriétaire veut économiser son quota : peu d'agents à la fois (deux en
général, trois au plus), des consignes précises et autonomes, pas de travail
refait.

- **Modèle fort** pour ce qui demande du jugement, de la recherche ou touche à
  la sûreté des données : conception du document, historique, algorithmes
  (tapes, modulations, structure), formats externes (Logic, Ableton), mise à
  jour automatique. Effort élevé pour la conception et les algorithmes, moyen
  pour une exécution délicate mais cadrée.
- **Modèle léger** pour l'exécution bien cadrée : écrans, fenêtres, câblage de
  menus, tests, documentation. Effort élevé pour un écran complet, moyen pour
  une retouche.
- Chaque agent travaille dans un **worktree isolé**, sur sa branche partie de
  `origin/v1`, avec des dossiers distincts de ceux des autres agents ; la
  session d'étape fusionne dans `v1`. Un agent arrêté par le quota se relance
  (son contexte est gardé) plutôt que d'en créer un neuf.
- Une consigne d'agent dit : le but, les points du cahier concernés (avec les
  textes exacts), les fichiers à lire, ce qui existe déjà, ce qu'il ne doit
  pas toucher, les tests à livrer, et la forme du compte rendu.

### Vérification

- Dans `app/` : `npm run typecheck`, `npm test`, puis après `npm run build` les
  vérifications dans Chromium (`npm run test:<nom>` ; la liste est dans
  `app/package.json`). Dans `desktop/` : `npm test`, puis
  `xvfb-run -a npm run test:e2e` (avec `FABTICE_NO_POPPLER=1` pour reproduire
  les Mac de GitHub).
- **Chaque écran livré** a sa vérification dans Chromium, dans les deux formes
  (1280 × 800 à la souris, 390 × 844 au toucher), et une capture d'écran
  regardée par la session d'étape, comparée à `DESIGN.md`.
- **Fin d'étape** : toutes les vérifications ci-dessus au calme, puis la
  fabrication sur les Mac de GitHub lancée à la main sur `v1` (elle ne publie
  rien hors de `main`). Résultat sur la branche `ci-logs` (`STATUS.md`, puis
  les journaux numérotés). Un lancement annule celui qui est en cours : un
  seul à la fois.
- Les vérifications qui mesurent le temps ou la fluidité (`test:timeline`,
  `test:engine`, la partie « 4 minutes » de `test:analysis`, le « Rouvrir » de
  `test:import`) et celles qui téléchargent depuis Hugging Face échouent
  parfois sous la charge : les relancer seules avant de chercher une panne.
  `test:engine`, `test:render`, `test:memory` se lancent au premier plan.
- Avant le message de fin d'étape :
  `git log --name-only --format= origin/main..HEAD | grep -iE "\.claude/|scratchpad|(^|/)tmp/"`
  ne doit rien renvoyer (pas de fichier de brouillon dans le dépôt).

### Ce que chaque étape rend

1. Le code sur `v1`, vert partout.
2. **`v1/bilan-etape-N.md`**, sur le modèle donné à la fin de ce plan : c'est
   le document qui permet à la session suivante de démarrer sans rien relire
   d'autre.
3. La table « État » de ce plan, et la section de l'étape suivante précisée
   si le code livré change ce qu'elle suppose.
4. `CHANGELOG.md` : les lignes de l'étape, en français simple, dans la section
   « ## Version 1.0.0 » en tête du fichier.
5. `app/README.md`, `desktop/README.md`, `app/src/project/FORMAT.md` à jour
   pour les contrats qui ont changé ; `CLAUDE.md` si le propriétaire a pris
   une décision ; `DESIGN.md` si un élément de dessin nouveau est validé.

Le schéma du document (version 6) peut encore bouger d'une étape à l'autre :
rien n'est publié avant la fin. Seule la migration de la version 5 (celle de
la version publiée) vers la version finale doit être exacte et testée.

## Étape 1 — Socle

**But.** Poser les données et les commandes sur lesquelles tout le reste se
branche. Peu d'écran, beaucoup de tests.

**Contenu.**

1. **Document version 6** (`app/src/model/`, migration dans
   `storage/documentFormat.ts`, `project/FORMAT.md`) :
   - tonalité par passage (C10) : changements détectés dans le résultat
     d'analyse, changements faits à la main dans les corrections, sélecteur
     « tonalité à cet instant » ; l'ancienne tonalité unique devient le
     premier passage ;
   - structure (C14) : mode (automatique, Jazz, Pop), parties (type, numéro,
     instrument, début, fin, lettres couvertes), couche de corrections à la
     main ; les lettres de section existantes (`corrections.sections`) y
     trouvent leur place ;
   - métriques : numérateur 1 à 64, dénominateur 4, 8, 16, 32 (C13) ;
   - une correction de tempo « tapée » de plus dans `tempoFixes` (C12).
   Données et commandes seulement : la détection et les écrans viennent aux
   étapes 4 et 5.
2. **Annuler / Rétablir** (C11) : historique sur la part du document qui se
   défait, gestes continus regroupés, libellé de chaque étape, `undo()`,
   `redo()`, « peut annuler », « peut rétablir » ; raccourcis clavier câblés
   (le menu vient à l'étape 2) ; champ de texte : la saisie d'abord.
   Conseil : un mécanisme générique autour du magasin (comparaison de la part
   annulable avant et après chaque action) plutôt qu'une retouche de chaque
   action.
3. **Projet enregistré ou non** (C5) : fichier du projet en cours, état
   « modifié », « Enregistrer », « Enregistrer sous… », enregistrement rapide
   (sons déjà encodés réutilisés), écriture sûre ; l'alerte à trois boutons et
   ses trois déclencheurs (nouveau projet, ouvrir, quitter ou fermer la
   fenêtre dans l'app Mac) ; titre de fenêtre. La sauvegarde locale
   automatique reste.
4. **Signatures par mesure** (C13, données) : commande « changer la signature
   à partir de cette mesure / pour cette mesure seulement » ; audit de **tous**
   les consommateurs (barres, numéros, métronome et accents par défaut pour
   toute métrique, grille d'accords et signature écrite, boucles, repères,
   export iReal Pro avec repli pour les signatures qu'il ne connaît pas,
   réanalyses qui gardent les signatures posées à la main) ; règle du
   dénominateur (« la noire reste la noire ») écrite et testée.

**Agents.** Deux à la fois.
- A (modèle fort, effort élevé) : document version 6 et migration, en un seul
  commit court, **d'abord** : les autres partent de là.
- B (modèle fort, effort élevé) : historique annuler / rétablir et état
  « modifié ».
- C (modèle fort, effort élevé) : signatures par mesure et audit.
- D (modèle léger, effort élevé), après B : enregistrer, enregistrer sous,
  enregistrement rapide et sûr, alerte, côté app Mac compris
  (`desktop/src/projects.js`, fermeture de fenêtre).
- Commandes de tonalité et de structure : petites, par A à la suite, ou par la
  session d'étape.

**Vérifié quand.** Tests unitaires de l'historique (y compris gestes
regroupés et limites), de la migration 5 → 6 sur de vrais documents de la
version publiée, des signatures (cas 7/8, 5/4, une mesure seule en 2/4, 4/4 →
6/8) ; vérification Chromium « annuler / rétablir » et « alerte » ;
`test:project-file` et le test e2e des projets de l'app Mac étendus à
« Enregistrer » (écrase, rapide, sûr) ; rien de cassé ailleurs.

## Étape 2 — Interface

**But.** La nouvelle organisation de l'app, dans ses deux formes.

**Contenu.** C6 (menu Fabtice, barre de menus du Mac, raccourcis, anciens
menus retirés), C7 (Réglages à sept onglets), C9 (fenêtre « Nouveau projet »,
message des grilles iReal Pro, « Vérifier les mises à jour de grilles »), C4
(impression avec aperçu, cmd + P), C1 (chargement visible), C3 (sous-grille),
C8 (forme mobile de tout cela).

**Agents.**
- A (modèle fort, effort moyen) : menu Fabtice et ses sous-menus, barre de
  menus du Mac synchronisée (commandes grisées), raccourcis, retrait des
  doublons. Touche `TopBar`, `ExportMenu`, `desktop/src/menu.js`.
- B (modèle léger, effort élevé) : Réglages à onglets ; déplace les réglages
  existants sans changer leur comportement.
- C (modèle léger, effort élevé) : fenêtre « Nouveau projet », message des
  grilles au démarrage, section des grilles dans « Avancé » ; C1 et C3.
- D (modèle léger, effort élevé) : fenêtre d'impression avec aperçu.
- E (modèle léger, effort élevé), **à la fin** : passe mobile sur tous les
  écrans de l'étape.
- Recherche d'autres recueils publics de grilles (pop, brésilien) : petit
  agent (modèle léger, effort moyen) ; les adresses se vérifient par un test
  lancé sur les Mac de GitHub, pas d'ici.
- A et B d'abord (B a besoin de l'entrée « Réglages » de A) ; C et D en
  parallèle ensuite.

**Points d'attention.** Le contenu des onglets (C7) est une proposition faite
au propriétaire : l'appliquer, et noter dans le bilan ce qu'il faudra lui
montrer. Laisser la place de la case « Alléger » (étape 6) et des entrées de
mise à jour (étape 6) sans les poser tant qu'elles ne font rien. Rien dans
`DESIGN.md` ne prévoit de menu à sous-menus ni d'onglets : les dessiner dans
son esprit (papier, encre, une seule braise) et l'y inscrire.

**Vérifié quand.** Chaque commande du menu atteinte à la souris, au clavier et
au toucher ; barre de menus du Mac testée en e2e ; réglages retrouvés à
l'identique après déplacement ; aperçu d'impression fidèle au PDF produit
(mêmes pages) ; message des grilles : les quatre chemins (oui, non, non avec
la case, déjà téléchargé).

## Étape 3 — Exports

**But.** C15 en entier.

**Agents.**
- A (modèle léger, effort élevé) : fenêtre « Audio… » (formats, débits,
  fréquence et quantification, choix des pistes, un ou plusieurs fichiers) ;
  s'appuie sur `ExportAudioDialog.tsx` et `app/src/export/audio/`.
- B (modèle léger, effort moyen) : iReal Pro (fichier, ouverture dans l'app)
  et PDF dans le nouveau menu.
- C (modèle fort, effort élevé) : écriture du fichier MIDI (courbe de tempo,
  signatures, armures, marqueurs) et « Dossier pour Logic Pro » ; recherche
  sur ce que Logic importe réellement d'un fichier MIDI selon les versions
  (tempo, signatures, marqueurs), mode d'emploi.
- D (modèle fort, effort élevé) : « Projet Ableton Live » ; recherche du
  format `.als` et de projets de référence libres ; s'appuie sur le fichier
  MIDI de C pour le repli.

**Ce que l'étape 2 a laissé** (voir `v1/bilan-etape-2.md`). Le sous-menu
« Exporter » existe déjà (Audio…, iReal Pro → Fichier… / Ouvrir dans iReal
Pro, PDF…) : « Audio… » ouvre l'ancienne fenêtre `ExportAudioDialog.tsx`, à
remplacer ; « PDF… » ouvre la fenêtre d'impression. Ajouter « Dossier pour
Logic Pro » et « Projet Ableton Live » : une entrée dans `COMMANDS` et
`FABTICE_MENU` (`app/src/ui/commands.ts`), une clé `menu.*`, et la même dans
`desktop/src/menu.js`. Le travail de l'agent B est donc réduit à vérifier
iReal Pro et PDF dans ce menu.

**Points d'attention.** Mesure avant le premier temps : le fichier MIDI doit
placer le premier temps sur une barre de mesure alors que les pistes
commencent toutes à zéro (une mesure d'attente dont le tempo est calculé pour
durer exactement ce silence, par exemple). Tempo et tonalité choisis compris :
la courbe de tempo est celle qu'on entend, les accords sont transposés. Dès
que le dossier Logic existe, en fabriquer un à partir du morceau de
démonstration et **le remettre au propriétaire pour essai dans Logic 13** (ce
n'est pas une version de l'app) ; continuer sans attendre sa réponse. Ableton :
« à l'essai », voir C15.

**Vérifié quand.** Fichier MIDI relu par un lecteur indépendant : chaque temps
de la grille retombe à moins d'une milliseconde ; durées et alignement des
pistes ; `.als` bien formé et conforme aux références ; chaque format audio
relu (durée, fréquence, quantification, débit).

## Étape 4 — Tempo à la main

**But.** C12 (correction en tapant) et la fenêtre de C13 (signature).

**Agents.**
- A (modèle fort, effort élevé) : l'algorithme des tapes (compensation de
  l'écart habituel et de la latence, calage sur les attaques, tapes manquantes
  ou en trop, jonction avec la suite réanalysée), avec un banc de tapes
  simulées : imprécision de ± 60 ms et plus, tapes oubliées, doublées, dérive.
  Part de `app/src/store/tempoFixActions.ts`, de `analysis/engine/` et de
  `test:tempo-fix`.
- B (modèle léger, effort élevé) : le déroulé à l'écran (fenêtre, décompte
  avec clic forcé qui s'arrête à la mesure, écoute des tapes au clavier et au
  toucher, « Vérifier en écoutant », les deux choix), dans les deux formes.
- C (modèle léger, effort moyen) : fenêtre « Changer la signature
  rythmique », branchée sur la commande de l'étape 1.

**Vérifié quand.** Sur les cas réels déjà en test (bosses de tempo, points
d'orgue simulés), des tapes imprécises donnent une grille juste à la tolérance
du banc ; la suite du morceau est réanalysée et reste alignée ; tout
s'annule ; la barre d'espace ne lance plus la lecture pendant la saisie et la
relance après.

## Étape 5 — Harmonie

**But.** C10 (modulations) et C14 (structure, colonne des sections, grille
simplifiée, mode Pop). C'est le plus gros chantier.

**Agents.**
- Banc d'abord (modèle fort, effort moyen) : `web/spikes/structure/`, sur le
  modèle de `web/spikes/accords/` : morceaux à forme connue (les recueils de
  standards donnent forme et sections ; rendus avec thèmes et solos
  d'instruments différents ; quelques morceaux pop), mesures claires (limites
  de chorus, lettres, thème ou solo, instrument, modulations).
- A (modèle fort, effort élevé) : modulations (détection, corrections à la
  main, orthographe des accords par passage).
- B (modèle fort, effort élevé) : forme et parties (longueur du chorus,
  lettres, intro et outro, thème ou solo, changement de soliste, mode Jazz ou
  Pop), puis grille simplifiée (consensus, règles d'harmonie, reprises) et
  correspondance entre mesures jouées et mesures écrites.
- C (modèle fort, effort moyen) : choix mesuré du petit modèle de
  reconnaissance d'instruments (poids, licence, conversion pour le
  navigateur, fiabilité sur la piste « Autres ») ; seuil en dessous duquel on
  écrit « Vents ».
- D (modèle léger, effort élevé) : l'écran : colonne de 20 %, sélecteur de
  mode, affichages, clic qui déplace la lecture, bouton « Boucle », marques de
  modulation sur la grille et la règle, suivi de la lecture en grille
  simplifiée, corrections à la main, forme mobile ; impression et exports de
  chaque affichage.

**Points d'attention.** La structure se recalcule quand la grille de mesures
ou les accords changent, sans toucher aux corrections à la main. Sans
séparation : « Solo 1, Solo 2 », pas de nom d'instrument. Dire honnêtement
dans le bilan la fiabilité mesurée de chaque brique.

**Ce que l'étape 2 a laissé.** « Ce qu'on imprime » (grille complète ou
simplifiée) : un champ `what` dans `PrintOptions` / `normalizePrintOptions`
(`app/src/chart/printLayout.ts`), lu par `printLines`
(`chart/printChart.ts`), et un groupe dans `PrintDialog` avant « Marges ».

**Vérifié quand.** Chiffres du banc dans le bilan ; l'exemple « Autumn
Leaves » du cahier sort sous la forme attendue à partir d'un rendu ; lecture
suivie sans saut dans les trois affichages ; tout se corrige et s'annule.

## Étape 6 — Machine

**But.** C2 (« Alléger »), C16 (mise à jour automatique), C17 (numéros de
version et fabrication).

**Agents.**
- A (modèle léger, effort élevé) : « Alléger le travail pour l'appareil » :
  case, curseur, pauses et fils de calcul dans la séparation, l'analyse et le
  rendu ; mesure de la charge moyenne obtenue.
- B (modèle fort, effort élevé) : mise à jour automatique de l'app Mac
  (fichier de version, téléchargement vérifié, remplacement, relance, cas de
  l'emplacement protégé), avec son essai complet sur les Mac de GitHub ;
  message équivalent pour l'app web.
- C (modèle fort, effort moyen) : numéro 1.0.0 partout, fabrication qui
  publie une vraie version numérotée avec son fichier de version et le
  changelog, sans casser le lancement à la main sur une branche.

**Ce que l'étape 2 a laissé.** La case « Alléger » se pose à deux endroits :
dans « Nouveau projet » (`NewPieceDialog.tsx`, composant `ImportStems`, un
commentaire marque la place) et dans Réglages → Général (avec son curseur de
20 à 99 %). Les entrées de mise à jour (« Rechercher une mise à jour… »,
numéro de version) vont dans Réglages → Général ou Avancé et, pour l'app Mac,
dans le menu « Fabtice » de la barre (`desktop/src/menu.js`) : rien n'est
posé. Un réglage s'ajoute par `AppSettings` (`app/src/model/project.ts`),
`store/settingsActions.ts` et une ligne dans l'onglet.

**Vérifié quand.** Sur les Mac de GitHub, une app « 1.0.0 » se met à jour vers
une version factice plus récente et se relance, sur les deux puces ; une
archive altérée est refusée ; « Alléger » à 75 % donne une charge moyenne
proche de la valeur, mesurée.

## Étape 7 — Finition

- Relecture indépendante (modèle fort, effort élevé) des chemins où l'on peut
  perdre des données : enregistrement qui écrase, migration 5 → 6, mise à
  jour automatique.
- Parcours complets rejoués comme un utilisateur, dans les deux formes et dans
  l'app Mac : importer, séparer, corriger, structurer, enregistrer, rouvrir,
  exporter, imprimer.
- Compatibilité des listes distantes avec la version déjà installée (C17).
- `CHANGELOG.md` relu (français simple, complet), `README.md`, `CLAUDE.md`,
  `PASSATION.md` à jour.
- Fabrication verte sur les Mac de GitHub, puis **question au propriétaire** :
  publier la 1.0.0 ? Sur son accord seulement, `v1` passe sur `main`. Lui dire
  ensuite quoi essayer en premier, et lui demander le déploiement Netlify de
  fin de lot.

## Ce qui attend le propriétaire en cours de route

Rien d'obligatoire avant la fin. Deux choses utiles s'il a le temps :
- étape 2 : regarder le contenu proposé pour les onglets de « Réglages » (C7) ;
- étape 3 : ouvrir dans Logic 13 le dossier d'essai qu'on lui remettra
  (`npm run essais`, voir `v1/bilan-etape-3.md`).

## Pièges à connaître

La liste complète est dans `PASSATION.md` (« Pièges de l'environnement de
travail »). Les principaux :

- Réseau limité à npm, PyPI, GitHub, Hugging Face : rien d'autre d'ici. Les
  Mac de GitHub, eux, ont tout Internet.
- Ni carte graphique ni sortie audio : tout se vérifie par tests. Playwright
  et Chromium sont préinstallés, ne pas les réinstaller.
- Tester avec des tailles réelles et un profil de navigateur persistant : les
  pannes de stockage ne se voient pas avec de petits sons.
- Sur les Mac de GitHub : pas de `pdfinfo` ni `pdftotext` ; un clic droit sur
  un mot le sélectionne ; pas de port fixe ; le texte est plus haut de
  quelques pixels (garder 20 px de marge dans les vérifications de mise en
  page) ; l'écran est petit (une fenêtre demandée en 1280 × 800 n'a que 656 px
  de haut).
- Un agent qui laisse une tâche de fond ouverte renvoie son rapport en
  boucle : l'arrêter une fois son travail fusionné.
- Disque presque plein : les tests Chromium plantent (« Page crashed ») sans
  que l'app y soit pour rien. Nettoyer les constructions et caches.
- `app/README.md` fait près de 3 000 lignes : chercher par titres, ne pas le
  lire en entier.

## Modèle de bilan d'étape (`v1/bilan-etape-N.md`)

```
# Bilan de l'étape N — <nom>

## Livré
Par point du cahier (C…) : ce qui marche, comme le verra l'utilisateur.

## Où c'est dans le code
Fichiers, contrats et commandes que les étapes suivantes utiliseront
(noms exacts), version du document, tests ajoutés et comment les lancer.

## Décisions prises sans le propriétaire
Chacune en une ligne, avec sa raison : à lui rendre compte.

## Pas fait, ou fragile
Ce qui reste, ce qui est approximatif, ce qui n'a pas pu être vérifié ici.

## Pièges rencontrés
Ce qui a fait perdre du temps et comment l'éviter.

## Vérifications
Commit de fin, résultat de chaque suite de tests, état de la fabrication
sur les Mac de GitHub.

## Pour l'étape suivante
Ce qu'elle doit savoir avant de commencer, et ce que ce bilan change à sa
section du plan.
```
