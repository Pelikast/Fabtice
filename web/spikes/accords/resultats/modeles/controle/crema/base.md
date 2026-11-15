# Banc accords — variante `base`

22 morceaux, mesuré le 2026-11-15 (6 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 10 | 71 % | 66 % | 56 % | 35 % | 72 % | 50 % | 14 % | 99 % | 96 % | 70 % |
| grille détectée | synthèse, vieux disque | 10 | 64 % | 61 % | 49 % | 34 % | 64 % | 51 % | 17 % | 94 % | 77 % | 50 % |
| grille détectée | enregistrements réels | 12 | 84 % | 81 % | 71 % | 52 % | 69 % | — | 13 % | 94 % | 80 % | 75 % |
| grille détectée | réels, façon vieux disque | 12 | 82 % | 79 % | 67 % | 44 % | 65 % | — | 18 % | 88 % | 62 % | 83 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 73 % | 56 % |
| grille détectée | synthèse, vieux disque | 65 % | 50 % |
| grille détectée | enregistrements réels | 85 % | 71 % |
| grille détectée | réels, façon vieux disque | 82 % | 66 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 95 % / 74 % |  | 85 % / 63 % |  |  |  |  |  |
| bossa | 80 % / 63 % |  | 52 % / 36 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 96 % / 77 % |  | 88 % / 64 % |  |
| guitare-jazz |  |  |  |  | 71 % / 64 % |  | 76 % / 70 % |  |
| swing | 55 % / 40 % |  | 48 % / 35 % |  |  |  |  |  |
| trad | 95 % / 84 % |  | 91 % / 79 % |  |  |  |  |  |
| waltz | 83 % / 38 % |  | 83 % / 43 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 23 % | 22 % | 11 % | 14 % |
| bonne fondamentale, septième ou sixte fausse | 23 % | 23 % | 36 % | 36 % |
| accord voisin (décalé d’un temps ou plus) | 12 % | 11 % | 9 % | 15 % |
| fondamentale à une tierce (mineure) | 12 % | 14 % | 15 % | 11 % |
| bonne fondamentale, famille fausse | 10 % | 5 % | 9 % | 10 % |
| fondamentale à une tierce (majeure) | 6 % | 8 % | 14 % | 4 % |
| fondamentale à un ton | 5 % | 7 % | 3 % | 8 % |
| fondamentale à un demi-ton | 5 % | 4 % | 1 % | 1 % |
| fondamentale au triton | 4 % | 2 % | 2 % | 0 % |
| aucun accord | 0 % | 5 % | 0 % | 0 % |
| *temps faux / tous les temps* | 44 % | 51 % | 29 % | 33 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

7 → maj (21 %) · maj7 → maj (15 %) · m7 → m (11 %) · m7 → 7 (8 %) · maj7 → 7 (4 %) · m6 → m7 (4 %) · m → m7 (4 %) · dim7 → dim (2 %) · m6 → m (2 %) · maj → maj7 (2 %) · m7b5 → dim (2 %) · 6 → maj (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 26 % | 70 % | 35 % | 41 % |
| grille détectée | synthèse, vieux disque | 35 % | 72 % | 40 % | 49 % |
| grille détectée | enregistrements réels | 25 % | 57 % | 20 % | 48 % |
| grille détectée | réels, façon vieux disque | 12 % | 57 % | 30 % | 20 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
