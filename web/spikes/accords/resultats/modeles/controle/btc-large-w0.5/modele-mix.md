# Banc accords — variante `modele-mix`

22 morceaux, mesuré le 2026-11-15 (7 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 10 | 75 % | 71 % | 63 % | 39 % | 75 % | 31 % | 15 % | 99 % | 96 % | 70 % |
| grille détectée | synthèse, vieux disque | 10 | 66 % | 62 % | 52 % | 35 % | 65 % | 32 % | 19 % | 94 % | 77 % | 50 % |
| grille détectée | enregistrements réels | 12 | 83 % | 81 % | 73 % | 52 % | 68 % | — | 16 % | 94 % | 80 % | 75 % |
| grille détectée | réels, façon vieux disque | 12 | 86 % | 83 % | 66 % | 44 % | 67 % | — | 21 % | 88 % | 62 % | 83 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 76 % | 62 % |
| grille détectée | synthèse, vieux disque | 66 % | 52 % |
| grille détectée | enregistrements réels | 85 % | 74 % |
| grille détectée | réels, façon vieux disque | 86 % | 65 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 93 % / 69 % |  | 84 % / 68 % |  |  |  |  |  |
| bossa | 78 % / 69 % |  | 54 % / 45 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 95 % / 80 % |  | 93 % / 62 % |  |
| guitare-jazz |  |  |  |  | 72 % / 66 % |  | 79 % / 71 % |  |
| swing | 60 % / 49 % |  | 50 % / 34 % |  |  |  |  |  |
| trad | 98 % / 95 % |  | 95 % / 88 % |  |  |  |  |  |
| waltz | 81 % / 35 % |  | 78 % / 43 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 23 % | 24 % | 11 % | 9 % |
| bonne fondamentale, septième ou sixte fausse | 20 % | 21 % | 29 % | 51 % |
| fondamentale à une tierce (mineure) | 14 % | 17 % | 19 % | 10 % |
| accord voisin (décalé d’un temps ou plus) | 13 % | 10 % | 11 % | 13 % |
| bonne fondamentale, famille fausse | 10 % | 6 % | 9 % | 8 % |
| fondamentale à une tierce (majeure) | 8 % | 7 % | 16 % | 5 % |
| fondamentale à un ton | 5 % | 7 % | 3 % | 0 % |
| fondamentale à un demi-ton | 4 % | 4 % | 3 % | 2 % |
| fondamentale au triton | 3 % | 2 % | 0 % | 0 % |
| aucun accord | 1 % | 2 % | 1 % | 1 % |
| *temps faux / tous les temps* | 37 % | 48 % | 27 % | 34 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

maj7 → maj (28 %) · 7 → maj (14 %) · m7 → m (12 %) · m7 → 7 (11 %) · m6 → m (5 %) · m7b5 → m7 (4 %) · 7 → m7 (3 %) · m6 → m7 (2 %) · 6 → maj (2 %) · m → maj (2 %) · maj → 7 (2 %) · m → m7 (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 31 % | 68 % | 22 % | 58 % |
| grille détectée | synthèse, vieux disque | 34 % | 71 % | 36 % | 50 % |
| grille détectée | enregistrements réels | 16 % | 58 % | 21 % | 34 % |
| grille détectée | réels, façon vieux disque | 14 % | 68 % | 28 % | 28 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
