# Fabtice pour Mac — prototype

Ce premier prototype ne sert qu’à vérifier une chose : l’audio d’un lien
YouTube peut-il être récupéré **sur le Mac de l’utilisateur**, avec sa propre
connexion ? On colle un lien, l’app télécharge la piste audio, la décode, la
fait écouter, et affiche un diagnostic détaillé à copier.

## Télécharger

La dernière version de test se trouve sur la page des versions du dépôt,
rubrique « desktop-dev » :
https://github.com/Pelikast/fabtice/releases/tag/desktop-dev

- `Fabtice-mac-universal.dmg` : l’image disque à ouvrir (recommandé) ;
- `Fabtice-mac-universal.zip` : la même app, compressée.

L’app est universelle (Mac Intel et Mac Apple Silicon) et demande macOS 12
Monterey ou plus récent.

## Ouvrir l’app la première fois

Fabtice n’est pas encore signée par un développeur enregistré chez Apple.
macOS bloque donc la première ouverture ; il faut l’autoriser une fois, à la
main. Commencez dans tous les cas par :

1. Ouvrir `Fabtice-mac-universal.dmg` (double-clic dans Téléchargements).
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

## Utiliser le prototype

1. Au premier lancement, cliquez sur **Installer yt-dlp**. L’app télécharge
   l’outil officiel yt-dlp (environ 37 Mo) depuis sa page GitHub, vérifie son
   empreinte SHA-256 et le range dans son dossier
   `~/Library/Application Support/Fabtice/yt-dlp/`. En cas de coupure, elle
   réessaie d’elle-même quatre fois en une vingtaine de secondes avant
   d’afficher « Réessayer ». À chaque ouverture, elle
   regarde s’il existe une version plus récente et propose la mise à jour.
2. Collez un lien YouTube (vidéo de 20 minutes au plus, pas de direct) et
   cliquez sur **Importer**.
3. Si tout va bien, le titre, la chaîne et la durée s’affichent, avec un
   bouton Lecture / Pause et un curseur de position.
4. Dans tous les cas, cliquez sur **Copier le diagnostic** et collez le texte
   dans la conversation : il dit ce qui a marché ou non (versions, commande
   exacte, erreurs de yt-dlp, format du fichier, décodage, WebGPU).

L’app utilise yt-dlp tel quel, depuis la connexion de l’utilisateur, sans
aucun moyen de contourner les protections de YouTube. Si YouTube refuse, le
diagnostic montre simplement le message d’erreur.

## Pour le développement

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

Commandes (dans `desktop/`) :

```
npm ci
npm start                 # lance l'app
npm test                  # tests unitaires
xvfb-run -a npm run test:e2e   # test de bout en bout (Linux), avec un faux yt-dlp
```

Variables d’environnement de test :

- `FABTICE_YTDLP_PATH` : chemin d’un autre exécutable à utiliser à la place
  de yt-dlp (par exemple `test/fixtures/stub-yt-dlp.js`, qui copie un fichier
  audio local au lieu de télécharger) ;
- `FABTICE_USER_DATA` : dossier de données jetable pour les tests ;
- `FABTICE_RELEASE_BASE` : adresse d’un serveur local qui imite les versions
  GitHub de yt-dlp (pannes simulées) ;
- `FABTICE_RETRY_DELAYS_MS` : attentes entre les essais, par exemple
  `100,200,300` (par défaut 2, 5 puis 10 secondes : 4 essais en 20 s environ).

Intégration continue : `.github/workflows/desktop-mac.yml` construit l’app sur
un Mac Apple Silicon, la teste (avec le faux yt-dlp) sur Apple Silicon et sur
Intel, puis publie la version de test `desktop-dev`. Le résultat de chaque
passage et la fin des journaux sont poussés sur la branche `ci-logs` :

```
git fetch origin ci-logs && git show FETCH_HEAD:STATUS.md
```
