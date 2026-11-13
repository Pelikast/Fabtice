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

Trois affichages se partagent la zone centrale : **Pistes**, **Grille
d'accords**, **Partition**. La barre du haut et le transport ne changent pas
de l'un à l'autre ; boucle, tempo et tonalité y agissent de la même façon.
L'affichage actif est souligné à l'encre, pas à la braise.

De haut en bas, pour l'affichage Pistes :

1. **Barre du haut** (58 px) : nom de l'app, titre du morceau, puis Nouveau
   projet, les trois affichages, Exporter, Réglages.
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

La boucle se lit à deux endroits : une bande de laiton pleine dans la règle des
mesures, un voile de laiton sur les pistes. La tête de lecture est un filet
braise coiffé d'un petit triangle.

Une piste coupée reste en place, sa forme d'onde tombe à 22 % d'opacité.

**Grille d'accords** : quatre mesures par ligne, barres de mesure à l'encre,
lettres de section encadrées, double barre aux changements de section. La
boucle est un voile de laiton sur les mesures concernées ; la mesure en cours
se remplit d'un filet braise.

**Partition** : une page claire (`#fffdf8`) posée sur le papier, la liste des
instruments à cocher à gauche. Plusieurs instruments cochés donnent un
conducteur. Accords au-dessus de la première portée, boucle et tête de lecture
comme ailleurs.

## Téléphone

Sous 760 px de large : la colonne des pistes se réduit à 92 px (nom, M, S), la
zone des pistes défile horizontalement à 86 px par mesure, les trois
affichages deviennent une rangée d'onglets sous la barre du haut, les autres
menus se replient derrière un seul bouton, et le transport s'empile en trois
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
