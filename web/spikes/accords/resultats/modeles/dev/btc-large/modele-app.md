# Banc accords — variante `modele-app`

27 morceaux, mesuré le 2026-11-15 (9 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 15 | 71 % | 67 % | 59 % | 33 % | 71 % | 30 % | 25 % | 92 % | 85 % | 67 % |
| grille détectée | synthèse, vieux disque | 15 | 59 % | 55 % | 42 % | 25 % | 60 % | 40 % | 27 % | 94 % | 81 % | 60 % |
| grille détectée | enregistrements réels | 12 | 84 % | 79 % | 65 % | 56 % | 74 % | — | 23 % | 91 % | 78 % | 83 % |
| grille détectée | réels, façon vieux disque | 12 | 83 % | 78 % | 63 % | 51 % | 72 % | — | 18 % | 75 % | 55 % | 75 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 72 % | 61 % |
| grille détectée | synthèse, vieux disque | 60 % | 44 % |
| grille détectée | enregistrements réels | 85 % | 66 % |
| grille détectée | réels, façon vieux disque | 82 % | 62 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 82 % / 73 % |  | 74 % / 61 % |  |  |  |  |  |
| bossa | 79 % / 67 % |  | 55 % / 42 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 91 % / 67 % |  | 85 % / 57 % |  |
| guitare-jazz |  |  |  |  | 78 % / 64 % |  | 81 % / 68 % |  |
| modal | 36 % / 25 % |  | 24 % / 3 % |  |  |  |  |  |
| shuffle | 81 % / 71 % |  | 66 % / 61 % |  |  |  |  |  |
| swing | 63 % / 51 % |  | 52 % / 38 % |  |  |  |  |  |
| trad | 91 % / 77 % |  | 89 % / 53 % |  |  |  |  |  |
| waltz | 67 % / 56 % |  | 57 % / 45 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 22 % | 25 % | 6 % | 6 % |
| bonne fondamentale, septième ou sixte fausse | 20 % | 22 % | 38 % | 41 % |
| fondamentale à une tierce (mineure) | 15 % | 17 % | 15 % | 16 % |
| accord voisin (décalé d’un temps ou plus) | 15 % | 8 % | 11 % | 6 % |
| bonne fondamentale, famille fausse | 7 % | 7 % | 16 % | 13 % |
| fondamentale à une tierce (majeure) | 7 % | 7 % | 10 % | 14 % |
| fondamentale à un ton | 6 % | 8 % | 2 % | 3 % |
| fondamentale à un demi-ton | 5 % | 4 % | 0 % | 0 % |
| fondamentale au triton | 3 % | 2 % | 1 % | 0 % |
| aucun accord | 0 % | 1 % | 0 % | 0 % |
| *temps faux / tous les temps* | 41 % | 58 % | 35 % | 38 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

7 → maj (17 %) · maj → maj7 (17 %) · m7 → m (15 %) · maj7 → maj (8 %) · m7 → 7 (8 %) · maj → 7 (7 %) · m7b5 → m7 (7 %) · 6 → maj (5 %) · m6 → m (3 %) · 7 → m7 (2 %) · maj → m (2 %) · sus4 → maj (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 38 % | 61 % | 29 % | 57 % |
| grille détectée | synthèse, vieux disque | 41 % | 72 % | 49 % | 51 % |
| grille détectée | enregistrements réels | 6 % | 83 % | 32 % | 14 % |
| grille détectée | réels, façon vieux disque | 13 % | 63 % | 34 % | 21 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
