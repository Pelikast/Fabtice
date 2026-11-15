# Banc accords — variante `modele-mix`

27 morceaux, mesuré le 2026-11-15 (10 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 15 | 72 % | 67 % | 64 % | 32 % | 72 % | 56 % | 13 % | 92 % | 85 % | 67 % |
| grille détectée | synthèse, vieux disque | 15 | 58 % | 54 % | 48 % | 26 % | 57 % | 66 % | 11 % | 94 % | 81 % | 67 % |
| grille détectée | enregistrements réels | 12 | 80 % | 74 % | 62 % | 55 % | 74 % | — | 15 % | 91 % | 78 % | 100 % |
| grille détectée | réels, façon vieux disque | 12 | 80 % | 76 % | 63 % | 52 % | 74 % | — | 16 % | 75 % | 55 % | 83 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 74 % | 67 % |
| grille détectée | synthèse, vieux disque | 60 % | 50 % |
| grille détectée | enregistrements réels | 81 % | 62 % |
| grille détectée | réels, façon vieux disque | 80 % | 62 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 85 % / 79 % |  | 77 % / 68 % |  |  |  |  |  |
| bossa | 82 % / 74 % |  | 65 % / 56 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 86 % / 68 % |  | 80 % / 64 % |  |
| guitare-jazz |  |  |  |  | 74 % / 56 % |  | 80 % / 62 % |  |
| modal | 75 % / 71 % |  | 36 % / 32 % |  |  |  |  |  |
| shuffle | 88 % / 81 % |  | 76 % / 74 % |  |  |  |  |  |
| swing | 59 % / 52 % |  | 46 % / 37 % |  |  |  |  |  |
| trad | 88 % / 78 % |  | 84 % / 60 % |  |  |  |  |  |
| waltz | 60 % / 54 % |  | 47 % / 41 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 28 % | 31 % | 15 % | 11 % |
| accord voisin (décalé d’un temps ou plus) | 21 % | 13 % | 9 % | 8 % |
| fondamentale à une tierce (mineure) | 11 % | 12 % | 11 % | 13 % |
| bonne fondamentale, famille fausse | 10 % | 7 % | 14 % | 12 % |
| fondamentale à un ton | 9 % | 9 % | 7 % | 8 % |
| bonne fondamentale, septième ou sixte fausse | 8 % | 11 % | 33 % | 34 % |
| fondamentale à un demi-ton | 7 % | 5 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 4 % | 5 % | 11 % | 13 % |
| fondamentale au triton | 2 % | 2 % | 0 % | 0 % |
| aucun accord | 0 % | 5 % | 0 % | 0 % |
| *temps faux / tous les temps* | 36 % | 52 % | 38 % | 37 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (16 %) · 7 → maj (15 %) · m7 → m (12 %) · maj → maj7 (11 %) · m7b5 → m7 (7 %) · 6 → maj (6 %) · maj7 → maj (5 %) · m → maj (5 %) · maj → m (4 %) · m6 → m (3 %) · m6 → m7 (3 %) · 7 → m7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 48 % | 52 % | 20 % | 71 % |
| grille détectée | synthèse, vieux disque | 47 % | 70 % | 37 % | 63 % |
| grille détectée | enregistrements réels | 28 % | 66 % | 27 % | 49 % |
| grille détectée | réels, façon vieux disque | 17 % | 79 % | 28 % | 36 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
