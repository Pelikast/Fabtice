# Banc accords — variante `modele-mix`

27 morceaux, mesuré le 2026-11-15 (8 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 15 | 73 % | 70 % | 64 % | 34 % | 73 % | 40 % | 22 % | 92 % | 85 % | 67 % |
| grille détectée | synthèse, vieux disque | 15 | 61 % | 56 % | 46 % | 25 % | 60 % | 47 % | 24 % | 94 % | 81 % | 67 % |
| grille détectée | enregistrements réels | 12 | 85 % | 80 % | 67 % | 57 % | 75 % | — | 18 % | 91 % | 78 % | 100 % |
| grille détectée | réels, façon vieux disque | 12 | 84 % | 79 % | 63 % | 50 % | 72 % | — | 19 % | 75 % | 55 % | 83 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 74 % | 66 % |
| grille détectée | synthèse, vieux disque | 62 % | 48 % |
| grille détectée | enregistrements réels | 85 % | 67 % |
| grille détectée | réels, façon vieux disque | 83 % | 61 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 85 % / 78 % |  | 81 % / 68 % |  |  |  |  |  |
| bossa | 83 % / 75 % |  | 60 % / 46 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 91 % / 70 % |  | 87 % / 58 % |  |
| guitare-jazz |  |  |  |  | 78 % / 64 % |  | 81 % / 68 % |  |
| modal | 42 % / 31 % |  | 27 % / 6 % |  |  |  |  |  |
| shuffle | 83 % / 76 % |  | 72 % / 69 % |  |  |  |  |  |
| swing | 64 % / 55 % |  | 52 % / 39 % |  |  |  |  |  |
| trad | 90 % / 82 % |  | 89 % / 62 % |  |  |  |  |  |
| waltz | 70 % / 61 % |  | 57 % / 50 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 22 % | 26 % | 6 % | 6 % |
| accord voisin (décalé d’un temps ou plus) | 19 % | 10 % | 10 % | 6 % |
| fondamentale à une tierce (mineure) | 15 % | 17 % | 15 % | 16 % |
| bonne fondamentale, septième ou sixte fausse | 15 % | 19 % | 38 % | 43 % |
| bonne fondamentale, famille fausse | 7 % | 8 % | 16 % | 14 % |
| fondamentale à une tierce (majeure) | 7 % | 6 % | 12 % | 11 % |
| fondamentale à un ton | 6 % | 7 % | 2 % | 3 % |
| fondamentale à un demi-ton | 6 % | 4 % | 0 % | 0 % |
| fondamentale au triton | 3 % | 2 % | 0 % | 0 % |
| aucun accord | 0 % | 1 % | 0 % | 0 % |
| *temps faux / tous les temps* | 36 % | 54 % | 33 % | 37 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → m (16 %) · 7 → maj (15 %) · maj → maj7 (12 %) · m7 → 7 (11 %) · maj7 → maj (8 %) · maj → 7 (7 %) · m7b5 → m7 (6 %) · 6 → maj (6 %) · 7 → m7 (3 %) · m6 → m (3 %) · maj → m (3 %) · m6 → m7 (3 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 37 % | 58 % | 23 % | 59 % |
| grille détectée | synthèse, vieux disque | 41 % | 71 % | 42 % | 55 % |
| grille détectée | enregistrements réels | 5 % | 70 % | 31 % | 11 % |
| grille détectée | réels, façon vieux disque | 7 % | 79 % | 34 % | 14 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
