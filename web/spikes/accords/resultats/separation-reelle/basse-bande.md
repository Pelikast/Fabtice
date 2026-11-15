# Banc accords — variante `basse-bande`

8 morceaux, mesuré le 2026-11-15 (5 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 8 | 78 % | 73 % | 66 % | 38 % | 78 % | 36 % | 22 % | 95 % | 90 % | 63 % |
| grille détectée | synthèse, vieux disque | 8 | 67 % | 62 % | 51 % | 30 % | 67 % | 42 % | 20 % | 91 % | 87 % | 50 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 4 | 79 % | 70 % | 80 % | 44 % | 14 % | 75 % | 78 % |
| grille détectée | développement | synthèse, vieux disque | 4 | 73 % | 56 % | 73 % | 53 % | 14 % | 50 % | 90 % |
| grille détectée | mis de côté | synthèse, son propre | 4 | 77 % | 62 % | 76 % | 12 % | 29 % | 50 % | 88 % |
| grille détectée | mis de côté | synthèse, vieux disque | 4 | 60 % | 46 % | 59 % | 12 % | 25 % | 50 % | 96 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 78 % | 67 % |
| grille détectée | synthèse, vieux disque | 67 % | 53 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille |
|---|---|---|---|---|
| ballad | 89 % / 82 % |  | 87 % / 76 % |  |
| bossa | 85 % / 69 % |  | 54 % / 40 % |  |
| swing | 69 % / 57 % |  | 56 % / 43 % |  |
| trad | 90 % / 80 % |  | 92 % / 66 % |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée |
|---|---|---|
| fondamentale à la quinte / quarte | 25 % | 25 % |
| bonne fondamentale, septième ou sixte fausse | 18 % | 22 % |
| accord voisin (décalé d’un temps ou plus) | 17 % | 12 % |
| bonne fondamentale, famille fausse | 14 % | 8 % |
| fondamentale à un demi-ton | 6 % | 3 % |
| fondamentale à une tierce (mineure) | 6 % | 10 % |
| fondamentale à une tierce (majeure) | 6 % | 6 % |
| fondamentale à un ton | 4 % | 4 % |
| fondamentale au triton | 2 % | 2 % |
| aucun accord | 1 % | 8 % |
| *temps faux / tous les temps* | 34 % | 49 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

7 → maj (19 %) · m7 → 7 (15 %) · m6 → m7 (8 %) · m7 → m (8 %) · dim7 → dim (7 %) · m → maj (7 %) · maj7 → 7 (5 %) · maj7 → maj (4 %) · 7 → m7 (3 %) · 6 → maj7 (3 %) · 6 → maj (3 %) · m6 → m (3 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 61 % | 46 % | 14 % | 84 % |
| grille détectée | synthèse, vieux disque | 88 % | 51 % | 28 % | 93 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
