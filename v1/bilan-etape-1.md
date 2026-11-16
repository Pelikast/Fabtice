# Bilan de l'étape 1 — Socle

## Livré

- **C11 — Annuler et Rétablir.** cmd + Z et Maj + cmd + Z (Ctrl + Z,
  Ctrl + Maj + Z et Ctrl + Y hors Mac) défont et refont : accords, sections,
  tonalités, corrections de la grille, corrections de tempo, signatures,
  boucle, repères, mixage (volume, muet, solo), tempo et tonalité de lecture,
  réglages du métronome, structure. Un geste continu (curseur tiré, boucle
  tracée) compte pour une étape. Cent étapes au plus, historique vidé quand on
  change de projet et après une analyse complète. Dans un champ de texte, le
  raccourci défait la saisie. Chaque étape a son libellé (« Annuler : volume
  de la piste »), prêt pour le menu de l'étape 2. Pas encore d'entrée de
  menu : le clavier seulement.
- **C5 — Projet enregistré ou non.** L'app sait où est le fichier `.fab` du
  projet ouvert et s'il a changé. cmd + S enregistre par-dessus ce fichier,
  sans fenêtre ; Maj + cmd + S (« Enregistrer sous… ») en fait un nouveau, qui
  devient celui du projet. Enregistrer est rapide (les sons déjà encodés du
  fichier sont recopiés tels quels : 0,4 s au lieu de 2,4 s sur le morceau
  d'essai) et sûr (fichier temporaire puis remplacement). L'alerte « Les
  modifications du projet en cours n'ont pas été sauvegardées, voulez-vous
  enregistrer ? » (« Enregistrer », « Ne pas enregistrer », « Annuler »)
  s'ouvre avant un nouveau projet, avant d'en ouvrir un autre, et dans l'app
  Mac avant de fermer la fenêtre ou de quitter. Le titre de la fenêtre montre
  le nom du fichier et l'état modifié (point de macOS dans l'app Mac, « • »
  sur le web). La sauvegarde automatique locale reste comme avant.
- **C13 (données) — Signatures par mesure.** Commandes « à partir de cette
  mesure » et « pour cette mesure seulement », numérateur de 1 à 64 sur 4, 8,
  16 ou 32. Tout suit : barres et numéros de mesure, sous-grille et
  magnétisme, métronome (accents par défaut pour toute signature, décompte),
  grille d'accords (la signature s'écrit à la mesure où elle change), boucles,
  repères, export iReal Pro (signature la plus proche quand iReal Pro ne
  connaît pas la vraie), réanalyses et corrections de tempo (les signatures
  posées à la main sont gardées). Pas encore de fenêtre (étape 4) : les
  commandes s'appellent par le code et par la poignée de test.
- **C10 et C14 (données).** Le document porte une tonalité par passage
  (détectée et corrigée à la main) et la structure (mode, parties, lettres),
  avec les sélecteurs « tonalité à cet instant », « structure en vigueur » et
  les commandes de correction. Rien ne les détecte ni ne les montre encore
  (étape 5).
- **C12 (données).** Une correction de tempo « tapée » peut être gardée avec
  le projet (les tapes brutes et la fin du passage).
- **Document version 6**, avec migration exacte depuis la version 5 (celle de
  la version publiée), testée sur trois vrais documents de la version 5. Un
  `.fab` de la version publiée s'ouvre sans rien perdre.

## Où c'est dans le code

**Document version 6** (`app/src/model/document.ts`, historique des versions en
tête). Aucun champ nouveau au premier niveau : tout est dans `analysis` et
`corrections`.
- `model/analysis.ts` : `ANALYSIS_RESULT_VERSION = 2` ; `AnalysisResult` gagne
  `keyChanges: AnalysedKeyChange[]` et `structure: DetectedStructure | null`.
  Un résultat de version 1 est mis à niveau, jamais jeté
  (`storage/documentFormat.ts#readAnalysis`).
- `model/harmony.ts` : `KeyChange { time, key }`.
- `model/corrections.ts` : `Corrections` gagne `keyChanges: KeyChange[] | null`
  (null = suivre l'analyse ; dès qu'on y touche, la liste entière) et
  `structure: StructureCorrections` ; `TempoFix = AnalysedTempoFix |
  TappedTempoFix` (`kind: 'tapped'`, `taps`, `end`).
- `model/structure.ts` : `StructureMode`, `StructureModeChoice`, `PartType`,
  `PartInstrument` (`WINDS_UNSURE = 'winds'`), `StructurePart`,
  `DetectedStructure`, `StructureCorrections`, et la règle de fusion en tête
  du fichier. Les lettres restent `corrections.sections` ; les lettres d'une
  partie se déduisent, elles ne sont pas stockées.
- `model/tempoMap.ts` : `METER_NUMERATOR`, `METER_DENOMINATORS`,
  `isValidMeter` ; la règle du dénominateur en tête du fichier.
- Migration `5:` dans `storage/documentFormat.ts` ; documents réels dans
  `storage/fixtures/v5-*.json` ; tests `storage/documentVersion6.test.ts`.

**Tonalités et structure** (pour l'étape 5).
- `store/keySelectors.ts` : `keyPassages`, `keyPassageAt`, `keyAt`,
  `keyChangesInForce`. `store/keyActions.ts` : `addKeyChange`,
  `setKeyChangeKey`, `moveKeyChange`, `removeKeyChange`, `resetKeyChanges`.
- `store/structureSelectors.ts` : `structureInForce`, `sectionsInForce`,
  `partAt`, `lettersAreByHand`. `store/structureActions.ts` :
  `setStructureMode`, `addPart`, `editPart`, `removePart`, `resetStructure`,
  `resetSectionLetters`. Tests : `store/keyStructure.test.ts`.

**Historique** (`app/src/store/history.ts`, pour l'étape 2).
- `undo()`, `redo()`, `canUndo()`, `canRedo()`, `undoLabel()`, `redoLabel()`,
  `useHistoryStatus()`, `subscribeHistory(listener)` (barre de menus du Mac).
- `transact(label, fn)` pour nommer une étape ou en regrouper plusieurs ;
  `beginGesture` / `endGesture` ; libellés `history.what.*` dans `i18n/fr.ts`.
- État « modifié » : `isModified()`, `useIsModified()`, `markSaved()`,
  `markModified()`, `resetHistory({ modified })`.
- Mécanisme générique autour du magasin : parts annulables `corrections`,
  `tempoMap`, `loop`, `markers`, `playback`, `metronome` et le mixage des
  pistes (par identifiant). Aucune action n'a été réécrite.
- Clavier : `ui/historyKeys.ts`. Tests : `store/history.test.ts`,
  `npm run test:undo`, `desktop/test/e2e/undo.test.js`.

**Signatures** (pour l'étape 4).
- `store/meterActions.ts` : `setMeterFrom(bar, meter)`,
  `setMeterForBar(bar, meter)`, `removeMeterChange(bar)`, `canChangeMeterAt`,
  `selectMeterAtBar`, `selectMeterAtTime`, `selectMeterChanges`.
- `grid/meters.ts` : `withMeterFrom`, `withMeterForBar`, `withoutMeterChange`,
  `meterChangeList`, `withMetersOf`, `mainMeter`, `feltBeat`.
  `grid/tempoMap.ts` : `barBeats`, `beatUnit`, `beatScale`.
- **Règle du dénominateur, « la noire reste la noire »** : les temps de la
  carte de tempo comptent l'unité de la première signature ; une mesure en
  n/d dure n × d0/d de ces temps (dans un morceau en 4/4, une mesure en 6/8
  dure trois noires). Écrite dans `model/tempoMap.ts` et `project/FORMAT.md`.
- `export/ireal.ts` : `IREAL_METERS`, `iRealMeterFor`, `iRealMeterToken`.
- Poignée de test : `window.__fabtice.lot2.meter`.

**Enregistrer** (pour l'étape 2).
- `project/saveFlow.ts` : `saveProject()`, `saveProjectAs()` (rendent
  `'saved' | 'cancelled' | 'failed'`).
- `project/leave.ts` : `confirmLeaveProject()`, `requestNewProject()` ;
  `project/choose.ts#chooseProjectFile()` pour « Ouvrir… ».
- `project/currentFile.ts` : `getCurrentFile()`, `useCurrentFile()` ;
  `project/windowState.ts` : titre de fenêtre.
- App Mac : `desktop/src/project-writer.js` (écriture sûre),
  `desktop/src/close-guard.js` (fermeture et cmd + Q) ; canaux
  `fabtice:project-file-*`, `fabtice:project-save-*`, `fabtice:project-state`,
  `fabtice:confirm-close`, `fabtice:close-ack`, `fabtice:close-answer`.
  Dans les tests e2e, la garde de fermeture est coupée par défaut
  (`FABTICE_NO_CLOSE_GUARD=1` dans `helpers.js`).
- Tests : `npm run test:alert`, `npm run test:project-file` (étendu),
  `desktop/test/e2e/project-file.test.js` (étendu).

## Décisions prises sans le propriétaire

- La tonalité principale reste où elle était ; les modulations sont une liste
  à part : moins de risque pour tout ce qui lit déjà la tonalité.
- Dès que l'utilisateur touche aux modulations, sa liste remplace celle de
  l'analyse : une nouvelle analyse ne peut pas défaire son travail.
- Une analyse complète vide l'historique d'annulation : c'est la règle la plus
  simple qui ne restaure jamais une grille incohérente avec la nouvelle
  analyse. Une séparation ou un rendu appliqué ne le vident pas.
- Un morceau importé compte comme « modifié » tant qu'il n'a pas été
  enregistré dans un `.fab` ; le morceau de démonstration non. Un morceau
  repris de la sauvegarde automatique au lancement compte comme modifié.
- Ordre des boutons de l'alerte comme sur macOS : « Ne pas enregistrer » à
  gauche, « Annuler », puis « Enregistrer » (bouton par défaut) à droite ; sur
  mobile, empilés, « Enregistrer » en premier. L'alerte a un titre, « Projet
  non enregistré ».
- Après « Ne pas enregistrer » sur « Nouveau projet », on ne repose pas la
  question pour l'import fait depuis la fenêtre ainsi ouverte.
- « Enregistrer » garde en silence le choix « avec ou sans les instruments »
  fait au dernier « Enregistrer sous… ».
- Web : le fichier du projet n'est pas retenu après un rechargement de la page
  (le navigateur redemanderait une autorisation) : « Enregistrer » redemande
  alors où écrire. Dans Safari et Firefox, « Enregistrer » télécharge le
  fichier, comme avant.
- Signatures : quand une mesure change de longueur, les changements de
  signature placés plus loin restent **au même endroit de la musique** (calés
  sur la barre la plus proche), pas au même numéro de mesure.
- Les signatures ne vivent que dans la carte de tempo (pas de champ de plus) :
  tout changement après le premier est celui de l'utilisateur. « Revenir à
  l'analyse » garde ces changements et rend la première signature analysée.
- Le tempo affiché est celui de la signature qui couvre la plus grande part du
  morceau, pour qu'une seule mesure en 6/8 ne le fasse pas sauter.
- Sur la grille, la signature ne s'écrit qu'aux changements (et en première
  mesure s'il y en a plusieurs) : une grille à signature unique ne change pas.
- iReal Pro ne connaît que quatorze signatures : une autre est écrite comme la
  plus proche en durée, la vraie en commentaire.
- Deux pannes anciennes corrigées au passage : l'export iReal Pro écrivait un
  morceau en 6/8 comme du 6/4, et une correction de tempo à la main rendait un
  6/8 en 6/4.

## Pas fait, ou fragile

- Rien de l'app Mac n'a été vu sur un vrai Mac à la main : la fenêtre
  d'enregistrement du système, le point dans le bouton de fermeture et
  cmd + Z sont vérifiés par les tests (Linux ici, Mac de GitHub).
- « Édition → Annuler » de la barre de menus du Mac n'agit encore que sur le
  texte : l'étape 2 refait ce menu.
- Rouvrir un morceau au lancement le donne « modifié » même s'il est identique
  à son `.fab`.
- Après une mesure au nombre impair de croches (7/8, 7/16), les barres
  suivantes tombent entre deux temps analysés : les corrections de tempo à la
  main refusent ces mesures en silence (contrôle dans `analysis/runner.ts`,
  non touché), et l'analyse numérote toujours avec une seule signature (règles
  figées). À regarder à l'étape 4.
- Le panneau du métronome ne règle les accents que de la première signature ;
  les autres prennent les accents par défaut.
- L'éditeur d'accord montre un bouton par temps : jusqu'à 64 pour une longue
  mesure, mise en page non vérifiée.
- Pas de signature dessinée sur la règle de l'affichage « Pistes ».
- La grille, les repères et les exports lisent encore `corrections.sections` et
  non `sectionsInForce` : l'étape 5 les basculera quand des lettres seront
  détectées.
- Safari et Firefox réencodent tout à chaque enregistrement (pas de poignée de
  fichier).
- Coupure de l'app en pleine écriture : couverte par des tests unitaires
  (l'ancien fichier reste intact), pas par un essai de bout en bout.

## Pièges rencontrés

- Les agents signent leurs commits avec leur propre ligne d'attribution, pas
  celle de la consigne : sans conséquence.
- Un agent qui tue « electron » à l'aveugle peut couper les tests d'un autre :
  ne lancer qu'une suite e2e de l'app Mac à la fois.
- `grid/metronome.ts` exportait ses propres bornes de métrique (2 à 12 sur 4
  ou 8) sous les mêmes noms que les nouvelles de `model/tempoMap.ts` : bien
  regarder d'où vient l'import.
- Trois choses ne se voient que sur un Mac, et ont coûté trois fabrications :
  un test qui lit le `navigator` de la machine (Node en a un sur Mac) ; le
  dossier temporaire atteint par un lien (`/var` vers `/private/var`) : y
  comparer des chemins réels (`fs.realpathSync`) — cela a aussi montré un vrai
  défaut, corrigé (le nettoyage des fichiers temporaires pouvait effacer
  l'enregistrement en cours dans un dossier atteint par un lien) ; les
  raccourcis des tests e2e : écrire `ControlOrMeta+s`, pas `Control+s`.
- Les tests e2e de l'app Mac demandent `npm run build:desktop` dans `app/`
  (pas `npm run build`) : sans cela la suite reste bloquée sans message.
- Les vérifications Chromium qui ouvrent un second morceau doivent maintenant
  répondre à l'alerte (`smoke`, `import`, `analysis` l'ont appris).

## Vérifications

- Commit vérifié : `2a52351` sur `v1` (le commit de fin n'ajoute que ce bilan
  et la table du plan).
- `app/` : `npm run typecheck` sans erreur ; `npm test` : 1 349 tests réussis,
  22 sautés.
- Vérifications Chromium après `npm run build`, toutes vertes, lancées l'une
  après l'autre au calme : `smoke`, `undo`, `alert`, `project-file`, `chart`,
  `timeline`, `import`, `export`, `export-audio`, `export-memory`, `analysis`,
  `separation`, `standards`, `render`, `memory`, `metronome`, `markers`,
  `tempo-fix`, `offline`, `engine`.
- `desktop/` : `npm test` : 108 réussis ; après `npm run build:desktop` dans
  `app/`, `FABTICE_NO_POPPLER=1 xvfb-run -a npm run test:e2e` : 31 tests, 28
  réussis, 3 sautés (ceux qui téléchargent), aucun échec.
- Fabrication sur les Mac de GitHub, lancée à la main sur `v1` : verte au
  quatrième lancement (run 43950201624, commit `2a52351`) : tests unitaires,
  construction pour puce Apple et Intel, e2e sur les deux (31 tests, 28
  réussis, 3 sautés), analyse, séparation, yt-dlp. Rien n'a été publié. Les
  trois premiers lancements ont échoué sur des défauts propres au Mac, tous
  corrigés (voir « Pièges rencontrés »).
- Captures regardées : alerte (1280 × 800 et 390 × 844), grille avec
  signatures 4/4, 7/8, 6/8 (les deux formes).
- Aucun fichier de brouillon dans le dépôt (commande du plan).

## Pour l'étape suivante

- Le menu Fabtice appelle : `undo()`, `redo()` et `useHistoryStatus()`
  (entrées grisées et libellés) ; `requestNewProject()` ;
  `chooseProjectFile()` ; `saveProject()` ; `saveProjectAs()`. La barre de
  menus du Mac s'abonne par `subscribeHistory`. « Quitter » passe déjà par la
  garde de fermeture.
- L'ancien dialogue « Enregistrer le projet » (avec ou sans les instruments)
  est gardé : il sert à « Enregistrer sous… ».
- `desktop/src/menu.js` n'a pas été touché : aucun raccourci d'enregistrement
  ni d'annulation n'y est déclaré, la page les traite. En les ajoutant au
  menu, veiller à ne pas les déclencher deux fois.
- Les raccourcis existants : `ui/historyKeys.ts`, `ui/saveKeys.ts`, installés
  par `ui/useGlobalKeys.ts`.
- Rien ne change dans la section « Étape 2 » du plan. Pour l'étape 4 : la
  fenêtre « Changer la signature rythmique » n'a qu'à appeler
  `setMeterFrom` / `setMeterForBar`, et le type `TappedTempoFix` attend ses
  tapes. Pour l'étape 5 : remplir `analysis.keyChanges` et
  `analysis.structure`, et passer les lecteurs de sections à
  `sectionsInForce`.
