# Banc accords — variante `base`

49 morceaux, mesuré le 2026-11-15 (96 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 25 | 70 % | 64 % | 57 % | 32 % | 71 % | 64 % | 11 % | 95 % | 89 % | 68 % |
| grille détectée | synthèse, vieux disque | 25 | 61 % | 57 % | 49 % | 30 % | 61 % | 66 % | 13 % | 94 % | 79 % | 60 % |
| grille détectée | enregistrements réels | 24 | 85 % | 81 % | 70 % | 55 % | 73 % | — | 13 % | 92 % | 79 % | 88 % |
| grille détectée | réels, façon vieux disque | 24 | 83 % | 78 % | 64 % | 47 % | 69 % | — | 17 % | 81 % | 58 % | 83 % |
| vraie grille | synthèse, son propre | 25 | 71 % | 65 % | 58 % | 33 % | 71 % | 62 % | 11 % | (vraie) | (vraie) | 68 % |
| vraie grille | synthèse, vieux disque | 25 | 62 % | 58 % | 49 % | 30 % | 62 % | 66 % | 10 % | (vraie) | (vraie) | 60 % |
| vraie grille | enregistrements réels | 24 | 87 % | 83 % | 71 % | 56 % | 75 % | — | 12 % | (vraie) | (vraie) | 88 % |
| vraie grille | réels, façon vieux disque | 24 | 85 % | 80 % | 66 % | 49 % | 71 % | — | 12 % | (vraie) | (vraie) | 83 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 72 % | 59 % |
| grille détectée | synthèse, vieux disque | 64 % | 51 % |
| grille détectée | enregistrements réels | 86 % | 70 % |
| grille détectée | réels, façon vieux disque | 83 % | 63 % |
| vraie grille | synthèse, son propre | 73 % | 60 % |
| vraie grille | synthèse, vieux disque | 65 % | 52 % |
| vraie grille | enregistrements réels | 88 % | 72 % |
| vraie grille | réels, façon vieux disque | 86 % | 66 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 93 % / 81 % | 93 % / 81 % | 85 % / 71 % | 85 % / 71 % |  |  |  |  |
| bossa | 85 % / 74 % | 85 % / 75 % | 67 % / 54 % | 67 % / 55 % |  |  |  |  |
| guitare-bossa |  |  |  |  | 93 % / 74 % | 94 % / 73 % | 88 % / 63 % | 90 % / 65 % |
| guitare-jazz |  |  |  |  | 76 % / 65 % | 80 % / 69 % | 78 % / 65 % | 80 % / 67 % |
| modal | 65 % / 34 % | 66 % / 35 % | 50 % / 26 % | 50 % / 26 % |  |  |  |  |
| shuffle | 79 % / 66 % | 81 % / 67 % | 78 % / 74 % | 79 % / 72 % |  |  |  |  |
| swing | 54 % / 42 % | 55 % / 43 % | 45 % / 35 % | 46 % / 35 % |  |  |  |  |
| trad | 90 % / 79 % | 90 % / 81 % | 89 % / 74 % | 91 % / 74 % |  |  |  |  |
| waltz | 65 % / 47 % | 65 % / 47 % | 52 % / 38 % | 52 % / 38 % |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, vraie grille | enregistrements réels, vraie grille | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| fondamentale à la quinte / quarte | 27 % | 24 % | 11 % | 14 % | 27 % | 25 % | 8 % | 11 % |
| accord voisin (décalé d’un temps ou plus) | 16 % | 12 % | 10 % | 10 % | 16 % | 11 % | 8 % | 8 % |
| bonne fondamentale, septième ou sixte fausse | 15 % | 16 % | 37 % | 38 % | 15 % | 17 % | 41 % | 40 % |
| bonne fondamentale, famille fausse | 12 % | 7 % | 13 % | 14 % | 12 % | 7 % | 14 % | 15 % |
| fondamentale à une tierce (mineure) | 9 % | 14 % | 13 % | 10 % | 9 % | 15 % | 13 % | 10 % |
| fondamentale à un ton | 7 % | 9 % | 4 % | 6 % | 7 % | 9 % | 3 % | 5 % |
| fondamentale à un demi-ton | 6 % | 4 % | 0 % | 1 % | 7 % | 4 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 4 % | 7 % | 11 % | 7 % | 4 % | 6 % | 12 % | 9 % |
| fondamentale au triton | 2 % | 2 % | 1 % | 0 % | 2 % | 2 % | 0 % | 0 % |
| aucun accord | 0 % | 3 % | 0 % | 0 % | 0 % | 3 % | 0 % | 0 % |
| *temps faux / tous les temps* | 43 % | 51 % | 30 % | 36 % | 42 % | 51 % | 29 % | 34 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

7 → maj (18 %) · m7 → 7 (16 %) · m7 → m (13 %) · maj7 → maj (10 %) · 6 → maj (3 %) · m → maj (3 %) · m6 → m7 (3 %) · maj7 → 7 (3 %) · 7 → m7 (3 %) · dim7 → dim (3 %) · maj → m (2 %) · maj → 7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 26 % | 69 % | 34 % | 41 % |
| grille détectée | synthèse, vieux disque | 30 % | 71 % | 43 % | 41 % |
| grille détectée | enregistrements réels | 18 % | 60 % | 24 % | 36 % |
| grille détectée | réels, façon vieux disque | 13 % | 71 % | 30 % | 26 % |
| vraie grille | synthèse, son propre | 24 % | 67 % | 33 % | 39 % |
| vraie grille | synthèse, vieux disque | 29 % | 72 % | 43 % | 41 % |
| vraie grille | enregistrements réels | 12 % | 60 % | 24 % | 26 % |
| vraie grille | réels, façon vieux disque | 9 % | 70 % | 30 % | 19 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
