# Banc accords — variante `modele-brut`

22 morceaux, mesuré le 2026-11-15 (2 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 14 | 64 % | 60 % | 54 % | 29 % | 65 % | 12 % | 56 % | 96 % | 90 % | 0 % |
| grille détectée | synthèse, vieux disque | 14 | 54 % | 48 % | 43 % | 24 % | 54 % | 22 % | 54 % | 92 % | 76 % | 0 % |
| grille détectée | enregistrements réels | 8 | 78 % | 78 % | 67 % | 67 % | 75 % | — | 41 % | 91 % | 74 % | 0 % |
| grille détectée | réels, façon vieux disque | 8 | 86 % | 86 % | 74 % | 65 % | 77 % | — | 27 % | 79 % | 43 % | 0 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 65 % | 55 % |
| grille détectée | synthèse, vieux disque | 55 % | 43 % |
| grille détectée | enregistrements réels | 81 % | 70 % |
| grille détectée | réels, façon vieux disque | 86 % | 73 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 80 % / 67 % |  | 74 % / 56 % |  |  |  |  |  |
| bossa | 55 % / 48 % |  | 44 % / 34 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 90 % / 82 % |  | 83 % / 71 % |  |
| guitare-jazz |  |  |  |  | 66 % / 52 % |  | 90 % / 77 % |  |
| modal | 47 % / 39 % |  | 32 % / 22 % |  |  |  |  |  |
| shuffle | 83 % / 79 % |  | 74 % / 72 % |  |  |  |  |  |
| swing | 55 % / 44 % |  | 41 % / 31 % |  |  |  |  |  |
| trad | 85 % / 81 % |  | 80 % / 69 % |  |  |  |  |  |
| waltz | 72 % / 48 % |  | 60 % / 42 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 30 % | 30 % | 9 % | 10 % |
| fondamentale à une tierce (mineure) | 16 % | 16 % | 22 % | 1 % |
| fondamentale à un ton | 11 % | 12 % | 4 % | 3 % |
| bonne fondamentale, septième ou sixte fausse | 11 % | 10 % | 32 % | 46 % |
| bonne fondamentale, famille fausse | 9 % | 8 % | 2 % | 3 % |
| accord voisin (décalé d’un temps ou plus) | 8 % | 8 % | 6 % | 10 % |
| fondamentale à une tierce (majeure) | 6 % | 6 % | 1 % | 16 % |
| fondamentale à un demi-ton | 5 % | 3 % | 0 % | 0 % |
| fondamentale au triton | 3 % | 3 % | 0 % | 0 % |
| aucun accord | 1 % | 4 % | 25 % | 12 % |
| *temps faux / tous les temps* | 46 % | 57 % | 33 % | 26 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (22 %) · 7 → maj (16 %) · m7 → m (10 %) · maj7 → maj (7 %) · 7 → m7 (5 %) · m7b5 → m7 (5 %) · m6 → m7 (4 %) · maj → maj7 (4 %) · maj → 7 (3 %) · maj7 → 7 (3 %) · m → m7 (2 %) · m6 → m (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 37 % | 65 % | 34 % | 53 % |
| grille détectée | synthèse, vieux disque | 46 % | 71 % | 46 % | 57 % |
| grille détectée | enregistrements réels | 24 % | 70 % | 21 % | 51 % |
| grille détectée | réels, façon vieux disque | 17 % | 65 % | 18 % | 43 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
