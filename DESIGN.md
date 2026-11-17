# Fabtice — design

Ce document fait référence pour toute l'interface. La maquette qui l'illustre
est dans `web/maquette/` (https://fabtice.netlify.app/maquette/).

## Intention

Un pupitre sous une lampe : du papier, de l'encre, une braise. L'app doit
donner l'impression d'un objet calme et chaleureux, pas d'un logiciel. La
chaleur vient de la couleur et de la typographie, jamais d'effets.

Trois règles tranchent en cas de doute :

1. **Le morceau d'abord.** Les formes d'onde et la grille d'accords occupent
   l'écran ; les commandes se font discrètes.
2. **Une seule chose rouge.** La braise désigne ce qui joue : le bouton de
   lecture et la tête de lecture. Rien d'autre.
3. **Simple en surface.** Tout ce qui n'est pas utile à quelqu'un qui ouvre
   l'app pour la première fois est rangé dans les réglages avancés.

Un seul thème, clair. Pas de mode sombre.

## Couleurs

| Jeton | Valeur | Usage |
|---|---|---|
| `--papier` | `#f4ecdf` | fond de l'app |
| `--papier-clair` | `#fbf6ec` | surfaces posées : transport, fenêtres |
| `--papier-fonce` | `#eadfcd` | creux : règle des mesures, survol |
| `--trait` | `#d8c8b0` | filets, bordures |
| `--trait-fin` | `#e6dac6` | filets secondaires, barres de mesure |
| `--encre` | `#2b1f17` | texte, accords |
| `--encre-douce` | `#6a5646` | texte secondaire, libellés |
| `--encre-pale` | `#a08c77` | éléments inactifs, jamais du texte à lire |
| `--braise` | `#c4502a` | lecture, tête de lecture |
| `--braise-sombre` | `#a23f1f` | braise au survol ou enfoncée |
| `--laiton` | `#b8873a` | boucle, sélection, solo |
| `--laiton-voile` | `rgba(184,135,58,.17)` | étendue de la boucle sur les pistes |

Teintes des pistes, sourdes et de même valeur, réservées aux formes d'onde et
à la pastille de la piste :

| Piste | Jeton | Valeur |
|---|---|---|
| Voix | `--voix` | `#b5533c` |
| Batterie | `--batterie` | `#6f5847` |
| Basse | `--basse` | `#85506b` |
| Guitare | `--guitare` | `#798043` |
| Piano | `--piano` | `#557886` |
| Vents | `--vents` | `#bd8a2c` |
| Autres | `--autres` | `#8d8176` |

Contrastes mesurés : encre sur papier 13,7 ; encre douce sur papier 5,9 ;
blanc sur braise 4,6. L'encre pâle (2,8) et le blanc sur laiton (3,2) sont
insuffisants pour du texte : sur le laiton, le texte est en encre.

Pas de dégradés, pas de transparence décorative, pas de violet ni de bleu vif.

## Typographie

- **Fraunces** (variable, licence OFL) pour ce qui se lit comme de la musique :
  le nom de l'app, le titre du morceau, les accords, les grands chiffres
  (temps, tempo, transposition). Axes utilisés : `opsz` selon la taille,
  `SOFT` entre 30 et 60.
- **Instrument Sans** (variable, licence OFL) pour tout le reste : libellés,
  boutons, menus. Chiffres tabulaires partout.

- **Noto Music** (licence OFL) pour les signes que les deux autres n'ont
  pas : bémol, dièse, bécarre, clés.

Les polices sont servies par l'app elle-même, jamais depuis un service tiers.

| Rôle | Police | Taille / graisse |
|---|---|---|
| Nom de l'app | Fraunces | 25 px / 560, le « t » en italique braise |
| Titre du morceau | Fraunces | 18 px / 480 |
| Accord | Fraunces | 18 px / 540 ; qualité à 74 %, extension en exposant |
| Grand chiffre | Fraunces | 22 à 28 px / 420–520 |
| Texte | Instrument Sans | 15 px / 400–600 |
| Libellé | Instrument Sans | 11 px / 600, capitales, interlettrage 0,09 em |

Les accords s'écrivent comme sur une grille de jazz :

- fondamentale en grand, qualité à 74 %, extensions en exposant (`A♭7` puis
  `13`) ;
- **majeur 7 : un triangle**, jamais « maj7 » ;
- bémol et dièse collés à la fondamentale, à 128 % de la taille du texte et
  légèrement remontés, épaissis pour s'accorder à la graisse de Fraunces ;
- mineur noté « m » par défaut, « – » au choix dans les réglages.

## Formes et espace

- Rayon de 5 px sur les boutons et les champs, 8 px sur les fenêtres. Le bouton
  de lecture est le seul objet rond.
- Filets de 1 px plutôt que des ombres. Une seule ombre, chaude et diffuse,
  sous les fenêtres ; une légère sous le bouton de lecture.
- Un grain de papier à 5 % d'opacité couvre tout l'écran.
- Cibles tactiles d'au moins 40 px ; le bouton de lecture fait 58 px.

## Écran principal

Deux affichages se partagent la zone centrale : **Pistes** et **Grille
d'accords**. La barre du haut et le transport ne changent pas de l'un à
l'autre ; boucle, tempo et tonalité y agissent de la même façon. L'affichage
actif est souligné à l'encre, pas à la braise. Un troisième affichage,
**Partition**, est dessiné et validé mais réservé à la v2 (voir plus bas).

De haut en bas, pour l'affichage Pistes :

1. **Barre du haut** (58 px) : le nom de l'app, qui est aussi le bouton du
   menu Fabtice (même allure, un petit chevron en encre douce, creux de papier
   au survol), le titre du morceau et ses états, puis les deux affichages.
   Toutes les commandes sont dans le menu Fabtice : une commande n'a qu'une
   place.
2. **Bandeau fixe** : courbe de tempo, accords, numéros de mesure. Il reste
   visible quand on fait défiler les pistes.
3. **Pistes** (74 px chacune) : à gauche la pastille de couleur, le nom, les
   boutons M (muet) et S (solo), le volume ; à droite la forme d'onde en deux
   tons, les crêtes claires et le corps plein.
4. **Transport** : à gauche le temps et la position (mesure, temps, boucle),
   puis la sous-grille (liste et bouton Triolets) ; au centre retour, lecture,
   boucle ; à droite tonalité, tempo, métronome.
5. **Outils d'affichage** : une petite barre posée en bas à droite des pistes,
   au-dessus du tempo — magnétisme (aimant), Auto, zoom horizontal, zoom
   vertical.

La grille des pistes a deux niveaux : les barres de mesure, nettes
(encre à 26 %), et la sous-grille, plus pâle (`--trait-fin`). La sous-grille
s'efface d'elle-même quand ses traits seraient à moins de 5 px l'un de l'autre.
La liste de la sous-grille va des blanches aux triples-croches ; un morceau
neuf s'ouvre sur « Noires ».

La boucle se lit à deux endroits : une bande de laiton pleine dans la règle des
mesures, un voile de laiton sur les pistes. Elle commence et finit sur la
sous-grille (ou librement, magnétisme éteint), pas forcément sur une barre de
mesure. La tête de lecture est un filet
braise coiffé d'un petit triangle.

Une piste coupée reste en place, sa forme d'onde tombe à 22 % d'opacité.

**Grille d'accords** : quatre mesures par ligne, barres de mesure à l'encre,
lettres de section encadrées, double barre aux changements de section. La
boucle est un voile de laiton sur les mesures concernées (une mesure bouclée en
partie n'est voilée que pour cette partie) ; la mesure en cours
se remplit d'un filet braise.

Chaque accord est écrit **à la place de son temps**, comme sur un Real Book :
à quatre temps, le temps 1 à la barre, le temps 3 au milieu de la mesure, les
temps 2 et 4 au quart et aux trois quarts ; à trois temps, trois places. Un
accord qui commence au milieu d'une mesure garde sa place. Deux accords ne se
touchent jamais et aucun ne sort de la mesure : quand deux symboles longs se
rencontrent, les accords de la mesure passent au palier de taille inférieur
(30, 22, 17, 14, 11 px), et sur un téléphone, où une mesure fait 90 px, ils
passent sur deux rangées plutôt que de devenir illisibles.

À droite de l'en-tête de la grille, après le choix Ut / Si♭ / Mi♭, un bouton
discret **Imprimer** (petite imprimante, encre douce, pas de braise) ouvre la
fenêtre d'impression (voir « Fenêtre d'impression »).

**Partition (v2)** : cet affichage n'est pas dans l'interface de la v1. Son
dessin est validé et conservé dans la maquette, à l'adresse
https://fabtice.netlify.app/maquette/#vue=partition : une page claire
(`#fffdf8`) posée sur le papier, la liste des instruments à cocher à gauche.
Plusieurs instruments cochés donnent un conducteur. Accords au-dessus de la
première portée, boucle et tête de lecture comme ailleurs. En v2, son onglet
prendra place après « Grille d'accords ».

## Menu Fabtice

Un clic sur le nom de l'app ouvre le menu sous lui : surface `--papier-clair`,
filet de 1 px `--trait`, rayon de 8 px, l'ombre chaude des fenêtres, Instrument
Sans 15 px à l'encre ; filets de séparation en `--trait-fin`. L'entrée survolée
ou atteinte au clavier se creuse en `--papier-fonce`. Les raccourcis sont à
droite, en `--encre-douce` 13 px (« cmd + Z », « Maj + cmd + Z » ; « Ctrl » hors
Mac). Les sous-menus s'ouvrent à droite, au survol ou au clic, marqués d'un
petit chevron en encre douce. Une entrée impossible reste lisible : encre
douce à 72 %. Aucune braise, aucune icône en couleur.

Sur téléphone, le menu est une feuille plein écran sur le papier clair :
en-tête de 52 px (« MENU » en libellé, ou « ‹ Retour »), titre du sous-menu en
Fraunces 22 px, entrées de 48 px, pas de raccourcis. Un sous-menu s'ouvre au
toucher, en liste emboîtée.

Dans l'app Mac, la barre de menus du système reprend les mêmes commandes aux
places habituelles ; une commande grisée dans l'app l'est aussi dans la barre.

## Réglages

Une fenêtre de la famille des fenêtres, large de 820 px au plus et haute de
580 px au plus, de même hauteur d'un onglet à l'autre ; le corps défile. Titre
en Fraunces 24 px, puis une rangée de sept onglets en Instrument Sans 14 px :
« Général », « Instruments », « Tempo et analyse », « Détection des accords »,
« Métronome », « Affichage », « Avancé ». L'onglet actif est souligné à l'encre
(2 px), comme les deux affichages, jamais à la braise ; survol
`--papier-fonce`. Flèches gauche et droite pour changer d'onglet ; Échap ou la
croix ferme. Le dernier onglet vu est retenu tant que l'app reste ouverte.

Chaque onglet se range en sections titrées en capitales, « Pour l'app » et
« Pour ce morceau » ; sans morceau ouvert, la seconde est grisée et dit
pourquoi en une phrase.

Sur téléphone, une feuille plein écran : d'abord la liste des sept onglets en
grosses lignes (58 px, chevron), un toucher ouvre l'onglet avec un bouton de
retour. Cases, curseurs et choix d'au moins 44 px ; la liste des raccourcis
clavier n'y figure pas.

Les petits panneaux (métronome, « Tempo et mesures », accordage) gardent leurs
commandes rapides et portent, en bas, un lien discret « Tous les réglages… »
vers l'onglet concerné.

## Chargement en cours

**Exception à « une seule chose rouge » (demande du propriétaire, 16 novembre
2026).** Le texte qui annonce une analyse ou une séparation en cours, dans la
barre du haut, prend la braise du « t » de Fabtice, un à deux pixels plus
grand que le texte voisin, et un reflet de lumière le parcourt de gauche à
droite toutes les 2,5 s (un dégradé découpé par le texte). Sans reflet quand
le système demande de réduire les animations : la couleur et la taille
restent. Une erreur ou un état terminé reprennent l'allure normale.

## Nouveau projet et message des grilles

« Nouveau projet » et le message « Grilles des standards » sont des fenêtres
de la famille : papier clair, titre en Fraunces, bouton principal plein **à
l'encre**, bouton secondaire en papier foncé. « Nouveau projet » ne montre que
ce qu'on a demandé (le lien, ou le fichier) ; au lancement, elle montre tout.
La case « Séparer les instruments » déplie la rangée des instruments, chacun
avec la pastille de sa teinte. Le message des grilles se pose par-dessus la
fenêtre d'ouverture, qui attend derrière ; pendant le téléchargement, un
pourcentage et un filet d'encre qui avancent régulièrement, le recueil en
cours et « n sur N ». Sur téléphone, ces fenêtres sont des feuilles posées en
bas, boutons empilés sur toute la largeur, le principal en premier, cibles
d'au moins 40 px.

## Fenêtre d'impression

Sur ordinateur, deux zones : à gauche l'aperçu, les feuilles blanches posées
sur un creux `--papier-fonce`, page par page (« Page 1 sur 3 ») ; à droite les
options (libellés en capitales, groupes de deux ou trois boutons, cases, une
liste pour l'échelle) puis, en bas à droite, « Enregistrer en PDF » et
« Imprimer ». **Le bouton principal d'une fenêtre est à l'encre, jamais à la
braise.** Sur téléphone, la fenêtre prend tout l'écran : aperçu en haut, pages
côte à côte, options dessous, les deux boutons collés en bas.

L'aperçu est exactement ce qui sort : mêmes feuilles, même pagination, une
feuille par page. Sur le papier, les règles de la grille restent vraies
(quatre mesures par ligne, accords à la place de leur temps, une seule taille
pour tous les accords, lettres de section, signatures aux changements, encre
sur blanc), avec le titre, la tonalité, le tempo et l'instrument en tête de la
première page, et un petit numéro de page en pied quand il y en a plusieurs.
Dans l'app Mac, l'imprimante et le nombre de copies se choisissent en haut des
options ; sans imprimante listée, la fenêtre du système s'ouvre.

## Fenêtre « Audio… »

« Exporter » ▸ « Audio… » : une fenêtre de la famille (papier clair, titre en
Fraunces, bouton principal **à l'encre**), large de 720 px au plus. Deux
colonnes sur ordinateur. À gauche, **Format** (trois boutons « Wave »,
« Flac », « MP3 », le choisi à l'encre) et ses réglages juste dessous (Wave : la
fréquence dans une liste et la quantification en trois boutons ; MP3 : le débit
constant dans une liste, 320 « meilleure qualité » ; Flac : une ligne), puis
**Durée** (deux cartes). À droite, **Quoi exporter** (deux cartes : « Le mix
complet », « Des pistes »), la liste des **pistes** à cocher, chacune avec la
pastille de sa teinte (grisée tant que le mix est choisi), et la case « Un
fichier par piste » avec sa phrase. Libellés en capitales de 11 px, comme les
autres fenêtres ; le choix en cours est cerné d'un filet d'encre, jamais de
braise. Une ligne discrète dit en une phrase que Fabtice travaille en 48 kHz
quand on choisit plus haut. Au pied, séparé par un filet : à gauche ce qui sera
fabriqué (le nom du fichier, ou le nombre de fichiers et l'archive) puis la
tonalité et le tempo choisis, à droite « Exporter ». Sur téléphone, une feuille
posée en bas, une colonne, cibles d'au moins 44 px, le bouton collé au pied sur
toute la largeur ; la liste des pistes se déroule en entier, la feuille défile.

## Téléphone

Sous 760 px de large : la colonne des pistes se réduit à 92 px (nom, M, S), la
zone des pistes défile horizontalement à 86 px par mesure, les deux
affichages deviennent une rangée d'onglets sous la barre du haut, toutes les
commandes sont dans le menu Fabtice (une feuille plein écran), et le transport s'empile en trois
rangs avec la lecture au pouce. Le zoom se fait en pinçant : la barre d'outils
ne garde que le magnétisme et Auto. La page elle-même ne défile jamais
horizontalement.

## Mouvement

- 140 ms pour un changement d'état (survol, bouton), 220 ms pour une entrée
  (fenêtre, piste coupée), courbe `cubic-bezier(.2,.7,.2,1)`.
- La tête de lecture et les formes d'onde avancent de façon linéaire, à
  60 images par seconde.
- Les fenêtres montent de 10 px en apparaissant. Rien ne rebondit, rien ne
  clignote.
- `prefers-reduced-motion` supprime les transitions.

## À ne pas faire

- Cartes à gros arrondis, dégradés, verre dépoli, ombres portées partout.
- Icônes en couleur, émojis, illustrations.
- Plus d'un accent par écran ; la braise ailleurs que sur la lecture.
- Texte en encre pâle, ou blanc sur laiton.
- Jargon : « stem » devient « instrument » ou « piste », « pitch » devient
  « tonalité ».
