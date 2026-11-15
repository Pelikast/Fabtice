# Banc accords — variante `modele-mix`

27 morceaux, mesuré le 2026-11-15 (11 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 15 | 73 % | 69 % | 66 % | 33 % | 73 % | 60 % | 11 % | 92 % | 85 % | 67 % |
| grille détectée | synthèse, vieux disque | 15 | 61 % | 56 % | 52 % | 29 % | 60 % | 68 % | 9 % | 94 % | 81 % | 67 % |
| grille détectée | enregistrements réels | 12 | 82 % | 76 % | 63 % | 56 % | 75 % | — | 14 % | 91 % | 78 % | 100 % |
| grille détectée | réels, façon vieux disque | 12 | 83 % | 79 % | 65 % | 54 % | 76 % | — | 15 % | 75 % | 55 % | 83 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 75 % | 69 % |
| grille détectée | synthèse, vieux disque | 63 % | 54 % |
| grille détectée | enregistrements réels | 82 % | 64 % |
| grille détectée | réels, façon vieux disque | 83 % | 64 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 89 % / 84 % |  | 80 % / 71 % |  |  |  |  |  |
| bossa | 86 % / 78 % |  | 72 % / 61 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 86 % / 68 % |  | 85 % / 66 % |  |
| guitare-jazz |  |  |  |  | 77 % / 59 % |  | 82 % / 64 % |  |
| modal | 81 % / 76 % |  | 46 % / 36 % |  |  |  |  |  |
| shuffle | 87 % / 81 % |  | 78 % / 73 % |  |  |  |  |  |
| swing | 58 % / 52 % |  | 46 % / 38 % |  |  |  |  |  |
| trad | 88 % / 77 % |  | 88 % / 77 % |  |  |  |  |  |
| waltz | 62 % / 57 % |  | 46 % / 41 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 30 % | 30 % | 11 % | 12 % |
| accord voisin (décalé d’un temps ou plus) | 23 % | 15 % | 9 % | 9 % |
| fondamentale à une tierce (mineure) | 11 % | 15 % | 13 % | 10 % |
| bonne fondamentale, famille fausse | 9 % | 9 % | 16 % | 14 % |
| bonne fondamentale, septième ou sixte fausse | 8 % | 8 % | 34 % | 39 % |
| fondamentale à un ton | 8 % | 9 % | 5 % | 7 % |
| fondamentale à un demi-ton | 7 % | 5 % | 0 % | 0 % |
| fondamentale au triton | 2 % | 2 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 2 % | 5 % | 11 % | 9 % |
| aucun accord | 0 % | 3 % | 0 % | 0 % |
| *temps faux / tous les temps* | 34 % | 48 % | 37 % | 35 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (20 %) · m7 → m (14 %) · 7 → maj (13 %) · 6 → maj (7 %) · m7b5 → m7 (6 %) · m → maj (5 %) · maj7 → maj (5 %) · maj → m (4 %) · m6 → m7 (4 %) · m6 → m (3 %) · 7 → m7 (3 %) · maj → maj7 (3 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 42 % | 50 % | 22 % | 62 % |
| grille détectée | synthèse, vieux disque | 43 % | 69 % | 32 % | 62 % |
| grille détectée | enregistrements réels | 19 % | 77 % | 27 % | 40 % |
| grille détectée | réels, façon vieux disque | 11 % | 70 % | 31 % | 22 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
