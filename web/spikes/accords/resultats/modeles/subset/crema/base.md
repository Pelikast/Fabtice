# Banc accords — variante `base`

22 morceaux, mesuré le 2026-11-15 (7 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 14 | 68 % | 62 % | 55 % | 29 % | 69 % | 63 % | 11 % | 96 % | 90 % | 71 % |
| grille détectée | synthèse, vieux disque | 14 | 58 % | 54 % | 46 % | 26 % | 58 % | 68 % | 13 % | 92 % | 76 % | 57 % |
| grille détectée | enregistrements réels | 8 | 92 % | 91 % | 84 % | 78 % | 86 % | — | 9 % | 91 % | 74 % | 88 % |
| grille détectée | réels, façon vieux disque | 8 | 88 % | 87 % | 77 % | 68 % | 78 % | — | 18 % | 79 % | 43 % | 88 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 71 % | 58 % |
| grille détectée | synthèse, vieux disque | 62 % | 49 % |
| grille détectée | enregistrements réels | 93 % | 85 % |
| grille détectée | réels, façon vieux disque | 87 % | 75 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 94 % / 82 % |  | 88 % / 73 % |  |  |  |  |  |
| bossa | 84 % / 73 % |  | 62 % / 48 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 89 % |  | 90 % / 82 % |  |
| guitare-jazz |  |  |  |  | 86 % / 80 % |  | 86 % / 71 % |  |
| modal | 65 % / 34 % |  | 50 % / 26 % |  |  |  |  |  |
| shuffle | 79 % / 66 % |  | 78 % / 74 % |  |  |  |  |  |
| swing | 47 % / 38 % |  | 37 % / 31 % |  |  |  |  |  |
| trad | 87 % / 75 % |  | 86 % / 72 % |  |  |  |  |  |
| waltz | 61 % / 40 % |  | 53 % / 35 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 26 % | 25 % | 11 % | 23 % |
| accord voisin (décalé d’un temps ou plus) | 16 % | 14 % | 10 % | 14 % |
| bonne fondamentale, septième ou sixte fausse | 16 % | 14 % | 43 % | 44 % |
| bonne fondamentale, famille fausse | 12 % | 7 % | 7 % | 3 % |
| fondamentale à un ton | 9 % | 10 % | 2 % | 6 % |
| fondamentale à une tierce (mineure) | 8 % | 14 % | 13 % | 0 % |
| fondamentale à un demi-ton | 7 % | 5 % | 2 % | 0 % |
| fondamentale à une tierce (majeure) | 4 % | 6 % | 5 % | 8 % |
| fondamentale au triton | 2 % | 2 % | 7 % | 0 % |
| aucun accord | 0 % | 4 % | 2 % | 1 % |
| *temps faux / tous les temps* | 45 % | 54 % | 16 % | 23 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (22 %) · 7 → maj (20 %) · m7 → m (14 %) · dim7 → dim (5 %) · maj7 → maj (4 %) · m6 → m7 (3 %) · 7 → m7 (3 %) · 6 → maj7 (2 %) · 6 → maj (2 %) · m6 → m (2 %) · maj → 7 (2 %) · maj7 → 7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 29 % | 71 % | 35 % | 45 % |
| grille détectée | synthèse, vieux disque | 32 % | 71 % | 46 % | 42 % |
| grille détectée | enregistrements réels | 11 % | 39 % | 13 % | 28 % |
| grille détectée | réels, façon vieux disque | 7 % | 93 % | 18 % | 29 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
