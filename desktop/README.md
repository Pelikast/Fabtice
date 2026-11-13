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
  workers, styles en ligne pour React, rien depuis le réseau. Les chemins qui
  sortent du dossier sont refusés.
- La page de diagnostic est servie par `fabtice://diagnostic/` et partage le
  même `window.fabtice` (`src/preload.js`). Les appels IPC ne sont acceptés
  que de ces deux adresses, depuis la fenêtre principale d’une page.
- Menu en français : `src/menu.js`.

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
  serveur de versions local, comme un vrai yt-dlp).

Les tests de bout en bout couvrent le parcours complet par les boutons de
l’interface (`test/e2e/journey.test.js`) : lien collé, installation de l’outil,
extraction, forme d’onde, lecture avec le vrai moteur (aucune violation de la
politique de sécurité), boucle et tonalité, relance avec le même dossier de
données, lien refusé, import d’un fichier.

Intégration continue : `.github/workflows/desktop-mac.yml` vérifie et construit
l’interface (`npm ci`, `typecheck`, `test`, `build:desktop` dans `app/`), construit
les deux apps sur un Mac Apple Silicon, teste chacune (avec le faux yt-dlp) sur
sa propre architecture, puis publie les deux `.dmg` sur la version de test
`desktop-dev` (sur `main` seulement). Le résultat de chaque
passage et la fin des journaux sont poussés sur la branche `ci-logs` :

```
git fetch origin ci-logs && git show FETCH_HEAD:STATUS.md
```
