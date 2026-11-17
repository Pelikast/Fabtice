# Bilan de l'étape 3 — Exports

## Livré

**C15.1 — « Audio… ».** Une nouvelle fenêtre remplace « Exporter le son ».
- Format : « Wave » (fréquence 44,1 / 48 / 88,2 / 96 kHz, 48 par défaut ;
  quantification 16 bits, 24 bits ou 32 bits flottant, 16 par défaut),
  « Flac », « MP3 » à débit constant (96, 128, 160, 192, 256, 320 kbit/s,
  **320 par défaut**). Au-dessus de 48 kHz, une ligne : « Fabtice travaille en
  48 kHz : une fréquence plus haute n'ajoute pas de qualité. »
- Quoi exporter : « Le mix complet » (tel qu'on l'entend) ou « Des pistes »
  (liste à cocher, « Tout cocher » / « Tout décocher »).
- Case « Un fichier par piste » : cochée, chaque piste à son plein niveau dans
  une archive ; décochée, un seul fichier, les pistes cochées mélangées à
  leurs volumes.
- « La boucle seulement » reste proposé ; tempo et tonalité choisis compris,
  comme avant. Le pied de la fenêtre dit ce qui sera fabriqué.

**C15.2 et C15.3 — iReal Pro et PDF.** Déjà dans le menu depuis l'étape 2
(« Fichier iReal Pro… », « Ouvrir dans iReal Pro », « PDF… ») ; vérifiés à
nouveau dans le menu complété (`test:menu`, `test:export`, e2e de l'app Mac).
Rien n'a changé.

**C15.4 — « Dossier pour Logic Pro… ».**
- Le dossier contient : les pistes (« 01 Batterie.wav »…) en Wave 48 kHz 16
  bits, toutes de la même longueur, alignées au début, dans le tempo et la
  tonalité choisis ; un fichier MIDI ; `Lisez-moi.txt` (les trois gestes).
- Le fichier MIDI (format 1, 960 tics par noire) porte la courbe de tempo
  exacte, les signatures, les armures (tonalité par passage, transposée), un
  marqueur par accord et par section (« [A] Bbmaj7 », en texte simple sans
  accents) et une piste « Accords » qui joue les accords en notes tenues.
- Le premier temps du morceau tombe sur une barre : une mesure d'attente dure
  exactement le silence qui précède (« la mesure 1 de Fabtice est la mesure 2
  de Logic », dit dans la fenêtre et dans le mode d'emploi).
- App Mac : un vrai dossier, à l'endroit choisi dans le panneau du système,
  avec « Afficher dans le Finder ». App web : une archive `.zip`.
- Fenêtre avant l'export (contenu, avis « le volume, le muet et le solo ne
  s'appliquent pas »), attente avec pourcentage et « Annuler », écran de fin
  avec les trois gestes.

**C15.5 — « Projet Ableton Live… », à l'essai.**
- Le dossier (« Titre Project ») contient : `Titre.als` (Live 11 et 12),
  `Titre (Live 10).als`, les pistes dans `Samples/Imported/`, le fichier MIDI
  (repli sûr) et `Lisez-moi.txt`.
- Dans le projet : une piste audio par piste, clips posés au début, Warp
  désactivé (temps absolu, sans étirement) ; la courbe de tempo en automation ;
  les signatures ; accords, sections et changements de tonalité en repères.
- La fenêtre et le changelog disent « À l'essai » : personne n'a pu l'ouvrir
  dans un vrai Live.

**Dossiers d'essai pour le propriétaire.** Dans `app/` :
`npm run essais -- /un/dossier/hors/du/depot` (une dizaine de minutes ;
Playwright et Chromium nécessaires, comme `npm run captures`). Le morceau de
démonstration, avec en plus une mesure en 3/4 et une modulation, en deux
variantes (d'origine ; +2 demi-tons à 90 %). Chacune reçoit le dossier Logic
(décompressé, et son `.zip`), le projet Ableton, un fichier de chaque format
audio et l'archive des pistes ; un `LISEZ-MOI.txt` à la racine dit quoi ouvrir
et quoi regarder dans Logic 13.

## Où c'est dans le code

Le détail est dans `app/README.md` (« Étape 3 de la 1.0.0 : exports » et
« … Projet Ableton Live… »), `desktop/README.md` (« Exports en dossier »),
`app/src/export/midi/LOGIC.md` et `app/src/export/ableton/ALS-FORMAT.md`
(recherches, avec leurs sources). En bref :

- **Audio** : `components/ExportAudioDialog.tsx`, `styles/export.css`,
  `model/audioExport.ts` (`ExportPreferences` gagne `waveRate`, `waveBits`,
  `mp3Kbps`, `separate`, lus de façon tolérante : version du document
  inchangée, 6), `export/audio/` (`planAudioExport(s, request, chosen)`,
  `ExportPlan.output`, `resample.ts#SincResampler`, `wavHeader(frames,
  channels, rate, bits)`, `encoders/settings.ts#MP3_DEFAULT_KBPS`).
- **Modèle de session** (pour l'étape 5 aussi) : `export/session/`,
  `buildSession(state, { tempoRange? }) → Session` : tout ce qu'un séquenceur
  reçoit, en temps de sortie (`time` en secondes, `quarters` en noires) :
  `leadIn`, `start`, `beats`, `bars`, `meters`, `keys`, `chords`, `sections`,
  `parts`, `tracks`, `warnings`.
- **MIDI** : `export/midi/`, `sessionToMidi(session, options) → { bytes,
  beatTimes, maxBeatError, markers }`, `writeSmf`, `MIDI_PPQ = 960`.
- **Pistes pour séquenceur** : `export/sequencer/` (`planSequencerTracks`,
  `renderSequencerTracks`), fenêtre commune
  `components/SequencerExportDialog.tsx`.
- **Remise d'un dossier** : `export/folder/` (`openFolderTarget(nom)`, puis
  `add`, `finish` ou `abort` ; `writesRealFolder()`), et dans l'app Mac
  `desktop/src/folder-writer.js` (canaux `fabtice:folder-begin`, `-write`,
  `-finish`, `-abort`, `-reveal`).
- **Logic** : `export/logic/` (`planLogicFolder`, `runLogicExport`,
  `logicReadme`), `components/ExportLogicDialog.tsx`, commande `exportLogic`.
- **Ableton** : `export/ableton/` (`writeAbletonSet(input)`,
  `sessionToAbleton(session, …)`, `planAbletonFolder`), commande
  `exportAbleton`.
- Poignée de test : `window.__fabtice.lot3.sequencer`.
- Tests ajoutés : `npm run test:export-logic`, `test:export-ableton`
  (`test:export-audio` réécrit) ; `tests/lib/sequencer.mjs` ;
  `desktop/test/e2e/export-logic.test.js`, `export-ableton.test.js`,
  `desktop/test/folder-writer.test.js` ; `npm run essais`. Nouvelle
  dépendance de test : `midi-file` (MIT), le lecteur MIDI indépendant.

## Décisions prises sans le propriétaire

Audio
- Pas de bruit de dispersion (dither) à la quantification. Les pistes étant
  gardées en 16 bits dans l'app, 24 et 32 bits n'ajoutent pas de précision.
- Le MP3 par défaut passe de 256 à 320 kbit/s (demandé par le cahier).
- Les pistes cochées ne sont pas retenues avec le morceau ; les autres choix
  le sont.
- « Un seul fichier » de plusieurs pistes : mélangées à leurs volumes, sans
  tenir compte de muet ni de solo ; nommé « Titre – Basse + Voix ».

Dossiers pour séquenceur
- App Mac : un vrai dossier ; app web : une archive `.zip`. Un dossier du
  même nom n'est jamais remplacé : l'app crée « nom 2 ».
- Pistes toujours en Wave 48 kHz 16 bits, gain unité, quels que soient les
  réglages de la fenêtre « Audio… ».
- Le dossier est possible dès qu'il y a des pistes, même sans accords.

Fichier MIDI et Logic
- Format 1, 960 tics par noire ; un changement de tempo par temps, calculé
  depuis l'instant réellement atteint (aucune dérive).
- Mesure d'attente : sa signature compte les temps de la levée ; pour un
  silence très court, un temps plus bref ; sous 7,6 ms environ, pas de mesure
  d'attente (écart signalé).
- Marqueurs en texte simple, sans accents (« Theme », « Special ») :
  l'encodage du texte des marqueurs dans Logic n'est pas établi.
- Une piste « Accords » plutôt qu'une piste de clics : elle sert à vérifier
  l'alignement à l'oreille.
- Mode d'emploi : 1. Fichier > Ouvrir… sur le `.mid` ; 2. mode de tempo du
  projet sur « Conserver » (KEEP) ; 3. glisser tous les `.wav` à la mesure 1,
  « Créer de nouvelles pistes », accepter 48 kHz.

Ableton
- Deux projets dans le dossier (Live 11 et 12 ; Live 10) : un seul fichier ne
  peut pas servir les trois versions.
- Dossier nommé « Titre Project », comme le fait Live.
- Signatures sur 32, que Live ne connaît pas : converties en signatures sur 16
  de même durée (tempo doublé pour la mesure si le numérateur est impair) ;
  si c'est impossible, approximation et avertissement dans le mode d'emploi.
- Dans l'app Mac, le chemin complet des pistes est écrit dans le projet : la
  page reçoit donc le chemin du dossier choisi (elle n'écrit toujours jamais
  par chemin).
- Pas de sous-dossier `Ableton Project Info` : c'est un format binaire de
  Live, on ne l'invente pas.

Aspect
- La pastille « À l'essai » est en braise : seconde exception, avec le texte
  de chargement, à « la braise reste à ce qui joue ». Inscrit dans `DESIGN.md`.

## Pas fait, ou fragile

- **Rien n'a été ouvert dans un vrai Logic.** Les pages d'aide d'Apple
  n'étaient pas joignables d'ici. Établi par une source : « Fichier > Ouvrir »
  sur un fichier MIDI crée un projet avec le tempo et les marqueurs ;
  « Importer » ou glisser ne prend pas ces données ; tempo de 5 à 990 ; le mode
  « Conserver » garde le tempo du projet. **Non établi, à voir par le
  propriétaire dans Logic 13** : que les signatures et les armures arrivent à
  l'ouverture (probable) ; une différence entre Logic 10 et 13 ; la fréquence
  du projet créé (44,1 ou 48 kHz) ; les libellés français exacts des menus de
  Logic.
- **Rien n'a été ouvert dans un vrai Ableton Live**, et personne ne le peut.
  Degré de confiance : environ 7 chances sur 10 que `Titre.als` s'ouvre du
  premier coup dans Live 11 et 12 avec tout en place. La structure a été
  relue par trois lecteurs libres indépendants (schémas de Live, validateur,
  ligne de temps) sans défaut. Le point le plus incertain : que Live retrouve
  les pistes par leur chemin relatif (app web) ; l'app Mac écrit aussi le
  chemin complet. Live 10 : le projet s'ouvre probablement, pistes à lui
  montrer une fois. Le repli (fichier MIDI et pistes) est dans le dossier.
- Le rééchantillonnage (Wave autre que 48 kHz) se fait dans le fil principal :
  environ 6 s pour 4 minutes en stéréo ; la fenêtre reste vivante mais ce
  n'est pas un calcul en arrière-plan.
- `test:menu` a montré une fois chez un agent « sans accords, Imprimer…
  grisé » en échec, puis vert au passage suivant (course avec l'analyse en
  arrière-plan) ; vert chez moi dans la passe finale.
- Les libellés des parties dans les marqueurs (`session.part.*`) sont propres
  à l'export : l'étape 5 pourra les unifier avec les siens.
- `npm run essais` a besoin de Playwright et de Chromium : il marche sur la
  machine de travail, pas tel quel sur le Mac du propriétaire.
- Les fenêtres n'ont été vues qu'en captures (Chromium), ni sur un vrai Mac ni
  sur un vrai téléphone.

## Pièges rencontrés

- **`npm ci` dans le dossier partagé** : les agents lient leur `node_modules`
  à celui du dépôt principal ; un `npm ci` lancé là pendant qu'un agent teste
  vide le dossier sous ses pieds (et échoue). Utiliser `npm install`, et
  seulement quand une dépendance a changé.
- **Verrou commun** : toutes les commandes lourdes (suites Chromium,
  constructions, e2e), les miennes et celles des agents, sous
  `flock /tmp/fabtice-heavy.lock`. Aucun redémarrage de la machine pendant
  cette étape.
- **Lien `node_modules`** : ajouter `node_modules` à `.git/info/exclude` (commun
  aux arbres de travail) empêche de le commiter par erreur.
- **Regarder les captures en entier** : le lien « Enregistrer… » de la fenêtre
  de fin coupait un long nom aux deux bouts, sans qu'aucun test ne le voie.
- **Tests qui listent le menu** : chaque entrée ajoutée à « Exporter » casse
  les vérifications qui comparent la liste entière (`tests/menu.mjs`,
  `tests/chart.mjs`).
- Un réglage de la fenêtre « Audio… » (fréquence, quantification) se
  retrouvait dans les pistes du dossier Logic après fusion : un export qui
  réutilise le plan audio doit partir de `defaultExportPreferences()`.

## Vérifications

À compléter : commit de fin et fabrication sur les Mac de GitHub.

- `app/` : `npm run typecheck` sans erreur ; `npm test` : 1 577 tests réussis,
  42 sautés.
- Vérifications Chromium après `npm run build`, l'une après l'autre, au
  calme, toutes vertes : `smoke`, `menu`, `settings`, `print`, `new-project`,
  `standards`, `undo`, `alert`, `project-file`, `chart`, `timeline`, `import`,
  `export`, `export-audio`, `export-memory`, `export-logic`,
  `export-ableton`, `analysis`, `separation`, `render`, `memory`,
  `metronome`, `markers`, `tempo-fix`, `offline`, `engine`. (`chart` a d'abord
  échoué sur une liste du menu périmée, corrigée, puis relancé seul : vert.)
- `desktop/` : `npm test` : 122 réussis ; après `npm run build:desktop`,
  `FABTICE_NO_POPPLER=1 xvfb-run -a npm run test:e2e` : 36 tests, 33 réussis,
  3 sautés (ceux qui téléchargent), aucun échec.
- Vérifié comme le demande le plan : fichier MIDI relu par des lecteurs
  indépendants (`midi-file` dans les tests, `mido` à la main) : chaque temps à
  moins d'une milliseconde (écart mesuré : 2 µs au plus sur vingt minutes) ;
  pistes de même durée, égale à celle du fichier MIDI ; `.als` décompressé,
  bien formé, relu par trois lecteurs libres ; chaque format audio relu par
  ffprobe (fréquence, quantification, débit, durée).
- Captures regardées, dans les deux formes : fenêtre « Audio… », fenêtres
  Logic et Ableton (avant, fin).
- Aucun fichier de brouillon dans le dépôt (commande du plan) ; aucun nom
  d'assistant en dehors des lignes d'attribution des commits.

## Pour l'étape suivante

- **Étape 4** : rien ne change à sa section. La barre d'espace dans les
  fenêtres reste à régler, y compris dans les trois fenêtres de cette étape.
- **Étape 5** : quand les modulations et la structure seront détectées, les
  exports les prendront sans changement (`buildSession` lit déjà les
  tonalités par passage et la structure en vigueur). Vérifier alors les
  marqueurs et les armures sur un morceau réel, et unifier les libellés des
  parties.
- **Étape 7** : relancer `npm run essais` et relire les dossiers avant la
  publication.
- **À remettre au propriétaire** : les dossiers d'essai (`npm run essais`),
  pour Logic 13 ; ce qu'il y verra tranchera les points « non établi ».
