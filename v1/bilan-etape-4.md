# Bilan de l'étape 4 — Tempo à la main

## Livré

**C12 — Corriger le tempo en tapant.** Le menu du clic droit sur une mesure
(appui long sur téléphone) a une troisième entrée, « Correction de la courbe
en tapant le tempo ». Déroulé, comme demandé :
1. Une petite fenêtre, posée au-dessus du transport sans rien assombrir (une
   feuille en bas sur téléphone) : le numéro de la mesure de départ, « Mesures
   de décompte » (1 par défaut, 0 à 4), le texte du propriétaire à la lettre
   (« Touchez l'écran » à la place de « Tapez sur la touche espace » sur
   téléphone) et « C'est parti ».
2. Le décompte se joue, métronome forcé quel que soit le réglage, sur la
   grille existante ; **le clic s'arrête à la mesure choisie**. On tape à la
   barre d'espace, ou en touchant une grande zone sur téléphone. Un anneau
   bat à chaque tape, le nombre de tapes s'affiche. On peut déjà taper avec
   le clic pendant le décompte : ces tapes servent à mesurer l'avance ou le
   retard habituel. La boucle est mise de côté, le tempo de lecture n'est pas
   touché (on peut taper au ralenti).
3. « Ok, j'ai fini » (ou la fin du morceau) : l'app calcule la grille de la
   mesure choisie jusqu'à la dernière tape **et réanalyse la suite**, avec le
   pourcentage. Si les tapes ne suffisent pas, une phrase calme et
   « Réessayer ».
4. « Vérifier en écoutant » joue le passage, clic actif, sur la nouvelle
   grille (la règle, la grille d'accords et le clic la montrent déjà). Une
   ligne dit ce qui a été compensé (« Vous tapez en moyenne 71 ms après le
   temps : c'est compensé. », temps oubliés ajoutés, tapes en trop écartées).
   Puis « Ce n'est pas bon, réessayer » ou « C'est bon, c'est corrigé ».
5. « C'est bon » garde exactement ce qu'on vient d'écouter, en une seule
   étape d'annulation ; la correction est gardée avec le projet (`.fab`
   compris) et « Revenir à l'analyse » sur la mesure la retire. Fermer la
   fenêtre à n'importe quel moment ne laisse rien de changé.

**C13 — Changer la signature rythmique.** Quatrième entrée du même menu. Deux
cases l'une sur l'autre séparées par un trait (1 à 64 ; 4, 8, 16 ou 32), le
choix « Changement permanent à partir de cette mesure » / « Changement
uniquement pour cette mesure », une phrase sur la noire quand le chiffre du
bas change (« La noire garde sa durée : une mesure en 7/8 dure trois noires
et demie. »), « Retirer ce changement de signature » sur une mesure qui en
porte un. Une étape d'annulation.

**Laissés par les étapes précédentes, traités ici.**
- Les trois corrections de tempo à la main marchent après une mesure au
  nombre impair de croches (7/8, 7/16) : plus de refus silencieux.
- La signature est dessinée sur la règle de « Pistes » à la mesure où elle
  change (et en mesure 1 s'il y en a plusieurs).
- Panneau du métronome (et onglet Métronome des Réglages) : avec plusieurs
  signatures, on choisit celle dont on règle le groupement et les temps forts.
- Éditeur d'accord sur une très longue mesure (13/8, 32/16, 64/32) : les
  temps passent en grille sur plusieurs lignes, vérifié dans les deux formes.
- **Barre d'espace** : avec une fenêtre ou un menu ouvert, elle ne lance plus
  la lecture, dans toutes les fenêtres ; elle actionne le contrôle en cours.
  Pendant les tapes elle tape ; après, elle reprend son rôle.
- Trouvé en route, sur téléphone : le libellé du tempo coupé (« ≈ 11… »,
  défaut plus ancien) et un débordement de la barre du haut pendant un
  calcul : corrigés.

**Captures.** `npm run captures` ajoute, dans les deux formes :
`tempo-menu-de-la-mesure`, `tapes-preparation`, `-decompte`, `-en-cours`,
`-calcul`, `-verification`, `-refus`, `-attente`, `signature-menu`,
`-fenetre`, `-fenetre-7-8`, `-fenetre-retrait`, `-regle`, `-grille`,
`-grille-une-mesure`, `metronome-signatures`, `accord-longue-mesure-13-8`
et `-64-32`.

## Où c'est dans le code

Le détail est dans `app/README.md`, « Étape 4 de la 1.0.0 : tempo à la main ».

- Menu : `components/TempoFixMenu.tsx` (`data-action` : `continuity`, `fresh`,
  `tap`, `meter`, `undo`) ; fenêtres ouvertes par `ui/barDialogs.ts`
  (`openTapFix`, `openMeterDialog`).
- Contrat des tapes : `analysis/tapFix.ts` (`tapNow(at?)`,
  `previewTappedFix`, `showTappedPreview`, `discardTappedPreview`,
  `commitTappedFix`, `TappedPreview.reading`, refus `tooFewTaps`, `notABar`,
  `noAnalysis`, `irregular`, `failed`).
- Calcul : `analysis/engine/tapGrid.ts` (`applyTappedFix`, `manualTempoGrid`),
  `analysis/runner.ts` (`runTappedFix`, `gridForFix`),
  `store/tempoFixActions.ts` (`tempoMapForFix`), `AppState.tempoPreview` et
  `gridInForce()` dans `store/store.ts`, `AudioEngine.getOutputLatency?()`.
- Écran : `components/TapFixDialog.tsx`, `ui/tapFixSession.ts`,
  `grid/tapFixPlan.ts`, `ui/tapFixReading.ts`, `styles/tapFix.css`.
- Signature : `components/MeterDialog.tsx`, `ui/meterForm.ts`,
  `timeline/meterMarks.ts` (`data-signatures` sur `.frise`).
- Métronome : `MetronomePanel.tsx#useEditedMeter`. Éditeur d'accord :
  `LONG_BAR_BEATS`. Barre d'espace : `ui/useGlobalKeys.ts#windowOpen`.
- Version du document : inchangée (6). `TappedTempoFix` existait ; `taps`
  garde maintenant aussi les tapes des deux mesures d'avant.
- Tests ajoutés : `npm run test:tap-fix`, `npm run test:meter` ; fin de
  `tests/tempo-fix.mjs` ; `tests/metronome.mjs` étendu ; banc
  `src/analysis/engine/tapGrid.bench.test.ts` (complet :
  `FABTICE_TAP_FULL=1 npx vitest run src/analysis/engine/tapGrid.bench.test.ts`) ;
  `tests/lib/bar-menu.mjs` ; `desktop/test/e2e/tempo-by-hand.test.js`.
  Poignée de test : `window.__fabtice.tapFix`.

## Chiffres du banc des tapes

2 448 essais simulés : 51 passages (bosses de tempo plantées sur les cas
réels enregistrés, rubato, point d'orgue, ralenti bref, accélération brève,
passages où le réseau n'entend rien) × des tapeurs simulés × 3 tirages. Écart
entre la grille obtenue et la vraie, sur les temps du passage. « ± X ms » :
dispersion gaussienne d'écart type X/2.

| Tapeur | médiane | à moins de 70 ms | nombre de temps juste | barres en phase | jonction avec la suite |
|---|---|---|---|---|---|
| précis | 4 ms | 100 % | 100 % | 100 % | 100 % |
| ± 30 ms | 6 ms | 100 % | 100 % | 100 % | 100 % |
| ± 60 ms | 8 ms | 99 % | 100 % | 100 % | 100 % |
| ± 100 ms | 11 ms | 83 % | 82 % | 86 % | 97 % |
| toujours en avance (−80 ms) | 8 ms | 98 % | 99 % | 99 % | 99 % |
| toujours en retard (+120 ms) | 8 ms | 97 % | 99 % | 99 % | 100 % |
| dérive lente | 14 ms | 88 % | 95 % | 87 % | 86 % |
| 10 % de tapes oubliées | 6 ms | 94 % | 91 % | 95 % | 100 % |
| 20 % oubliées (deux de suite au plus) | 6 ms | 91 % | 86 % | 91 % | 95 % |
| 20 % oubliées, trois de suite et plus | 6 ms | 78 % | 67 % | 85 % | 95 % |
| 10 % de tapes en trop | 6 ms | 97 % | 95 % | 95 % | 100 % |
| lecture aux trois quarts | 7 ms | 100 % | 100 % | 100 % | 100 % |
| une tape sur deux (blanches) | 7 ms | 98 % | 100 % | 100 % | 100 % |
| « moyen » (tout mélangé) | 10 ms | 82 % | 80 % | 88 % | 95 % |
| « mauvais » (tout, en pire) | 140 ms | 52 % | 43 % | 59 % | 88 % |
| **ensemble** | 7 ms | 91 % | 90 % | 93 % | 97 % |
| grille d'avant, sans taper | 24 ms | 66 % | 59 % | 72 % | 96 % |

Par type de passage (nombre de temps juste) : ralenti bref 93 %, accélération
brève 89 %, point d'orgue 93 %, cas enregistrés 87 %, réseau sourd 87 %.

**Jusqu'où cela tient.** En tapant chaque temps à ± 60 ms près, même toujours
un peu en avance ou en retard, ou au ralenti, la grille est juste
pratiquement à chaque fois. Si l'on oublie en plus un temps sur dix et qu'on
tape parfois en trop, elle est juste **huit fois sur dix** : un essai sur
cinq donne un temps de trop ou de moins, et c'est « Vérifier en écoutant »
puis « réessayer » qui rattrape. Ce qui casse encore : des tapes à ± 100 ms
sur un tempo rapide (200 à la noire et plus : l'imprécision vaut un tiers de
temps) ; un enregistrement réel du banc à 186 à la noire (compte juste 56 %
dès que les tapes sont imprécises) ; un point d'orgue tenu exactement deux
temps sans premier temps audible (ambigu par nature) ; un temps oublié à côté
d'une tape très en retard, lu comme un point d'orgue. Rendre le point d'orgue
plus coûteux améliorait le tapeur moyen (83 %) mais abîmait les vrais points
d'orgue (83 % au lieu de 93 %) : non retenu.

Ces chiffres sont ceux de tapeurs simulés. Sur le vrai analyseur dans
Chromium (`test:tap-fix`) : un passage planté à mi-tempo, des tapes à ± 40 ms
avec 70 ms de retard habituel, 95 % des temps à moins de 50 ms des vrais.
**Personne n'a encore tapé pour de vrai.**

## Décisions prises sans le propriétaire

Correction en tapant
- Titre de la fenêtre : « Correction du tempo à partir de la mesure N ».
  Décompte de 0 à 4 mesures. Textes ajoutés autour des siens (consignes,
  attente, refus, ligne « c'est compensé ») : à relire par lui.
- La suite du morceau est réanalysée **avant** « Vérifier en écoutant », pas
  après « C'est bon » : on écoute exactement ce qui sera gardé, et « C'est
  bon » est immédiat. L'attente (pourcentage) est donc après « Ok, j'ai
  fini ».
- La fenêtre n'assombrit rien : on regarde la règle en tapant.
- Les tapes faites pendant le décompte sont gardées (deux mesures avant) et
  servent à mesurer l'avance ou le retard ; le compteur ne compte que celles
  du passage.
- L'avance ou le retard compensé est borné à 0,3 temps, pour ne jamais caler
  la grille à contretemps.
- Un point d'orgue est un seul temps long ; un temps tenu d'une durée proche
  d'un nombre entier de temps est lu comme des tapes oubliées.
- Une tape sur deux ou sur trois (blanches, noires pointées en 6/8) est
  reconnue, les temps intermédiaires ajoutés.
- Une série de tapes régulière l'emporte sur les premiers temps entendus par
  le réseau après le passage.
- Le réglage du métronome de l'utilisateur n'est pas modifié : le clic forcé
  est donné directement au lecteur, puis rendu.
- Pendant le calcul, fermer la fenêtre annule l'analyse en cours.

Signature
- Bouton « Changer la signature » ; la fenêtre s'ouvre toujours sur
  « permanent » ; confirmer la signature déjà en vigueur ferme sans rien
  enregistrer.
- Sur la règle : chiffres superposés, numéro de mesure après ; la signature
  est omise si la mesure est trop étroite, plutôt que de chevaucher.

Divers
- « Une fenêtre est ouverte » se lit dans la page (dialogue modal, alerte,
  menu) : une fenêtre future est comptée sans être listée. Dans un panneau
  non modal (métronome, repères…), l'espace n'agit sur le contrôle que si
  c'est lui qui a le focus ; sinon il lance la lecture comme avant.
- Sur téléphone, le tempo de la règle est arrondi à l'entier.

## Pas fait, ou fragile

- **Aucune tape réelle** : le banc est simulé, la latence de sortie n'a pu
  être lue sur aucun vrai appareil (ni son ni carte audio ici). Sur le Mac,
  avec un casque Bluetooth, la latence annoncée par le système peut être
  fausse : la compensation de l'écart habituel la rattrape en principe, à
  vérifier à l'oreille.
- Le tapeur « moyen » : compte juste 80 % (voir plus haut).
- Recalculer plus tard une correction tapée à partir de ses tapes gardées
  (meilleur algorithme) n'est pas fait : les tapes sont dans le projet,
  rien ne les relit.
- Fermer l'app pendant un aperçu : le morceau rouvre avec la grille d'avant,
  les tapes sont perdues.
- Sur téléphone, un appui long près d'un bord de boucle attrape le bord au
  lieu d'ouvrir le menu (plus ancien).
- La liste « Mesure » du panneau du métronome règle toujours la première
  signature du morceau entier, à côté du nouveau choix : peut dérouter.
- Sur une mesure en 64/32 à deux accords, la case de la grille est serrée.
- L'analyse automatique numérote toujours avec une seule signature (règles
  figées) : après un changement de signature posé à la main, une
  réanalyse complète garde les changements mais ne les « entend » pas.
- Les fenêtres n'ont été vues qu'en captures (Chromium), ni sur un vrai Mac
  ni sur un vrai téléphone.

## Pièges rencontrés

- **Verrou commun très demandé** : trois agents qui lancent des suites
  Chromium font attendre chacun jusqu'à une heure. Demander aux agents de ne
  lancer que les suites de leur sujet, et garder la passe complète pour la
  session d'étape.
- **Écrire le contrat avant de lancer les agents** (`analysis/tapFix.ts` avec
  un calcul provisoire, les entrées du menu, les deux fenêtres vides) a
  permis à trois agents de travailler en même temps sans conflit de fusion.
  Prévoir ensuite une passe de jonction : l'écran et le calcul avaient chacun
  protégé l'aperçu contre l'historique, il a fallu n'en garder qu'un.
- Les sorties brutes « premier temps » du réseau sont décalées d'un ou trois
  temps pendant des chorus entiers sur deux enregistrements, alors que
  l'analyse complète place bien les barres : ne pas s'y fier seules.
- Un agent qui a encore une tâche de fond à la remise de son rapport : l'arrêter
  une fois son travail fusionné.
- Le conteneur de la session démarre sans `node_modules` : `npm install` dans
  `app/` et `desktop/` avant tout.

## Vérifications

- Commit vérifié : `dfb1535` sur `v1` (les commits suivants n'ajoutent que ce
  bilan et la table du plan).
- Fabrication sur les Mac de GitHub, lancée à la main sur `v1` : **verte au
  premier lancement** (run 44041028597, commit `dfb1535`) : vérification de
  l'interface, adresses des recueils, tests unitaires, construction pour puce
  Apple et Intel, e2e sur les deux (avec le nouveau
  `tempo-by-hand.test.js`), analyse, séparation, yt-dlp. Rien n'a été publié.
- `app/` : `npm run typecheck` sans erreur ; `npm test` : 1 639 tests
  réussis, 42 sautés (dont le sous-ensemble rapide du banc des tapes, avec
  ses seuils).
- Vérifications Chromium après `npm run build`, l'une après l'autre, au
  calme, toutes vertes au premier passage : `smoke`, `menu`, `settings`,
  `print`, `new-project`, `standards`, `undo`, `alert`, `project-file`,
  `chart`, `timeline`, `import`, `export`, `export-audio`, `export-memory`,
  `export-logic`, `export-ableton`, `analysis`, `separation`, `render`,
  `memory`, `metronome`, `markers`, `tempo-fix` (cas réels, attentes
  inchangées), `tap-fix` (deux formes, analyseur simulé et réel), `meter`
  (deux formes), `offline`, `engine`.
- `desktop/` : `npm test` : 122 réussis ; après `npm run build:desktop`,
  `FABTICE_NO_POPPLER=1 xvfb-run -a npm run test:e2e` : 36 tests, 33 réussis,
  3 sautés (ceux qui téléchargent) ; puis `tempo-by-hand.test.js`, ajouté
  ensuite : 4 sur 4, trois passages de suite chez l'agent, un chez moi.
- Les tests de l'analyse automatique passent sans changement de leurs
  attentes : ses règles n'ont pas été touchées.
- `npm run captures` relancé en entier à la fin, sans échec ; captures de
  l'étape regardées dans les deux formes (menu de la mesure, chaque moment
  de la correction en tapant, fenêtre de signature, règle et grille avec un
  changement, métronome à plusieurs signatures, éditeur d'accord en 13/8 et
  64/32) : rien d'assombri à tort, aucun texte coupé. Un défaut vu en cours
  de route et corrigé (numéro de mesure manquant après la signature sur la
  règle).
- Aucun fichier de brouillon dans le dépôt (commande du plan) ; aucun nom
  d'assistant en dehors des lignes d'attribution des commits.
- À savoir : avec un décompte de 0 mesure, une tape faite pile sur le premier
  temps de la mesure choisie est datée juste avant elle (latence de sortie
  retirée) et n'entre pas dans le nombre affiché ; le calcul n'en souffre
  pas (le début de la mesure est fixe).

## Pour l'étape suivante

- **Étape 5 (Harmonie)** : rien ne change à sa section. Le menu de la mesure
  et `ui/barDialogs.ts` sont le modèle pour une action de plus sur une
  mesure. Les modulations et la structure doivent suivre une grille corrigée
  en tapant comme les deux autres corrections (accords redécodés à partir de
  la mesure). `AppState.tempoPreview` : tout code qui enregistre ou compare
  la grille doit lire `gridInForce()`, pas `tempoMap`.
- **Étape 7** : relire les textes ajoutés autour de ceux du propriétaire ;
  relancer le banc complet.
- **À faire essayer au propriétaire** : la correction en tapant sur ses
  morceaux difficiles (le disque de 1945, le morceau aux bosses du 15
  novembre), avec et sans casque Bluetooth ; c'est le seul vrai juge.
