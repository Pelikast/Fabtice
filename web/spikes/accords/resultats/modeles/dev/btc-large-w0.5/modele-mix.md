# Banc accords — variante `modele-mix`

27 morceaux, mesuré le 2026-11-15 (9 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 15 | 75 % | 72 % | 67 % | 34 % | 75 % | 53 % | 15 % | 92 % | 85 % | 67 % |
| grille détectée | synthèse, vieux disque | 15 | 62 % | 58 % | 51 % | 29 % | 62 % | 58 % | 17 % | 94 % | 81 % | 67 % |
| grille détectée | enregistrements réels | 12 | 86 % | 81 % | 69 % | 58 % | 76 % | — | 13 % | 91 % | 78 % | 100 % |
| grille détectée | réels, façon vieux disque | 12 | 84 % | 79 % | 65 % | 53 % | 73 % | — | 15 % | 75 % | 55 % | 83 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 77 % | 69 % |
| grille détectée | synthèse, vieux disque | 65 % | 54 % |
| grille détectée | enregistrements réels | 86 % | 69 % |
| grille détectée | réels, façon vieux disque | 83 % | 64 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 91 % / 82 % |  | 86 % / 73 % |  |  |  |  |  |
| bossa | 90 % / 83 % |  | 70 % / 61 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 91 % / 70 % |  | 87 % / 65 % |  |
| guitare-jazz |  |  |  |  | 81 % / 68 % |  | 82 % / 66 % |  |
| modal | 55 % / 46 % |  | 40 % / 17 % |  |  |  |  |  |
| shuffle | 88 % / 81 % |  | 77 % / 70 % |  |  |  |  |  |
| swing | 64 % / 56 % |  | 49 % / 38 % |  |  |  |  |  |
| trad | 89 % / 80 % |  | 89 % / 76 % |  |  |  |  |  |
| waltz | 69 % / 63 % |  | 52 % / 47 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 26 % | 27 % | 5 % | 9 % |
| accord voisin (décalé d’un temps ou plus) | 23 % | 13 % | 10 % | 5 % |
| bonne fondamentale, septième ou sixte fausse | 13 % | 13 % | 39 % | 39 % |
| fondamentale à une tierce (mineure) | 13 % | 17 % | 15 % | 13 % |
| fondamentale à un demi-ton | 7 % | 4 % | 0 % | 0 % |
| bonne fondamentale, famille fausse | 7 % | 8 % | 16 % | 16 % |
| fondamentale à un ton | 6 % | 8 % | 3 % | 4 % |
| fondamentale à une tierce (majeure) | 3 % | 7 % | 13 % | 13 % |
| fondamentale au triton | 2 % | 2 % | 0 % | 0 % |
| aucun accord | 0 % | 1 % | 0 % | 0 % |
| *temps faux / tous les temps* | 33 % | 49 % | 31 % | 35 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → m (19 %) · 7 → maj (15 %) · m7 → 7 (15 %) · maj7 → maj (9 %) · 6 → maj (7 %) · maj → 7 (4 %) · m6 → m (4 %) · maj → m (3 %) · 7 → m7 (3 %) · m7b5 → m7 (3 %) · sus4 → maj (2 %) · m6 → m7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 31 % | 58 % | 21 % | 56 % |
| grille détectée | synthèse, vieux disque | 39 % | 69 % | 35 % | 56 % |
| grille détectée | enregistrements réels | 6 % | 68 % | 29 % | 14 % |
| grille détectée | réels, façon vieux disque | 10 % | 71 % | 31 % | 20 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
