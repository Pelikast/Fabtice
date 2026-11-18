# Bilan de l'étape 7 — Finition

Cette étape n'ajoute aucune fonction : elle cherche et corrige ce qui restait
de défauts avant la publication, et laisse `v1` prête à passer sur `main`.
**Rien n'a été publié** : ni push sur `main`, ni étiquette, ni version.

## Livré

### Défauts trouvés et corrigés, par gravité

**Important (données, publication)**
- **Un rendu gardé pouvait être enregistré sous l'étiquette d'un autre.** Après
  un second « Appliquer meilleure qualité », si l'appareil était plein ou si
  l'on enregistrait pendant l'écriture du rendu (cmd + S reste actif dans la
  barre de menus), le `.fab` recevait les sons du nouveau rendu avec la
  tonalité et le tempo de l'ancien. Le fichier ne prend plus les sons en
  mémoire que s'ils sont ceux du rendu que le document nomme ; sinon il les
  relit sur l'appareil. Deux tests.
- **Les toutes dernières modifications pouvaient manquer après la fermeture de
  l'app Mac** (un accord changé, cmd + Q dans la seconde) : la sauvegarde
  automatique en attente est maintenant écrite avant que la fenêtre se ferme
  (3 s au plus). Trois tests.
- **Publication** : des notes disant encore « En préparation » arrêtent la
  publication réelle (c'était un simple avertissement) ; après la publication,
  le travail relit la **vraie chaîne de mise à jour** sur GitHub avec le code
  de l'app (fichier de version, hôtes des archives) et passe au rouge si une
  app installée ne pourrait pas la suivre.

**Mineur**
- « Enregistrer sous… » demandé pendant un « Enregistrer » faisait échouer ce
  dernier (aucun fichier abîmé) : il attend maintenant ; cmd + S pendant que
  la fenêtre « Enregistrer sous… » écrit rend la réponse de la fenêtre.
- App Mac : un enregistrement qui finit après l'ouverture d'un autre projet ne
  retire plus son fichier à ce dernier.
- Mise à jour : une app lancée depuis la copie mise de côté
  (`.Fabtice-ancienne.app`) refuse de se mettre à jour (elle s'effaçait
  elle-même) ; place libre exigée portée à quatre fois l'archive ; le script
  de relance attend la fin de l'ancienne app jusqu'à dix minutes (60 s avant,
  après quoi la nouvelle pouvait ne pas s'ouvrir).
- Publication : une étiquette `v<numéro>` sans version publiée, ou un numéro
  plus petit que la dernière version publiée, arrêtent en rouge.
- Fabrication : jeton en lecture seule pour les travaux qui installent des
  paquets (écriture pour `publish` et `ci-logs` seulement) ; les deux `.dmg`
  publiés sont maintenant montés et contrôlés (étape `07b`).
- Version web, « Nouveau projet ▸ À partir d'un lien YouTube » : la fenêtre
  disait « Ici, choisissez un fichier audio » sans rien proposer ; elle montre
  le bouton du fichier (vu sur les captures du téléphone).
- Analyse avec le modèle d'accords détaillé : le pourcentage affiché retombait
  à 0 % au début de l'écoute fine et ne correspondait pas à la barre ; c'est
  maintenant celui de toute l'analyse, qui ne recule jamais.
- Téléphone : la phrase d'aide de la grille dit comment ouvrir le menu d'une
  mesure (appui d'une seconde sans bouger) ; il était introuvable.
- Le nombre présélectionné dans la fenêtre de signature était surligné dans le
  bleu du système : le texte sélectionné est en laiton (inscrit dans
  `DESIGN.md`).
- Panneau du métronome, morceau à plusieurs signatures : la liste « Mesure »
  s'appelle « Mesure au début » (elle règle la première signature), avec un
  peu d'air entre les rangées.
- Textes : « se retentent » → « peuvent être réessayés » ; espaces insécables
  dans « Enregistrer au format PDF ».
- Vérification `test:standards` : elle attend la ligne fugitive « n sur N » au
  lieu de la lire une fois (échec sous charge à l'étape 6).

### Conformité au cahier, point par point

| Point | État |
|---|---|
| C1 Chargement visible | Livré. |
| C2 Alléger | Livré. Mesuré à 76–77 % pour 75 % sur la machine de travail ; rien mesuré sur carte graphique. |
| C3 Sous-grille | Livré. |
| C4 Imprimer | Livré. App Mac : imprimante et copies dans la fenêtre. Jamais essayé sur une vraie imprimante. |
| C5 Projet enregistré, alerte | Livré. Web sans poignée de fichier (Safari, Firefox) : « Enregistrer » télécharge, comme prévu. |
| C6 Menu Fabtice | Livré, textes exacts. « PDF… » ouvre la fenêtre d'impression (où est « Enregistrer en PDF ») plutôt qu'une seconde fenêtre. |
| C7 Réglages | Livré autrement sur trois lignes du tableau, qui était une proposition : pas de « instruments cochés par défaut » (contredit C9 : case décochée, puis tous cochés) ; pas de choix « carte graphique ou processeur » (le repli est automatique, en gardant l'outil) ; la vitesse est une estimation affichée dans le panneau de séparation. Le reste est là, liste des raccourcis comprise. |
| C8 Deux formes | Livré : chaque écran existe et a été regardé dans les deux formes. Téléphone tenu en largeur : forme ordinateur. |
| C9 Nouveau projet, grilles | Livré, textes exacts. « Tous » les recueils = ceux que la forme de l'app sait télécharger (5 sur 15 dans l'app web, 15 dans l'app Mac), dit dans la phrase de fin. |
| C10 Modulations | Livré. Sur téléphone, la pastille n'écrit que la tonalité (« E »), faute de place ; « Ton : E » sur ordinateur et sur le papier. |
| C11 Annuler / Rétablir | Livré (neuf étapes annulées et rétablies une à une dans le parcours rejoué, chacune nommée dans le menu). |
| C12 Tempo en tapant | Livré, textes du propriétaire à la lettre. Livré autrement : la suite du morceau est réanalysée avant « Vérifier en écoutant » (on écoute exactement ce qui sera gardé). |
| C13 Signature | Livré. |
| C14 Structure, grille simplifiée | Livré. Fiabilité mesurée sur des rendus de synthèse seulement (bilan 5). |
| C15 Exports | Livré. Logic : un dossier (format fermé). Ableton : « à l'essai ». Aucun des deux n'a été ouvert dans le vrai logiciel. |
| C16 Mise à jour | Livré ; essai complet sur les deux puces des Mac de GitHub. Le vrai parcours ne se verra qu'à la version suivante. |
| C17 Version 1.0.0 | Livré ; la publication elle-même n'a tourné qu'à blanc. |

Rien ne manque au cahier.

### Documents
- `CHANGELOG.md`, section 1.0.0 : réorganisée pour être montrée (« L'essentiel »
  en tête, un chapitre par sujet, l'impression regroupée), phrase « En
  préparation » retirée, **titre sans date** (la session d'origine la pose).
- `PASSATION.md` : un état des lieux de la 1.0.0 en tête (ce qui existe, où
  sont les documents, comment vérifier, comment publier la suivante, points
  ouverts).
- `README.md`, `DESIGN.md`, `app/README.md`, `desktop/README.md` : mis d'accord
  avec ce qui est livré.

## Où c'est dans le code

- Rendu gardé : `app/src/render/controller.ts` (`keptRenderAudio(kept)`,
  `renderedKey`), `app/src/project/save.ts` (`gatherProject`).
- Enregistrement : `app/src/project/saveFlow.ts` (`saveProjectAs` attend,
  `openSaveAsDialog`), `desktop/src/project-writer.js` (`finish`).
- Fermeture : `app/src/project/windowState.ts` (`CLOSE_FLUSH_MAX_MS`).
- Preuve de la migration : `app/src/project/fixtures/published-main-v5.fab`
  (écrit par le code de `main`, commit `09da8d8`), `project/publishedFile.test.ts`.
- Publication : `desktop/ci/publish-release.js` (`preparationVerdict`,
  `newestPublished`, état `tag-only`), `desktop/ci/update-chain.js`,
  `desktop/ci/release-host.js` ; fabrication : étape `07b-inspect-dmg`,
  permissions par travail dans `.github/workflows/desktop-mac.yml`.
- Mise à jour : `desktop/src/update-place.js` (`isUpdateCopy`, `roomNeeded`),
  `update-install.js` (`swap`), `updater.js` (script de relance).

## Décisions prises sans le propriétaire

- Corriger tous les défauts « mineurs » de la relecture qui se corrigeaient
  simplement, plutôt que les seuls importants.
- Le pourcentage de l'écoute fine des accords est celui de toute l'analyse
  (avant : celui de l'étape seule, qui repartait de zéro).
- La fenêtre « à partir d'un lien » de la version web montre aussi le choix du
  fichier (l'étape 2 avait voulu « seulement la phrase »).
- Le texte du propriétaire de la fenêtre des tapes est gardé à la lettre
  (« ré-analysée », sans point final), bien que la revue l'ait relevé.
- La signature des `.dmg` est exigée sur puce Apple et seulement dite sur
  Intel, comme le fait la mise à jour.
- Les préversions numérotées comptent dans « numéro plus petit que la dernière
  version publiée ».
- Une fabrication d'essai a été lancée dès les corrections de la fabrication
  fusionnées, puis une seconde sur le commit final.
- L'annonce de durée d'« Alléger » n'est pas retouchée : elle est exacte sur
  carte graphique (pause seule) et un peu longue sur processeur seulement.

## Pas fait, ou fragile

**Défauts laissés, avec leur raison**
- Après « Ne pas enregistrer », le dernier travail (modifications refusées
  comprises) est proposé à la réouverture : c'est ce que demande le cahier
  (la sauvegarde automatique reste le filet), mais cela peut surprendre. **À
  dire au propriétaire.**
- Quitter ou mettre à jour pendant une longue séparation, sur un projet sans
  modification, ne demande rien : le calcul est perdu (aucune donnée).
- Une page figée plus de 2 s au moment de fermer laisse fermer sans alerte ;
  la sauvegarde automatique garde le travail.
- Coupure de courant juste après un enregistrement sur Mac : `fsync` ne force
  pas le disque ; cas rare, pas de remède simple.
- L'ancienne app mise de côté est effacée dès que la nouvelle démarre : si la
  nouvelle plantait ensuite, il n'y aurait pas de copie (le bilan 6 disait le
  contraire). Elle est essayée avant le remplacement.
- **Arrêt de la page sur le Mac Intel de GitHub au lancement de la lecture**
  (« Target crashed ») : vu une fois sur deux fabrications à cette étape, et
  déjà une fois à l'étape 2 (pendant `audio-device.test.js`), chaque fois vert
  à la relance sans changement. Jamais vu sur la puce Apple ni sur la machine
  de travail. Cause non trouvée ; **à rapprocher du blocage du son signalé par
  le propriétaire sur son Mac Intel** : lui demander s'il voit l'app se figer
  ou se fermer au lancement de la lecture. Conséquence pour la publication :
  si cela arrive au push sur `main`, le travail `intel` est rouge et rien
  n'est publié ; relancer les travaux en échec suffit (la publication part
  ensuite).
- Remplacement de l'app dans le vrai dossier Applications : jamais essayé sur
  un vrai Mac (macOS 13 et plus peut demander une autorisation) ; en cas de
  refus, l'ancienne app reste et l'app le dit.
- Mesure de levée (« mesure 0 ») seule sur la première ligne de la grille, et
  mesure vide possible en fin de morceau après une correction en tapant :
  anciens choix de mise en page, laissés.
- La structure peut changer après une simple correction d'accord (elle se
  recalcule) ; « Forme globale : — » quand aucune forme à chorus n'est
  trouvée, alors que la ligne « Forme : » liste les parties.
- La grille simplifiée peut prendre plus de pages que la grille complète en
  paysage (chaque section commence une ligne).
- La séparation annonce une durée pessimiste sur un morceau court (« Environ
  3 min » pour moins d'une minute).
- Avant la publication, « Rechercher une mise à jour… » répond « informations
  illisibles » (le fichier de version n'existe pas encore sur GitHub) : à
  revoir une fois la 1.0.0 publiée, où elle doit dire « Fabtice est à jour. ».
- Au premier lancement, le message des grilles s'affiche par-dessus la fenêtre
  « Nouveau projet ».
- Listes déroulantes du système (modèle d'accords, outil de séparation,
  numéro, instrument) : aspect natif, non redessiné.
- Parcours non rejoués : séparation et import par lien dans l'app Mac, export
  Ableton dans l'app Mac, boucle par glissé au toucher, reprises numérotées de
  la grille simplifiée sur un vrai morceau à forme AABA.
- Tout ce que les bilans 1 à 6 disent « jamais vu sur un vrai Mac ni un vrai
  téléphone » reste vrai.

## Pièges rencontrés

- Un agent de revue de captures a perdu ses observations (trop d'images à
  double densité) : réduire les images de moitié et lui faire écrire ses
  notes dans un fichier toutes les huit images.
- Un agent en worktree n'a pas pu commiter (refus de l'outil) : son travail a
  été relu puis intégré par la session d'étape.
- Le dépôt cloné par la session n'avait que cinquante commits : `git fetch
  --unshallow` avant toute comparaison avec `main`.
- Les captures rangées dans `/tmp` ont disparu en cours d'étape (nettoyage
  par un agent ou par la machine) : les ranger dans le dossier de brouillon de
  la session.
- Le binaire d'Electron n'est pas toujours installé par `npm install` : `node
  node_modules/electron/install.js` dans `desktop/`.

## Vérifications

- **Commit vérifié** : `4557436` sur `v1` (dernier commit qui touche au code).
  Les commits suivants n'ajoutent que des documents (`PASSATION.md`, ce
  bilan, la table du plan).
- `app/` : `npm run typecheck` sans erreur ; `npm test` : 2 002 tests
  réussis, 43 sautés. Bancs relancés : tapes
  (`src/analysis/engine/tapGrid.bench.test.ts`, 4 réussis) et structure
  (`src/structure/bench.test.ts`, 6 réussis).
- Vérifications Chromium après `npm run build`, l'une après l'autre, toutes
  vertes au premier passage : `smoke`, `menu`, `settings`, `print`,
  `new-project`, `ease`, `update`, `undo`, `alert`, `project-file`, `chart`,
  `timeline`, `import`, `export`, `export-audio`, `export-memory`,
  `export-logic`, `export-ableton`, `analysis`, `separation`, `standards`,
  `markers`, `metronome`, `tempo-fix`, `tap-fix`, `meter`, `structure`,
  `harmony`, `simplified`, `offline`, `engine`, `render`, `memory`.
- `desktop/` : `npm test` : 191 réussis ; après `npm run build:desktop`,
  `FABTICE_NO_POPPLER=1 xvfb-run -a npm run test:e2e` : 41 tests, 38 réussis,
  3 sautés (ceux qui téléchargent), aucun échec.
- **Relecture indépendante** des quatre chemins à risque (modèle fort, effort
  élevé, lecture seule) : aucun défaut critique ; trois importants et dix
  mineurs, tous corrigés sauf ceux listés plus haut. Chemins jugés sains :
  écriture du `.fab` (temporaire à côté, `fsync`, renommage, nettoyage qui ne
  touche que ses fichiers), enregistrement rapide (identifiants neufs à chaque
  séparation et rendu, contrôle CRC), migration 5 → 6 (tous les champs
  gardés), vérification de l'archive avant tout déballage, retour en arrière
  du remplacement, publication en brouillon puis publiée après relecture.
- **Parcours rejoués comme un utilisateur**, tout en vrai (moteur, analyse,
  séparation, rendu, encodeurs), à l'adresse simple : ordinateur (les dix pas),
  téléphone au toucher, app Mac sous `xvfb-run`. Aucun défaut bloquant, trois
  gênants (deux corrigés, un voulu par le cahier), une vingtaine de mineurs
  (voir « Pas fait, ou fragile »). Tout revient après enregistrement,
  fermeture et réouverture, et à l'ouverture du `.fab` dans un profil vide.
  Le modèle d'accords détaillé montre sa progression, sa source et sa
  licence ; un téléchargement bloqué retombe sur le modèle rapide et le dit.
  Fichiers exportés relus (MP3 320, Wave 44,1 kHz 24 bits, Flac, archive de
  pistes, MIDI du dossier Logic, les deux `.als`). Durées sur la machine de
  travail (4 cœurs, sans carte graphique), morceau de 38 s : import avec
  séparation et modèle détaillé 74 s ; premier enregistrement 0,6 s, suivant
  0,2 s ; réouverture 0,4 s ; `.fab` dans un profil vide 3 s.
- **Captures** (`npm run captures`, 188 images, 96 ordinateur et 92
  téléphone), refaites après les corrections. Regardées en entier par des
  agents : les 92 du téléphone, et 96 de l'ordinateur en deux passes ; une
  quinzaine par la session d'étape (menus, Réglages, Nouveau projet,
  structure, mise à jour, export audio, impression, métronome). Aucun défaut
  net restant. Relevés et laissés (mineurs) : la phrase de fin du
  téléchargement des grilles reste lourde ; « Regroupement » dans le panneau
  du métronome et « groupement » dans sa phrase d'aide ; l'écart entre
  « Outro » et « Couplet » dans la fenêtre d'une partie (séparation Jazz /
  Pop).
- **Dossiers d'essai** (`npm run essais`) : fabriqués et relus (deux
  variantes, dossier Logic, projet Ableton, chaque format audio, mode
  d'emploi).
- **Dépôt public** : sur tout ce que `v1` ajoute à `main` (236 commits et
  ceux de l'étape), aucun fichier de brouillon (commande du plan), aucun
  secret, aucune information personnelle, aucun nom de modèle ou d'assistant
  hors des lignes d'attribution des commits.
- **Étiquette `v1.0.0`** : absente (`git ls-remote --tags origin` ne montre
  que `desktop-dev`).
- **Fabrication sur les Mac de GitHub**, lancée à la main sur `v1`, deux
  fois :
  1. run 44176970526, commit `ad02879` (après les corrections de la
     fabrication) : **vert au premier lancement** sur les deux puces, étape
     `07b` comprise (les deux `.dmg` : « Fabtice.app 1.0.0, signature
     valide »), essai de mise à jour sur les deux puces, jeton en lecture
     seule, essai à blanc.
  2. run 44197337671, commit `2c0fa59` (tout le code de l'étape ; les commits
     suivants ne sont que des documents) : puce Apple verte ; **Mac Intel
     rouge au premier lancement, vert à la relance du seul travail en échec,
     sans rien changer au code** (41 tests e2e : 38 réussis, 3 sautés). La
     panne : la page s'est arrêtée (« Target crashed ») au moment où
     `journey.test.js` lance la lecture avec le vrai moteur audio. Voir « Pas
     fait, ou fragile ».
  - Essai à blanc de la publication (`15-publish-dry-run.log`) : aucune
    étiquette `v1.0.0`, une seule version sur GitHub (`desktop-dev`), fichier
    de version fabriqué (notes de 15 345 caractères, deux archives avec leurs
    empreintes), cinq fichiers listés, « la version v1.0.0 serait publiée »,
    **sans avertissement**.
  - `release/notes.txt` (16,7 Ko) : « Quel fichier télécharger ? », puis
    « Nouveautés » = la section 1.0.0 du changelog telle qu'elle est ;
    `release/fabtice-version.txt` : format 1, version 1.0.0, page
    `releases/tag/v1.0.0`, macOS 12 minimum, les deux `.zip` à l'adresse
    `releases/download/v1.0.0/…`.
  - Travail `publish` sauté (pas sur `main`) : rien n'a été publié.

## Pour la suite

**Avant le push sur `main`** (session d'origine, avec l'accord du
propriétaire) :
0. Si le travail `intel` échoue sur « Target crashed », relancer les travaux
   en échec (voir plus haut) avant de chercher une panne.
1. Dater le titre de `CHANGELOG.md` (« ## Version 1.0.0 — <date> »).
2. Vérifier encore que `v1.0.0` n'existe pas (`git ls-remote --tags origin`).
3. Passer `v1` sur `main`.

**Après le push** : la liste du bilan 6 (travail `publish` vert, page de la
version, fichier de version, ancienne page `desktop-dev`, déploiement
Netlify). En plus : `15-publish.log` doit finir par la ligne « Vérifié : …
fabtice-version.json donne 1.0.0 ; les .zip se joignent par … » ; s'il dit
« HÔTE HORS LISTE », la version reste publiée et le journal dit quoi faire.

**Ce que le propriétaire doit essayer en premier, dans l'ordre, sur ses deux
Mac**
1. Installer la 1.0.0 à la main (dernière fois), en la glissant dans
   Applications ; « À propos de Fabtice » et Réglages → Général disent 1.0.0 ;
   « Rechercher une mise à jour… » répond « Fabtice est à jour. ».
2. Ouvrir un projet `.fab` de la version précédente : tout doit y être.
3. Un morceau neuf avec séparation : le modèle d'accords détaillé se
   télécharge (progression, source, licence) ; le pourcentage avance sans
   reculer ; puis cmd + S, modifier, cmd + S, fermer avec des modifications
   (l'alerte), rouvrir.
4. cmd + Z dans un champ de texte puis hors champ ; cmd + P ; la barre de
   menus grisée quand une fenêtre est ouverte.
5. La grille : structure proposée, une modulation, « Grille complète
   simplifiée » en lecture ; corriger une partie, une lettre.
6. Sur un passage au tempo mal lu : « Correction de la courbe en tapant le
   tempo » (c'est le premier essai avec de vraies tapes et un vrai son ; avec
   un casque Bluetooth la latence peut gêner).
7. Le dossier pour Logic Pro, ouvert dans Logic 13 (signatures, armures,
   marqueurs, alignement) ; l'impression sur une vraie imprimante.
8. « Alléger » pendant une séparation, ventilateur écouté, à 75 % puis plus
   bas.
9. Sur l'iPhone, après le déploiement Netlify : le menu, les Réglages, l'appui
   long sur une mesure.

**Fragile, à lui dire** : structure et modulations sont des propositions ; le
projet Ableton est « à l'essai » ; la mise à jour automatique ne se verra qu'à
la version suivante, et seulement si l'app est dans Applications.
