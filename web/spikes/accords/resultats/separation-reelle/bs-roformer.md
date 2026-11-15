# Écouter les instruments séparés : BS-RoFormer SW (celui du Mac M1)

Mesuré le 15 novembre 2026 avec la séparation **réelle** de l’app (`bs-roformer-sw` de
`app/src/separation/models.json`, même fichier, même SHA-256, même découpage et mêmes calculs
avant et après le réseau que l’app ; seul le réseau tourne dans ONNX Runtime de Python, sur le
processeur : `banc/separer.ts --tool bs-roformer-sw`). Comparé à la séparation idéale (instruments
rendus à part) et à HTDemucs 6 sources, sur les mêmes morceaux. Analyse : la variante `app`
(l’analyse publiée : basse dans le grave du morceau, reprises, grille connue, fiabilité), avec en
plus les instruments séparés de trois façons.

**Petit échantillon : 4 morceaux de synthèse**, chacun en vieux disque et en son propre :
*blues-fa-swing* (swing chargé, piano ; développement), *chorale-voix* (voix harmonisées façon Four
Freshmen ; développement), *ballade-cuivres* (cuivres harmonisés ; mis de côté), *tous-ces-trucs*
(swing rapide, piano ; mis de côté). Les deux swings sont coupés à leurs 72 premières secondes
(40 et 49 mesures, deux grilles et plus), les ballades sont entières (32 mesures, deux grilles) :
`banc/corpus-court.py`. Calcul : 7 à 11 fois la durée du morceau sur 3 cœurs, 1 h 50 pour les huit.
Un écart de 2 ou 3 points sur ces 4 morceaux n’est pas un résultat.

## Les variantes

- `app-sans-tiges` : l’analyse publiée, sans séparation.
- `*-selection-*` : le réseau d’accords entend aussi le mélange des parties jugées porteuses de
  l’harmonie (`selectHarmony` : polyphonie, rarement « pas d’accord », au moins 5 % de l’énergie)
  avec la basse, sans batterie ni mélodie, mis en commun avec le mélange (poids 0,3 au mélange).
- `*-sansbatterie-*` : le plus simple, sans sélection ni confiance dans les noms des pistes : le
  réseau entend le morceau moins la batterie séparée.
- `*-basse-seule` : seulement l’indice de basse lu sur la basse séparée.
- `…-tige` : la basse est lue sur la piste séparée ; `…-bande` : dans le grave du morceau, comme
  sans séparation.

Par temps, grille détectée ; colonnes de droite : couleur (fondamentale + qualité) par morceau.


### Vieux disque
| variante | fondamentale | couleur | manqués | en trop | blues-fa-swing | chorale-voix | ballade-cuivres | tous-ces-trucs |
|---|---|---|---|---|---|---|---|---|
| base | 68 % | 58 % | 37 % | 17 % | 52 % | 67 % | 82 % | 42 % |
| app-sans-tiges | 83 % | 73 % | 23 % | 18 % | 54 % | 70 % | 81 % | 84 % |
| ideales-selection-tige | 87 % | 79 % | 23 % | 18 % | 58 % | 82 % | 92 % | 86 % |
| ideales-selection-bande | 87 % | 78 % | 29 % | 11 % | 56 % | 81 % | 92 % | 86 % |
| ideales-sansbatterie-tige | 84 % | 74 % | 20 % | 22 % | 51 % | 77 % | 84 % | 86 % |
| ideales-sansbatterie-bande | 84 % | 74 % | 20 % | 15 % | 51 % | 77 % | 84 % | 84 % |
| ideales-basse-seule | 84 % | 74 % | 23 % | 20 % | 57 % | 71 % | 80 % | 86 % |
| htdemucs-selection-tige | 78 % | 70 % | 29 % | 14 % | 50 % | 74 % | 79 % | 78 % |
| htdemucs-selection-bande | 83 % | 73 % | 20 % | 20 % | 54 % | 77 % | 81 % | 81 % |
| htdemucs-sansbatterie-tige | 79 % | 70 % | 31 % | 14 % | 52 % | 68 % | 78 % | 82 % |
| htdemucs-sansbatterie-bande | 82 % | 73 % | 20 % | 17 % | 54 % | 70 % | 81 % | 84 % |
| htdemucs-basse-seule | 80 % | 71 % | 31 % | 14 % | 52 % | 68 % | 80 % | 82 % |
| roformer-selection-tige | 82 % | 73 % | 26 % | 16 % | 48 % | 69 % | 84 % | 88 % |
| roformer-selection-bande | 84 % | 75 % | 23 % | 17 % | 52 % | 73 % | 85 % | 88 % |
| roformer-sansbatterie-tige | 81 % | 72 % | 29 % | 24 % | 52 % | 67 % | 83 % | 84 % |
| roformer-sansbatterie-bande | 81 % | 72 % | 20 % | 23 % | 49 % | 72 % | 83 % | 83 % |
| roformer-basse-seule | 81 % | 71 % | 26 % | 19 % | 54 % | 64 % | 81 % | 83 % |

### Son propre
| variante | fondamentale | couleur | manqués | en trop | blues-fa-swing | chorale-voix | ballade-cuivres | tous-ces-trucs |
|---|---|---|---|---|---|---|---|---|
| base | 77 % | 68 % | 40 % | 15 % | 52 % | 80 % | 89 % | 60 % |
| app-sans-tiges | 88 % | 80 % | 17 % | 17 % | 58 % | 88 % | 90 % | 87 % |
| ideales-selection-tige | 89 % | 82 % | 20 % | 19 % | 68 % | 84 % | 91 % | 88 % |
| ideales-selection-bande | 89 % | 82 % | 20 % | 19 % | 66 % | 84 % | 91 % | 88 % |
| ideales-sansbatterie-tige | 89 % | 80 % | 17 % | 18 % | 63 % | 80 % | 89 % | 88 % |
| ideales-sansbatterie-bande | 89 % | 80 % | 20 % | 16 % | 64 % | 78 % | 89 % | 88 % |
| ideales-basse-seule | 88 % | 80 % | 17 % | 18 % | 59 % | 84 % | 90 % | 87 % |
| htdemucs-selection-tige | 86 % | 76 % | 14 % | 21 % | 58 % | 75 % | 88 % | 85 % |
| htdemucs-selection-bande | 86 % | 76 % | 17 % | 21 % | 57 % | 75 % | 88 % | 85 % |
| htdemucs-sansbatterie-tige | 88 % | 79 % | 17 % | 18 % | 60 % | 83 % | 89 % | 87 % |
| htdemucs-sansbatterie-bande | 88 % | 79 % | 17 % | 18 % | 59 % | 81 % | 91 % | 87 % |
| htdemucs-basse-seule | 88 % | 79 % | 20 % | 18 % | 59 % | 83 % | 90 % | 87 % |
| roformer-selection-tige | 89 % | 81 % | 14 % | 19 % | 68 % | 73 % | 95 % | 87 % |
| roformer-selection-bande | 89 % | 81 % | 23 % | 19 % | 66 % | 73 % | 95 % | 87 % |
| roformer-sansbatterie-tige | 88 % | 80 % | 17 % | 19 % | 65 % | 80 % | 91 % | 87 % |
| roformer-sansbatterie-bande | 88 % | 79 % | 20 % | 19 % | 63 % | 77 % | 91 % | 87 % |
| roformer-basse-seule | 87 % | 79 % | 23 % | 18 % | 59 % | 81 % | 90 % | 87 % |

## Ce qu’on en retient

- **Aucune variante ne bat nettement l’analyse publiée sur les vieux disques avec BS-RoFormer.**
  La meilleure, `roformer-selection-bande` (parties porteuses de l’harmonie, basse lue dans le grave
  du morceau), fait 75 % contre 73 % : +2 points, sur 3 morceaux sur 4 (+3, +4, +4 ; −2 sur le swing
  chargé). En son propre, +1 point, mais *chorale-voix* perd 15 points. Trop peu et trop irrégulier
  pour brancher quoi que ce soit.
- **BS-RoFormer sépare bien mieux qu’HTDemucs sur les vieux disques** : batterie, piano et cuivres
  sont reconnaissables. HTDemucs, lui, ne met presque rien dans la basse et range la moitié de
  l’orchestre dans « guitare ». Mais la **basse séparée reste faible** : 3 à 7 % du niveau du morceau, pour 9 à 13 % dans
  la vraie partie (écart au signal idéal : +0,3 à +1,3 dB). La lire sur la piste séparée fait
  donc moins bien que la lire dans le grave du morceau, avec les deux outils.
- **Les noms des pistes trompent** : sur *chorale-voix*, les voix harmonisées partent dans
  « autres » et seule la voix principale reste dans « voix ». Le sélecteur prend alors « autres »,
  ce qui est juste sur le vieux disque mais coûte 15 points en son propre.
- **Le morceau moins la batterie** n’apporte rien (−1 point au vieux disque) : enlever la batterie
  ne suffit pas, c’est la mélodie qui trompe le réseau.
- **Avec des instruments séparés idéaux**, l’écoute sélective donne +6 points au vieux disque
  (73 → 79 %) : le gain existe, c’est la séparation réelle qui le perd presque entièrement.
- Le modèle d’accords fin (Tsumugi, étape 2) n’a pas été essayé sur les parties séparées : il
  faudrait calculer ses sorties sur chaque mélange de parties, avec la grille de l’app (environ une
  fois la durée par fichier en Python), ce qui n’a pas été fait.

## Ce qu’il faudrait pour aller plus loin

Mesurer `roformer-selection-bande` sur plus de morceaux (8 à 12 vieux disques, 2 h de calcul
par tranche de 4 morceaux ici), et l’essayer avec le modèle fin. S’il tient (+3 points ou plus,
sans morceau qui s’effondre), le branchement serait le suivant. Après une séparation, le worker fait
tourner le réseau d’accords sur chaque partie autre que la batterie et la basse (5 passages), choisit
les parties, mélange ces parties et la basse (lecture par tranches, un seul tampon de 48 kHz à la
fois), et fait un dernier passage sur ce mélange. L’indice de basse reste celui du grave du morceau.
Coût : environ 6 passages du réseau CREMA (1 à 2 s chacun pour 4 minutes) et la lecture des pistes.
