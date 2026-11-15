# Banc accords — variante `reprises-et-grille`

8 morceaux, mesuré le 2026-11-15 (8 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 8 | 84 % | 82 % | 76 % | 41 % | 81 % | 23 % | 15 % | 95 % | 90 % | 88 % |
| grille détectée | synthèse, vieux disque | 8 | 77 % | 74 % | 65 % | 36 % | 73 % | 31 % | 17 % | 91 % | 87 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 4 | 84 % | 81 % | 81 % | 29 % | 13 % | 100 % | 24 % |
| grille détectée | développement | synthèse, vieux disque | 4 | 77 % | 69 % | 74 % | 36 % | 16 % | 75 % | 52 % |
| grille détectée | mis de côté | synthèse, son propre | 4 | 85 % | 71 % | 81 % | 8 % | 17 % | 75 % | 46 % |
| grille détectée | mis de côté | synthèse, vieux disque | 4 | 76 % | 61 % | 71 % | 16 % | 18 % | 75 % | 64 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 84 % | 76 % |
| grille détectée | synthèse, vieux disque | 76 % | 65 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille |
|---|---|---|---|---|
| ballad | 93 % / 87 % |  | 86 % / 75 % |  |
| bossa | 84 % / 69 % |  | 52 % / 36 % |  |
| swing | 78 % / 69 % |  | 73 % / 63 % |  |
| trad | 95 % / 94 % |  | 96 % / 85 % |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée |
|---|---|---|
| bonne fondamentale, septième ou sixte fausse | 25 % | 25 % |
| fondamentale à la quinte / quarte | 20 % | 21 % |
| accord voisin (décalé d’un temps ou plus) | 19 % | 13 % |
| fondamentale à une tierce (mineure) | 8 % | 11 % |
| fondamentale à un demi-ton | 7 % | 4 % |
| fondamentale au triton | 7 % | 4 % |
| bonne fondamentale, famille fausse | 6 % | 5 % |
| fondamentale à une tierce (majeure) | 5 % | 6 % |
| fondamentale à un ton | 2 % | 6 % |
| aucun accord | 0 % | 3 % |
| *temps faux / tous les temps* | 24 % | 35 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m6 → m7 (22 %) · 7 → maj (13 %) · dim7 → dim (10 %) · m7 → 7 (8 %) · 6 → maj7 (8 %) · m7 → m (7 %) · maj7 → maj (6 %) · m6 → m (5 %) · 6 → maj (4 %) · m7b5 → dim (2 %) · +7 → 7 (2 %) · 7 → m7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 15 % | 57 % | 18 % | 36 % |
| grille détectée | synthèse, vieux disque | 30 % | 67 % | 21 % | 58 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
