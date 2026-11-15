# Banc accords — variante `base`

27 morceaux, mesuré le 2026-11-15 (7 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 15 | 69 % | 63 % | 58 % | 30 % | 70 % | 72 % | 9 % | 92 % | 85 % | 67 % |
| grille détectée | synthèse, vieux disque | 15 | 60 % | 55 % | 49 % | 28 % | 60 % | 74 % | 9 % | 94 % | 81 % | 67 % |
| grille détectée | enregistrements réels | 12 | 86 % | 81 % | 68 % | 58 % | 77 % | — | 13 % | 91 % | 78 % | 100 % |
| grille détectée | réels, façon vieux disque | 12 | 84 % | 77 % | 62 % | 50 % | 74 % | — | 16 % | 75 % | 55 % | 83 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 72 % | 62 % |
| grille détectée | synthèse, vieux disque | 63 % | 52 % |
| grille détectée | enregistrements réels | 86 % | 69 % |
| grille détectée | réels, façon vieux disque | 83 % | 61 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 92 % / 84 % |  | 86 % / 75 % |  |  |  |  |  |
| bossa | 88 % / 79 % |  | 74 % / 62 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 90 % / 70 % |  | 87 % / 63 % |  |
| guitare-jazz |  |  |  |  | 81 % / 66 % |  | 80 % / 61 % |  |
| modal | 65 % / 34 % |  | 50 % / 26 % |  |  |  |  |  |
| shuffle | 79 % / 66 % |  | 78 % / 74 % |  |  |  |  |  |
| swing | 53 % / 44 % |  | 42 % / 35 % |  |  |  |  |  |
| trad | 84 % / 73 % |  | 88 % / 68 % |  |  |  |  |  |
| waltz | 58 % / 50 % |  | 41 % / 37 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 30 % | 26 % | 11 % | 13 % |
| accord voisin (décalé d’un temps ou plus) | 20 % | 13 % | 10 % | 6 % |
| bonne fondamentale, famille fausse | 13 % | 9 % | 16 % | 18 % |
| bonne fondamentale, septième ou sixte fausse | 10 % | 11 % | 38 % | 39 % |
| fondamentale à un ton | 9 % | 11 % | 5 % | 4 % |
| fondamentale à une tierce (mineure) | 7 % | 14 % | 10 % | 9 % |
| fondamentale à un demi-ton | 7 % | 5 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 3 % | 5 % | 9 % | 10 % |
| fondamentale au triton | 1 % | 2 % | 0 % | 0 % |
| aucun accord | 0 % | 3 % | 0 % | 0 % |
| *temps faux / tous les temps* | 42 % | 51 % | 32 % | 38 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (23 %) · 7 → maj (15 %) · m7 → m (15 %) · maj7 → maj (6 %) · 6 → maj (5 %) · m → maj (4 %) · 7 → m7 (4 %) · dim7 → dim (3 %) · maj → m (3 %) · maj → 7 (2 %) · m6 → m7 (2 %) · sus4 → maj (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 25 % | 68 % | 33 % | 41 % |
| grille détectée | synthèse, vieux disque | 27 % | 70 % | 45 % | 36 % |
| grille détectée | enregistrements réels | 12 % | 64 % | 27 % | 25 % |
| grille détectée | réels, façon vieux disque | 14 % | 82 % | 31 % | 31 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
