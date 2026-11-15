# Banc accords — variante `modele-app`

22 morceaux, mesuré le 2026-11-15 (9 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 14 | 67 % | 64 % | 58 % | 31 % | 68 % | 39 % | 18 % | 96 % | 90 % | 57 % |
| grille détectée | synthèse, vieux disque | 14 | 53 % | 48 % | 42 % | 24 % | 54 % | 55 % | 16 % | 92 % | 76 % | 50 % |
| grille détectée | enregistrements réels | 8 | 80 % | 79 % | 69 % | 69 % | 77 % | — | 13 % | 91 % | 74 % | 75 % |
| grille détectée | réels, façon vieux disque | 8 | 88 % | 87 % | 75 % | 67 % | 78 % | — | 16 % | 79 % | 43 % | 88 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 69 % | 59 % |
| grille détectée | synthèse, vieux disque | 55 % | 44 % |
| grille détectée | enregistrements réels | 83 % | 72 % |
| grille détectée | réels, façon vieux disque | 88 % | 74 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 83 % / 71 % |  | 77 % / 57 % |  |  |  |  |  |
| bossa | 60 % / 52 % |  | 45 % / 36 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 90 % / 83 % |  | 86 % / 72 % |  |
| guitare-jazz |  |  |  |  | 70 % / 55 % |  | 89 % / 78 % |  |
| modal | 72 % / 65 % |  | 34 % / 29 % |  |  |  |  |  |
| shuffle | 82 % / 81 % |  | 74 % / 72 % |  |  |  |  |  |
| swing | 53 % / 42 % |  | 41 % / 31 % |  |  |  |  |  |
| trad | 90 % / 86 % |  | 76 % / 65 % |  |  |  |  |  |
| waltz | 71 % / 48 % |  | 54 % / 37 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 26 % | 32 % | 12 % | 9 % |
| fondamentale à une tierce (mineure) | 14 % | 14 % | 24 % | 0 % |
| accord voisin (décalé d’un temps ou plus) | 14 % | 11 % | 6 % | 16 % |
| bonne fondamentale, septième ou sixte fausse | 12 % | 10 % | 31 % | 47 % |
| fondamentale à un ton | 10 % | 11 % | 4 % | 6 % |
| bonne fondamentale, famille fausse | 8 % | 7 % | 3 % | 4 % |
| fondamentale à une tierce (majeure) | 6 % | 5 % | 6 % | 17 % |
| fondamentale à un demi-ton | 6 % | 4 % | 0 % | 0 % |
| fondamentale au triton | 3 % | 3 % | 0 % | 0 % |
| aucun accord | 0 % | 3 % | 14 % | 1 % |
| *temps faux / tous les temps* | 42 % | 58 % | 31 % | 25 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (22 %) · 7 → maj (15 %) · m7 → m (11 %) · maj7 → maj (9 %) · m7b5 → m7 (5 %) · m6 → m7 (4 %) · maj7 → 7 (4 %) · maj → maj7 (4 %) · 7 → m7 (3 %) · m → m7 (3 %) · maj → 7 (3 %) · m6 → m (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 55 % | 55 % | 27 % | 71 % |
| grille détectée | synthèse, vieux disque | 57 % | 70 % | 41 % | 69 % |
| grille détectée | enregistrements réels | 23 % | 73 % | 18 % | 54 % |
| grille détectée | réels, façon vieux disque | 12 % | 100 % | 15 % | 47 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
