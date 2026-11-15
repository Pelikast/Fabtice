# Banc accords — variante `modele-app`

22 morceaux, mesuré le 2026-11-15 (9 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 14 | 69 % | 65 % | 56 % | 32 % | 70 % | 26 % | 28 % | 96 % | 90 % | 64 % |
| grille détectée | synthèse, vieux disque | 14 | 57 % | 51 % | 41 % | 26 % | 57 % | 32 % | 30 % | 92 % | 76 % | 64 % |
| grille détectée | enregistrements réels | 8 | 88 % | 86 % | 71 % | 69 % | 83 % | — | 16 % | 91 % | 74 % | 75 % |
| grille détectée | réels, façon vieux disque | 8 | 88 % | 88 % | 60 % | 59 % | 77 % | — | 15 % | 79 % | 43 % | 88 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 70 % | 57 % |
| grille détectée | synthèse, vieux disque | 58 % | 42 % |
| grille détectée | enregistrements réels | 89 % | 71 % |
| grille détectée | réels, façon vieux disque | 87 % | 61 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 85 % / 71 % |  | 79 % / 61 % |  |  |  |  |  |
| bossa | 76 % / 64 % |  | 46 % / 33 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 95 % / 72 % |  | 85 % / 52 % |  |
| guitare-jazz |  |  |  |  | 80 % / 70 % |  | 92 % / 69 % |  |
| modal | 36 % / 25 % |  | 24 % / 3 % |  |  |  |  |  |
| shuffle | 81 % / 71 % |  | 66 % / 61 % |  |  |  |  |  |
| swing | 56 % / 43 % |  | 43 % / 27 % |  |  |  |  |  |
| trad | 92 % / 84 % |  | 92 % / 76 % |  |  |  |  |  |
| waltz | 71 % / 44 % |  | 66 % / 45 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 26 % | 27 % | 10 % | 9 % |
| bonne fondamentale, septième ou sixte fausse | 19 % | 17 % | 54 % | 68 % |
| accord voisin (décalé d’un temps ou plus) | 14 % | 8 % | 8 % | 6 % |
| fondamentale à une tierce (mineure) | 11 % | 16 % | 19 % | 0 % |
| bonne fondamentale, famille fausse | 9 % | 9 % | 4 % | 2 % |
| fondamentale à un ton | 8 % | 10 % | 5 % | 4 % |
| fondamentale à une tierce (majeure) | 5 % | 6 % | 0 % | 11 % |
| fondamentale à un demi-ton | 4 % | 4 % | 0 % | 0 % |
| fondamentale au triton | 2 % | 2 % | 0 % | 0 % |
| aucun accord | 1 % | 1 % | 1 % | 1 % |
| *temps faux / tous les temps* | 44 % | 59 % | 29 % | 40 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

7 → maj (19 %) · m7 → m (17 %) · maj7 → maj (12 %) · m7 → 7 (10 %) · m7b5 → m7 (7 %) · maj → maj7 (6 %) · maj → 7 (6 %) · 7 → m7 (5 %) · 6 → maj (4 %) · m7 → maj (2 %) · m6 → m (2 %) · m6 → m7 (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 39 % | 63 % | 32 % | 56 % |
| grille détectée | synthèse, vieux disque | 41 % | 74 % | 49 % | 52 % |
| grille détectée | enregistrements réels | 4 % | 100 % | 26 % | 14 % |
| grille détectée | réels, façon vieux disque | 15 % | 96 % | 30 % | 36 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
