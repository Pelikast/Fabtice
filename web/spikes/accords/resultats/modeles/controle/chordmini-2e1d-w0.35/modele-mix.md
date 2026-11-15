# Banc accords — variante `modele-mix`

22 morceaux, mesuré le 2026-11-15 (7 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 10 | 74 % | 69 % | 61 % | 39 % | 74 % | 46 % | 10 % | 99 % | 96 % | 70 % |
| grille détectée | synthèse, vieux disque | 10 | 64 % | 62 % | 53 % | 35 % | 64 % | 48 % | 13 % | 94 % | 77 % | 50 % |
| grille détectée | enregistrements réels | 12 | 82 % | 81 % | 74 % | 54 % | 68 % | — | 13 % | 94 % | 80 % | 75 % |
| grille détectée | réels, façon vieux disque | 12 | 84 % | 82 % | 73 % | 48 % | 65 % | — | 17 % | 88 % | 62 % | 83 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 75 % | 61 % |
| grille détectée | synthèse, vieux disque | 65 % | 53 % |
| grille détectée | enregistrements réels | 84 % | 75 % |
| grille détectée | réels, façon vieux disque | 84 % | 72 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 95 % / 77 % |  | 86 % / 66 % |  |  |  |  |  |
| bossa | 81 % / 69 % |  | 55 % / 44 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 96 % / 84 % |  | 91 % / 73 % |  |
| guitare-jazz |  |  |  |  | 68 % / 64 % |  | 78 % / 72 % |  |
| swing | 56 % / 43 % |  | 47 % / 36 % |  |  |  |  |  |
| trad | 98 % / 95 % |  | 92 % / 88 % |  |  |  |  |  |
| waltz | 88 % / 44 % |  | 81 % / 46 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 25 % | 26 % | 11 % | 13 % |
| bonne fondamentale, septième ou sixte fausse | 19 % | 18 % | 29 % | 34 % |
| fondamentale à une tierce (mineure) | 13 % | 15 % | 20 % | 11 % |
| accord voisin (décalé d’un temps ou plus) | 12 % | 12 % | 11 % | 18 % |
| bonne fondamentale, famille fausse | 10 % | 4 % | 3 % | 8 % |
| fondamentale à une tierce (majeure) | 6 % | 7 % | 17 % | 9 % |
| fondamentale à un ton | 5 % | 9 % | 6 % | 5 % |
| fondamentale à un demi-ton | 5 % | 3 % | 3 % | 1 % |
| fondamentale au triton | 5 % | 3 % | 0 % | 0 % |
| aucun accord | 0 % | 4 % | 1 % | 1 % |
| *temps faux / tous les temps* | 39 % | 47 % | 26 % | 27 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

maj7 → maj (19 %) · 7 → maj (14 %) · m7 → 7 (14 %) · m7 → m (11 %) · maj7 → 7 (5 %) · m → m7 (4 %) · m6 → m7 (4 %) · m6 → m (3 %) · 7 → m7 (3 %) · 6 → maj (3 %) · m → maj (3 %) · m7b5 → dim (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 33 % | 66 % | 25 % | 57 % |
| grille détectée | synthèse, vieux disque | 39 % | 70 % | 33 % | 58 % |
| grille détectée | enregistrements réels | 29 % | 63 % | 11 % | 69 % |
| grille détectée | réels, façon vieux disque | 20 % | 39 % | 25 % | 28 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
