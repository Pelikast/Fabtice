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

**Ce qu'on imprime** (C14) : un groupe de la colonne des options, avant « Marges »,
dont les choix s'empilent (« Grille complète », « Grille complète simplifiée »,
« Une section ») dans une même famille « duo » à l'encre ; « Grille complète
simplifiée » n'est proposée que lorsque la grille simplifiée existe, « Une
section » est grisée (à 50 %) quand le morceau n'a aucune partie. « Une section »
déplie sous elle la liste des parties, avec leurs lettres (« Thème 1 · AABC »).
La fenêtre s'ouvre sur ce que l'écran montre : la grille entière, ou la partie
affichée. Imprimer une section ne met que ses mesures, avec leurs numéros ; une
ligne discrète le dit sous le titre (« Thème 1 · mesures 3–10 », 10 pt, encre).
Quand la forme du morceau est connue, une ligne « Forme : AABC » (même corps)
vient sous la ligne de la tonalité et du tempo ; la case « Forme » du groupe
« En-tête » la retire.

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

## Fenêtres « Dossier pour Logic Pro… » et « Projet Ableton Live… »

Une même fenêtre pour les deux exports vers un séquenceur, de la famille
(papier clair, titre en Fraunces, bouton principal à l'encre). Avant
l'export : une phrase qui dit ce qu'est le dossier, puis son contenu en
lignes séparées par des filets fins (les pistes, le fichier MIDI, le mode
d'emploi), un avis sur un filet de laiton (« Le volume, le muet et le solo ne
s'appliquent pas »), la tonalité et le tempo choisis, « Annuler » et « Créer
le dossier ». Pendant : la jauge et son pourcentage, la piste en cours,
« Annuler ». À la fin : où est le dossier (app Mac : « Afficher dans le
Finder » ; app web : « Enregistrer l'archive »), puis le mode d'emploi en
gestes numérotés, chaque numéro dans un petit cercle au trait d'encre.
**« À l'essai »** : une pastille en braise, petites capitales, en tête d'un
encadré au filet de braise à gauche ; c'est la seule autre exception, avec le
texte de chargement, à « la braise reste à ce qui joue », et elle est réservée
à ce qui n'a pu être essayé par personne. Sur téléphone, une feuille posée en
bas, une colonne, boutons sur toute la largeur.

## Fenêtres du menu de la mesure

**« Correction du tempo en tapant »** : une petite fenêtre de la famille
(papier clair, titre en Fraunces, bouton principal à l'encre), **posée
au-dessus du transport sans rien assombrir** : la règle des mesures et la tête
de lecture restent visibles et vivantes, car l'utilisateur les regarde en
tapant. Pendant les tapes : un anneau en trait d'encre qui bat d'un voile de
laiton à chaque tape, la consigne du moment (« Écoutez le décompte… » puis
« À vous : tapez sur chaque temps »), le nombre de tapes et « Ok, j'ai fini ».
Le refus est une phrase calme sur un filet de laiton, avec « Réessayer » ; à
la vérification, une ligne dit sans chiffres inutiles ce qui a été compensé.
Sur téléphone, une feuille posée en bas (62 % de la hauteur pendant les tapes)
dont la zone à toucher remplit presque toute la feuille, boutons de 48 px sur
toute la largeur, le principal en premier ; la règle reste en vue au-dessus.

**« Changer la signature rythmique »** : petite fenêtre sur le voile habituel ;
deux cases de 64 px en Fraunces 40 px, séparées par un trait d'encre de 3 px
qui dépasse un peu, comme une signature écrite ; le bouton principal est
d'encre ; la phrase sur la noire a le filet de laiton des notes ; aucune
erreur en rouge, une ligne calme réservée sous les cases. Sur téléphone, une
feuille en bas.

**Sur la règle** : la signature en chiffres superposés (Fraunces 600, 12 px,
encre), à droite de la barre de la mesure où elle change, le numéro de mesure
poussé après elle ; omise plutôt que de chevaucher. **Métronome** : le choix
de la signature réglée est une rangée de boutons de la famille « duo »,
au-dessus du groupement ; les temps d'une longue mesure sont de petits boutons
séparés, en grille.

## Colonne de la structure

Dans l'affichage **Grille d'accords**, la grille (quatre mesures par ligne) occupe
80 % de la largeur, à droite ; une **colonne de 20 %** à gauche porte la
liste interactive du morceau. Elle est posée sur le même papier que la
grille, sans carte ni fond propre : un simple filet de 1 px (`--trait-fin`)
la sépare de la feuille, et son haut s'aligne sur le titre du morceau. Elle
défile seule quand la liste est longue ; la grille garde son propre
défilement.

De haut en bas : **« Forme globale : AABC »** en Fraunces 19 px, un titre
qu'on ne modifie pas (« Forme globale : — » quand elle est inconnue) ;
**« Mode : »** en libellé, puis deux boutons de la famille « duo » (Jazz,
Pop ; le mode en vigueur est plein à l'encre) et un petit « Auto » encadré
d'un filet d'encre tant que c'est Fabtice qui choisit ; les deux
affichages, **« Affichage complet »** et **« Grille complète simplifiée »**,
en Instrument Sans 15 px ; **« Sections : »** en libellé, puis les parties,
chacune une ligne séparée par un filet fin : son nom, ses lettres en texte
discret (12,5 px, encre douce) sous le nom, un petit bouton **« Boucle »**
(filet `--trait`, texte encre douce) et un crayon. En bas, des liens
discrets : « Ajouter une partie », et seulement quand il y a quelque chose
à défaire, « Revenir à la structure de l'analyse » et « Revenir aux lettres
de l'analyse ».

**Ce qui est choisi, ce qui joue, ce qui boucle.** L'affichage montré (ou la
partie montrée) est cerné d'un filet d'encre, jamais de braise. La partie
qu'on entend est marquée par une petite barre d'encre dans la marge et un nom
plus gras, posés directement dans le DOM par la boucle d'images (comme la
mesure en cours de la grille). Le bouton « Boucle » d'une partie dont la
boucle est active prend le laiton (filet `--laiton`, voile `--laiton-voile`,
texte à l'encre). Une partie corrigée à la main le dit sur sa propre ligne, en
italique, sous ses lettres (« Corrigée à la main ») ; celles de l'analyse ne
disent rien. Le nom d'une partie tient sur une ligne quand la colonne le permet
(14,5 px) ; « Boucle » et le crayon restent à droite.

**Au-dessus des mesures**, quand elles ne sont pas toute la grille, une ligne
discrète (13,5 px, encre douce) : « Thème 1 · mesures 3–10 », ou, quand le
morceau n'a pas de forme à replier (la grille simplifiée n'existe pas), « Ce
morceau n'a pas de forme à replier : la grille est affichée en entier. »
Quand elle existe, c'est la section « Grille complète simplifiée » ci-dessous.

**Fenêtre « Modifier la partie » / « Ajouter une partie ».** Une fenêtre de
la famille (papier clair, titre en Fraunces, bouton principal **à l'encre**),
large de 480 px au plus : le **type** en puces (celles du mode d'abord, un
petit écart, puis les autres), le **numéro** et l'**instrument** en listes,
les **limites** en deux cases (de la mesure… à la mesure…, comptées comme on
les lit, la première mesure étant la 1), une phrase calme en cas d'erreur
(cases cernées de laiton, aucun rouge), le lien « Supprimer cette partie »,
« Annuler » et « Valider » (« Ajouter » pour une nouvelle partie).

**Téléphone.** Pas de colonne : une **barre discrète** sous le titre de la
grille, sur toute la largeur, filets en haut et en bas, collée en haut de la
feuille quand on la fait défiler : « **Forme globale : AABC** · Thème 1 »
(la forme, puis l'affichage en cours) et un chevron. Un toucher ouvre une
**feuille posée en bas** (82 % de la hauteur au plus, angles hauts arrondis,
voile habituel) avec la même liste ; choisir un affichage ou une partie, ou
toucher « Boucle » ou le crayon, la referme. Cibles d'au moins 40 px
(boutons de 42 à 46 px). La fenêtre d'une partie est, elle aussi, une feuille
posée en bas, boutons sur toute la largeur.

## Grille complète simplifiée

L'affichage « Grille complète simplifiée » écrit le morceau sur une page, comme
un Real Book : chaque section une seule fois, les reprises repliées. Il remplace
les mesures de la grille, sous le même titre, et garde le langage de la grille :
mêmes cases (`.case`), accords à la place de leur temps, **une seule taille
pour tous les accords** de la page, signatures aux changements, pastille de
modulation (« Ton : A♭ », qu'on lit sans qu'elle s'ouvre).
**Les mesures n'ont pas de numéro** : une mesure écrite en représente
plusieurs jouées.

**La ligne de forme** d'abord, en Instrument Sans 14,5 px, encre douce, qui
passe à la ligne sans bruit : « **Forme :** Intro, Thème 1 (AABC), Solo (Piano)
(AABC), Solo (Trompette) (AA), Thème 2 (BC) » (noms de `partName`, lettres de
la forme). Chaque partie est un texte cliquable (encre, papier foncé au
survol) qui place la tête de lecture au début de la partie, sans rien changer
d'autre. Dessous, une ligne en italique, encre douce, 13 px : « Pour corriger un
accord, passez par l'affichage complet. » : c'est dit une fois, il n'y a ni
avertissement ni fenêtre quand on essaie, simplement rien ne s'ouvre.

**Un bloc par section écrite.** Son titre d'abord : la lettre encadrée comme
sur la grille (« A », « B », « A2 » pour une section dont la fin diffère), ou,
pour ce qui est hors des lettres, le nom de la partie dans le style des
étiquettes (INTRO, OUTRO, SPÉCIAL : 12 px, capitales espacées, encre douce) ;
puis les mesures, quatre par ligne ; une section plus courte (une intro d'une
mesure) n'écrit que ses mesures. Une mesure qui continue l'accord d'avant porte
le signe de répétition de la grille (𝄎, le même glyphe, le même style : c'est
le « % » du Real Book), jamais un accord recopié.

**Les reprises, dessinées** (CSS, jamais une image) : quand un passage est joué
deux fois de suite, une double barre de reprise épaisse-fine suivie des deux
points ouvre sa première mesure, les deux points suivis de fine-épaisse
ferment sa dernière, et « ×2 » (12,5 px, 640, encre douce) est écrit en haut
de cette dernière mesure. La dernière mesure du morceau se ferme par la double
barre finale (fine, épaisse). Sur le papier les mêmes signes sont faits de
bordures (un navigateur n'imprime pas les fonds : une bordure s'imprime
toujours).

**Le suivi.** La mesure écrite qui correspond à l'audio se remplit du même filet
de braise que la mesure jouée de la grille complète (le trait qui avance dans
la mesure) ; la mesure jouée est cherchée dans la grille simplifiée, et ce qui
n'y est pas ne s'allume pas. Tant qu'un passage joué plusieurs fois se joue, **le
titre de son bloc dit quelle fois c'est**, à droite, en encre douce 13 px,
chiffres tabulaires : « 2ᵉ fois » (jusqu'à quatre passages), « reprise 3/6 » au
delà (la même mesure écrite joue à chaque chorus) ; rien pour une mesure jouée
une seule fois. La feuille suit la ligne qui joue et, quand le même passage
revient, glisse en douceur (pas de saut). La partie jouée est marquée dans la
colonne, comme avant.

**Les gestes.** Un clic ou un toucher sur une mesure écrite va à **sa prochaine
occurrence** après la tête de lecture (la première quand il n'y en a plus) ; on
l'entend aussitôt en lecture. Glisser sur plusieurs mesures écrites (au doigt :
appuyer, tenir, glisser) sélectionne en boucle les mesures jouées de la
prochaine occurrence où elles se suivent dans le jeu, voilées en laiton sur les
mesures écrites ; sur un passage dont les mesures ne se suivent pas dans le
temps la sélection par glissement ne fait rien (la boucle reste ce qu'elle
était). Clic droit, appui long, clic sur un accord ou sur une pastille : rien
ne s'ouvre (l'éditeur d'accord, le menu de la mesure et la fenêtre des
modulations agissent sur des mesures jouées : c'est dans « Affichage complet »).

**Au téléphone** les mesures ont la taille de la grille du téléphone (76 px de
haut) et la feuille de la structure s'ouvre par-dessus, comme avant.

**Sur le papier** (« Ce qu'on imprime ▸ Grille complète simplifiée ») : le même
dessin, noir sur blanc ; un bandeau de 9 mm au-dessus de la première ligne de
chaque bloc porte son titre ; la ligne « Forme : … » est écrite en entier sous
le titre, sur autant de lignes qu'il faut ; le morceau de l'exemple tient sur
une page A4 à 100 %. L'aperçu est la page.

## Modulations

Quand la tonalité change en cours de morceau, la grille le dit **au-dessus de
la mesure où le passage commence**, pas ailleurs : une petite **pastille**
(filet `--trait` de 1 px, coins arrondis, 18 px de haut, Instrument Sans
11,5 px à 600, ♭ et ♯ en Noto Music comme les accords) qui écrit
**« Ton : E »** (la nouvelle tonalité, dans l'écriture de la grille : elle suit
la transposition, l'instrument Si♭ ou Mi♭ et le choix « m » ou « – » du
mineur). Ni braise, ni laiton : la modulation n'est ni la lecture ni la boucle.
Elle partage la ligne du haut de la mesure avec la lettre de section (à sa
droite, 5 px d'écart), le numéro de mesure reste dans l'angle droit et la
signature rythmique sous la ligne ; si la place manque, la pastille passe à
la ligne de la rangée et disparaît plutôt que de recouvrir quoi que ce soit.
Sur téléphone, seule la tonalité est écrite (« E », « A♭ »).
Une mesure à deux rangs d'accords démarre ses rangs 29 px plus bas (26 px pour
une lettre seule), pour que les exposants des accords ne touchent pas la
pastille.

**Analyse ou main, dit sans bruit.** Texte en encre douce et filet clair tant
que les modulations sont celles de l'analyse ; dès que l'utilisateur en a
touché une, toute la liste est la sienne et les pastilles passent à l'encre
(filet `--encre-pale`). Le survol d'une pastille donne le papier clair. Le
titre « Tonalité de A♭ » au-dessus de la grille reste la tonalité principale.

**Sur le papier**, la même pastille, en encre sur blanc, avec la lettre de la
mesure à sa gauche ; l'aperçu est le papier (le PDF a le même texte).

**Sur la frise de « Pistes »**, la barre de mesure où la tonalité change est
tracée un peu plus forte (2 px) et la tonalité s'écrit dans une petite pastille
après le numéro de mesure (ou la signature) ; elle est omise, jamais serrée ni
posée sur autre chose, quand il n'y a pas la place avant la barre suivante.

**Fenêtre « Modifier la modulation » / « Changer de tonalité ».** Un clic ou un
toucher sur la pastille l'ouvre (sans déplacer la tête de lecture ni choisir de
boucle) ; le menu de la mesure (clic droit, appui long) aussi, avec
« Changer de tonalité à partir de cette mesure… » sur une mesure sans
modulation, « Modifier la modulation… » et « Supprimer la modulation » sur une
mesure qui en porte une. Même famille que la fenêtre de la tonalité : papier
clair, titre en Fraunces, « Tonalité d'avant : A♭ » en encre douce, le choix
Majeur / Mineur, les douze notes en grille de six, la case « À partir de la
mesure » (le numéro qu'on lit sur la grille) ; en dessous une phrase calme en
cas de souci (« C'est déjà la tonalité de ce passage. », « Il y a déjà une
modulation à cette mesure. », « Une mesure de 2 à 25. », jamais de rouge,
la case est alors cernée de laiton), une ligne en italique qui dit d'où vient
la modulation (« Trouvée par l'analyse. » / « Écrite à la main. »), les liens
« Supprimer la modulation » et, seulement quand la liste est celle de
l'utilisateur, « Revenir aux modulations de l'analyse » (aussi dans la fenêtre
de la tonalité principale), puis « Annuler » et le bouton principal **à
l'encre** (« Valider », ou « Changer de tonalité » pour une nouvelle). Sur
téléphone : feuille posée en bas, boutons sur toute la largeur, cibles d'au
moins 40 px. La fenêtre ignore le pointeur 350 ms après son ouverture, et le
menu d'une mesure ouvert par un appui long ignore les clics jusqu'à 400 ms
après que le doigt s'est levé : le clic que le navigateur peut envoyer à ce
moment-là ne doit rien choisir.

## « Ouvrir dans iReal Pro » dans l'app web

Le navigateur suit le lien `irealb://` au geste de l'utilisateur, puis surveille
la page pendant un instant (1,6 s). Si une application a pris le lien, la page
est cachée ou perd le focus et rien n'est dit. Si la page est restée visible,
un avis calme, de la famille de l'avis de stockage (papier clair, filet de
1 px, **filet de laiton à gauche**, jamais de braise), se pose au-dessus du
transport : « Si rien ne s'est ouvert, iReal Pro n'est pas installé sur cet
appareil, ou le navigateur a bloqué l'ouverture. Vous pouvez enregistrer le
fichier et l'ouvrir depuis iReal Pro. », avec « Enregistrer le fichier… » et
« Fermer » (deux boutons de la famille `bouton-cadre`). Un lien trop long pour
être suivi enregistre le fichier tout de suite et le dit en une phrase, avec
« Fermer » seul. Sur téléphone, l'avis est sur toute la largeur, les boutons
côte à côte, de 44 px.

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
