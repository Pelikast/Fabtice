# Banc accords — variante `modele-app`

49 morceaux, mesuré le 2026-11-15 (15 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 25 | 69 % | 64 % | 58 % | 34 % | 70 % | 39 % | 18 % | 95 % | 89 % | 52 % |
| grille détectée | synthèse, vieux disque | 25 | 56 % | 51 % | 43 % | 26 % | 57 % | 54 % | 14 % | 94 % | 79 % | 48 % |
| grille détectée | enregistrements réels | 24 | 67 % | 64 % | 55 % | 47 % | 61 % | — | 15 % | 92 % | 79 % | 71 % |
| grille détectée | réels, façon vieux disque | 24 | 73 % | 69 % | 58 % | 46 % | 62 % | — | 17 % | 81 % | 58 % | 63 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 70 % | 58 % |
| grille détectée | synthèse, vieux disque | 57 % | 44 % |
| grille détectée | enregistrements réels | 68 % | 56 % |
| grille détectée | réels, façon vieux disque | 72 % | 57 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 80 % / 69 % |  | 74 % / 56 % |  |  |  |  |  |
| bossa | 67 % / 59 % |  | 54 % / 46 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 79 % / 68 % |  | 77 % / 62 % |  |
| guitare-jazz |  |  |  |  | 55 % / 41 % |  | 68 % / 53 % |  |
| modal | 72 % / 65 % |  | 34 % / 29 % |  |  |  |  |  |
| shuffle | 82 % / 81 % |  | 74 % / 72 % |  |  |  |  |  |
| swing | 57 % / 43 % |  | 43 % / 32 % |  |  |  |  |  |
| trad | 92 % / 85 % |  | 84 % / 63 % |  |  |  |  |  |
| waltz | 66 % / 47 % |  | 52 % / 38 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 25 % | 30 % | 11 % | 12 % |
| fondamentale à une tierce (mineure) | 15 % | 13 % | 11 % | 10 % |
| bonne fondamentale, septième ou sixte fausse | 14 % | 14 % | 20 % | 26 % |
| accord voisin (décalé d’un temps ou plus) | 13 % | 10 % | 7 % | 8 % |
| bonne fondamentale, famille fausse | 11 % | 7 % | 7 % | 9 % |
| fondamentale à un ton | 7 % | 10 % | 4 % | 7 % |
| fondamentale à une tierce (majeure) | 7 % | 5 % | 8 % | 11 % |
| fondamentale à un demi-ton | 5 % | 4 % | 2 % | 3 % |
| fondamentale au triton | 3 % | 2 % | 0 % | 0 % |
| aucun accord | 0 % | 5 % | 31 % | 15 % |
| *temps faux / tous les temps* | 42 % | 57 % | 45 % | 42 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (15 %) · 7 → maj (14 %) · maj7 → maj (12 %) · m7 → m (10 %) · maj → maj7 (10 %) · m7b5 → m7 (5 %) · m → maj (4 %) · 6 → maj (3 %) · 7 → m7 (3 %) · m6 → m (3 %) · m6 → m7 (3 %) · maj7 → 7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 51 % | 60 % | 24 % | 72 % |
| grille détectée | synthèse, vieux disque | 53 % | 70 % | 41 % | 66 % |
| grille détectée | enregistrements réels | 39 % | 64 % | 34 % | 55 % |
| grille détectée | réels, façon vieux disque | 24 % | 70 % | 33 % | 39 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
