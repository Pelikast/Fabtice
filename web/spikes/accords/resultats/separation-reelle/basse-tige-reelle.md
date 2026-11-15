# Banc accords — variante `basse-tige-reelle`

8 morceaux, mesuré le 2026-11-15 (25 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 8 | 78 % | 73 % | 66 % | 38 % | 78 % | 33 % | 24 % | 95 % | 90 % | 63 % |
| grille détectée | synthèse, vieux disque | 8 | 64 % | 61 % | 50 % | 30 % | 65 % | 49 % | 17 % | 91 % | 87 % | 50 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 4 | 79 % | 70 % | 79 % | 41 % | 18 % | 75 % | 69 % |
| grille détectée | développement | synthèse, vieux disque | 4 | 70 % | 55 % | 71 % | 61 % | 11 % | 50 % | 95 % |
| grille détectée | mis de côté | synthèse, son propre | 4 | 77 % | 62 % | 77 % | 8 % | 30 % | 50 % | 86 % |
| grille détectée | mis de côté | synthèse, vieux disque | 4 | 58 % | 44 % | 58 % | 16 % | 24 % | 50 % | 98 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 78 % | 67 % |
| grille détectée | synthèse, vieux disque | 65 % | 51 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille |
|---|---|---|---|---|
| ballad | 89 % / 82 % |  | 84 % / 73 % |  |
| bossa | 84 % / 68 % |  | 48 % / 34 % |  |
| swing | 70 % / 57 % |  | 54 % / 42 % |  |
| trad | 90 % / 80 % |  | 92 % / 67 % |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée |
|---|---|---|
| fondamentale à la quinte / quarte | 25 % | 24 % |
| bonne fondamentale, septième ou sixte fausse | 19 % | 21 % |
| accord voisin (décalé d’un temps ou plus) | 17 % | 13 % |
| bonne fondamentale, famille fausse | 13 % | 6 % |
| fondamentale à une tierce (mineure) | 6 % | 10 % |
| fondamentale à un demi-ton | 6 % | 3 % |
| fondamentale à une tierce (majeure) | 5 % | 6 % |
| fondamentale à un ton | 4 % | 7 % |
| fondamentale au triton | 2 % | 2 % |
| aucun accord | 2 % | 7 % |
| *temps faux / tous les temps* | 34 % | 50 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

7 → maj (20 %) · m7 → 7 (14 %) · m6 → m7 (9 %) · m7 → m (8 %) · m → maj (7 %) · maj7 → 7 (7 %) · dim7 → dim (6 %) · maj7 → maj (4 %) · 6 → maj (3 %) · m7b5 → dim (3 %) · 6 → maj7 (3 %) · 7 → m7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 56 % | 47 % | 17 % | 78 % |
| grille détectée | synthèse, vieux disque | 95 % | 51 % | 40 % | 96 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
