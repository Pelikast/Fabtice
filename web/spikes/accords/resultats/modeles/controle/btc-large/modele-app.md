# Banc accords — variante `modele-app`

22 morceaux, mesuré le 2026-11-15 (8 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 10 | 74 % | 69 % | 58 % | 38 % | 74 % | 19 % | 25 % | 99 % | 96 % | 70 % |
| grille détectée | synthèse, vieux disque | 10 | 63 % | 58 % | 47 % | 33 % | 63 % | 18 % | 26 % | 94 % | 77 % | 70 % |
| grille détectée | enregistrements réels | 12 | 79 % | 78 % | 62 % | 45 % | 64 % | — | 22 % | 94 % | 80 % | 75 % |
| grille détectée | réels, façon vieux disque | 12 | 86 % | 83 % | 57 % | 40 % | 66 % | — | 26 % | 88 % | 62 % | 92 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 74 % | 57 % |
| grille détectée | synthèse, vieux disque | 63 % | 45 % |
| grille détectée | enregistrements réels | 81 % | 63 % |
| grille détectée | réels, façon vieux disque | 86 % | 57 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 84 % / 59 % |  | 80 % / 55 % |  |  |  |  |  |
| bossa | 69 % / 61 % |  | 42 % / 34 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 91 % / 66 % |  | 92 % / 56 % |  |
| guitare-jazz |  |  |  |  | 68 % / 59 % |  | 80 % / 58 % |  |
| swing | 60 % / 45 % |  | 48 % / 29 % |  |  |  |  |  |
| trad | 97 % / 88 % |  | 95 % / 86 % |  |  |  |  |  |
| waltz | 84 % / 38 % |  | 75 % / 35 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| bonne fondamentale, septième ou sixte fausse | 24 % | 21 % | 40 % | 61 % |
| fondamentale à la quinte / quarte | 20 % | 21 % | 9 % | 6 % |
| fondamentale à une tierce (mineure) | 12 % | 17 % | 11 % | 5 % |
| bonne fondamentale, famille fausse | 11 % | 9 % | 5 % | 7 % |
| accord voisin (décalé d’un temps ou plus) | 10 % | 9 % | 9 % | 9 % |
| fondamentale à une tierce (majeure) | 10 % | 9 % | 10 % | 5 % |
| fondamentale à un ton | 5 % | 7 % | 2 % | 2 % |
| fondamentale à un demi-ton | 4 % | 5 % | 2 % | 3 % |
| fondamentale au triton | 2 % | 2 % | 0 % | 0 % |
| aucun accord | 1 % | 1 % | 12 % | 2 % |
| *temps faux / tous les temps* | 42 % | 53 % | 38 % | 43 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

maj7 → maj (26 %) · 7 → maj (21 %) · m7 → m (15 %) · m7 → 7 (9 %) · m7b5 → m7 (6 %) · 7 → m7 (3 %) · m6 → m (3 %) · m → maj (2 %) · maj → 7 (2 %) · 6 → maj (2 %) · m(maj7) → m (1 %) · 7 → m (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 29 % | 63 % | 33 % | 44 % |
| grille détectée | synthèse, vieux disque | 33 % | 71 % | 45 % | 43 % |
| grille détectée | enregistrements réels | 14 % | 74 % | 32 % | 28 % |
| grille détectée | réels, façon vieux disque | 13 % | 73 % | 39 % | 23 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
