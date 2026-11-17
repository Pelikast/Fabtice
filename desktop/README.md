# Fabtice pour Mac

L’app Mac affiche la vraie interface de Fabtice (celle de `app/`) dans une
fenêtre Electron, et lui ajoute ce que le web ne peut pas faire : importer
l’audio d’un lien YouTube **sur le Mac de l’utilisateur**, avec sa propre
connexion, grâce à yt-dlp. Tout le reste tourne comme sur le site.

## Télécharger

La dernière version se trouve sur la page des versions du dépôt :
https://github.com/pelikast/fabtice/releases/latest

(L’ancienne « version de test », rubrique « desktop-dev », n’est plus
reconstruite depuis la 1.0.0.)

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

1. Au lancement, la fenêtre « Nouveau projet » propose de coller un lien
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

4. **Clic droit** : dans un champ de texte (le lien du « Nouveau projet » par
   exemple), « Couper », « Copier », « Coller » et « Tout sélectionner », chacun
   utilisable selon ce qui est possible à cet endroit ; sur un texte sélectionné,
   « Copier » ; ailleurs, rien. On colle donc un lien YouTube sans le clavier.
5. **Imprimer la grille** : **cmd + P**, **Fichier > Imprimer…** ou le bouton
   « Imprimer » de l’affichage « Grille d’accords » ouvrent la fenêtre
   d’impression : à gauche l’aperçu, page par page, exactement ce qui sortira ;
   à droite l’imprimante et le nombre de copies, le papier (A4 ou Lettre),
   portrait ou paysage, les marges, l’échelle (ou « Tenir sur une page »),
   l’instrument (Ut, Si♭, Mi♭) et ce qu’on écrit en tête (titre, tonalité,
   tempo). Puis **Imprimer** ou **Enregistrer en PDF** (le
   volet d’enregistrement de macOS, dans le dossier Téléchargements, au nom du
   morceau). Sans imprimante listée, la fenêtre d’impression de macOS s’ouvre.
6. **Projets** : **Fichier > Enregistrer** (cmd + S) fait un seul fichier
   `.fab` qui garde tout : le morceau tel qu’importé, la grille, les accords,
   vos corrections, les boucles et repères, le métronome, **toutes** les
   séparations faites (une par outil) et le dernier rendu « meilleure
   qualité », ces pistes en FLAC sans perte ; la fenêtre d’enregistrement de
   macOS s’ouvre au nom du morceau. Pour le rouvrir : **double-clic** sur le
   fichier dans le Finder (ou clic droit > **Ouvrir avec** > Fabtice), le
   déposer sur la fenêtre, « ouvrir un projet Fabtice » ou un des **projets
   récents** dans la fenêtre « Nouveau projet », ou **Fichier > Ouvrir un
   projet récent** (aussi dans le Dock). Le morceau ouvert est remplacé comme
   par un import ; si le fichier est abîmé, une phrase le dit et rien ne
   change. Format : `app/src/project/FORMAT.md`.

   **Enregistrer par-dessus** (1.0.0) : l’app sait où est le fichier du projet
   ouvert (celui qu’on a ouvert ou le dernier enregistré). **cmd + S** écrit
   par-dessus, sans fenêtre, en une fraction de seconde : les sons déjà
   enregistrés dans le fichier sont recopiés tels quels. **Maj + cmd + S**
   (« Enregistrer sous… ») ouvre le volet d’enregistrement de macOS et fait un
   nouveau fichier, qui devient celui du projet. Un projet jamais enregistré
   demande d’abord où. Le titre de la fenêtre montre le nom du fichier, avec le
   point de macOS dans le bouton rouge tant qu’il y a des modifications non
   enregistrées. Fermer la fenêtre ou quitter (cmd + Q) dans ce cas ouvre
   l’alerte « Les modifications du projet en cours n’ont pas été sauvegardées,
   voulez-vous enregistrer ? » (« Enregistrer », « Ne pas enregistrer »,
   « Annuler »). Si l’écriture est coupée en route (panne, app tuée), l’ancien
   fichier reste tel quel.
7. **Le son ne démarre plus ?** Menu **Aide > Diagnostic…**, puis **Copier le
   journal audio** (il est aussi dans « Copier le diagnostic ») et collez le
   texte dans la conversation. Il donne, avec l’heure, ce que Fabtice a fait de
   la sortie audio (ouverte, mise en sommeil, rendue au système, rouverte,
   reprise après une panne), les mises en veille et sorties de veille du Mac,
   les changements de périphériques audio et l’arrêt éventuel d’un processus
   de Chromium. Il est gardé après un redémarrage du Mac. Fabtice rend la
   sortie audio au système après 45 secondes sans lecture et dès que le Mac
   se met en veille ; il n’empêche jamais la mise en veille. Si le son de tout
   le Mac est bloqué (même l’aperçu du Finder reste muet), il n’est en général
   pas nécessaire de redémarrer : ouvrir **Moniteur d’activité**, chercher
   `coreaudiod`, le sélectionner puis **Forcer à quitter** (mot de passe
   demandé) ; macOS le relance aussitôt.

L’app utilise yt-dlp tel quel, depuis la connexion de l’utilisateur, sans
aucun moyen de contourner les protections de YouTube. Si YouTube refuse, le
diagnostic montre simplement le message d’erreur.

## Mise à jour automatique

À partir de la 1.0.0, l’app se met à jour elle-même, par un système maison
(sans signature Apple, sans outil tiers). La 1.0.0 est la première version à
savoir le faire : le vrai parcours, chez le propriétaire, ne se verra qu’avec
la version suivante. D’ici là, il est essayé en entier sur les Mac de GitHub
(voir « L’essai complet » plus bas).

### Ce que voit l’utilisateur

- À l’ouverture (si « Vérifier à chaque ouverture » est coché, Réglages →
  Général), quelques secondes après, l’app cherche en arrière-plan. À jour, ou
  pas de réseau : rien ne s’affiche. Une version plus récente : le message
  « Une mise à jour est disponible », avec le numéro actuel et le nouveau, les
  nouveautés, un bouton « Mettre à jour Fabtice » et « Plus tard ».
- « Rechercher une mise à jour… » dans le menu Fabtice de la barre des menus
  (après « À propos de Fabtice ») et dans Réglages → Général répond toujours :
  à jour, disponible, ou la raison claire (pas de réseau, fichier illisible).
- Le bouton télécharge (pourcentage, « Annuler »), vérifie, demande s’il faut
  enregistrer le projet (comme cmd + Q : un refus annule tout), remplace l’app
  et la rouvre dans la nouvelle version. Un calcul en cours (séparation,
  rendu, export…) fait d’abord poser la question.
- Quand cela ne peut pas marcher, l’app le dit et propose « Télécharger à la
  main » (la page de la version sur GitHub, dans le navigateur) : app ouverte
  depuis Téléchargements ou l’image disque sans avoir été déplacée (macOS la
  fait tourner depuis un emplacement protégé, « App Translocation »), image
  disque (volume en lecture seule), dossier que le compte ne peut pas
  modifier, macOS trop ancien pour la nouvelle version.

### Le fichier de version

Chaque version publiée porte un fichier `fabtice-version.json` parmi ses
fichiers, lu à
`https://github.com/pelikast/fabtice/releases/latest/download/fabtice-version.json` :

```json
{
  "format": 1,
  "version": "1.0.1",
  "publishedAt": "2026-12-01T10:00:00Z",
  "notes": "la première section de CHANGELOG.md (Markdown, en français)",
  "page": "https://github.com/pelikast/fabtice/releases/tag/v1.0.1",
  "minimumSystemVersion": "12.0",
  "downloads": {
    "arm64": { "name": "Fabtice-mac-apple-silicon.zip", "url": "https://github.com/pelikast/fabtice/releases/download/v1.0.1/Fabtice-mac-apple-silicon.zip", "sha256": "<64 hex>", "size": 123456789 },
    "x64":   { "name": "Fabtice-mac-intel.zip", "url": "https://github.com/pelikast/fabtice/releases/download/v1.0.1/Fabtice-mac-intel.zip", "sha256": "<64 hex>", "size": 123456789 }
  }
}
```

- Il est fait par `ci/make-version-file.js` (sans dépendance) :
  `node ci/make-version-file.js <version> v<version> <…apple-silicon.zip> <…intel.zip> ../CHANGELOG.md <sortie>` ;
  le script calcule tailles et empreintes, prend les notes dans la première
  section « ## » du changelog et relit le fichier avec le lecteur de l’app
  avant de finir (un fichier que l’app ne saurait pas lire n’est jamais
  publié).
- Le lecteur (`src/update-version.js`) est strict : `format` inconnu, champ
  absent, mal typé ou hors bornes, adresse hors des versions du projet sur
  `github.com`, et tout le fichier est « illisible » (rien à l’ouverture, une
  phrase claire pour une recherche à la main). Les numéros sont trois nombres
  comparés comme des nombres ; seule une version **strictement plus récente**
  est proposée : jamais la même, jamais une plus ancienne.
- Un futur format : publié sous le même nom seulement si les versions déjà
  installées savent encore le lire ; sinon sous un autre nom.

### Réseau : hôtes permis

Le processus principal fait tous les téléchargements (`src/update-net.js`),
jamais la page, en `https` seulement, sans cookie ni identifiant, avec les
redirections suivies à la main et chaque étape vérifiée : `github.com` (la
première adresse est toujours là), et les hôtes où GitHub range les fichiers
des versions : `objects.githubusercontent.com` (relevé le 17 novembre 2026)
et `release-assets.githubusercontent.com` (utilisé par GitHub en 2025). Rien
d’autre. La fabrication relève à chaque passage l’hôte de la redirection du
jour (étape « GitHub release redirect host », `ci/release-host.js`) : si
GitHub en change, l’ajouter à `ALLOWED_HOSTS` avant une version.

### Le remplacement, pas à pas

1. **Où est l’app** (`src/update-place.js`) : le paquet `.app` qui contient
   l’exécutable, chemin réel. Refus si emplacement protégé
   (`/private/var/folders/…/AppTranslocation/…`), volume en lecture seule
   (`EROFS`), dossier non modifiable (un fichier d’essai y est créé puis
   effacé), app non empaquetée, et app lancée depuis une copie que la mise à
   jour fabrique elle-même (`.Fabtice-ancienne.app` ouverte à la main pour se
   dépanner, ou une app d’un dossier `.Fabtice-maj-…`) : l’échange effacerait
   l’app en cours. L’app le dit comme pour une copie non empaquetée, avec
   « Télécharger à la main ».
2. **Place sur le disque** : quatre fois l’archive (l’archive, gardée jusqu’à
   la fin, l’app déballée, environ 2,4 fois l’archive, et une marge).
3. **Téléchargement** dans un dossier de travail neuf à côté de l’app
   (`.Fabtice-maj-<hasard>`, même volume), taille exacte exigée, SHA-256
   calculé en écrivant. Une empreinte fausse efface le téléchargement :
   « Le fichier téléchargé est incomplet ou abîmé. Rien n’a été changé. »
   Un fichier écrit par l’app n’est pas mis en quarantaine par macOS (l’essai
   le vérifie) ; si un réglage du système le faisait, la marque est retirée
   de l’archive, jamais de l’app.
4. **Déballage** avec `ditto -x -k` (garde la signature et les attributs),
   puis **contrôle** (`src/update-install.js`) : un seul `Fabtice.app`, vrai
   dossier ; `Info.plist` : `org.fabtice.desktop` et la version annoncée ;
   exécutable présent, Mach-O de la bonne puce ; il **démarre**
   (`ELECTRON_RUN_AS_NODE=1 <exe> -e …` : sur puce Apple, le système tue un
   programme dont la signature ne tient pas) ; `codesign --verify --deep`
   doit passer sur puce Apple (sur Intel, son résultat est seulement noté).
5. **Question de fermeture** : la même que cmd + Q (`close-guard.js`) ; un
   refus annule tout, rien n’a bougé.
6. **Échange** : l’app installée renommée en `.Fabtice-ancienne.app` dans le
   même dossier, la nouvelle renommée à sa place, puis relue. À toute erreur,
   l’ancienne est remise à sa place (la nouvelle retourne dans le dossier de
   travail, effacé). Rien n’est jamais modifié à l’intérieur d’un paquet.
7. **Relance** : un petit `sh` détaché attend la fin du processus, puis
   `open -n` du paquet (comme le Finder) ; les chemins passent en arguments,
   jamais dans le script.
8. **Au démarrage suivant**, la nouvelle app efface `.Fabtice-ancienne.app`
   et les dossiers de travail restés (jamais l’app qui tourne, jamais un lien).

Chaque étape est notée dans `update-log.txt` du dossier de données de l’app
(300 lignes au plus, dossier personnel remplacé par « ~ ») : à demander au
propriétaire si une mise à jour échoue chez lui.

### Ce que cela garantit, et ce que cela ne garantit pas

- L’empreinte et l’archive viennent du même endroit (la même version sur
  GitHub) : la vérification garantit un fichier **complet et intact**, rien
  de plus. Elle ne protège pas d’un compte GitHub compromis ; seule une
  signature Apple le ferait, écartée par le propriétaire pour l’instant.
- L’app installée reste intacte et utilisable à toute erreur avant la
  relance. Après l’échange, si la nouvelle version ne démarrait pas du tout,
  l’ancienne reste cachée à côté (`.Fabtice-ancienne.app`) jusqu’au démarrage
  réussi de la nouvelle ; le contrôle « elle démarre » de l’étape 4 rend ce
  cas très improbable.
- Une app Intel lancée sous Rosetta sur une puce Apple se met à jour vers la
  version Intel (la même puce que celle qui tourne).

### Seuils pour les tests

Trois variables, actives **seulement** avec `FABTICE_HOLD_WINDOW=1` (le
réglage de tous les tests e2e, que personne n’utilise autrement) :
`FABTICE_UPDATE_TEST_ORIGIN` (un serveur local `http://127.0.0.1:<port>`,
`localhost` ou `[::1]` : boucle locale seulement, où le `http` simple est alors
permis ; les hôtes sont vérifiés sur les vraies adresses, la requête part vers
`<origine>/<hôte><chemin>`), `FABTICE_UPDATE_TEST_APP` (un dossier tient lieu
de paquet installé, pour aller jusqu’au téléchargement sous Linux) et
`FABTICE_UPDATE_TRIAL_REPORT` (l’app écrit au démarrage son numéro, sa place
et ce qu’elle a nettoyé). Sous ce réglage, la recherche à l’ouverture ne
contacte jamais GitHub.

### L’essai complet

`test/trial/update-trial.js`, étape obligatoire de la fabrication sur chaque
puce (« Update trial (arm64) » dans `build`, « Update trial (x64) » dans
`intel`), après une seconde fabrication des mêmes sources avec un numéro plus
haut (`-c.extraMetadata.version`, archive zip seulement ; celle d’Intel passe
au second job comme artefact, jamais publiée). L’essai :

1. installe l’app fabriquée dans un dossier au nom avec espaces et accents ;
2. sert la version factice et son fichier de version (fait par
   `make-version-file.js`) depuis un serveur local, avec les redirections de
   GitHub ;
3. lance l’app, cherche, met à jour (question de fermeture réellement posée),
   attend la relance par `open -n`, lit le numéro **dans l’app relancée**
   (son rapport), vérifie que l’ancienne copie a disparu, que
   `codesign --verify --deep --strict` passe et qu’il n’y a pas de
   quarantaine, puis relance l’app une fois de plus ;
4. archive altérée d’un octet : refusée, l’app installée inchangée et qui
   démarre encore ;
5. dossier non modifiable (`chmod 555`) et emplacement protégé (copie sous
   `…/AppTranslocation/…/d/`, la règle de chemin) : dits, rien touché.

Pour le lancer à la main sur un Mac :
`FABTICE_TRIAL_APP_ZIP=… FABTICE_TRIAL_NEW_ZIP=… FABTICE_TRIAL_ARCH=arm64 node test/trial/update-trial.js`.
Sous Linux, `test/e2e/update.test.js` couvre la recherche, le message, le
menu, l’archive altérée et une archive qui n’est pas une vraie app ; les
tests unitaires `test/unit/update-*.test.js` et `updater.test.js` couvrent le
reste sur des arbres de fausses apps.

## Pour le développement

Fonctionnement :

- **Sortie audio et veille** : `src/power-events.js` écoute `powerMonitor`
  (veille, réveil, verrouillage de l’écran, température, arrêt) et
  `child-process-gone` / `render-process-gone` (arrêt du service audio, du
  processus graphique ou d’une page) ; il écrit dans le journal et transmet
  veille, réveil et verrouillage aux fenêtres (`fabtice:power`, `onPower` du
  pont), dont le moteur rend alors la sortie audio. `src/audio-journal.js`
  garde les 200 derniers événements (ceux de l’interface arrivent par
  `audioJournalAdd`, la source est déduite de l’adresse de l’expéditeur) dans
  `audio-journal.json` du dossier de données ; `audioJournal()` le rend en
  texte pour la fenêtre de diagnostic. Le lecteur de la fenêtre de diagnostic
  ferme lui aussi son contexte 30 s après la dernière pause et à la veille.
  L’app n’utilise jamais `powerSaveBlocker` (un test le vérifie).

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
- **Enregistrer le projet sur son fichier** (étape 1 de la 1.0.0, C5) : le
  processus principal possède le fichier du projet ouvert et l’écrit ;
  la page ne connaît jamais un chemin, elle nomme le projet par son
  identifiant et demande « le fichier du projet » ou « un fichier que
  l’utilisateur va choisir dans le volet d’enregistrement ».
  - `src/project-writer.js` : **écriture sûre**, toujours de la même façon :
    fichier temporaire `<nom>.fab.tmp-<16 hexadécimaux>` dans le même dossier
    (le renommage final reste sur un seul volume), morceaux ajoutés au fil de
    l’eau (64 Mo au plus par appel), puis `fsync`, fermeture, **renommage par-dessus
    la cible** (atomique : l’ancien fichier ou le nouveau, jamais un mélange) et
    `fsync` du dossier. Un échec, ou une page qui abandonne, supprime le
    temporaire et ne touche pas à la cible. **Nettoyage au démarrage** : un
    temporaire de plus de 60 s laissé par une coupure, dans un dossier connu
    (ceux des fichiers retenus), est supprimé (`cleanStale`, appelé depuis
    `main.js` au démarrage). Seuls peuvent être écrits : le fichier du projet
    ouvert (connu parce qu’il a été ouvert, enregistré ou retrouvé) et un chemin
    choisi dans le volet d’enregistrement, toujours en `.fab`, moins de 4 Go.
    La page peut aussi **relire** ce fichier par plages de 16 Mo au plus (pour
    recopier les sons déjà encodés), jamais un autre.
  - **Fichier retenu par projet** : `project-files.json` dans le dossier de
    données, une ligne par identifiant de projet (cent au plus, les plus
    anciens tombent). Au relancement, la page demande le fichier de son projet
    (`recallProjectFile`) et « Enregistrer » écrase le même fichier. Un fichier
    disparu n’est pas retrouvé : « Enregistrer » redemande où. Le chemin sert
    aussi à l’icône du fichier dans la barre de titre.
  - Les canaux IPC (enregistrés par `src/projects.js`, sauf deux) :
    `fabtice:project-file-info`, `-read`, `-adopt` (le projet vient d’être
    ouvert par jeton : Finder, projets récents), `-adopt-chosen` (par le
    sélecteur de la page : le preload lit le chemin avec
    `webUtils.getPathForFile`), `-recall`, `-forget` ;
    `fabtice:project-save-begin`, `-write`, `-restart` (reprendre depuis le
    début quand la page a dû tout réécrire sans rien emprunter), `-finish`,
    `-abort` ; dans `main.js` : `fabtice:project-state` (la page dit quel
    projet est ouvert et s’il est modifié : `setDocumentEdited`,
    `setRepresentedFilename` ; le titre lui-même est celui de la page) et
    `fabtice:close-ack` / `fabtice:close-answer`. Une panne du rédacteur n’est
    jamais une exception qui traverse l’IPC (le message pourrait contenir un
    chemin) : `{ ok: false, reason }`, avec `reason` parmi `no-file`,
    `cancelled`, `invalid`, `failed`, `unknown-session`, `too-large`.
    Côté page : `projectFileInfo`, `readCurrentProjectFile`,
    `adoptProjectFile`, `adoptChosenProjectFile`, `recallProjectFile`,
    `forgetProjectFile`, `beginProjectSave`, `writeProjectSave`,
    `restartProjectSave`, `finishProjectSave`, `abortProjectSave`,
    `reportProjectState`, `onConfirmClose`, `ackClose`, `answerClose`
    (`src/preload.js`, types dans `app/src/platform/desktopBridge.ts`, tous
    facultatifs).
  - **Garde de fermeture** (`src/close-guard.js`, branchée dans `main.js`) : le
    processus principal ne sait pas si le projet a changé, la page si. Fermer la
    fenêtre (bouton rouge, cmd + W : évènement `close`) et cmd + Q / « Quitter »
    (`before-quit`) sont suspendus ; la fenêtre est ramenée devant, et le
    processus principal envoie `fabtice:confirm-close` `{ id }`. La page répond
    tout de suite `fabtice:close-ack` (« j’ai entendu, je demande à
    l’utilisateur »), puis `fabtice:close-answer` (`true` : fermer, `false` :
    rester). **Sans accusé de réception en 2 s** (page figée, pas encore
    chargée, ou page ancienne qui ne connaît pas la question), ou si la page
    disparaît pendant que l’utilisateur décide, la fenêtre se ferme : elle ne
    doit jamais rester ouverte pour toujours. Après l’accusé, l’utilisateur a
    tout le temps qu’il veut (l’alerte, un enregistrement en cours). Une seule
    question à la fois.
  - **Passage de test** : `FABTICE_NO_CLOSE_GUARD=1` coupe la garde (jamais
    posée chez un utilisateur). Les tests de bout en bout ferment des apps qui
    tiennent des morceaux jamais enregistrés : `test/e2e/helpers.js` la pose par
    défaut ; seul `project-file.test.js` la rétablit pour essayer la fermeture.
  - Les raccourcis (cmd + S, cmd + Z, cmd + P…) sont écrits dans la barre de
    menus (`src/menu.js`) mais c’est la page qui les traite : voir « Barre de
    menus » plus bas.
- Pas de service worker dans l’app Mac : la version web hors ligne
  (`app/src/pwa/`) ne s’inscrit pas sur `fabtice://`, qui les refuse de toute
  façon, et la construction pour le Mac n’a ni manifeste ni `sw.js`.
- **Exports en dossier** (« Dossier pour Logic Pro… », « Projet Ableton
  Live… », étape 3 de la 1.0.0) : `src/folder-writer.js`. Le panneau
  d’enregistrement du système (« Enregistrer le dossier ») donne le nom et
  l’endroit ; l’app crée un dossier **neuf** (« nom 2 », « nom 3 »… si quelque
  chose porte déjà ce nom : rien n’est jamais remplacé), puis la page envoie
  chaque fichier par morceaux de 8 Mo (`fabtice:folder-write`, nom nettoyé,
  vérifié dans le dossier, créé une fois puis complété dans l’ordre). Un nom
  peut passer par des sous-dossiers (« Samples/Imported/01 Morceau.wav », trois
  au plus, chaque partie nettoyée, ni « . » ni « .. ») : l’app les crée.
  `fabtice:folder-abort` retire ce que l’export a écrit, puis les sous-dossiers
  qu’il a créés et le dossier, chacun s’il est vide ; `fabtice:folder-reveal` le
  montre dans le Finder. Pour montrer, la page reçoit le nom et l’endroit avec
  le dossier personnel écrit « ~ ». Elle reçoit aussi le chemin complet du
  dossier (`path`), seulement pour l’écrire **dans** un fichier qui doit dire
  où sont ses voisins : le projet Ableton Live, où Live 11 cherche un
  échantillon par son chemin absolu si le chemin relatif ne suffit pas. La page
  n’écrit jamais par chemin : seul le processus principal résout les noms dans
  le dossier.
- **Barre de menus** (étape 2 de la 1.0.0) : `src/menu.js`, en français.
  Fabtice (À propos, Réglages… cmd + ,, Quitter), Fichier (Nouveau projet → À
  partir d’un lien YouTube… / d’un fichier audio…, Ouvrir…, Ouvrir un projet
  récent, Enregistrer, Enregistrer sous…, Exporter → Audio… / iReal Pro /
  PDF… / Dossier pour Logic Pro… / Projet Ableton Live…, Imprimer…), Édition (Annuler, Rétablir, puis couper, copier, coller),
  Présentation, Fenêtre, Aide (Diagnostic…). Les commandes sont **celles du
  menu Fabtice de la page** (`app/src/ui/commands.ts`), sous les mêmes
  identifiants (`MENU_COMMANDS`, `LABELS`, `ACCELERATORS`).
  - La page dit à l’app ce qui est possible : canal `fabtice:menu-state`
    (pont `reportMenuState`), relu par `parseMenuState` ; la barre grise les
    commandes et reprend les libellés (« Annuler : accord »). Un clic dans la
    barre exécute `commandScript(id)` dans la page, qui reçoit l’événement
    `fabtice-menu-command` (`app/src/ui/menuBar.ts`).
  - **Un raccourci ne part qu’une fois** : sur macOS la barre reçoit le
    raccourci et la page aussi ; `menuBar.ts` ignore la commande de la barre
    si le clavier vient de la traiter (garde de 600 ms). Ailleurs les
    raccourcis ne sont pas enregistrés par la barre (`registerAccelerator:
    false`). Dans un champ de texte, cmd + Z défait la saisie ; hors champ,
    Édition → Annuler / Rétablir agissent sur le morceau.
  - « Quitter » de la page : canal `fabtice:quit` (pont `quitApp`), qui passe
    par la garde de fermeture.
  - Ajouter une commande : son identifiant dans `MENU_COMMANDS`, son libellé
    dans `LABELS`, son raccourci dans `ACCELERATORS`, puis `command('id')` à
    sa place dans le modèle. Test : `test/e2e/menu-bar.test.js`.
  - Imprimantes : canal `fabtice:list-printers` (pont `listPrinters`) ;
    `fabtice:print-chart` et `fabtice:save-chart-pdf` reçoivent le papier,
    l’imprimante et le nombre de copies (`parsePrintRequest` dans
    `src/printing.js`).
- Menu du clic droit, en français, pour toutes
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

**Étape 5 de la 1.0.0 (structure, modulations, grille simplifiée).** Rien à
changer côté Mac. Le petit modèle qui reconnaît les instruments à vent est
téléchargé au premier usage depuis Hugging Face, déjà autorisé par
`src/protocol.js` (même règle que les autres outils : somme SHA-256 vérifiée
par l'interface). « Ouvrir dans iReal Pro » est inchangé (il ouvre le lien que
l'interface lui donne, grille complète ou grille simplifiée, par
`openInIRealPro`), et le PDF de la grille simplifiée passe par le même chemin
que celui de la grille complète (`printChart`, `saveChartPdf`) : la feuille est
dessinée par l'interface.

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

- `FABTICE_NO_CLOSE_GUARD=1` : l’app ferme et quitte sans demander à la page si
  le projet a des modifications non enregistrées (voir « Garde de fermeture »
  plus haut) ; posée par `test/e2e/helpers.js` ;
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

Étape 1 de la 1.0.0 :

- `test/e2e/project-file.test.js` (étendu, derniers tests du fichier) : un
  morceau jamais enregistré, cmd/Ctrl + S demande où (dialogue
  « Enregistrer sous… », volet du système remplacé par une réponse du test),
  volet fermé sans choix : rien n’est écrit ; le titre montre le morceau puis le
  fichier, l’icône du fichier, le point « modifié » ; un changement puis
  cmd/Ctrl + S écrasent **le même** fichier, sûrement (temporaire puis
  renommage) et vite (les sons déjà encodés recopiés : CRC de chaque entrée
  comparées avant et après) ; un second fichier devient celui du projet ;
  fermer la fenêtre et cmd + Q avec des modifications non enregistrées
  demandent d’abord (« Annuler » reste, « Enregistrer » écrit puis quitte,
  « Ne pas enregistrer » ferme sans toucher au fichier) ; après un relancement
  le fichier est retrouvé ; un temporaire laissé par une écriture morte est
  supprimé ; un autre projet remis par le Finder pose la question des
  modifications. Une coupure en pleine écriture n’y est pas essayée (une
  écriture est ici trop rapide pour qu’on la tue au milieu) : c’est
  `test/unit/project-writer.test.js` qui le fait.
- `test/e2e/undo.test.js` (nouveau) : Ctrl + Z et Ctrl + Maj + Z (cmd sur Mac)
  défont et refont un changement du morceau, avec le menu Édition en place
  (rôles `undo` et `redo`) ; dans un champ de texte, le raccourci reste au champ.
- `test/unit/project-writer.test.js` (nouveau : écriture sûre, cible protégée,
  temporaire supprimé à l’échec, droits du fichier gardés, lien suivi, reprise
  depuis le début, nettoyage, fichiers retenus, plages de lecture, échec simulé
  en plein milieu et au renommage final) et `test/unit/close-guard.test.js` (nouveau : réponse,
  refus, accusé de réception, délai de 2 s, page disparue, une question à la
  fois).
- Une seule suite e2e de l’app Mac à la fois : tuer « electron » à l’aveugle
  coupe les tests d’un autre.

Les tests unitaires couvrent aussi `src/progress.js` (les lignes de progression
exactes du vrai yt-dlp) et `src/report.js` (le rapport copiable).

## Fabrication et publication

Tout passe par `.github/workflows/desktop-mac.yml`, sur les Mac de GitHub. Il
se lance à chaque envoi sur `main` qui touche `app/`, `desktop/`, le workflow
lui-même ou `CHANGELOG.md` (un envoi qui ne touche que d’autres documents ne
fabrique rien), et à la main (« Run workflow ») sur n’importe quelle branche.

### Ce que fait un envoi sur `main`, dans l’ordre

1. **Numéro de version** (`node ci/publish-release.js check`, à chaque
   passage, sur toutes les branches, avant toute fabrication) :
   `app/package.json` et `desktop/package.json` portent le même numéro, trois
   nombres (`1.0.0`), et le premier titre « ## » de `CHANGELOG.md` le nomme
   (« ## Version 1.0.0 … »). Sinon tout s’arrête, en rouge, avec la phrase qui
   dit quoi corriger. Le test `test/unit/publish-release.test.js` vérifie la
   même chose dans `npm test`.
2. **Interface** vérifiée et construite (`npm ci`, `typecheck`, `test`,
   `build:desktop` dans `app/`), puis les tests unitaires de l’app Mac.
3. **Les deux apps** construites sur un Mac à puce Apple : `.dmg` (ce qu’on
   télécharge) et `.zip` (ce que télécharge la mise à jour automatique), puis
   essayées : bout en bout avec le faux yt-dlp, essai complet de la mise à
   jour… L’app Intel est essayée ensuite sur un Mac Intel (tâche `intel`).
4. **Publication** (tâche `publish`), seulement sur `main` et seulement si
   les deux puces sont vertes, avec les fichiers fabriqués à l’étape 3, par
   `ci/publish-release.js` :
   1. la version `V` est lue dans `desktop/package.json`, l’étiquette est
      `vV` ;
   2. **déjà publiée ?** Si l’étiquette `vV` existe, ou une release `vV`
      publiée : **rien n’est publié ni modifié** (aucun fichier remplacé,
      aucune étiquette déplacée), le journal le dit (« RIEN À PUBLIER ») et
      la tâche finit en vert. Un envoi sur `main` sans nouveau numéro
      fabrique et essaie donc tout, mais ne republie pas. Si un **brouillon**
      `vV` traîne (fabrication interrompue au milieu) : rien non plus, mais en
      rouge, pour qu’on le supprime à la main sur GitHub avant de relancer ;
   3. `fabtice-version.json` est fait par `ci/make-version-file.js` à partir
      des deux `.zip` (adresses de l’étiquette `vV`), et les notes de la
      release : quel fichier télécharger (puce Apple ou Intel, comment le
      savoir, macOS 12 minimum, « Ouvrir l’app la première fois »), puis
      « Nouveautés » : exactement les notes du fichier de version (la
      première section de `CHANGELOG.md`, sans son titre) ;
   4. une release **brouillon** « Fabtice V » est créée pour `vV`, sur le
      commit envoyé. Un brouillon ne crée pas d’étiquette et ne se voit pas ;
   5. les cinq fichiers y sont envoyés : `Fabtice-mac-apple-silicon.dmg`,
      `Fabtice-mac-intel.dmg`, `Fabtice-mac-apple-silicon.zip`,
      `Fabtice-mac-intel.zip`, `fabtice-version.json` ; puis vérifiés : les
      noms exacts, les tailles, et les deux `.zip` et le fichier de version
      **retéléchargés** depuis GitHub, avec la même empreinte SHA-256 que
      dans le fichier de version ;
   6. le brouillon est **publié** : pas une préversion, marqué « dernière
      version » (`latest`). C’est à ce moment que GitHub crée l’étiquette
      `vV` sur le commit. Le script vérifie ensuite que la dernière version
      selon GitHub est bien `vV` et que l’étiquette est sur le commit.

   Un échec aux étapes 4 et 5 supprime le brouillon (seulement s’il est
   encore brouillon) et met la tâche en rouge : rien ne s’est vu, aucune
   étiquette n’a été créée. Un échec des vérifications après l’étape 6 met
   la tâche en rouge mais laisse la version publiée : à regarder à la main.
   Une fabrication sur `main` n’est jamais annulée par un envoi plus récent
   (elle peut être en train de publier) : le suivant attend son tour.
5. **Journaux** (tâche `ci-logs`) : l’état de chaque tâche, publication
   comprise, et la fin de chaque journal sont poussés sur la branche
   `ci-logs`, avec les notes et le fichier de version obtenus
   (`release/notes.txt`, `release/fabtice-version.txt`) :

```
git fetch origin ci-logs && git show FETCH_HEAD:STATUS.md
```

L’ancienne version de test (`desktop-dev`) n’est plus touchée par le
workflow.

### Publier la version suivante (par exemple 1.0.1)

1. Mettre `"version": "1.0.1"` dans `app/package.json` **et** dans
   `desktop/package.json` (puis `npm install --package-lock-only` dans les
   deux dossiers, pour que les `package-lock.json` suivent).
2. Ajouter en tête de `CHANGELOG.md` la section « ## Version 1.0.1 — <date> »,
   en français simple : c’est le texte de la page de la version et du
   message de mise à jour dans l’app.
3. Envoyer sur `main`. La fabrication publie `v1.0.1` et les apps installées
   la proposent à leur ouverture suivante.

Si le numéro existe déjà sur GitHub, rien n’est publié (voir plus haut) :
changer de numéro. Une étiquette ou une release n’est jamais remplacée ni
déplacée par le workflow.

### Lancement à la main et essai à blanc

Lancé à la main sur une autre branche que `main`, le workflow vérifie,
fabrique et essaie tout, exactement comme sur `main`, mais ne publie rien :
à la place de `publish`, la tâche `publish-dry-run` lance le même script avec
les mêmes fichiers en **essai à blanc** (`--dry-run`). Il fait pour de vrai
tout ce qui ne fait que lire (numéro, étiquette par `git ls-remote`, liste des
releases par `gh api`, fichier de version, notes, liste des cinq fichiers
avec tailles et empreintes) et écrit seulement la liste des commandes qu’il
lancerait. Le script refuse de toute façon de publier pour de vrai dans
GitHub Actions hors de `main`. En local :

```
node ci/publish-release.js publish --dry-run --assets <dossier des quatre fichiers> [--out <dossier>]
```

(`gh` absent ou non connecté : seule l’étiquette est vérifiée.) Les tests
unitaires essaient le script entier avec un faux `gh` (`test/unit/fake-gh.js`)
et un dépôt local à la place de GitHub : déjà publié, brouillon resté,
publication complète, fichier relu différent, envoi qui échoue.

### Listes distantes : rester lisible par les versions installées

Deux listes sont lues **sur `main`** par les versions déjà installées, au
moment où elles s’ouvrent : la liste des outils de séparation
(`app/src/separation/models.json`) et celle des recueils de grilles
(`app/src/standards/collections.json`), par `raw.githubusercontent.com`. Une
version installée n’est pas mise à jour en même temps que `main` : avant
d’envoyer un changement de l’une de ces listes, vérifier qu’il reste lisible
par le lecteur de la plus ancienne version encore installée (champ ajouté
qu’elle ignore, rien d’enlevé ou de renommé qu’elle exige). Sinon, publier le
nouveau format sous **un autre nom de fichier**, lu par les nouvelles
versions seulement, et laisser l’ancien en place. Même règle pour
`fabtice-version.json` (voir « Le fichier de version »).
