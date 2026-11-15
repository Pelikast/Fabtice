# Banc accords — variante `modele-brut`

49 morceaux, mesuré le 2026-11-15 (4 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 25 | 66 % | 61 % | 54 % | 32 % | 66 % | 10 % | 57 % | 95 % | 89 % | 0 % |
| grille détectée | synthèse, vieux disque | 25 | 56 % | 51 % | 43 % | 26 % | 56 % | 20 % | 54 % | 94 % | 79 % | 0 % |
| grille détectée | enregistrements réels | 24 | 67 % | 64 % | 54 % | 45 % | 60 % | — | 47 % | 92 % | 79 % | 0 % |
| grille détectée | réels, façon vieux disque | 24 | 73 % | 68 % | 58 % | 45 % | 62 % | — | 41 % | 81 % | 58 % | 0 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 66 % | 55 % |
| grille détectée | synthèse, vieux disque | 57 % | 44 % |
| grille détectée | enregistrements réels | 68 % | 55 % |
| grille détectée | réels, façon vieux disque | 72 % | 57 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 77 % / 65 % |  | 72 % / 56 % |  |  |  |  |  |
| bossa | 61 % / 54 % |  | 51 % / 43 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 79 % / 66 % |  | 76 % / 61 % |  |
| guitare-jazz |  |  |  |  | 55 % / 41 % |  | 69 % / 54 % |  |
| modal | 47 % / 39 % |  | 32 % / 22 % |  |  |  |  |  |
| shuffle | 83 % / 79 % |  | 74 % / 72 % |  |  |  |  |  |
| swing | 57 % / 43 % |  | 44 % / 33 % |  |  |  |  |  |
| trad | 86 % / 78 % |  | 82 % / 65 % |  |  |  |  |  |
| waltz | 67 % / 48 % |  | 56 % / 41 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 30 % | 29 % | 10 % | 11 % |
| fondamentale à une tierce (mineure) | 16 % | 15 % | 11 % | 12 % |
| bonne fondamentale, septième ou sixte fausse | 13 % | 13 % | 21 % | 25 % |
| bonne fondamentale, famille fausse | 10 % | 7 % | 7 % | 10 % |
| fondamentale à un ton | 9 % | 10 % | 4 % | 6 % |
| accord voisin (décalé d’un temps ou plus) | 8 % | 7 % | 5 % | 7 % |
| fondamentale à une tierce (majeure) | 7 % | 7 % | 7 % | 12 % |
| fondamentale à un demi-ton | 4 % | 3 % | 2 % | 2 % |
| fondamentale au triton | 3 % | 3 % | 0 % | 0 % |
| aucun accord | 0 % | 5 % | 32 % | 14 % |
| *temps faux / tous les temps* | 46 % | 57 % | 46 % | 42 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

7 → maj (15 %) · m7 → 7 (14 %) · maj7 → maj (12 %) · m7 → m (10 %) · maj → maj7 (8 %) · m7b5 → m7 (6 %) · 7 → m7 (4 %) · 6 → maj (3 %) · m6 → m7 (3 %) · m6 → m (3 %) · m → maj (3 %) · maj → 7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 37 % | 68 % | 32 % | 56 % |
| grille détectée | synthèse, vieux disque | 43 % | 72 % | 45 % | 55 % |
| grille détectée | enregistrements réels | 34 % | 72 % | 33 % | 52 % |
| grille détectée | réels, façon vieux disque | 25 % | 64 % | 35 % | 38 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
