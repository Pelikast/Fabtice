# Bilan de l'étape 6 — Machine

## Livré

**C2 — « Alléger le travail pour l'appareil »**
- Une case, décochée par défaut, la même à trois endroits : « Nouveau projet »
  (juste après « Séparer les instruments », quelle que soit l'entrée, lien de
  l'app Mac compris), Réglages → Général, et le panneau de la séparation
  quand on en lance une plus tard. Le dernier choix est retenu sur l'appareil.
  Sous la case, une phrase donne le pourcentage en vigueur ; pendant un
  calcul, elle dit que le changement vaudra pour le suivant.
- Un curseur de 20 à 99 % (75 % par défaut) dans Réglages → Avancé, avec la
  phrase honnête sur les longues tranches et la moyenne.
- Ce que cela fait : une pause après chaque tranche de calcul et, sur le
  processeur, moins de fils de calcul, pour la séparation, l'analyse,
  « Appliquer meilleure qualité » et la reconnaissance des vents. La passe
  d'harmonie (quelques dixièmes de seconde sur le fil principal) n'est pas
  ralentie : une pause n'y aurait pas de sens.
- Les durées annoncées (« Nouveau projet », panneau de la séparation,
  analyse) s'allongent du facteur 1 / part ; le pourcentage avance
  régulièrement, pauses comprises ; annuler pendant une pause est immédiat.
- **Mesure** (`npm run measure:ease`, machine de travail : 4 cœurs, sans
  carte graphique ; temps processeur de tous les processus du navigateur
  divisé par le temps écoulé, rapporté à la marche sans la case) :

  | Réglage | Analyse, modèle d'accords standard | Analyse, modèle détaillé | Séparation (SCNet, processeur) |
  |---|---|---|---|
  | décochée | 2,79 cœurs | 3,59 cœurs | 2,99 cœurs (3 fils) |
  | 75 % | **0,77** (durée × 1,07) | **0,77** (× 1,09) | **0,76** (× 1,23, 2 fils) |
  | 50 % | **0,51** (× 1,40) | **0,47** (× 1,79) | **0,56** (× 1,60, 2 fils) |

  À 75 %, la charge moyenne obtenue est donc de 76 à 77 % de la charge sans
  la case. La colonne du modèle détaillé vient d'un extrait de 90 s, les deux
  autres d'un extrait de 25 s.

**C16 — Mise à jour automatique**
- App Mac : quatre secondes après l'ouverture (si « Vérifier à chaque
  ouverture » est cochée), recherche en arrière-plan. À jour ou en échec :
  rien ne se voit. Sinon, le message « Une mise à jour est disponible » avec
  le numéro actuel, le nouveau, les nouveautés (défilables), **un bouton**
  « Mettre à jour Fabtice » et un « Plus tard » discret.
- « Rechercher une mise à jour… » dans le menu Fabtice de la barre du Mac
  (après « À propos de Fabtice ») et dans Réglages → Général, avec « Fabtice
  1.0.0 » et la case « Vérifier à chaque ouverture ». Une recherche à la main
  répond toujours (à jour, disponible, ou la raison claire de l'échec).
- Téléchargement par le processus principal, dans un dossier de travail à
  côté de l'app, avec progression et « Annuler » ; taille exacte et empreinte
  SHA-256 vérifiées avant tout remplacement.
- Remplacement : déballage par `ditto`, contrôle de ce qui est déballé
  (identifiant, numéro annoncé, bonne puce, l'exécutable démarre, signature
  locale valide sur puce Apple), question habituelle de fermeture si des
  modifications ne sont pas enregistrées, ancienne app mise de côté
  (`.Fabtice-ancienne.app`), nouvelle à sa place, relance. À chaque échec,
  l'ancienne app est remise en place. Rien n'est modifié dans un paquet
  d'app. L'ancienne est effacée au démarrage suivant de la nouvelle.
- Cas impossibles, chacun avec sa phrase et le bouton « Télécharger à la
  main » (page de la version sur GitHub) : app lancée depuis un emplacement
  protégé par macOS (Téléchargements, image disque), volume en lecture seule,
  dossier où l'app ne peut pas s'écrire, app non empaquetée, macOS trop
  ancien pour la nouvelle version.
- App web : quand une nouvelle version du site est installée et en attente,
  le même message (« Une nouvelle version de Fabtice est prête »,
  « Recharger », « Plus tard ») ; la recherche de Réglages → Général
  interroge le site. Le mode hors ligne est intact.

**C17 — Version 1.0.0 et fabrication**
- Numéro 1.0.0 dans `app/` et `desktop/`, visible dans « À propos de
  Fabtice » et Réglages → Général.
- La fabrication publie une vraie version numérotée (détail plus bas, « Ce
  que fera le push sur `main` »). Un lancement à la main sur une branche
  fabrique et teste tout, fait l'essai de mise à jour sur les deux puces et
  un **essai à blanc** de la publication, sans rien écrire.
- `README.md` et `desktop/README.md` : le lien de téléchargement mène à
  https://github.com/pelikast/fabtice/releases/latest.
- Listes distantes : la liste des outils de séparation (`models.json`) n'a
  pas changé depuis `main` ; la liste des recueils (`collections.json`) a
  changé, et le lecteur de la version du 16 novembre (celui de `main`) lit
  celle de `v1` sans erreur (vérifié en faisant tourner ce lecteur sur ce
  fichier). Rien à publier sous un autre nom.

## Où c'est dans le code

- Réglages : `AppSettings.easeLoad`, `easeLoadPercent`, `checkUpdatesAtLaunch`
  (`app/src/model/project.ts`, bornes `EASE_LOAD_MIN/MAX/DEFAULT`), gardés par
  `store/preferences.ts`, modifiés par `setEaseLoad`, `setEaseLoadPercent`,
  `setCheckUpdatesAtLaunch` (`store/settingsActions.ts`).
- Version : `app/src/version.ts` (`APP_VERSION`, fixée par `vite.config.ts`
  depuis `app/package.json`) ; dans l'app Mac, le numéro montré est celui de
  l'app (`app.getVersion()`). `node desktop/ci/publish-release.js check`
  vérifie que les deux `package.json` et le premier titre de `CHANGELOG.md`
  donnent le même numéro (aussi en test unitaire).
- « Alléger » : règles pures dans `app/src/settings/easeLoad.ts` (`loadShare`,
  `pauseAfterMs`, `reducedThreads`, `easePlan`, `separationEase`,
  `stretchedSeconds`, `createThrottle`, `createSleeper`) ; lecture du réglage
  au départ d'un calcul dans `settings/easeLoadShare.ts` (les fils de calcul
  reçoivent `loadShare` dans leur demande) ; écran dans
  `components/settings/EaseLoad.tsx`, style `styles/alleger.css`. Points
  d'application : `separation/engine/pipeline.ts` (option `throttle`) et
  `separation/worker/separation.worker.ts`, `analysis/worker/analysis.worker.ts`
  (`yieldNow`), `render/controller.ts` et `render/rubberband/job.ts`,
  `structure/instruments/instruments.worker.ts`.
- Mise à jour, app Mac : `desktop/src/updater.js` (états, pont),
  `update-version.js` (lecteur du fichier de version, comparaison des
  numéros), `update-net.js` (hôtes, redirections, téléchargement, empreinte),
  `update-place.js` (emplacements impossibles), `update-install.js`
  (déballage, contrôle, remplacement, retour en arrière, nettoyage) ; entrée
  de menu dans `menu.js` ; pont `updateStatus`, `checkForUpdate`,
  `startUpdate`, `cancelUpdate`, `openUpdatePage`, `onUpdateState`
  (`preload.js`, `app/src/platform/desktopBridge.ts`). Journal :
  `update-log.txt` dans le dossier de données de l'app.
- Mise à jour, interface : `app/src/update/` (`updates.ts`, `texts.ts`,
  `notes.tsx`), `components/UpdateMessage.tsx`,
  `components/settings/UpdateSection.tsx`, `styles/update.css` ; app web :
  `pwa/build.ts`, `pwa/register.ts`, `pwa/sw.js` (messages `fabtice-build` et
  `fabtice-skip-waiting`).
- Fichier de version : `fabtice-version.json`, fabriqué par
  `desktop/ci/make-version-file.js` (format 1 : numéro, date, notes, page,
  macOS minimum, et pour `arm64` et `x64` : nom, adresse, SHA-256, taille),
  lu à `https://github.com/pelikast/fabtice/releases/latest/download/fabtice-version.json`.
  Hôtes admis : `github.com`, `objects.githubusercontent.com`,
  `release-assets.githubusercontent.com` (HTTPS, chaque redirection
  contrôlée). L'adresse ne se remplace que dans les tests
  (`FABTICE_UPDATE_TEST_ORIGIN`, accepté seulement avec `FABTICE_HOLD_WINDOW=1`
  et vers une adresse locale).
- Fabrication : `.github/workflows/desktop-mac.yml` (travaux `build`, `intel`,
  `publish` sur `main` seulement, `publish-dry-run` ailleurs, `ci-logs`) ;
  `desktop/ci/publish-release.js` (`check`, `publish --assets … [--dry-run]`) ;
  essai de mise à jour `desktop/test/trial/update-trial.js` ;
  `desktop/ci/release-host.js` (montre l'hôte vers lequel GitHub redirige).
- Tests ajoutés : `app/` : `settings/easeLoad.test.ts`,
  `settings/easeIntegration.test.ts`, `separation/engine/ease.test.ts`,
  `src/update/*.test.ts` ; Chromium : `npm run test:ease`, `npm run
  test:update` ; mesure : `npm run measure:ease` (hors suites) ; captures :
  `tests/captures-alleger.mjs`, `tests/captures-maj.mjs` (dans `npm run
  captures`, ou seules avec `FABTICE_CAPTURES_ONLY="mise à jour,alléger"`).
  `desktop/` : tests unitaires `update-*.test.js`, `publish-release.test.js`,
  `make-version-file` ; e2e `test/e2e/update.test.js`.

## Ce que fera le push sur `main`

Dans l'ordre :
1. Contrôle du numéro (les deux `package.json`, le titre de `CHANGELOG.md`).
2. Interface vérifiée et construite, les deux apps fabriquées, testées chacune
   sur sa puce, essai de mise à jour compris.
3. Travail `publish`, seulement si tout ce qui précède est vert :
   - si l'étiquette `v1.0.0` ou une version publiée de ce numéro existe déjà :
     rien n'est écrit, fin verte ;
   - sinon : fichier de version et notes (quel fichier télécharger, puis la
     première section de `CHANGELOG.md`), version créée **en brouillon**, envoi
     des cinq fichiers (deux `.dmg`, deux `.zip`, `fabtice-version.json`),
     contrôle des noms et des tailles, relecture des deux `.zip` et du fichier
     de version depuis GitHub avec comparaison des empreintes, puis
     publication : version normale (pas « version de test »), marquée dernière
     version ; GitHub crée l'étiquette `v1.0.0` à ce moment-là ;
   - échec avant la publication : le brouillon est supprimé, aucune étiquette
     n'existe, fin rouge. Jamais d'étiquette déplacée ni de fichier remplacé.
4. L'ancienne page « version de test » (`desktop-dev`) n'est plus touchée.

## Décisions prises sans le propriétaire

- Contrat posé avant les agents (réglages, numéro, emplacements des deux
  écrans) pour qu'ils travaillent sans conflit.
- « Alléger » : la règle « moins de fils, puis une pause pour le reste »,
  avec deux constantes mesurées (`SEPARATION_FIXED_LOAD` 0,9,
  `ANALYSIS_FIXED_LOAD` 3,2), au lieu de « fils et pause en proportion » :
  la règle simple donnait 0,86 au lieu de 0,75 pour l'analyse.
- « Alléger » : le réglage est lu au départ d'un calcul ; un changement en
  cours vaut pour le calcul suivant (on ne change pas les fils en route).
- « Alléger » : sur carte graphique, la tranche suivante n'est plus préparée
  d'avance quand la case est cochée (sinon la carte travaille pendant la
  pause).
- Mise à jour : l'app garde sa puce (une app Intel se met à jour en Intel).
- Mise à jour : l'exécutable de la nouvelle app doit démarrer avant le
  remplacement (contrôle en plus du cahier) ; signature exigée sur puce Apple,
  seulement notée sur Intel.
- Mise à jour : relance par un petit script détaché et `open -n`, pas par
  l'outil de relance d'Electron.
- Mise à jour : archive entre 1 Mo et 2 Go, notes de 64 Ko au plus ; place
  libre exigée : trois fois l'archive.
- Mise à jour : « Plus tard » fait taire le message jusqu'à la prochaine
  ouverture ; si un calcul tourne, l'app demande « Continuer quand même » ou
  « Attendre ».
- App web : le message n'apparaît que si la version en attente diffère de
  celle de la page.
- Publication : en brouillon d'abord, puis publiée après relecture des
  fichiers ; un brouillon du même numéro laissé là arrête la fabrication en
  rouge au lieu d'être supprimé (il peut être celui du propriétaire).
- Publication : une fabrication sur `main` n'est plus annulée par un push
  plus récent (elle peut être en train de publier) ; `CHANGELOG.md` déclenche
  aussi la fabrication.
- Les archives `.zip` sont publiées à côté des `.dmg` : ce sont elles que la
  mise à jour télécharge.
- L'ancienne page `desktop-dev` est laissée telle quelle (voir étape 7).
- Le test de la barre d'espace de l'app Mac (échec sur le Mac Intel dans la
  fabrication lancée par la session de l'étape 5) est rendu patient.
- Délai du travail Intel de la fabrication porté de 30 à 45 minutes.

## Pas fait, ou fragile

- **Ce que vaut la vérification de l'archive** : l'empreinte et l'archive
  viennent du même endroit (la page de la version sur GitHub). Elle garantit
  un fichier complet et non abîmé, pas davantage : elle ne protège pas d'un
  compte GitHub compromis.
- **Le vrai parcours chez le propriétaire** ne se verra qu'avec la version qui
  suivra la 1.0.0 (la 1.0.0 est la première à savoir se mettre à jour). Il
  passera par le dossier Applications, que les Mac de GitHub n'ont pas essayé
  tel quel (l'essai utilise un dossier temporaire au nom accentué).
- La publication réelle n'a jamais tourné : seul l'essai à blanc l'a été, sur
  GitHub. Trois points ne se verront qu'au vrai push : l'envoi de fichiers
  vers un brouillon sans étiquette, la relecture des fichiers par `gh api`,
  le marquage « dernière version ». S'ils échouent, c'est l'échec sûr
  (brouillon supprimé, rouge).
- Si la nouvelle app passait tous les contrôles puis ne démarrait pas,
  l'ancienne resterait sous le nom caché `.Fabtice-ancienne.app` dans le même
  dossier : à récupérer à la main. Très improbable (l'exécutable est essayé
  avant le remplacement).
- App web, plusieurs onglets ouverts : « Recharger » active la nouvelle
  version sous les autres onglets aussi.
- Si GitHub change l'hôte de ses fichiers de version, il faut l'ajouter à la
  liste (`update-net.js`) ; l'étape `08f` de la fabrication montre l'hôte du
  jour.
- « Alléger » : les deux constantes viennent d'une seule machine (4 cœurs,
  Linux). Sur carte graphique, rien n'a pu être mesuré ici (pause seule, sans
  réduction de fils) : à mesurer sur les Mac du propriétaire avec `npm run
  measure:ease` ou à l'oreille du ventilateur. À 50 %, la séparation donne
  0,56 et dure 1,6 fois plus alors que l'annonce dit 2 fois (l'annonce est un
  peu longue ; le temps restant affiché pendant le calcul est mesuré, donc
  juste).
- « À propos de Fabtice » : le panneau n'a pas été regardé sur un vrai Mac
  (le numéro y est fixé par un réglage testé, pas par une capture).
- `test:standards` a échoué une fois dans la passe complète (le texte fugitif
  « n sur N » sur téléphone), puis réussi deux fois de suite lancé seul :
  sensible à la charge, sans rapport avec l'étape.

## Pièges rencontrés

- **Une autre session a poussé sur `v1` et lancé une fabrication** pendant
  l'étape (décisions du propriétaire sur l'étape 5) : toujours `git fetch`
  avant de fusionner, et regarder `ci-logs` avant de lancer une fabrication.
- **Deux agents sur le fichier de fabrication** : l'un a ajouté ses étapes
  d'essai, l'autre a déplacé la publication dans son propre travail, en
  partant de la branche du premier. Seuls conflits : deux lignes ajoutées au
  même endroit (`app/README.md`, `tests/captures.mjs`).
- **Hôte des fichiers de GitHub** : `objects.githubusercontent.com` depuis la
  machine de travail, `release-assets.githubusercontent.com` depuis les Mac
  de GitHub. Les deux sont dans la liste.
- **Charge et fils de calcul** : passer de 4 à 3 fils n'ôte que 14 % de la
  charge de l'analyse ; il faut mesurer, pas supposer.
- Le test de la barre d'espace (`tempo-by-hand.test.js`) : sur le Mac Intel,
  le menu de la mesure peut se refermer avant la frappe ; le test rouvre le
  menu et ne frappe que quand l'entrée a le focus.

## Vérifications

À compléter : les tests de l'app Mac et les captures sont en cours.

## Pour l'étape suivante

- **Avant la publication**, dans l'ordre :
  1. Relecture indépendante des chemins à risque (prévue au plan), avec en
     plus `desktop/src/update-install.js` (`swap`, `rollback`,
     `cleanLeftovers`) et `desktop/ci/publish-release.js`.
  2. Dans `CHANGELOG.md` : retirer « En préparation… » de la section 1.0.0 et
     dater son titre (« ## Version 1.0.0 — <date> » ; le contrôle du numéro
     accepte ce titre). L'essai à blanc avertit tant que la phrase y est.
  3. Fabrication à la main sur `v1` : verte, puis lire sur `ci-logs`
     `15-publish-dry-run.log` (« serait publiée »), `release/notes.txt` (les
     notes telles qu'elles paraîtront) et `release/fabtice-version.txt`.
  4. Vérifier que `v1.0.0` n'existe pas (`git ls-remote --tags origin`).
  5. Question au propriétaire, puis `v1` sur `main`.
- **Après le push sur `main`**, dans l'ordre :
  1. Travail `publish` vert ; `15-publish.log` dit « PUBLIÉE » puis
     « est la dernière version ».
  2. La page de la version : « Fabtice 1.0.0 », pas « version de test »,
     marquée dernière, cinq fichiers.
  3. `https://github.com/pelikast/fabtice/releases/latest/download/fabtice-version.json`
     se télécharge et donne 1.0.0 ; l'étiquette `v1.0.0` est sur le commit
     de `main`.
  4. À la main : modifier le titre et les notes de l'ancienne page
     `desktop-dev` (« Ancienne version de test, remplacée par Fabtice
     1.0.0 », avec le lien vers la dernière version), en gardant ses fichiers
     pour les anciens liens ; ne jamais la marquer dernière version.
  5. Demander au propriétaire le déploiement Netlify de fin de lot.
- **À faire essayer au propriétaire** : installer la 1.0.0 à la main (c'est
  la dernière fois) en la glissant dans Applications ; « À propos de
  Fabtice » et Réglages → Général montrent 1.0.0 ; « Rechercher une mise à
  jour… » répond « Fabtice est à jour. » ; la case « Alléger » sur une
  séparation, ventilateur écouté, à 75 % puis plus bas. Lui dire que la mise
  à jour automatique ne se verra qu'à la version suivante, et que si l'app
  est lancée depuis Téléchargements elle le dira.
- **Une version suivante** (1.0.1) se publie ainsi : changer le numéro dans
  `app/package.json` et `desktop/package.json`, ajouter sa section en tête de
  `CHANGELOG.md`, pousser sur `main`. Un push sans changement de numéro
  fabrique et teste, sans rien republier.
- Les listes distantes restent lues sur `main` par les versions installées :
  garder leur format lisible par le plus ancien lecteur installé, ou publier
  sous un autre nom de fichier.
