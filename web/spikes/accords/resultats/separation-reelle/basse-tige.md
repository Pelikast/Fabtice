# Banc accords — variante `basse-tige`

8 morceaux, mesuré le 2026-11-15 (4 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 8 | 78 % | 73 % | 66 % | 38 % | 78 % | 35 % | 24 % | 95 % | 90 % | 63 % |
| grille détectée | synthèse, vieux disque | 8 | 70 % | 65 % | 52 % | 31 % | 70 % | 36 % | 24 % | 91 % | 87 % | 50 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 4 | 79 % | 70 % | 79 % | 43 % | 18 % | 75 % | 70 % |
| grille détectée | développement | synthèse, vieux disque | 4 | 76 % | 58 % | 76 % | 44 % | 19 % | 50 % | 83 % |
| grille détectée | mis de côté | synthèse, son propre | 4 | 77 % | 62 % | 76 % | 12 % | 31 % | 50 % | 83 % |
| grille détectée | mis de côté | synthèse, vieux disque | 4 | 64 % | 46 % | 63 % | 12 % | 29 % | 50 % | 93 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 78 % | 67 % |
| grille détectée | synthèse, vieux disque | 71 % | 54 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille |
|---|---|---|---|---|
| ballad | 89 % / 82 % |  | 90 % / 79 % |  |
| bossa | 84 % / 68 % |  | 55 % / 39 % |  |
| swing | 70 % / 57 % |  | 63 % / 45 % |  |
| trad | 90 % / 80 % |  | 90 % / 64 % |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée |
|---|---|---|
| fondamentale à la quinte / quarte | 24 % | 22 % |
| bonne fondamentale, septième ou sixte fausse | 19 % | 26 % |
| accord voisin (décalé d’un temps ou plus) | 17 % | 11 % |
| bonne fondamentale, famille fausse | 13 % | 10 % |
| fondamentale à une tierce (mineure) | 7 % | 10 % |
| fondamentale à un demi-ton | 6 % | 3 % |
| fondamentale à une tierce (majeure) | 5 % | 5 % |
| fondamentale à un ton | 4 % | 4 % |
| fondamentale au triton | 2 % | 1 % |
| aucun accord | 2 % | 7 % |
| *temps faux / tous les temps* | 34 % | 48 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

7 → maj (18 %) · m7 → 7 (15 %) · m7 → m (7 %) · m6 → m7 (7 %) · dim7 → dim (7 %) · maj7 → 7 (6 %) · m → maj (6 %) · maj7 → maj (6 %) · 6 → maj (4 %) · 6 → maj7 (3 %) · m6 → m (3 %) · m7b5 → dim (3 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 54 % | 48 % | 17 % | 77 % |
| grille détectée | synthèse, vieux disque | 80 % | 52 % | 28 % | 88 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
