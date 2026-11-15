# Fabtice pour Mac

L’app Mac affiche la vraie interface de Fabtice (celle de `app/`) dans une
fenêtre Electron, et lui ajoute ce que le web ne peut pas faire : importer
l’audio d’un lien YouTube **sur le Mac de l’utilisateur**, avec sa propre
connexion, grâce à yt-dlp. Tout le reste tourne comme sur le site.

## Télécharger

La dernière version de test se trouve sur la page des versions du dépôt,
rubrique « desktop-dev » :
https://github.com/Pelikast/fabtice/releases/tag/desktop-dev

Il y a **deux téléchargements**, un par type de Mac (chacun est deux fois plus
léger qu’une app universelle) :

- **Mac à puce Apple (M1, M2, M3, M4…)** : `Fabtice-mac-apple-silicon.dmg` ;
- **Mac Intel** : `Fabtice-mac-intel.dmg`.

**Comment savoir lequel prendre ?** Menu Pomme (en haut à gauche) puis
**À propos de ce Mac**. Si la ligne « Puce » indique « Apple M… », prenez le
fichier « apple-silicon » ; si la ligne « Processeur » indique « Intel »,
prenez le fichier « intel ». Les deux demandent macOS 12 Monterey ou plus
récent.

## Ouvrir l’app la première fois

Fabtice n’est pas encore signée par un développeur enregistré chez Apple.
macOS bloque donc la première ouverture ; il faut l’autoriser une fois, à la
main. Commencez dans tous les cas par :

1. Ouvrir le fichier `.dmg` téléchargé (double-clic dans Téléchargements).
2. Faire glisser l’icône **Fabtice** sur le dossier **Applications**.
3. Éjecter l’image disque.

### Sur macOS 12 Monterey (et aussi 13 Ventura, 14 Sonoma)

1. Dans le Finder, ouvrez le dossier **Applications**.
2. Faites un **clic droit** (ou Contrôle + clic) sur **Fabtice**, puis
   choisissez **Ouvrir**.
3. Un message dit que macOS ne peut pas vérifier le développeur de
   « Fabtice ». Cliquez sur **Ouvrir**.
4. C’est tout : les fois suivantes, un double-clic normal suffit.

Si le message ne propose pas de bouton « Ouvrir », cliquez sur **Annuler**
et refaites l’étape 2 : le bouton apparaît à la deuxième tentative.

### Sur macOS 15 Sequoia et plus récent (dont macOS 26 Tahoe)

Depuis Sequoia, le clic droit ne suffit plus ; l’autorisation se donne dans
les Réglages Système.

1. Double-cliquez sur **Fabtice** dans **Applications**. Un message dit que
   « Fabtice » n’a pas été ouvert. Cliquez sur **Terminé** (surtout pas sur
   « Placer dans la corbeille »).
2. Ouvrez le menu Pomme (en haut à gauche) > **Réglages Système…** > **Confidentialité et
   sécurité**.
3. Descendez jusqu’à la rubrique **Sécurité**. On y lit : « “Fabtice” a été
   bloqué pour protéger votre Mac. » Cliquez sur **Ouvrir quand même**.
4. Confirmez avec votre mot de passe ou Touch ID.
5. Rouvrez **Fabtice** ; dans le message qui s’affiche, cliquez sur
   **Ouvrir quand même**. Les fois suivantes, un double-clic suffit.

Le bouton « Ouvrir quand même » ne reste visible qu’environ une heure après
la tentative d’ouverture ; s’il a disparu, recommencez à l’étape 1.

### En dernier recours

Si macOS affiche « Fabtice est endommagé et ne peut pas être ouvert », ouvrez
l’app **Terminal** (dans Applications > Utilitaires), collez cette ligne puis
appuyez sur Entrée :

```
xattr -dr com.apple.quarantine /Applications/Fabtice.app
```

Ouvrez ensuite Fabtice normalement.

## Utiliser l’app

1. Au lancement, la fenêtre « Nouveau morceau » propose de coller un lien
   YouTube (vidéo de 20 minutes au plus, pas de direct) ou de choisir un
   fichier audio. Au premier import par lien, l’app télécharge l’outil
   officiel yt-dlp (environ 37 Mo) depuis sa page GitHub, vérifie son
   empreinte SHA-256 et le range dans son dossier
   `~/Library/Application Support/Fabtice/yt-dlp/`. En cas de coupure, elle
   réessaie d’elle-même quatre fois en une vingtaine de secondes. À chaque
   ouverture, elle regarde s’il existe une version plus récente.
2. **Aide > Diagnostic…** ouvre une fenêtre à part (la page de test des
   premiers essais) : elle importe un lien, le décode, le fait écouter et
   affiche un diagnostic détaillé. Cliquez sur **Copier le diagnostic** et
   collez le texte dans la conversation : il dit ce qui a marché ou non
   (versions, commande exacte, erreurs de yt-dlp, format du fichier,
   décodage, WebGPU).
3. **Un import par lien a été long ?** Menu **Aide > Diagnostic…**, puis le
   bouton **Copier le rapport du dernier import** : il copie, pour le dernier
   import fait depuis la fenêtre principale (gardé aussi après un
   redémarrage), le temps passé à chaque étape (démarrage de yt-dlp, recherche
   du morceau, temps avant la première ligne de progression, vitesse du
   téléchargement), puis le détail technique. Collez-le dans la conversation.

4. **Clic droit** : dans un champ de texte (le lien du « Nouveau morceau » par
   exemple), « Couper », « Copier », « Coller » et « Tout sélectionner », chacun
   utilisable selon ce qui est possible à cet endroit ; sur un texte sélectionné,
   « Copier » ; ailleurs, rien. On colle donc un lien YouTube sans le clavier.
5. **Imprimer la grille** : dans l’affichage « Grille d’accords », le bouton
   « Imprimer » (ou **Exporter > Imprimer la grille…**) ouvre une petite fenêtre :
   portrait ou paysage, taille telle quelle ou sur une page, puis **Imprimer…**
   (la fenêtre d’impression de macOS) ou **Enregistrer en PDF…** (le volet
   d’enregistrement de macOS, dans le dossier Téléchargements, au nom du morceau).
6. **Projets** : **Exporter > Enregistrer le projet…** fait un seul fichier
   `.fab` qui garde tout : le morceau tel qu’importé, la grille, les accords,
   vos corrections, les boucles et repères, le métronome, **toutes** les
   séparations faites (une par outil) et le dernier rendu « meilleure
   qualité », ces pistes en FLAC sans perte ; la fenêtre d’enregistrement de
   macOS s’ouvre au nom du morceau. Pour le rouvrir : **double-clic** sur le
   fichier dans le Finder (ou clic droit > **Ouvrir avec** > Fabtice), le
   déposer sur la fenêtre, « ouvrir un projet Fabtice » ou un des **projets
   récents** dans la fenêtre « Nouveau morceau », ou **Fichier > Ouvrir un
   projet récent** (aussi dans le Dock). Le morceau ouvert est remplacé comme
   par un import ; si le fichier est abîmé, une phrase le dit et rien ne
   change. Format : `app/src/project/FORMAT.md`.

L’app utilise yt-dlp tel quel, depuis la connexion de l’utilisateur, sans
aucun moyen de contourner les protections de YouTube. Si YouTube refuse, le
diagnostic montre simplement le message d’erreur.

## Pour le développement

Fonctionnement :

- L’interface est construite par `app/` (`npm run build:desktop`) dans
  `desktop/ui/` (non versionné) et embarquée dans l’app. Elle est servie par
  le protocole `fabtice://app/` (`src/protocol.js`), avec les en-têtes
  d’isolation COOP/COEP (SharedArrayBuffer, AudioWorklet), les bons types MIME
  (dont `.wasm`) et une politique de sécurité (CSP) stricte : scripts et
  styles de l’app seulement, WebAssembly, `blob:` pour les médias et les
  workers, styles en ligne pour React. Du réseau, **une seule chose** : le
  téléchargement des outils d’analyse (`connect-src` : `https://huggingface.co`
  et `https://*.cdn.hf.co`, le réseau de contenu de Hugging Face vers lequel il
  redirige, dont le premier mot est la région du serveur), vérifiés par leur
  SHA-256 côté interface. Les chemins qui sortent du dossier sont refusés.
- La page de diagnostic est servie par `fabtice://diagnostic/` et partage le
  même `window.fabtice` (`src/preload.js`). Les appels IPC ne sont acceptés
  que de ces deux adresses, depuis la fenêtre principale d’une page.
- Projets `.fab` (lot 4, puis décisions du 15 novembre) : l’extension est
  déclarée à macOS par `fileAssociations` dans `package.json` (`fab`, « Projet
  Fabtice », `application/x-fabtice`), ce qui donne le double-clic et « Ouvrir
  avec ». Tout ce qui touche aux projets dans le processus principal est dans
  `src/projects.js` (main.js n’a que trois points d’accroche : la création,
  `registerIpc`, et `onSaved` des téléchargements).
  macOS signale le fichier par l’évènement `open-file`, écouté dès
  `will-finish-launching` (l’app peut être lancée pour lui) ; un chemin passé
  en argument (seconde instance) est traité de même. `src/open-files.js` ne
  retient qu’un chemin absolu vers un fichier ordinaire en `.fab` de moins
  de 4 Go, sous un jeton aléatoire ; la page demande ceux qui attendent
  (`pendingProjects`), reçoit les suivants (`onOpenProject`), lit chacun par
  plages de 16 Mo au plus (`readProjectFile`) et le libère
  (`releaseProjectFile`). Aucun autre fichier n’est lisible par ce chemin. La
  fenêtre d’enregistrement d’un projet a son titre et le filtre `.fab`
  (`src/downloads.js`). **Projets récents** (`src/recent-projects.js`) : les
  huit derniers `.fab` ouverts (Finder, liste, sélecteur de la page : le
  preload lit le chemin avec `webUtils.getPathForFile`, la page ne le voit
  jamais) ou enregistrés (fin du téléchargement), dans
  `recent-projects.json` du dossier de données, les fichiers disparus retirés ;
  chacun est aussi donné à macOS (`app.addRecentDocument` : menu Fichier >
  Ouvrir un projet récent, rôle `recentDocuments`, et le Dock ; un choix
  revient en `open-file`). La page reçoit nom et dossier (« ~ » pour le
  dossier personnel) et ouvre par un jeton de la dernière liste
  (`recentProjects`, `openRecentProject`) ; le fichier lui arrive alors comme
  depuis le Finder. Ce qui ne peut pas être essayé ici : le double-clic
  réel dans le Finder et l’icône du type de fichier ; le test de bout en bout
  fait ce que fait macOS (`app.emit('open-file', …)`).
- Pas de service worker dans l’app Mac : la version web hors ligne
  (`app/src/pwa/`) ne s’inscrit pas sur `fabtice://`, qui les refuse de toute
  façon, et la construction pour le Mac n’a ni manifeste ni `sw.js`.
- Menu en français : `src/menu.js`. Menu du clic droit, en français, pour toutes
  les fenêtres : `src/context-menu.js` (le modèle des entrées est une fonction
  pure, testée ; Electron n'en montre aucun de lui-même).
- Impression de la grille : `src/printing.js`. `window.print()` ne marche pas dans
  Electron (la page cesse de répondre ; observé ici sous Linux, et c'est pourquoi
  l'entrée de menu ne faisait rien), alors l'interface met la page en forme
  d'impression (la grille seule, les choix appliqués : `app/src/chart/print.ts`)
  et demande au processus principal : `fabtice:print-chart` (`webContents.print`
  avec l'orientation : la fenêtre d'impression du système) et
  `fabtice:save-chart-pdf` (volet d'enregistrement `dialog.showSaveDialog`, en
  français, dossier Téléchargements, nom du morceau ; puis `printToPDF` en A4, ou
  US Letter dans une région qui l'emploie, et le fichier est écrit ici). Seuls
  deux sens et un titre court sont acceptés. Politique de sécurité inchangée.

Choix techniques (vérifiés le 12 novembre 2026) :

- **Electron 43** (43.8.9) : Electron 44 et suivants exigent macOS 13
  Ventura ; 43 est la dernière version majeure qui fonctionne sur Monterey
  (Chromium 150).
- **yt-dlp** : fichier `yt-dlp_macos` des versions officielles, universel
  (Intel + Apple Silicon), annoncé pour macOS 10.15 et plus ; il contient déjà
  les scripts EJS (yt-dlp-ejs) qui résolvent les défis JavaScript de YouTube.
  Il n’est pas inclus dans l’app : il est téléchargé au premier usage.
- **Moteur JavaScript pour yt-dlp** : l’exécutable de l’app elle-même, lancé
  avec `ELECTRON_RUN_AS_NODE=1`, que yt-dlp utilise comme « node »
  (`--no-js-runtimes --js-runtimes node:<chemin de l’app>`).
- **Pas de ffmpeg** : yt-dlp est lancé avec `--fixup never` et le m4a DASH
  (MP4 fragmenté) est passé tel quel à `decodeAudioData`. Le diagnostic dit
  si Chromium l’a accepté.

Commandes (depuis `desktop/`) :

```
npm ci
npm run build:ui          # construit l'interface (app/) dans desktop/ui/
npm start                 # lance l'app
npm test                  # tests unitaires (dont le protocole)
xvfb-run -a npm run test:e2e   # bout en bout (Linux), avec un faux yt-dlp
npm run dist:mac:arm64    # Fabtice-mac-apple-silicon.dmg et .zip (sur Mac)
npm run dist:mac:x64      # Fabtice-mac-intel.dmg et .zip (sur Mac)
npm run dist:dir          # app non empaquetée, pour essayer (toute plateforme)
```

Les commandes de fabrication s’arrêtent avec un message clair si
`desktop/ui/` n’existe pas. Pour tester l’app empaquetée :
`FABTICE_E2E_APP=<chemin de l’exécutable> npm run test:e2e`.

Le pont (`window.fabtice`, `src/preload.js`) : `systemInfo`, `ytdlpStatus`,
`ytdlpCheck`, `ytdlpInstall`, `extract`, `lastImportReport`, `copyText`,
`onYtdlpProgress`, `onExtractProgress`, `printChart({ orientation })`,
`saveChartPdf({ orientation, title })` (voir plus haut ; `{ ok: true }` ou
`{ ok: false, reason: 'cancelled' | 'failed' }`) et `openInIRealPro(lien)`. Cette
dernière est celle de « Ouvrir dans iReal Pro » (menu « Exporter » de
l’interface) : le processus principal vérifie le lien (`src/ireal-link.js` :
schéma exactement `irealb://`, 200 000 caractères au plus, rien que ce
qu’écrit `encodeURIComponent` plus `=` et `/`, aucun espace ni caractère de
contrôle) puis le confie au système par `shell.openExternal`. Elle rend
`{ ok: true }`, ou `{ ok: false, reason: 'invalid' }` (lien refusé : le système
n’est pas sollicité) ou `{ ok: false, reason: 'failed' }` (le système n’a pas pu
l’ouvrir, par exemple iReal Pro n’est pas installé). Rien d’autre ne peut
atteindre `shell.openExternal`. Les protections restent : ni navigation ni
nouvelle fenêtre ; le fichier « Grille pour iReal Pro » est un vrai
téléchargement (l’app demande où l’enregistrer ; `test/e2e/ireal-export.test.js`
le range dans un dossier jetable et remplace `shell.openExternal` par un
enregistreur, rien n’est lancé pour de bon).

`standardsFetchText(url)` sert à l'offre de télécharger les grilles des standards
(`app/src/standards/library.ts` ; une page ne peut pas lire un autre site, c'est
donc le processus principal qui fait la requête, `src/standards-fetch.js`).
GET en HTTPS seulement, sans identifiant, sans port, sans fragment ; l'hôte doit
être dans une liste fixe (les mêmes que `COLLECTION_HOSTS` de
`app/src/standards/collections.ts`, épinglés l'un à l'autre par
`test/unit/standards-fetch.test.js` : sites d'iReal Pro et
`raw.githubusercontent.com`) ; les redirections sont suivies à la main, cinq au
plus, et seulement vers un hôte de la liste (`net.request`, car `net.fetch`
annule la requête à la première redirection) ; 25 Mo au plus, lus au fil de
l'eau ; 60 s ; ni cookie ni identifiant, agent utilisateur « Fabtice ». Elle ne
rejette jamais : `{ ok: true, text, url, bytes }` ou `{ ok: false, error, status? }`
avec `error` parmi `invalid-url`, `host-not-allowed`, `redirect`, `http`,
`too-large`, `timeout`, `network`. Pour les tests, `FABTICE_STANDARDS_TEST_ORIGIN`
(`http://127.0.0.1:port`, actif seulement avec `FABTICE_HOLD_WINDOW=1`) envoie
les requêtes des hôtes permis à un faux serveur local, à `/<hôte><chemin>` ; la
liste est contrôlée sur l'adresse réelle avant. Pas de `connect-src` à ajouter
dans `src/protocol.js` : la page ne fait pas la requête. Essai de bout en bout :
`test/e2e/standards.test.js` (règles du pont, puis toute l'offre).

`test/e2e/chart-pdf.test.js` essaie l'impression dans l'app : le PDF de la grille
tombe sur le disque (en-tête `%PDF-`, fin `%%EOF`, nombre de pages, taille de page
debout et couchée, texte de la grille, l'interface rendue telle qu'elle était), un
morceau de 48 mesures en deux pages puis sur une seule, un volet fermé qui n'écrit
rien, des demandes refusées, et « Imprimer… » qui demande bien la fenêtre
d'impression avec l'orientation. Comme pour l'export du son, c'est le processus
principal qui répond au volet d'enregistrement (`dialog.showSaveDialog` est lu au
moment de l'appel, après que l'app a construit les options du volet, que le test
relit) ; `webContents.print` est remplacé par un enregistreur. Il lui faut `pdfinfo` et
`pdftotext` (poppler). `test/e2e/context-menu.test.js` fait un vrai clic droit dans la
page : le menu natif ne se pilote pas, `Menu.prototype.popup` est remplacé par un
enregistreur et le test appuie sur l'entrée (son propre gestionnaire) ; le lien
collé arrive bien dans le champ, dans la fenêtre principale et dans celle de
diagnostic. `test/unit/context-menu.test.js` et `test/unit/printing.test.js` couvrent
les modèles, la validation, le volet et l'écriture du fichier.

Ce que le pont envoie à l’interface pendant un import (`src/extract.js`) :
`{ phase: 'info' }`, puis `{ phase: 'prepare', meta }` quand le téléchargement
va démarrer (rien ne se mesure encore : le binaire de yt-dlp démarre), puis
`{ phase: 'download', percent, receivedBytes, totalBytes, speedBps }` **seulement**
quand yt-dlp a écrit une vraie ligne de progression (`percent` est `null` quand
la taille totale est inconnue). Les arguments donnés à yt-dlp ne changent pas.

Variables d’environnement de test :

- `FABTICE_YTDLP_PATH` : chemin d’un autre exécutable à utiliser à la place
  de yt-dlp (par exemple `test/fixtures/stub-yt-dlp.js`, qui copie un fichier
  audio local au lieu de télécharger) ;
- `FABTICE_USER_DATA` : dossier de données jetable pour les tests ;
- `FABTICE_RELEASE_BASE` : adresse d’un serveur local qui imite les versions
  GitHub de yt-dlp (pannes simulées) ;
- `FABTICE_RETRY_DELAYS_MS` : attentes entre les essais, par exemple
  `100,200,300` (par défaut 2, 5 puis 10 secondes : 4 essais en 20 s environ) ;
- `FABTICE_HOLD_WINDOW=1` : l’app n’ouvre sa première fenêtre que sur demande
  du test (`globalThis.__fabticeOpenFirstWindow()`), pour que l’outil de test
  s’attache avant qu’une page se charge (sinon son lancement peut rester
  bloqué) ; `FABTICE_E2E_QUERY` (par exemple `?debug`) n’est pris en compte
  qu’avec elle ;
- `FABTICE_STARTUP_TRACE=1` : chaque étape du démarrage écrit une ligne
  `[fabtice] …` sur la sortie d’erreur, que les tests recopient quand un
  lancement échoue ;
- `FABTICE_STUB_FIXTURES` : dossier des fichiers audio du faux yt-dlp quand
  il est installé ailleurs (le test de parcours le fait installer par le
  serveur de versions local, comme un vrai yt-dlp) ;
- `FABTICE_STUB_FILE` : le faux yt-dlp rend ce fichier (n'importe quelle
  taille) au lieu de la petite fixture, pour essayer des morceaux de taille
  réelle ;
- `FABTICE_STUB_START_DELAY_MS` : le faux yt-dlp ne dit rien du tout pendant ce
  temps au début du téléchargement (le binaire autonome d'un vieux Mac) ;
- `FABTICE_STUB_PROGRESS` : `known` (par défaut), `unknown` (taille totale
  inconnue : seulement la quantité reçue) ou `none` (aucune ligne de
  progression) ; `FABTICE_STUB_PROGRESS_GAP_MS` : pause entre deux lignes. Les
  lignes imitées sont celles que le vrai yt-dlp écrit (voir `src/progress.js`).

Les tests de bout en bout couvrent le parcours complet par les boutons de
l’interface (`test/e2e/journey.test.js`) : lien collé, installation de l’outil,
extraction, forme d’onde, lecture avec le vrai moteur (aucune violation de la
politique de sécurité), boucle et tonalité, relance avec le même dossier de
données, lien refusé, import d’un fichier.

`test/e2e/analysis.test.js` fait la **vraie analyse** dans l’app, sous la
politique livrée : import d’un fichier, téléchargement des outils depuis
Hugging Face, worker et ONNX Runtime, résultat comparé à ce qu’on sait du morceau
d’essai, outils gardés dans IndexedDB, relance, nouvelle analyse sans
télécharger. Il télécharge 18 Mo : il ne tourne que si
`FABTICE_E2E_ANALYSIS=1` (`FABTICE_E2E_ANALYSIS=1 xvfb-run -a npm run test:e2e`).

Deux autres fichiers gardent des défauts déjà rencontrés :

- `test/e2e/real-size.test.js` : **des morceaux de taille réelle** (quelques Mo,
  fabriqués à la volée, sans fichier binaire) importés par un fichier puis par
  un lien (le faux yt-dlp rend un gros fichier), puis quitter, relancer avec le
  même dossier de données : le morceau doit revenir seul en quelques secondes,
  avec ses réglages, et se jouer. Les fixtures de quelques ko ne suffisent pas :
  le navigateur garde les grosses valeurs à part, et c'est là que la lecture
  d'un morceau gardé échouait en silence (le test échoue sans le correctif) ;
- `test/e2e/link-steps.test.js` : un import par lien passe par des étapes
  honnêtes (recherche, préparation du téléchargement sans aucun chiffre, vrai
  pourcentage ou quantité reçue, préparation du son) avec un démarrage lent et
  une taille inconnue, et le bouton « Copier le rapport du dernier import » de
  la fenêtre de diagnostic.

Les tests unitaires couvrent aussi `src/progress.js` (les lignes de progression
exactes du vrai yt-dlp) et `src/report.js` (le rapport copiable).

Intégration continue : `.github/workflows/desktop-mac.yml` vérifie et construit
l’interface (`npm ci`, `typecheck`, `test`, `build:desktop` dans `app/`), construit
les deux apps sur un Mac Apple Silicon, teste chacune (avec le faux yt-dlp) sur
sa propre architecture, puis publie les deux `.dmg` sur la version de test
`desktop-dev` (sur `main` seulement). Le résultat de chaque
passage et la fin des journaux sont poussés sur la branche `ci-logs` :

```
git fetch origin ci-logs && git show FETCH_HEAD:STATUS.md
```
