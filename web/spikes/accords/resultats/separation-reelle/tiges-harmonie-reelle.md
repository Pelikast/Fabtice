# Banc accords — variante `tiges-harmonie-reelle`

8 morceaux, mesuré le 2026-11-15 (113 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 8 | 73 % | 67 % | 61 % | 35 % | 75 % | 48 % | 15 % | 95 % | 90 % | 63 % |
| grille détectée | synthèse, vieux disque | 8 | 65 % | 60 % | 50 % | 30 % | 65 % | 53 % | 15 % | 91 % | 87 % | 50 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 4 | 77 % | 67 % | 79 % | 60 % | 8 % | 75 % | 38 % |
| grille détectée | développement | synthèse, vieux disque | 4 | 70 % | 56 % | 71 % | 64 % | 9 % | 50 % | 22 % |
| grille détectée | mis de côté | synthèse, son propre | 4 | 69 % | 53 % | 70 % | 16 % | 23 % | 50 % | 42 % |
| grille détectée | mis de côté | synthèse, vieux disque | 4 | 59 % | 42 % | 59 % | 20 % | 20 % | 50 % | 72 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 74 % | 62 % |
| grille détectée | synthèse, vieux disque | 66 % | 51 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille |
|---|---|---|---|---|
| ballad | 91 % / 79 % |  | 86 % / 76 % |  |
| bossa | 77 % / 59 % |  | 53 % / 41 % |  |
| swing | 62 % / 50 % |  | 53 % / 39 % |  |
| trad | 91 % / 79 % |  | 92 % / 69 % |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée |
|---|---|---|
| fondamentale à la quinte / quarte | 24 % | 27 % |
| accord voisin (décalé d’un temps ou plus) | 20 % | 13 % |
| bonne fondamentale, septième ou sixte fausse | 15 % | 19 % |
| bonne fondamentale, famille fausse | 14 % | 10 % |
| fondamentale à une tierce (majeure) | 7 % | 6 % |
| fondamentale à un demi-ton | 6 % | 5 % |
| fondamentale à une tierce (mineure) | 6 % | 9 % |
| fondamentale à un ton | 4 % | 8 % |
| fondamentale au triton | 3 % | 2 % |
| aucun accord | 0 % | 1 % |
| *temps faux / tous les temps* | 39 % | 50 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (18 %) · 7 → maj (17 %) · m7 → m (8 %) · m6 → m7 (8 %) · m → maj (7 %) · dim7 → dim (5 %) · maj7 → maj (4 %) · 6 → maj7 (3 %) · maj7 → 7 (3 %) · m6 → m (3 %) · m7b5 → 7 (2 %) · m7 → m7b5 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 27 % | 60 % | 32 % | 41 % |
| grille détectée | synthèse, vieux disque | 34 % | 73 % | 39 % | 49 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
