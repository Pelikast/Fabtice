# Banc accords — variante `ecoute`

8 morceaux, mesuré le 2026-11-15 (5 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 8 | 81 % | 76 % | 69 % | 41 % | 81 % | 25 % | 23 % | 95 % | 90 % | 63 % |
| grille détectée | synthèse, vieux disque | 8 | 76 % | 71 % | 64 % | 37 % | 75 % | 39 % | 22 % | 91 % | 87 % | 50 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 4 | 81 % | 72 % | 82 % | 34 % | 18 % | 75 % | 70 % |
| grille détectée | développement | synthèse, vieux disque | 4 | 78 % | 67 % | 78 % | 47 % | 16 % | 50 % | 83 % |
| grille détectée | mis de côté | synthèse, son propre | 4 | 81 % | 66 % | 80 % | 0 % | 29 % | 50 % | 90 % |
| grille détectée | mis de côté | synthèse, vieux disque | 4 | 74 % | 61 % | 73 % | 16 % | 27 % | 50 % | 93 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 81 % | 70 % |
| grille détectée | synthèse, vieux disque | 76 % | 65 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille |
|---|---|---|---|---|
| ballad | 94 % / 87 % |  | 94 % / 84 % |  |
| bossa | 88 % / 77 % |  | 65 % / 55 % |  |
| swing | 74 % / 61 % |  | 70 % / 57 % |  |
| trad | 90 % / 78 % |  | 90 % / 76 % |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée |
|---|---|---|
| fondamentale à la quinte / quarte | 24 % | 24 % |
| bonne fondamentale, septième ou sixte fausse | 21 % | 19 % |
| accord voisin (décalé d’un temps ou plus) | 19 % | 19 % |
| bonne fondamentale, famille fausse | 14 % | 12 % |
| fondamentale à une tierce (mineure) | 6 % | 8 % |
| fondamentale à un demi-ton | 6 % | 5 % |
| fondamentale à une tierce (majeure) | 5 % | 5 % |
| fondamentale à un ton | 3 % | 3 % |
| fondamentale au triton | 2 % | 1 % |
| aucun accord | 1 % | 3 % |
| *temps faux / tous les temps* | 31 % | 36 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (15 %) · m6 → m7 (13 %) · 7 → maj (12 %) · dim7 → dim (8 %) · m → maj (8 %) · 6 → maj7 (5 %) · m7 → m (4 %) · 7 → m7 (4 %) · m6 → m (4 %) · 7 → maj7 (3 %) · m7b5 → dim (3 %) · 6 → maj (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 59 % | 42 % | 15 % | 81 % |
| grille détectée | synthèse, vieux disque | 82 % | 38 % | 24 % | 88 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
