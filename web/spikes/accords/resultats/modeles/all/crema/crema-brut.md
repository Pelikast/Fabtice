# Banc accords — variante `crema-brut`

49 morceaux, mesuré le 2026-11-15 (2 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 25 | 70 % | 65 % | 58 % | 33 % | 71 % | 36 % | 38 % | 95 % | 89 % | 0 % |
| grille détectée | synthèse, vieux disque | 25 | 61 % | 57 % | 48 % | 29 % | 62 % | 38 % | 38 % | 94 % | 79 % | 0 % |
| grille détectée | enregistrements réels | 24 | 85 % | 81 % | 68 % | 54 % | 72 % | — | 32 % | 92 % | 79 % | 0 % |
| grille détectée | réels, façon vieux disque | 24 | 84 % | 79 % | 66 % | 49 % | 69 % | — | 32 % | 81 % | 58 % | 0 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 72 % | 59 % |
| grille détectée | synthèse, vieux disque | 63 % | 50 % |
| grille détectée | enregistrements réels | 85 % | 68 % |
| grille détectée | réels, façon vieux disque | 83 % | 65 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 90 % / 77 % |  | 84 % / 67 % |  |  |  |  |  |
| bossa | 82 % / 71 % |  | 65 % / 53 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 92 % / 72 % |  | 89 % / 66 % |  |
| guitare-jazz |  |  |  |  | 77 % / 64 % |  | 78 % / 66 % |  |
| modal | 63 % / 34 % |  | 44 % / 23 % |  |  |  |  |  |
| shuffle | 79 % / 69 % |  | 79 % / 73 % |  |  |  |  |  |
| swing | 57 % / 44 % |  | 46 % / 35 % |  |  |  |  |  |
| trad | 90 % / 80 % |  | 90 % / 73 % |  |  |  |  |  |
| waltz | 64 % / 47 % |  | 54 % / 42 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 24 % | 24 % | 9 % | 11 % |
| accord voisin (décalé d’un temps ou plus) | 18 % | 12 % | 14 % | 11 % |
| bonne fondamentale, septième ou sixte fausse | 16 % | 17 % | 38 % | 37 % |
| bonne fondamentale, famille fausse | 12 % | 7 % | 13 % | 14 % |
| fondamentale à une tierce (mineure) | 10 % | 15 % | 12 % | 11 % |
| fondamentale à un ton | 7 % | 9 % | 3 % | 5 % |
| fondamentale à un demi-ton | 6 % | 4 % | 1 % | 1 % |
| fondamentale à une tierce (majeure) | 4 % | 6 % | 10 % | 8 % |
| fondamentale au triton | 3 % | 2 % | 0 % | 0 % |
| aucun accord | 0 % | 3 % | 1 % | 1 % |
| *temps faux / tous les temps* | 42 % | 52 % | 32 % | 34 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

7 → maj (18 %) · m7 → 7 (15 %) · m7 → m (12 %) · maj7 → maj (10 %) · 6 → maj (3 %) · maj7 → 7 (3 %) · dim7 → dim (3 %) · m6 → m (3 %) · m6 → m7 (3 %) · m → maj (3 %) · 7 → m7 (2 %) · maj → m (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 31 % | 63 % | 33 % | 47 % |
| grille détectée | synthèse, vieux disque | 33 % | 68 % | 44 % | 44 % |
| grille détectée | enregistrements réels | 24 % | 48 % | 26 % | 37 % |
| grille détectée | réels, façon vieux disque | 20 % | 50 % | 30 % | 29 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
