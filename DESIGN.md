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

Les polices sont servies par l'app elle-même, jamais depuis un service tiers.

| Rôle | Police | Taille / graisse |
|---|---|---|
| Nom de l'app | Fraunces | 25 px / 560, le « t » en italique braise |
| Titre du morceau | Fraunces | 18 px / 480 |
| Accord | Fraunces | 18 px / 540 ; qualité à 74 %, extension en exposant |
| Grand chiffre | Fraunces | 22 à 28 px / 420–520 |
| Texte | Instrument Sans | 15 px / 400–600 |
| Libellé | Instrument Sans | 11 px / 600, capitales, interlettrage 0,09 em |

Les accords s'écrivent comme sur une grille de jazz : lettre de la fondamentale
en grand, qualité plus petite, extensions en exposant (`A♭7` puis `13`).

## Formes et espace

- Rayon de 5 px sur les boutons et les champs, 8 px sur les fenêtres. Le bouton
  de lecture est le seul objet rond.
- Filets de 1 px plutôt que des ombres. Une seule ombre, chaude et diffuse,
  sous les fenêtres ; une légère sous le bouton de lecture.
- Un grain de papier à 5 % d'opacité couvre tout l'écran.
- Cibles tactiles d'au moins 40 px ; le bouton de lecture fait 58 px.

## Écran principal

De haut en bas :

1. **Barre du haut** (58 px) : nom de l'app, titre du morceau, quatre menus au
   plus (Nouveau projet, Grille d'accords, Exporter, Réglages).
2. **Bandeau fixe** : courbe de tempo, accords, numéros de mesure. Il reste
   visible quand on fait défiler les pistes.
3. **Pistes** (74 px chacune) : à gauche la pastille de couleur, le nom, les
   boutons M (muet) et S (solo), le volume ; à droite la forme d'onde en deux
   tons, les crêtes claires et le corps plein.
4. **Transport** : à gauche le temps et la position (mesure, temps, boucle) ;
   au centre retour, lecture, boucle ; à droite tonalité, tempo, métronome.

La boucle se lit à deux endroits : une bande de laiton pleine dans la règle des
mesures, un voile de laiton sur les pistes. La tête de lecture est un filet
braise coiffé d'un petit triangle.

Une piste coupée reste en place, sa forme d'onde tombe à 22 % d'opacité.

## Téléphone

Sous 760 px de large : la colonne des pistes se réduit à 92 px (nom, M, S), la
zone des pistes défile horizontalement à 86 px par mesure, les menus se
replient derrière un seul bouton, et le transport s'empile en trois rangs avec
la lecture au pouce. La page elle-même ne défile jamais horizontalement.

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
