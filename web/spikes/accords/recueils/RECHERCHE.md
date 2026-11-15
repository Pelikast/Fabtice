# Recueils de grilles iReal Pro : où ils sont, comment les lire

Recherche faite pour la décision du propriétaire (CLAUDE.md, analyse, moyen 3) :
l'app retrouve la grille d'un standard par son titre, comme filet de sécurité
pour les accords. **Le dépôt ne contient aucune grille.** Il ne contient que des
adresses (`app/src/standards/collections.json`) et un lecteur du format
(`app/src/standards/`).

## Ce qui a pu être vérifié, et ce qui ne l'a pas pu

- Depuis le bac à sable, `irealpro.com`, `www.irealpro.com`, `forums.irealpro.com`
  et `blog.karimratib.me` sont refusés par le réseau (403 du proxy). **Aucune
  adresse officielle n'a donc été ouverte.** Toutes sont marquées `verified: false`
  dans la liste.
- Ce qui est établi vient de dépôts publics sur GitHub qui téléchargent ou
  copient ces listes (lus par `raw.githubusercontent.com`, recherche de code de
  l'API GitHub, clonage de dépôts publics). Les adresses de copies sur GitHub
  ont, elles, été ouvertes et lues : `verified: true`.
- Les listes réelles ont servi à tester le lecteur, dans un dossier hors du
  dépôt. Rien n'en a été copié dans le dépôt, pas même dans les tests.

## Les listes officielles (« Main Playlists »)

Page : **https://www.irealpro.com/main-playlists/** (citée par trois projets
libres indépendants : ireal-musicxml, JazzStandards, ChoCo).

| Liste | Morceaux | Remarque |
|---|---|---|
| Jazz 1460 | 1 460 (lu : 1 460) | Le grand recueil de standards. Avant : Jazz 1300, 1350, 1400 (même fil du forum, numéro 12753). |
| Brazilian 220 | 220 | Bossa nova, samba, choro. Avant : « Brazilian 150 » (copie ChoCo : 150 morceaux). |
| Latin 50 | 50 (lu : 50) | |
| Blues 50 | 50 (lu : 54) | |
| Pop 400 | 400 (lu : 403) | |
| Country 50 | 50 (lu : 50) | |

Les noms et les nombres viennent du code de trois outils qui les téléchargent
(importeur « official_playlists » du projet *changes*, démonstration *chirp*
d'ireal-musicxml, bibliothèque d'*openscribe*).

**Comment la page les livre : non vérifié.** Hypothèse la plus probable : la page
porte les listes sous forme de liens `irealb://…` (une liste = un grand lien,
jusqu'à 650 Ko d'adresse, le nom de la liste étant le dernier morceau après
`===`). Preuves indirectes : le format du fichier « Jazz 1460 » copié par les
projets est exactement ce lien, nu ; ireal-musicxml écrit qu'on peut y « téléverser
une des listes principales » ; le test de ChoCo lit ces liens. Si la page n'est pas
cela, mais un lien vers un fichier `.html`, `extractPlaylistFileLinks` le suit.
Confiance : moyenne.

## Le forum

Le forum a changé d'adresse : ancien `www.irealb.com/forums/showthread.php?<n>-<titre>`,
actuel **`forums.irealpro.com/threads/<titre>.<n>/`** (XenForo). Le numéro est
conservé : `https://forums.irealpro.com/threads/<n>/` doit rediriger (usage
standard de XenForo ; non vérifié ici).

Fils connus (le code de crawl d'*openscribe* donne les adresses actuelles ; les
numéros des autres viennent de liens du vieux forum cités dans des dépôts) :

| Fil | Numéro | Source | Confiance |
|---|---|---|---|
| Jazz 1460 Standards | 12753 | openscribe (adresse actuelle) ; ancien « Jazz 1300 Standards » | élevée |
| Brazilian 220 | 4414 | openscribe | élevée |
| Latin 50 | 8482 | openscribe | élevée |
| Blues 50 | 4782 | openscribe | élevée |
| Pop 400 | 8483 | openscribe | élevée |
| Country 50 | 6102 | openscribe | élevée |
| Dixieland Trad Playlists | 10591 | ancien lien `showthread.php?10591-Dixieland-Trad-Playlists` (dépôts TradJazz, Harmony-Analyzer) ; adresse actuelle déduite | moyenne |
| Gypsy Jazz | 215 | ancien lien `showthread.php?215-Gypsy-Jazz` ; adresse actuelle déduite | moyenne |

Livraison sur le forum : la liste est une **pièce jointe `.html`** (le fichier
que fabrique iReal Pro : une page avec un lien `irealb://…`). Le crawler
d'*openscribe* lit les fils sans compte et suit les adresses contenant
`/attachments/`. **Une connexion est-elle nécessaire pour les pièces jointes ?
Inconnu** : le crawler n'en utilise pas, ce qui laisse penser que non, mais je
n'ai pas pu le vérifier. À prévoir dans l'app : si la pièce jointe répond par une
page de connexion, ne rien garder et le dire simplement.

Autres listes de membres vues dans les jeux de données ChoCo (copie du forum,
2025) — **sans adresse établie ici**, donc absentes de la liste distante :
« Jazz Standard Bible » (~450 titres), « Real Book I / II / III », « Anton list »
(~280), « Engelbach list » (~500), « Brazilian 150 », « Samba e Pagode 460 »,
« Choro - Brasil » (~260), « Tradjazz list » (~190), « Jazz 1400 Standards »
(~1 400). Chaque fil existe dans l'index du forum ; il suffira d'ajouter son
numéro à `collections.json` (sans nouvelle version de l'app) quand le propriétaire
l'aura repéré. « Les plus téléchargés » : le nombre de téléchargements n'est pas
lisible d'ici, le choix repose sur la taille et la place dans l'index.

## Pour un musicien du jazz ancien

- **Dixieland / trad** : fil 10591, plusieurs listes (environ 970 titres
  distincts, avec beaucoup de doublons d'une liste à l'autre), dont « Dixieland
  Tunes 1 » (233 morceaux, lue ici : *Muskrat Ramble*, *Tiger Rag*, *Tin Roof
  Blues*, *When the Saints*…). Le lecteur gère les doublons en laissant
  l'appelant garder toutes les variantes d'un titre.
- **Jazz manouche** : fil 215 (environ mille titres distincts, doublons compris).
- Jazz 1460 contient aussi l'essentiel du swing des années 30 à 40.

## Droits et conditions

- Aucun des sites ne publie de licence pour les grilles. Les conditions du forum
  disent que les auteurs gardent leurs droits et n'accordent de licence qu'à
  l'exploitant du site (lu dans un audit de licences public, 2026-11-07).
  ChoCo parle de « domaine public » sans le justifier.
- Une suite d'accords n'est pas en soi une œuvre protégée dans la plupart des pays,
  mais le recueil et sa mise en forme peuvent l'être. D'où la règle de CLAUDE.md :
  rien dans le dépôt, téléchargement à la demande de l'utilisateur, copie gardée
  sur son appareil, source et incertitude affichées (`licence`, `licenceUnclear`).
- Il n'a pas été vu d'interdiction écrite de lecture automatique. Agir poliment :
  un seul téléchargement par liste, jamais en boucle, un en-tête
  `User-Agent` honnête, aucun contournement de connexion.

## Copies sur GitHub (repli, vérifiées)

Adresses figées à une révision, donc stables. Contenu lu ici :

| Liste | Adresse | Morceaux lus |
|---|---|---|
| Jazz 1460 | `infojunkie/ireal-musicxml@3101d352…/test/data/jazz1460.txt` | 1 460 |
| Blues 50 | idem, `blues50.txt` | 54 |
| Pop 400 | idem, `pop400.txt` | 403 |
| Country 50 | idem, `country.txt` | 50 |
| Latin 50 | `smashub/choco@5fe168fd…/partitions/ireal-pro/raw/playlists/latin_playlist.txt` | 50 |

Ce sont des copies faites par des tiers dans des dépôts de test ou de recherche
(GPL-3.0 pour le premier, CC BY 4.0 revendiquée pour le second, pour *leur*
contenu — pas pour les grilles). Elles sont marquées `role: "mirror"` : le
propriétaire peut les retirer de la liste distante d'un simple changement du
fichier. Pas de copie pour Brazilian 220 (les copies ne font que 150 morceaux).
Avantage : GitHub envoie `access-control-allow-origin: *`, donc **la version web
peut les lire directement**, sans l'app Mac.

Un autre miroir existe (`blog.karimratib.me/demos/chirp/data/<nom>.txt`, les six
listes officielles) ; il est injoignable d'ici et dépend du blog d'un tiers : non
retenu.

## Comment l'app Mac les télécharge en un clic

Le processus principal (Electron) fait la requête, car une page ne peut pas lire un
autre site. Pour chaque collection choisie, dans l'ordre de `pages` :

1. `GET` de l'adresse (https, hôte de `COLLECTION_HOSTS` seulement, redirections
   permises dans le même hôte, taille limitée à quelques mégaoctets, délai de 30 s).
2. Selon `kind` :
   - `ireal-url-file` : le texte est le lien.
   - `html-with-ireal-links` : `extractIRealLinks(texte)` ; si `followAttachments`,
     ou s'il n'y a aucun lien, `extractPlaylistFileLinks(texte, adresse)` donne les
     pièces jointes à télécharger à leur tour (jusqu'à une trentaine), puis on
     cherche les liens dans chacune.
3. `readIRealPlaylists(texte)` (une liste par lien), puis `selectPlaylists(collection,
   listes)` : on garde la liste dont le nom commence par `playlistName`, ou toutes
   (fil de forum) ; refus si le total est sous `minTunes` (téléchargement tronqué,
   mauvaise page, page de connexion).
4. Si la page ne donne rien de bon, passer à l'adresse suivante. Si aucune ne
   marche : un message simple, sans erreur technique.
5. Garder sur l'appareil le **texte brut** téléchargé (relisable avec une version
   plus récente du lecteur), pas l'analyse.

Le CSP de la fenêtre (`desktop/src/protocol.js`) n'est pas concerné par le
téléchargement du processus principal. Il le serait pour le chargement de
`collections.json` par la page (`connect-src` doit contenir
`https://raw.githubusercontent.com`, déjà utile pour `models.json`).

## Version web

- Les pages officielles et du forum ne sont presque certainement pas lisibles
  depuis une page (pas d'en-têtes CORS ; non vérifié). La version web propose donc :
  1. l'**import d'un fichier** : l'utilisateur enregistre la liste (le `.html` du
     forum, ou le lien) et la donne à l'app ; `readIRealText` lit les deux ;
  2. le téléchargement direct des **copies GitHub** (CORS ouvert), si le propriétaire
     les garde.
- Même contenu gardé sur l'appareil (IndexedDB).

## Risques et ce que l'app doit faire avec prudence

- Adresses officielles non vérifiées : prévoir l'échec silencieux, le repli sur
  l'adresse suivante, et la possibilité de corriger `collections.json` sans
  publier de version.
- Le site officiel peut passer derrière une protection anti-robot ou une
  connexion : détecter l'absence de lien `irealb://`, ne rien contourner.
- Les listes contiennent des fautes (accords, tonalités, titres) et des doublons :
  la grille n'est qu'un a priori, jamais ce qui est entendu.
- Taille : Jazz 1460 fait environ 650 Ko en lien, 1,3 Mo d'adresse selon la version ;
  lecture en 150 ms ici. Garder le texte, pas de l'analyse de 1 460 grilles.
- Titres de vidéos bruités : le seuil du moteur de titres (0,88) préfère ne rien
  rendre qu'une mauvaise grille.
- Formats : `irealb://` (lu), `irealbook://` ancien (lu). Les titres longs en deux
  parties (« Titre 1 », « Titre 2 ») ne sont pas recollés.
