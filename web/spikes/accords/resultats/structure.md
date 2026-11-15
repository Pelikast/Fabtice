# Banc accords — preuves de structure : reprises, grille connue, fiabilité

Mesuré le 15 novembre 2026 sur le banc de `web/spikes/accords/` (code :
`app/src/analysis/engine/{evidence,repeats,knownChart,reliability}.ts`, évaluation :
`banc/structure.ts`). Rapport complet produit par le banc : `structure-detectee.md`
(grille détectée) et `structure-vraie.md` (vraie grille).

```sh
node banc/build-structure.mjs
node recueils/telecharger.mjs        # une fois : les recueils (copies publiques figées), dans data/recueils/
node dist/structure.mjs --fit        # base, reprises, grille, les deux ; acceptation des grilles ; fiabilité
```

## Méthode

- **Partage dev / contrôle** : celui de l'autre chantier des accords
  (`banc/partage.json`, branche `accords-ecoute`), pour que tout le programme mesure
  sur la même moitié de contrôle. Les réglages ont été choisis sur « dev » ;
  « contrôle » ne sert qu'à mesurer. *Attention* : nos premiers réglages avaient été
  faits sur un autre partage (la règle de la consigne, alternance par style), publié
  ici avant que celui de l'autre chantier n'existe ; en adoptant le sien, quelques
  morceaux réglés en « dev » sont passés en « contrôle » (Ipanema, So What, et
  d'autres sans titre). Nous avons revérifié chaque réglage sur le nouveau « dev »
  (même choix retenu à chaque fois, voir plus bas) et réglé la fiabilité sur lui
  seul ; le contrôle reste donc presque aveugle, pas tout à fait.
- **Titre bruité** : la grille connue est cherchée avec un titre abîmé comme ceux
  d'un lien vidéo (« Quartet - so what - take 2 », « AUTUMN LEAVES | Official
  Audio », « … (Live, 1958) [Remastered] », « … feat. the Trio (1961) »).
- **Recueils** : Jazz 1460, Latin 50, Blues 50, depuis les copies publiques
  vérifiées de `app/src/standards/collections.json` (révisions figées), dans
  `data/recueils/` (jamais dans le dépôt) ; 1 564 grilles. Le Brésil 220 n'a pas de
  copie vérifiée : Ipanema et Blue Bossa sont trouvés dans Jazz 1460.
- **Mesures réharmonisées** : une mesure d'une grille après la première dont les
  accords (fondamentale et couleur, temps par temps) diffèrent de la même mesure de
  la première grille, d'après la vérité (substitution tritonique, II ajouté,
  diminué de passage, maj7 ↔ 6…). C'est là qu'on voit si les reprises et la grille
  connue « recopient bêtement ».

## Résultats, grille détectée (par temps ; « couleur » = fondamentale + qualité exacte)

*base* : l'analyse actuelle de l'app ; *reprises* : + `repeats.ts` ; *grille* : + grille
connue (titre bruité) ; *les deux* : les deux preuves dans le même calcul.
*Manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un
accord où plusieurs le sont. *Réharm.* : couleur juste sur les temps des mesures
réharmonisées (215 temps en dev, 219 en contrôle) ; *reprises* : sur les mesures
rejouées à l'identique.

### Contrôle (jamais réglé dessus)

| Son | Variante | Fondamentale | Couleur | Manqués | En trop | Réharm. | Reprises |
|---|---|---|---|---|---|---|---|
| synthèse, propre | base | 68,8 % | 55,6 % | 69,9 % | 12,2 % | 27,9 % | 54,8 % |
| | reprises | 69,9 % | 57,2 % | 64,0 % | 15,8 % | 32,4 % | 55,8 % |
| | grille | 75,5 % | 64,6 % | 71,3 % | 8,7 % | 26,0 % | 63,3 % |
| | **les deux** | **75,9 %** | **65,9 %** | 64,7 % | 10,8 % | 32,4 % | 64,3 % |
| synthèse, vieux disque | base | 60,0 % | 47,2 % | 67,6 % | 13,7 % | 25,1 % | 43,8 % |
| | reprises | 60,6 % | 48,2 % | 65,4 % | 16,2 % | 24,2 % | 45,6 % |
| | grille | 67,5 % | 57,2 % | 69,1 % | 10,4 % | 24,2 % | 51,2 % |
| | **les deux** | **67,7 %** | **56,8 %** | 66,9 % | 10,9 % | 23,7 % | 51,2 % |
| GuitarSet | base | 84,7 % | 69,2 % | — | 16,5 % | — | — |
| | les deux | 84,9 % | 69,5 % | — | 16,5 % | — | — |
| GuitarSet, vieux disque | base | 88,5 % | 73,4 % | — | 12,5 % | — | — |
| | les deux | 88,5 % | 74,0 % | — | 12,5 % | — | — |

### Développement

| Son | Variante | Fondamentale | Couleur | Manqués | En trop | Réharm. | Reprises |
|---|---|---|---|---|---|---|---|
| synthèse, propre | base | 71,1 % | 59,3 % | 59,8 % | 9,3 % | 32,6 % | 61,9 % |
| | reprises | 73,9 % | 65,0 % | 53,6 % | 11,3 % | 32,6 % | 68,2 % |
| | grille | 75,0 % | 65,2 % | 45,9 % | 9,8 % | 32,1 % | 68,3 % |
| | **les deux** | **77,4 %** | **69,8 %** | 42,6 % | 11,1 % | 34,0 % | 72,8 % |
| synthèse, vieux disque | base | 62,9 % | 50,4 % | 64,1 % | 10,9 % | 22,3 % | 52,9 % |
| | reprises | 64,9 % | 52,8 % | 60,8 % | 16,0 % | 23,3 % | 53,9 % |
| | grille | 67,1 % | 58,8 % | 52,6 % | 11,4 % | 24,2 % | 61,6 % |
| | **les deux** | **68,7 %** | **60,0 %** | 50,2 % | 16,0 % | 25,1 % | 62,1 % |
| GuitarSet | base | 84,7 % | 69,9 % | — | 8,5 % | — | — |
| | les deux | 84,5 % | 70,0 % | — | 10,8 % | — | — |
| GuitarSet, vieux disque | base | 77,3 % | 55,1 % | — | 21,6 % | — | — |
| | les deux | 78,0 % | 56,5 % | — | 24,4 % | — | — |

Sur GuitarSet, *grille* = *base* (pas de titre : aucun effet) et *reprises* = *les
deux*. Avec la vraie grille des temps, mêmes conclusions à un point près
(`structure-vraie.md` : contrôle, son propre 56,3 → 67,0 %, vieux disque 47,2 →
58,3 %).

### Les standards seuls (morceaux dont la grille est dans les recueils)

| Partie | Son | base | reprises | grille | les deux | Réharm. base → les deux |
|---|---|---|---|---|---|---|
| contrôle (6 morceaux) | propre | 63,8 % | 65,0 % | 80,9 % | 81,5 % | 42,7 → 38,5 % |
| contrôle | vieux disque | 57,5 % | 59,2 % | 76,7 % | 75,7 % | 36,5 → 33,3 % |
| dev (5 morceaux) | propre | 61,3 % | 64,4 % | 72,2 % | 73,3 % | 28,6 → 27,7 % |
| dev | vieux disque | 51,1 % | 52,9 % | 66,8 % | 66,4 % | 13,4 → 17,0 % |

## Ce qu'on apprend

- **La grille connue est le moyen le plus fort** quand le morceau est un standard :
  de 64 à 81 % des temps justes sur les standards du contrôle (vieux disque : 58 →
  77 %). Par morceau (titre bruité, son propre puis vieux disque) : Autumn Leaves
  38 → 70 % et 45 → 76 %, All the Things You Are 48 → 73 % et 33 → 68 %, Ipanema
  78 → 94 % et 66 → 93 %, So What 34 → 74 % et 26 → 52 %, Blue Bossa 80 → 94 % et
  57 → 84 %, Satin Doll 58 → 84 % et 43 → 77 %, Saints 80 → 96 % et 67 → 88 %,
  Sweet Georgia Brown 82 → 88 % et 73 → 81 %. **Une perte** : St. Louis Blues 88 →
  80 % et 87 → 83 % : la grille d'iReal n'a pas la même forme que la nôtre (elle
  n'est d'accord avec notre vérité que sur 60 % des temps pour la fondamentale, 27 %
  pour la couleur : elle écrit des 7 où nous jouons des accords parfaits). La
  « confiance dans les couleurs » (plus bas) a réduit cette perte (88 → 69 % avant),
  sans l'annuler.
- **Les reprises aident peu, mais sans dommage** : + 1 à + 6 points selon la moitié
  et le son, davantage sur le son propre. Le réseau se trompe souvent **de la même
  façon** à chaque grille (même voicing, même erreur) : mettre les grilles en commun
  ne corrige que les erreurs isolées. Les mesures réharmonisées ne sont **pas
  aplaties** : 27,9 → 32,4 % en contrôle (son propre), 25,1 → 24,2 % (vieux
  disque). Un poids double gagnait 1 à 2 points de plus en dev mais en coûtait 3 à 4
  sur les mesures réharmonisées : refusé (« trouver l'équilibre »).
- **Les deux ensemble** : le meilleur partout sur le son propre ; sur le vieux
  disque, à égalité avec la grille seule.
- **Réharmonisations et grille connue** : sur les standards du contrôle, la grille
  coûte quelques réharmonisations (42,7 → 38,5 %, vieux disque 36,5 → 33,3 % ; une
  centaine de temps) : là où le réseau hésite, la grille l'emporte, y compris sur une
  substitution jouée. En dev, l'effet est nul ou positif. C'est le poids qui dépend
  du doute du réseau qui les protège : avec un poids fixe, − 3 points sur les
  réharmonisations en dev.
- **Changements à mi-mesure** : la grille connue en retrouve beaucoup en dev (60 →
  43 % de manqués), peu en contrôle (70 → 65 %).
- **GuitarSet ne régresse pas** (un seul passage, pas de titre) : à ± 1 point. Les
  reprises y trouvent parfois une vraie reprise interne (Jazz3 : deux fois les mêmes
  huit mesures).

## Forme trouvée par les reprises

Sur les 50 versions de synthèse : forme juste 35 fois, un multiple ou un diviseur
(8 pour 16, 24 pour 12) 3 fois, rien 9 fois (rhythm changes à 236 à la noire, II-V
mineurs rapides, So What : formes dont toutes les mesures se ressemblent, ou tempo
trop rapide pour le réseau), fausse 3 fois (37 et 36 pour un blues, 12 pour Autumn
Leaves en vieux disque). GuitarSet (une seule grille) : rien sur 40 prises sur 48 ;
les 8 autres sont de vraies reprises internes de huit mesures.

## Grille connue : acceptée ou refusée

| Partie | Titre | Bonne grille acceptée | Bonne grille refusée | Mauvaise grille acceptée | Refusée à raison, ou rien trouvé |
|---|---|---|---|---|---|
| dev | exact | 6 | 4 | 0 | 14 |
| dev | bruité | 6 | 4 | 0 | 14 |
| dev | d'un autre morceau | — | — | 0 | 48 |
| dev | aucun | — | — | 0 | 24 |
| contrôle | exact | 12 | 0 | 0 | 14 |
| contrôle | bruité | 12 | 0 | 0 | 14 |
| contrôle | d'un autre morceau | — | — | 0 | 50 |
| contrôle | aucun | — | — | 0 | 24 |

(Chaque morceau compte deux fois : son propre et vieux disque.) Les titres bruités
retrouvent toujours la même grille que les titres exacts. Refus de bonnes grilles :
*I Got Rhythm* (rhythm changes à 236 à la noire : le réseau n'est d'accord avec la
grille que sur 16 à 24 % des temps) et *Bill Bailey* (pas trouvé par le titre).
« D'un autre morceau » : un blues appelé *All the Things You Are*, une bossa appelée
*Corcovado*, une ballade appelée *Body and Soul*, une prise de GuitarSet appelée
*Blue Bossa* ou *Blues for Alice*… toutes refusées. La plus proche de passer : une
prise de GuitarSet (BN2, les huit premières mesures d'Autumn Leaves en si mineur,
deux fois) appelée *Blue Bossa*, qui partage le II-V-I mineur : 2,2 écarts-types
au-dessus des autres morceaux (seuil 2,5).

**Le seuil, honnêtement** : il a d'abord été fixé à 2 (sur notre premier partage).
Cette prise, alors en contrôle, passait : **une fausse acceptation sur 44**. Le
seuil a été porté à 2,5 : c'est le milieu de l'écart observé sur le premier dev
(mauvaises grilles jusqu'à 1,46, bonnes à partir de 3,3) et il tient sur le dev
partagé (mauvaises jusqu'à 2,16, bonnes à partir de 3,3), mais la décision a été
prise après avoir vu ce cas : le chiffre de contrôle ci-dessus n'est plus aveugle.

**La grille connue alignée, comparée à notre vérité** (ce que vaudrait la grille
seule : plafond et plancher de ce moyen) : dev 90,6 % (fondamentale) / 89,0 %
(couleur) ; contrôle 81,1 % / 70,7 % (St. Louis Blues et Sweet Georgia Brown tirent
vers le bas : forme ou couleurs différentes de notre lecture). Nos vérités ont été
écrites sans ces grilles : leurs différences (7 ou accord parfait, 6 ou maj7, une
autre forme) sont celles qu'on rencontrera sur de vrais disques.

## Fiabilité : une probabilité d'être juste

Modèle logistique (`reliability.ts`) réglé sur le dev partagé, chaque condition
pesant autant (sinon la synthèse, cinq fois plus nombreuse, l'emporte et GuitarSet
est mal calibré : écart moyen de 14 à 20 % lors d'un premier essai). Entrées et
coefficients : confiance du réseau (log, 0,21), marginal du décodeur (log, 0,99),
marge du réseau sur le second accord (0,50), accord des autres grilles (1,05 ;
présence − 0,29), accord exact avec la grille connue pondéré par son accord local
(4,86 ; présence − 0,25), longueur du segment (log, − 0,53), constante 0,73.

| Contrôle | Brier (nouveau / ancienne confiance) | Écart moyen de calibration | Douteux | Faux si douteux | Faux si sûr | Erreurs signalées (nouveau / ancien « douteux ») |
|---|---|---|---|---|---|---|
| synthèse, propre | 0,182 / 0,269 | 4,3 % / 18,1 % | 27,8 % | 61,8 % | 23,5 % | 50,3 % / 22,1 % |
| synthèse, vieux disque | 0,176 / 0,282 | 8,7 % / 16,3 % | 34,8 % | 72,3 % | 27,6 % | 58,2 % / 30,3 % |
| GuitarSet | 0,166 / 0,159 | 7,5 % / 10,6 % | 16,2 % | 63,2 % | 24,0 % | 33,8 % / 30,0 % |
| GuitarSet, vieux disque | 0,164 / 0,166 | 5,2 % / 8,0 % | 12,1 % | 63,5 % | 20,7 % | 29,7 % / 15,4 % |

(Variante « les deux ». « Ancienne confiance » : la moyenne géométrique de la
probabilité du réseau lue comme une probabilité ; « ancien douteux » : cette
moyenne < 0,35.)

Courbe sur tout le contrôle (« les deux », 8 357 temps) :

| Annoncé | 0–10 % | 10–20 % | 20–30 % | 30–40 % | 40–50 % | 50–60 % | 60–70 % | 70–80 % | 80–90 % | 90–100 % |
|---|---|---|---|---|---|---|---|---|---|---|
| Temps | 64 | 105 | 482 | 806 | 916 | 1 061 | 977 | 971 | 1 366 | 1 609 |
| Juste en réalité | 0 % | 54 % | 27 % | 27 % | 41 % | 50 % | 59 % | 70 % | 87 % | 95 % |
| Ancienne confiance : juste | 74 % | 50 % | 39 % | 48 % | 56 % | 64 % | 65 % | 80 % | 81 % | 95 % |

L'ancienne confiance ne dit presque rien en dessous de 50 % (un accord à « 5 % »
est juste trois fois sur quatre : souvent un accord que la grille connue a
corrigé). La nouvelle suit la diagonale à quelques points près, un peu optimiste
entre 30 et 70 %. **Proposition** : `confidence` = cette probabilité ; **douteux =
plus probablement faux que juste** (< 0,5) : 12 à 35 % des temps marqués, faux près
de deux fois sur trois quand ils le sont, et la moitié des erreurs signalées sur la
synthèse (contre un quart à un tiers aujourd'hui). Les indices de la basse et des
instruments séparés entreront comme entrées de plus ; le modèle se recalcule avec
`--fit`.

## Coûts

Mesurés sur cette machine (4 cœurs, chargée par d'autres travaux) : moins de 5 ms
par morceau pour les reprises ; environ 55 ms pour la grille connue (dont 60
grilles de référence alignées pour la vérification) ; lecture des trois recueils et
index des titres : une fois, environ 1 s. Mémoire négligeable (quelques Mo).

## Décisions prises seul

- Partage dev / contrôle : nous avons d'abord publié le nôtre (règle de la
  consigne), puis adopté celui de l'autre chantier dès qu'il a existé, pour que tout
  le programme mesure sur la même moitié de contrôle ; réglages revérifiés sur le
  nouveau dev, fiabilité réglée sur lui seul.
- Poids des reprises 1 (et non 2) pour ne pas aplatir les réharmonisations ; poids
  de la grille 4, réduit par le doute du réseau et par l'accord local.
- Vérification de la grille contre **d'autres morceaux** (60 grilles de référence)
  plutôt qu'un seuil fixe sur le score : c'est ce qui sépare une grille juste d'une
  grille chanceuse.
- Alignement **par morceaux** (Viterbi sur les 6 meilleurs décalages, 12 nats pour
  changer) : en dev, standards en vieux disque, 62,8 → 66,8 % et accords en trop 25
  → 12 % par rapport à un seul décalage.
- « Confiance dans les couleurs » de la grille, ajoutée **après** avoir vu St. Louis
  Blues en contrôle : sans effet mesurable en dev (les couleurs y sont justes), elle
  réduit la perte sur ce morceau.
- Décoder dans la tonalité de la grille acceptée : aucune différence mesurable ici
  (gardé, désactivable).

## Limites

- Synthèse : notre propre orchestre, plus régulier qu'un vrai ; les reprises y sont
  faciles à voir. Aucun vrai enregistrement avec reprises ni titre de standard dans
  le banc (GuitarSet : une seule grille) : sur du vrai son, les deux moyens n'ont été
  mesurés que dans leur « non-effet ».
- Onze standards seulement, dont six en contrôle.
- La grille d'iReal n'est pas toujours celle du disque (St. Louis Blues) : acceptée,
  elle peut faire perdre des accords justes là où le réseau hésite.
- Les reprises ne corrigent pas une erreur que le réseau fait à chaque grille.
- Une grille plus longue que l'enregistrement n'est pas essayée (extrait de moins
  d'une grille).
