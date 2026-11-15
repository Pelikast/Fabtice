# Banc accords — variante `modele-mix`

27 morceaux, mesuré le 2026-11-15 (6 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 15 | 75 % | 71 % | 67 % | 34 % | 75 % | 55 % | 14 % | 92 % | 85 % | 67 % |
| grille détectée | synthèse, vieux disque | 15 | 62 % | 58 % | 51 % | 29 % | 61 % | 58 % | 15 % | 94 % | 81 % | 67 % |
| grille détectée | enregistrements réels | 12 | 86 % | 81 % | 69 % | 58 % | 76 % | — | 13 % | 91 % | 78 % | 100 % |
| grille détectée | réels, façon vieux disque | 12 | 84 % | 78 % | 64 % | 53 % | 73 % | — | 16 % | 75 % | 55 % | 83 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 77 % | 69 % |
| grille détectée | synthèse, vieux disque | 64 % | 53 % |
| grille détectée | enregistrements réels | 86 % | 69 % |
| grille détectée | réels, façon vieux disque | 83 % | 64 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 90 % / 82 % |  | 86 % / 74 % |  |  |  |  |  |
| bossa | 89 % / 81 % |  | 71 % / 60 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 91 % / 71 % |  | 87 % / 65 % |  |
| guitare-jazz |  |  |  |  | 80 % / 68 % |  | 80 % / 64 % |  |
| modal | 57 % / 52 % |  | 39 % / 12 % |  |  |  |  |  |
| shuffle | 87 % / 81 % |  | 76 % / 69 % |  |  |  |  |  |
| swing | 64 % / 56 % |  | 49 % / 39 % |  |  |  |  |  |
| trad | 89 % / 79 % |  | 88 % / 77 % |  |  |  |  |  |
| waltz | 69 % / 62 % |  | 51 % / 45 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 27 % | 26 % | 6 % | 9 % |
| accord voisin (décalé d’un temps ou plus) | 23 % | 13 % | 9 % | 6 % |
| bonne fondamentale, septième ou sixte fausse | 13 % | 13 % | 38 % | 38 % |
| fondamentale à une tierce (mineure) | 11 % | 18 % | 15 % | 14 % |
| bonne fondamentale, famille fausse | 8 % | 8 % | 16 % | 15 % |
| fondamentale à un demi-ton | 7 % | 4 % | 0 % | 0 % |
| fondamentale à un ton | 6 % | 8 % | 3 % | 5 % |
| fondamentale à une tierce (majeure) | 3 % | 6 % | 13 % | 12 % |
| fondamentale au triton | 2 % | 2 % | 0 % | 0 % |
| aucun accord | 0 % | 1 % | 0 % | 0 % |
| *temps faux / tous les temps* | 33 % | 49 % | 31 % | 36 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → m (17 %) · 7 → maj (15 %) · m7 → 7 (14 %) · maj7 → maj (8 %) · 6 → maj (7 %) · m7b5 → m7 (5 %) · m6 → m (5 %) · maj → 7 (4 %) · maj → m (3 %) · 7 → m7 (3 %) · m6 → m7 (3 %) · sus4 → maj (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 36 % | 56 % | 20 % | 61 % |
| grille détectée | synthèse, vieux disque | 40 % | 72 % | 33 % | 60 % |
| grille détectée | enregistrements réels | 9 % | 62 % | 28 % | 19 % |
| grille détectée | réels, façon vieux disque | 9 % | 70 % | 32 % | 18 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
