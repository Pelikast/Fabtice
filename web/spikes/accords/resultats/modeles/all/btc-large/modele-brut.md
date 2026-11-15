# Banc accords — variante `modele-brut`

49 morceaux, mesuré le 2026-11-15 (4 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 25 | 70 % | 65 % | 56 % | 33 % | 70 % | 7 % | 52 % | 95 % | 89 % | 0 % |
| grille détectée | synthèse, vieux disque | 25 | 60 % | 55 % | 42 % | 27 % | 60 % | 12 % | 54 % | 94 % | 79 % | 0 % |
| grille détectée | enregistrements réels | 24 | 81 % | 76 % | 62 % | 49 % | 69 % | — | 38 % | 92 % | 79 % | 0 % |
| grille détectée | réels, façon vieux disque | 24 | 84 % | 80 % | 59 % | 45 % | 69 % | — | 37 % | 81 % | 58 % | 0 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 70 % | 56 % |
| grille détectée | synthèse, vieux disque | 59 % | 42 % |
| grille détectée | enregistrements réels | 81 % | 62 % |
| grille détectée | réels, façon vieux disque | 84 % | 58 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 77 % / 64 % |  | 71 % / 55 % |  |  |  |  |  |
| bossa | 68 % / 59 % |  | 51 % / 39 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 91 % / 66 % |  | 90 % / 56 % |  |
| guitare-jazz |  |  |  |  | 71 % / 57 % |  | 79 % / 61 % |  |
| modal | 36 % / 24 % |  | 23 % / 6 % |  |  |  |  |  |
| shuffle | 72 % / 66 % |  | 60 % / 55 % |  |  |  |  |  |
| swing | 61 % / 47 % |  | 49 % / 32 % |  |  |  |  |  |
| trad | 94 % / 81 % |  | 92 % / 70 % |  |  |  |  |  |
| waltz | 70 % / 50 % |  | 58 % / 41 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 23 % | 24 % | 6 % | 4 % |
| bonne fondamentale, septième ou sixte fausse | 20 % | 21 % | 37 % | 51 % |
| fondamentale à une tierce (mineure) | 15 % | 17 % | 14 % | 10 % |
| accord voisin (décalé d’un temps ou plus) | 10 % | 7 % | 11 % | 8 % |
| bonne fondamentale, famille fausse | 9 % | 8 % | 12 % | 10 % |
| fondamentale à une tierce (majeure) | 9 % | 8 % | 10 % | 10 % |
| fondamentale à un ton | 6 % | 8 % | 2 % | 3 % |
| fondamentale à un demi-ton | 5 % | 4 % | 2 % | 1 % |
| fondamentale au triton | 3 % | 2 % | 0 % | 0 % |
| aucun accord | 0 % | 1 % | 6 % | 2 % |
| *temps faux / tous les temps* | 44 % | 58 % | 38 % | 41 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

7 → maj (18 %) · maj7 → maj (15 %) · m7 → m (13 %) · maj → maj7 (11 %) · m7 → 7 (8 %) · m7b5 → m7 (6 %) · maj → 7 (4 %) · 6 → maj (3 %) · 7 → m7 (3 %) · m6 → m (3 %) · maj → m (1 %) · m → maj (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 26 % | 66 % | 35 % | 40 % |
| grille détectée | synthèse, vieux disque | 33 % | 75 % | 49 % | 43 % |
| grille détectée | enregistrements réels | 20 % | 62 % | 32 % | 33 % |
| grille détectée | réels, façon vieux disque | 14 % | 65 % | 38 % | 22 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
