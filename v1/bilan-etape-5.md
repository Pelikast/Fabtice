# Bilan de l'étape 5 — Harmonie

## Livré

- **C14 — Structure du morceau.** Après l'analyse, l'app établit seule la
  forme (AABC…), les lettres des sections, et les parties : Intro, Thème,
  Solo, Pont, Spécial, Outro (Couplet, Refrain en mode Pop), numérotées
  comme le demande le cahier. Avec une séparation des instruments, le
  soliste est nommé (« Solo (Piano) ») ; un vent s'affiche d'abord « Solo
  (Vents) », puis prend son nom si le petit outil de reconnaissance est
  sûr de lui. Sans séparation : « Solo 1, Solo 2 », jamais de nom
  d'instrument. Pas de gros modèle généraliste : reprises de la grille,
  grille connue du standard, niveaux des pistes séparées, et un modèle de
  6,7 Mo pour les vents.
- **C14 — Colonne des sections.** À gauche de la grille (20 %, la grille
  80 %) : « Forme globale : AABC », « Mode » (Jazz, Pop, et « Auto »),
  « Affichage complet », « Grille complète simplifiée », « Sections : » et
  la liste des parties. Un clic sur une partie n'affiche que ses mesures et
  place la tête de lecture à son début ; « Boucle » pose la boucle sur
  toute la partie ; le crayon ouvre la correction (type, numéro,
  instrument, mesures, suppression) ; « Ajouter une partie » ; « Revenir à
  la structure de l'analyse » et « Revenir aux lettres de l'analyse ». La
  partie en cours de lecture est marquée à l'encre. Sur téléphone : une
  barre sous le titre de la grille, qui ouvre une feuille avec la même
  liste.
- **C14 — Grille complète simplifiée.** Ligne « Forme : Intro, Thème 1
  (AABC)… », un bloc par section écrite, accord de consensus entre les
  reprises ramené à sa famille, substitution tritonique ramenée à la
  dominante, « % », barres de reprise avec « ×2 », double barre de fin.
  L'exemple « Autumn Leaves » du cahier sort à l'identique et tient sur une
  page A4. La lecture suit : la mesure écrite qui correspond à l'audio est
  mise en évidence, avec « 2ᵉ fois » ou « reprise 2/6 » ; un clic sur une
  mesure écrite va à sa prochaine occurrence ; un glissé boucle les
  prochaines occurrences. On ne corrige pas dans cet affichage (une ligne
  le dit).
- **C10 — Modulations.** Un changement d'armure qui dure (huit mesures au
  moins) est détecté ; le va-et-vient avec le relatif et les II-V de
  passage ne comptent pas. Marque « Ton : A♭ » au-dessus de la mesure sur
  la grille, sur la règle de « Pistes » et sur le papier ; accords
  orthographiés dans la tonalité du passage ; tonalité du transport qui
  suit la lecture ; la transposition décale tout ensemble. Correction à la
  main par un clic sur la marque ou par le menu de la mesure (changer,
  déplacer, supprimer, revenir à l'analyse). Un accord qui glisse d'un
  demi-ton vers le bas s'écrit avec un bémol (« Bm B♭7 | Am7 »), comme dans
  l'exemple du cahier.
- **Tout se recalcule seul** 150 ms après un changement de la grille de
  mesures (correction du tempo à l'oreille ou en tapant, signature), des
  accords (y compris à la main, annuler, rétablir), de la tonalité, du
  mode, de la séparation ou des recueils, sans toucher à ce qui a été
  corrigé à la main, sans créer d'étape d'annulation ni vider l'historique.
- **Impression (C4).** « Ce qu'on imprime » : grille complète, grille
  complète simplifiée, une section ; ligne « Forme » dans l'en-tête (case à
  cocher). La fenêtre s'ouvre sur ce que l'écran montre.
- **Exports.** iReal Pro : la grille simplifiée s'exporte avec de vraies
  reprises quand c'est elle qui est affichée ; les modulations sont écrites
  en note (« Ton : Ab ») ; « Ouvrir dans iReal Pro » existe aussi dans
  l'app web, avec un message si rien ne s'ouvre. Fichier MIDI des dossiers
  Logic et Ableton : armures par passage, parties et sections en
  marqueurs (déjà en place depuis l'étape 3, maintenant alimentés), avec
  « (Ton : Ab) » au changement. Les libellés des parties sont unifiés.
- **Réglages**, onglet « Détection des accords » : « Détecter les
  modulations », « Structure automatique du morceau », « Mode ».

## Où c'est dans le code

Le détail est dans `app/README.md`, « Étape 5 de la 1.0.0 : harmonie », et
dans `web/spikes/structure/README.md` (banc, chiffres, limites).

- **Passe d'harmonie** : `app/src/structure/` — `types.ts` (contrats),
  `index.ts` (`detectKeyChanges`, `detectStructure`, `simplifyChart`),
  `keys.ts` (modulations), `grid.ts`, `form.ts`, `parts.ts`, `detect.ts`
  (forme, lettres, parties, mode), `simplify.ts` (grille simplifiée,
  `places` : mesure jouée → mesure écrite), `evidence.ts` et `gather.ts`
  (ce que disent les pistes), `instruments/` (reconnaissance des vents,
  `createInstrumentRecognizer`), `refresh.ts` (`HarmonyRefresh`,
  `startHarmonyRefresh` dans `main.tsx` : déclencheurs, anti-rebond,
  identifiants de parties stables), `knownCache.ts`.
- **Historique** : `store/history.ts`, `DERIVED_ANALYSIS_FIELDS` : un
  changement de `analysis.keyChanges` ou `analysis.structure` seuls n'est
  ni une étape ni une remise à zéro.
- **Sélecteurs et commandes** : `store/chartDisplay.ts` (`ui.chartDisplay`,
  `showPart`, `loopPart`…), `store/simplifiedSelectors.ts`
  (`selectSimplifiedChart`), `store/chartSelectors.ts` (`selectBarContexts`,
  `ChartBar.keyChange`, `BarChord.next`), `store/modulationActions.ts`,
  `model/structureLabels.ts` (`partName`, clés `structure.part.*`).
- **Écran** : `components/` de la colonne et `PartDialog`,
  `ModulationDialog`, `chart/SimplifiedGrid.tsx`,
  `chart/simplifiedLayout.ts`, `chart/useWrittenPlayhead.ts`,
  `timeline/keyMarks.ts`, `ui/keyDialog.ts`, `ui/partDialog.ts`.
- **Impression et exports** : `PrintOptions.what`, `PrintHeader.form`,
  `usePrintChart(instrument, what)`, `PrintChart.rows` ;
  `export/simplifiedExport.ts`, `chartExport.ts#chartForExportShown`,
  `export/irealOpen.ts`, `components/IRealNotice.tsx`.
- **Orthographe** : `harmony/chord.ts` (`rootName`, `approachTargets`),
  `harmony/pitch.ts#upperNeighbour`.
- **Modèle d'instruments** : `MODEL_REGISTRY['ced-tiny']`
  (`analysis/models.ts`), CED-Tiny, 6,7 Mo, licence Apache-2.0, fichier
  public de ses auteurs sur Hugging Face (adresse et empreinte épinglées).
- **Version du document** : inchangée (6). Rien de nouveau n'est
  enregistré pour la grille simplifiée, l'affichage ou l'écoute des pistes.
- **Démo et poignées** : `?demo&structure=demo|pop`, `?demo&piece=feuilles`
  (`&modulation=oui`), `?harmonie=non` ; `window.__fabtice.structure`,
  `window.__fabtice.harmony`.
- **Tests ajoutés** : `npm run test:structure`, `test:harmony`,
  `test:simplified` ; `print`, `export`, `menu`, `meter`, `tempo-fix`,
  `tap-fix`, `settings`, `chart` étendus ; captures :
  `FABTICE_CAPTURES_ONLY=structure,modulations,simplifi npm run captures`.
  Banc : `npx vitest run src/structure/bench.test.ts` (complet :
  `FABTICE_STRUCTURE_FULL=1`), et dans `web/spikes/structure/` :
  `node banc/build.mjs && node dist/run.mjs`.

## Chiffres du banc

35 morceaux écrits pour le banc (AABA, ABAC, AABC, blues, 16 mesures, pop,
vraies modulations et pièges), en deux paliers : **simulé** (la vérité lue
à travers des erreurs d'analyse tirées au sort : « réaliste » ≈ un accord
sur quatre faux, « mauvais » ≈ un sur deux) et **rendus** (audio rendu par
synthèse, 35 propres et 9 « vieux disque », passé par la vraie analyse de
l'app : accords justes à 68 % et 54 %). « + grille » : la grille connue du
standard est trouvée par le titre. Tableaux complets :
`web/spikes/structure/resultats/`. J'ai relancé les deux paliers sur `v1` :
ils se reproduisent à l'identique.

| Brique | simulé réaliste | + grille | simulé mauvais | + grille | rendus propres | + grille | vieux disque | + grille |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Longueur du chorus | 81 % | 97 % | 33 % | 93 % | 83 % | 93 % | 75 % | 75 % |
| Forme exacte (AABA…) | 79 % | 100 % | 41 % | 100 % | 79 % | 93 % | 62 % | 75 % |
| Type de partie (thème, solo…), pistes séparées | 82 % | 84 % | 67 % | 73 % | 93 % | 89 % | 80 % | 82 % |
| Solistes voisins séparés, pistes séparées | 77 % | 79 % | 64 % | 71 % | 78 % | 76 % | 82 % | 82 % |
| Solistes voisins séparés, sans séparation | 24 % | 29 % | 7 % | 13 % | 18 % | 22 % | 9 % | 27 % |
| Instrument juste (piano, guitare, basse, batterie, voix) | 92 % | 92 % | 66 % | 68 % | 84 % | 84 % | 95 % | 95 % |
| Instrument faux nommé | 5 % | 5 % | 12 % | 12 % | 7 % | 6 % | 5 % | 5 % |
| Mode Jazz / Pop | 100 % | 100 % | 99 % | 99 % | 100 % | 100 % | — | — |
| Modulations : précision | 97 % | 98 % | 76 % | 80 % | 100 % | 100 % | — | — |
| Modulations : rappel | 65 % | 85 % | 33 % | 42 % | 58 % | 67 % | 0 sur 4 | 0 sur 4 |
| Grille simplifiée, accords justes (structure vraie) | 79 % | 90 % | 58 % | 75 % | 78 % | 94 % | 62 % | 78 % |
| Grille simplifiée, accords justes (tout détecté) | 52 % | 80 % | 18 % | 68 % | 62 % | 74 % | 38 % | 58 % |

Fausses modulations sur les morceaux qui ne modulent pas : aucune jusqu'au
niveau réaliste et sur les rendus (0 sur 30 propres, 0 sur 8 vieux
disques) ; 2 au niveau mauvais (un seul morceau).

**Jusqu'où cela tient.**
- **Chorus et forme** : sûrs quand les accords sont bien lus, encore bons
  avec un accord sur quatre faux, perdus avec un sur deux, sauf si la
  grille du standard est dans les recueils téléchargés : elle rattrape
  presque tout. Ce qui trompe : deux sections presque pareilles, une intro
  qui est la fin de la grille.
- **Thème ou solo, changement de soliste** : corrects avec les pistes
  séparées. **Sans séparation, deux solistes qui se suivent ne sont
  distingués qu'une fois sur quatre au mieux** : c'est la limite de l'app
  sans séparation ; on obtient souvent un seul long « Solo ».
- **Instrument** : jamais nommé sans séparation. Avec, 84 à 95 % de justes
  et 5 à 7 % de noms faux sur les rendus. **Les vents sont simulés dans le
  banc** ; le vrai outil a été mesuré à part
  (`web/spikes/structure/instruments/`) : sur de vrais instrumentistes,
  63 à 79 % des vents bien nommés pour 1 à 4 % de noms faux ; trompette
  bouchée lue saxophone, et saxophone souvent laissé en « Vents ». Aucun
  vrai disque des années 1930-50 n'a pu être essayé.
- **Modulations** : presque jamais de fausse alerte, mais une vraie
  modulation sur trois est manquée dès que l'analyse des accords est
  moyenne, et toutes sur les rendus « vieux disque ». Cause principale :
  quand l'analyse se trompe d'une quinte sur la tonalité principale, le
  pont dans un autre ton n'est pas vu. Choix assumé : ne rien signaler
  plutôt que signaler à tort.
- **Grille simplifiée** : elle vaut ce que valent les accords. Une erreur
  répétée à chaque reprise ne se corrige pas par consensus. La grille
  connue du standard ou le modèle d'accords détaillé changent tout : avec
  le modèle détaillé (16 rendus), accords lus justes de 63 à 86 % (propres)
  et de 54 à 81 % (vieux disque), grille simplifiée juste à 93 % et 89 %
  sans grille connue.
- **« Autumn Leaves » à partir d'un rendu** (critère du plan) : **passe**
  avec la grille connue et les pistes séparées, sur le rendu propre et le
  vieux disque, avec les deux modèles d'accords. Sans séparation, la grille
  écrite est juste mais le dernier thème est lu « Solo ». **Sans grille
  connue, échoue** : forme et parties sont justes sur le rendu propre, mais
  l'analyse lit D7 pour D△, E7 pour Em7… à chaque reprise (11 erreurs avec
  le modèle standard, 5 avec le détaillé).
- **Ce que le banc idéalise** : pistes séparées parfaites (pas une vraie
  séparation), sons de synthèse, thème identique à chaque reprise, grille
  connue toujours trouvée par le titre. Les chiffres « avec pistes » sont
  des plafonds. Le palier sur de vrais standards des recueils n'a pas été
  fait.

## Décisions prises sans le propriétaire

Architecture
- La structure et les modulations se calculent à partir de la grille et
  des accords **en vigueur**, sur le fil principal, après chaque
  changement : même résultat après une correction du tempo, une signature
  ou un accord écrit à la main.
- Ce recalcul est invisible pour Annuler / Rétablir et ne marque le projet
  « modifié » que si son résultat diffère de ce que le fichier contient.
- Un calcul est lancé à chaque ouverture de projet.

Modulations
- Un changement modal qui change l'armure (type « So What ») compte.
- La marque écrit la tonalité en lettres (« Ton : A♭ »), comme les accords
  de la grille (la note de l'export iReal Pro l'écrivait en français : voir
  les décisions du propriétaire plus bas).
- Dès que l'utilisateur touche une modulation, toute sa liste remplace
  celle de l'analyse. La première mesure ne reçoit pas de modulation (c'est
  la tonalité principale, qui se change au titre).
- Une modulation se cale toujours sur une barre de mesure.
- Les modulations écrites à la main survivent à « revenir à l'analyse »
  des accords : elles ont leur propre retour.

Structure et grille simplifiée
- Numéro d'un solo laissé vide quand chaque soliste est nommé et distinct.
- Sans audio lisible : Thème 1, Solo, Thème 2 à partir de trois chorus.
- Mode Pop quand moins de 30 % des accords sont des septièmes (sauf grille
  connue).
- **Appui sur la grille connue du standard** dans la grille simplifiée :
  quand elle correspond nettement au morceau, un accord de même
  fondamentale mais d'autre couleur prend la couleur du livre, sauf s'il a
  été écrit à la main ; une autre fondamentale jouée par plusieurs
  reprises est gardée. Prix mesuré : si l'enregistrement s'écarte vraiment
  du livre sur la couleur, la grille simplifiée écrit le livre (82 % au
  lieu de 96 %). L'affichage complet montre toujours l'accord entendu.
- L'accord mineur de tonique s'écrit sans septième (« Bm »).
- Un accord un demi-ton au-dessus du suivant s'écrit avec un bémol, partout
  où un accord s'écrit.

Écran
- « Auto » est un troisième choix discret à côté de Jazz / Pop.
- Les lettres d'une partie sont sous son nom ; « Corrigée à la main » sur
  sa ligne.
- Le numéro de la reprise est au-dessus du bloc (« 2ᵉ fois », puis
  « reprise n/total » au-delà de quatre).
- Dans la grille simplifiée, clic droit, appui long et clic sur un accord
  ne font rien ; une ligne renvoie à l'affichage complet.
- Titre du menu de la mesure : « À partir de la mesure N ».
- Sur téléphone, une garde de quelques dixièmes de seconde empêche qu'un
  appui long choisisse une entrée du menu en relâchant le doigt.
- Impression : le choix « une section » n'est pas retenu d'une fois sur
  l'autre ; la fenêtre s'ouvre sur ce que l'écran montre.
- iReal Pro dans l'app web : le message apparaît si la page est restée
  visible 1,6 s après le clic.

Modèle d'instruments
- CED-Tiny plutôt que YAMNet (deux fois moins de vents bien nommés avec
  accompagnement). Piano, guitare et voix ne sont jamais nommés par lui
  (ils ont leur piste). Seuil réglé pour 10 % de noms faux au plus.

## Décisions du propriétaire après ce bilan (17 novembre 2026)

Il a répondu aux trois questions posées en fin d'étape ; elles sont
appliquées (commit `548b544`) et inscrites dans `CLAUDE.md`.

1. **Le modèle d'accords détaillé est choisi d'office** quand l'appareil le
   permet. Réglage « Automatique (recommandé) », par défaut : modèle
   détaillé sur un ordinateur dont la mémoire connue est d'au moins 8 Go
   (`navigator.deviceMemory`), modèle rapide sinon (téléphone, tablette,
   mémoire inconnue comme dans Safari et Firefox). Un choix déjà fait dans
   les réglages est respecté. Si le modèle détaillé échoue (hors ligne,
   mémoire), l'analyse garde le modèle rapide, comme avant. Une analyse déjà
   faite n'est pas refaite toute seule. Sur les adresses de test,
   « Automatique » donne le modèle rapide (`setChordModelAutoAllowed`,
   `?modele-accords=auto` pour la vraie règle).
2. **Tonalités en chiffrage américain partout** : « Ton : A♭ » sur la
   grille (déjà le cas), « Ton : Ab » dans la note de l'export iReal Pro et
   dans les marqueurs MIDI. Les noms français de tonalité ont disparu du
   code (`keyNameFr`, `noteTextFr`). « Si♭ » et « Mi♭ » restent pour les
   instruments transpositeurs, comme dans le cahier.
3. **L'appui sur la grille du livre dans la grille simplifiée est
   accepté** tel qu'il est décrit plus haut.

## Pas fait, ou fragile

- **Rien n'a été vu sur un vrai Mac, un vrai téléphone, ni entendu sur un
  vrai disque.** Structure, modulations et reconnaissance des vents n'ont
  été mesurées que sur des rendus de synthèse et, pour les vents, sur des
  enregistrements d'étude. Le propriétaire est le seul juge sur ses
  morceaux.
- Sans séparation, les solistes qui se suivent sont rarement distingués.
- Modulations manquées quand la tonalité principale de l'analyse est
  fausse ; aucune trouvée sur les rendus « vieux disque ».
- Un long solo n'est pas toujours gardé entier (92 % au niveau réaliste,
  moins sur les rendus).
- Le modèle d'accords standard lit mal les couleurs (D△ lu D7) : pour la
  grille simplifiée, le modèle détaillé ou les recueils de standards sont
  presque nécessaires. À dire au propriétaire.
- La passe prend environ 0,3 s pour un morceau de quinze minutes, 0,7 s
  pour trente, sur le fil principal (après un anti-rebond).
  Elle ne lit que 256 mesures au-delà du dernier accord.
- « Ouvrir dans iReal Pro » dans un navigateur : vérifié avec un lien
  intercepté seulement ; le message dépend de ce que le navigateur signale.
- L'impression de la grille simplifiée n'a été vue qu'en PDF.
- Un glissé sur des mesures écrites non contiguës dans la lecture ne fait
  rien (couvert par un test unitaire seulement).
- Le palier « vrais standards des recueils » du banc n'existe pas.
- Dans les rendus du banc, le thème de la fin n'a pas la mélodie de celui
  du début et les solos de contrebasse sont muets (documenté, non corrigé).
- Un nom de partie long écrit à la main (« Solo 2 (Saxophone) ») passe sur
  deux lignes dans la colonne.
- Le menu de la mesure est haut sur téléphone (six entrées avec leurs
  lignes d'explication) ; il tient à 390 × 844 et défile sinon.

## Pièges rencontrés

- **Fusionner puis pousser sans attendre les tests** : j'ai poussé une
  fois avec un test en échec (une attente périmée), corrigé dans le commit
  suivant. Enchaîner `tests && commit && push`, pas `tests ; commit`.
- **Vérifications périmées par la détection** : dès que la structure est
  détectée pour de bon, les vérifications qui comptent les lettres de la
  démo, comparent toute l'analyse ou listent le menu de la mesure
  changent (`tests/chart.mjs`, `tests/structure.mjs`,
  `desktop/test/e2e/tempo-by-hand.test.js`).
- **Morceau étiré des tests** : `tests/export.mjs` étire la démo à 60 000
  mesures ; la détection des modulations y prenait près de cinq minutes.
  D'où la borne de 256 mesures après le dernier accord.
- **Le PDF de Chromium n'imprime pas les fonds** : les barres de reprise
  dessinées en dégradé n'apparaissaient pas sur le papier ; elles sont en
  bordures.
- **Ordre des feuilles de style** : les styles d'un composant précèdent
  `dialog.css` ; une règle à une seule classe sur `.voile-…` perd contre
  `.voile`. Doubler la classe.
- **Deux agents sur le même fichier de vérification** (`tests/harmony.mjs`,
  `bench/thresholds.ts`) : conflits à la fusion, résolus à la main. Donner
  un fichier par agent.
- **FluidSynth** : absent de la machine ; `apt-get update && apt-get
  install fluidsynth` fonctionne.
- Les agents signent leurs commits avec leur propre ligne d'attribution.
- La pause demandée par le propriétaire (limite de 5 h) : agents arrêtés
  puis relancés avec leur contexte, rien de perdu ; les calculs en cours
  sont à relancer.

## Vérifications

- Commit vérifié : `4b8d2db` sur `v1` (les commits suivants n'ajoutent que
  ce bilan et la table du plan).
- `app/` : `npm run typecheck` sans erreur ; `npm test` : 1 923 tests
  réussis, 43 sautés (dont le sous-ensemble du banc de structure, avec ses
  seuils).
- Banc relancé par la session d'étape sur `v1` : palier simulé complet
  (`FABTICE_STRUCTURE_FULL=1`) et palier des rendus : tableaux identiques à
  ceux du dépôt.
- Vérifications Chromium après `npm run build`, l'une après l'autre, au
  calme, **toutes vertes au premier passage** : `smoke`, `menu`,
  `settings`, `print`, `new-project`, `standards`, `undo`, `alert`,
  `project-file`, `chart`, `timeline`, `import`, `export`, `export-audio`,
  `export-memory`, `export-logic`, `export-ableton`, `analysis`,
  `separation`, `markers`, `metronome`, `tempo-fix`, `tap-fix`, `meter`,
  `structure`, `harmony`, `simplified`, `offline`, puis `engine`, `render`,
  `memory`.
- `desktop/` : `npm test` : 122 réussis ; après `npm run build:desktop`,
  `FABTICE_NO_POPPLER=1 xvfb-run -a npm run test:e2e` : 40 tests, 37
  réussis, 3 sautés (ceux qui téléchargent), aucun échec. À surveiller :
  dans `tempo-by-hand.test.js`, le test de la barre d'espace a échoué une
  fois, lancé seul, puis réussi au passage suivant sans changement ; vert
  dans les deux passes entières.
- Vérifié comme le demande le plan : chiffres du banc ci-dessus ;
  l'exemple « Autumn Leaves » sort sous la forme du cahier à partir d'un
  rendu **avec la grille connue et les pistes séparées** (pas sans grille
  connue : voir plus haut) et à partir de la grille sans erreur
  (`demo/demoAutumn.test.ts`, `test:simplified`) ; lecture suivie dans les
  trois affichages (`test:structure`, `test:simplified` : la mesure écrite
  en cours, le numéro de la reprise, le défilement sans saut) ; chaque
  correction à la main s'annule et se rétablit (`test:structure`,
  `test:harmony`).
- Captures regardées par la session d'étape, dans les deux formes : colonne
  (complète, une partie, partie corrigée, feuille du téléphone), fenêtre
  d'impression avec une section, message iReal Pro, modulations (grille,
  fenêtre, règle, menu de la mesure), grille simplifiée (lecture au
  deuxième passage, page imprimée, téléphone). Les agents ont regardé les
  autres. Défauts vus et corrigés en route : lettre de section sur un
  accord (téléphone), « Corrigée à la main » mal coupée, accords du papier
  touchant la marque de modulation, barres de reprise absentes du PDF,
  « A♯7 » au lieu de « B♭7 », titre du menu de la mesure.
- Fabrication sur les Mac de GitHub, lancée à la main sur `v1` : **verte au
  premier lancement** (run 44132804411, commit `cc0f673`, qui ne diffère de
  `4b8d2db` que par ce bilan) : vérification de l'interface, adresses des
  recueils, tests unitaires, construction pour puce Apple et Intel, e2e sur
  les deux, analyse, séparation, yt-dlp. Rien n'a été publié.
- Aucun fichier de brouillon dans le dépôt (commande du plan) ; aucun nom
  d'assistant ni information personnelle dans ce que l'étape a ajouté.

## Pour l'étape suivante

- **Étape 6 (Machine)** : rien ne change à sa section. À savoir :
  - « Alléger le travail pour l'appareil » : la passe d'harmonie tourne sur
    le fil principal (quelques dixièmes de seconde, après un anti-rebond de
    150 ms) et la reconnaissance des vents dans son propre fil
    (`structure/instruments/instruments.worker.ts`, un fil de calcul) :
    deux calculs de plus à compter, légers.
  - Le modèle des vents est dans `MODEL_REGISTRY` (`analysis/models.ts`),
    dans le même magasin que les outils d'analyse : il suit leurs mises à
    jour et « Libérer ».
  - La liste distante des modèles (C17) ne le concerne pas : il est épinglé
    dans le code, comme les modèles d'analyse.
- **Étape 7 (Finition)** : rejouer le parcours « structurer » comme un
  utilisateur (importer, séparer, corriger une partie, une lettre, une
  modulation, enregistrer, rouvrir : tout doit revenir) ; relancer le banc
  complet et `npm run captures` ; relire le changelog de l'étape.
- **À faire essayer au propriétaire**, en premier : un de ses standards
  avec les recueils téléchargés et le modèle d'accords détaillé, séparé
  puis non séparé : la colonne, « Grille complète simplifiée », la lecture
  suivie, l'impression sur une page ; un morceau qui module ; un solo de
  trompette, de saxophone, de trombone (le nom donné, ou « Vents ») ; sur
  téléphone, « Ouvrir dans iReal Pro ». Lui dire ce qui est fragile : les
  solistes sans séparation, les modulations manquées, la grille simplifiée
  sans grille connue avec le modèle d'accords standard.
- **Questions à lui poser** : faut-il conseiller, ou choisir d'office, le
  modèle d'accords détaillé quand l'appareil le permet (il double presque
  la justesse de la grille simplifiée) ? La marque « Ton : A♭ » doit-elle
  s'écrire en français (« Ton : La♭ ») ? L'appui sur la grille du livre
  dans la grille simplifiée lui convient-il ?
