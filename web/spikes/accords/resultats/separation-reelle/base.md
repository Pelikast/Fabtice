# Banc accords — variante `base`

8 morceaux, mesuré le 2026-11-15 (3 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 8 | 72 % | 67 % | 62 % | 36 % | 73 % | 58 % | 15 % | 95 % | 90 % | 63 % |
| grille détectée | synthèse, vieux disque | 8 | 65 % | 61 % | 50 % | 30 % | 65 % | 53 % | 14 % | 91 % | 87 % | 50 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 4 | 74 % | 68 % | 76 % | 69 % | 11 % | 75 % | 25 % |
| grille détectée | développement | synthèse, vieux disque | 4 | 70 % | 55 % | 71 % | 66 % | 7 % | 50 % | 20 % |
| grille détectée | mis de côté | synthèse, son propre | 4 | 69 % | 55 % | 70 % | 28 % | 19 % | 50 % | 33 % |
| grille détectée | mis de côté | synthèse, vieux disque | 4 | 58 % | 44 % | 58 % | 16 % | 21 % | 50 % | 60 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 73 % | 63 % |
| grille détectée | synthèse, vieux disque | 65 % | 51 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille |
|---|---|---|---|---|
| ballad | 92 % / 84 % |  | 86 % / 75 % |  |
| bossa | 80 % / 63 % |  | 52 % / 36 % |  |
| swing | 59 % / 49 % |  | 53 % / 41 % |  |
| trad | 90 % / 80 % |  | 92 % / 67 % |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée |
|---|---|---|
| fondamentale à la quinte / quarte | 26 % | 28 % |
| accord voisin (décalé d’un temps ou plus) | 21 % | 13 % |
| bonne fondamentale, septième ou sixte fausse | 14 % | 21 % |
| bonne fondamentale, famille fausse | 10 % | 7 % |
| fondamentale à une tierce (mineure) | 9 % | 10 % |
| fondamentale à un demi-ton | 7 % | 4 % |
| fondamentale à une tierce (majeure) | 5 % | 7 % |
| fondamentale à un ton | 4 % | 6 % |
| fondamentale au triton | 3 % | 2 % |
| aucun accord | 0 % | 3 % |
| *temps faux / tous les temps* | 38 % | 50 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

7 → maj (20 %) · m7 → 7 (16 %) · m6 → m7 (8 %) · m → maj (7 %) · m7 → m (7 %) · maj7 → 7 (6 %) · dim7 → dim (5 %) · maj7 → maj (5 %) · 6 → maj (4 %) · m7b5 → dim (3 %) · 6 → maj7 (2 %) · 7 → m7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 20 % | 56 % | 34 % | 29 % |
| grille détectée | synthèse, vieux disque | 28 % | 73 % | 42 % | 41 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
