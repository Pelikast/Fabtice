# Banc accords — variante `modele-app`

49 morceaux, mesuré le 2026-11-15 (17 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 25 | 72 % | 68 % | 59 % | 35 % | 72 % | 26 % | 25 % | 95 % | 89 % | 68 % |
| grille détectée | synthèse, vieux disque | 25 | 61 % | 56 % | 44 % | 28 % | 61 % | 32 % | 27 % | 94 % | 79 % | 64 % |
| grille détectée | enregistrements réels | 24 | 82 % | 78 % | 64 % | 50 % | 69 % | — | 22 % | 92 % | 79 % | 79 % |
| grille détectée | réels, façon vieux disque | 24 | 84 % | 81 % | 60 % | 46 % | 69 % | — | 22 % | 81 % | 58 % | 83 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 73 % | 59 % |
| grille détectée | synthèse, vieux disque | 61 % | 44 % |
| grille détectée | enregistrements réels | 83 % | 64 % |
| grille détectée | réels, façon vieux disque | 84 % | 59 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 83 % / 68 % |  | 76 % / 59 % |  |  |  |  |  |
| bossa | 76 % / 65 % |  | 52 % / 40 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 91 % / 67 % |  | 88 % / 56 % |  |
| guitare-jazz |  |  |  |  | 73 % / 61 % |  | 81 % / 63 % |  |
| modal | 36 % / 25 % |  | 24 % / 3 % |  |  |  |  |  |
| shuffle | 81 % / 71 % |  | 66 % / 61 % |  |  |  |  |  |
| swing | 62 % / 48 % |  | 51 % / 34 % |  |  |  |  |  |
| trad | 94 % / 82 % |  | 92 % / 70 % |  |  |  |  |  |
| waltz | 72 % / 51 % |  | 62 % / 42 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| bonne fondamentale, septième ou sixte fausse | 22 % | 22 % | 39 % | 52 % |
| fondamentale à la quinte / quarte | 21 % | 23 % | 7 % | 6 % |
| fondamentale à une tierce (mineure) | 14 % | 17 % | 13 % | 10 % |
| accord voisin (décalé d’un temps ou plus) | 13 % | 8 % | 10 % | 8 % |
| bonne fondamentale, famille fausse | 9 % | 8 % | 10 % | 10 % |
| fondamentale à une tierce (majeure) | 8 % | 7 % | 10 % | 9 % |
| fondamentale à un ton | 6 % | 8 % | 2 % | 2 % |
| fondamentale à un demi-ton | 5 % | 4 % | 1 % | 2 % |
| fondamentale au triton | 2 % | 2 % | 0 % | 0 % |
| aucun accord | 0 % | 1 % | 6 % | 1 % |
| *temps faux / tous les temps* | 41 % | 56 % | 36 % | 40 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

7 → maj (19 %) · maj7 → maj (16 %) · m7 → m (15 %) · maj → maj7 (9 %) · m7 → 7 (8 %) · m7b5 → m7 (6 %) · maj → 7 (5 %) · 6 → maj (4 %) · m6 → m (3 %) · 7 → m7 (3 %) · m → maj (1 %) · 7 → m (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 34 % | 62 % | 31 % | 52 % |
| grille détectée | synthèse, vieux disque | 38 % | 71 % | 47 % | 48 % |
| grille détectée | enregistrements réels | 10 % | 77 % | 32 % | 21 % |
| grille détectée | réels, façon vieux disque | 13 % | 68 % | 36 % | 22 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
