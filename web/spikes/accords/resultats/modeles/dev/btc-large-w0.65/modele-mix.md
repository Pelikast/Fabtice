# Banc accords — variante `modele-mix`

27 morceaux, mesuré le 2026-11-15 (8 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 15 | 74 % | 71 % | 66 % | 34 % | 74 % | 47 % | 19 % | 92 % | 85 % | 67 % |
| grille détectée | synthèse, vieux disque | 15 | 62 % | 57 % | 49 % | 27 % | 61 % | 52 % | 20 % | 94 % | 81 % | 67 % |
| grille détectée | enregistrements réels | 12 | 85 % | 80 % | 68 % | 57 % | 75 % | — | 16 % | 91 % | 78 % | 100 % |
| grille détectée | réels, façon vieux disque | 12 | 85 % | 79 % | 66 % | 54 % | 73 % | — | 17 % | 75 % | 55 % | 83 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 76 % | 68 % |
| grille détectée | synthèse, vieux disque | 64 % | 51 % |
| grille détectée | enregistrements réels | 85 % | 68 % |
| grille détectée | réels, façon vieux disque | 84 % | 65 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 89 % / 81 % |  | 84 % / 71 % |  |  |  |  |  |
| bossa | 87 % / 80 % |  | 65 % / 53 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 91 % / 70 % |  | 87 % / 65 % |  |
| guitare-jazz |  |  |  |  | 79 % / 66 % |  | 82 % / 68 % |  |
| modal | 50 % / 41 % |  | 35 % / 10 % |  |  |  |  |  |
| shuffle | 85 % / 78 % |  | 77 % / 70 % |  |  |  |  |  |
| swing | 64 % / 56 % |  | 51 % / 39 % |  |  |  |  |  |
| trad | 89 % / 80 % |  | 89 % / 71 % |  |  |  |  |  |
| waltz | 70 % / 63 % |  | 56 % / 50 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 25 % | 27 % | 5 % | 8 % |
| accord voisin (décalé d’un temps ou plus) | 21 % | 11 % | 10 % | 6 % |
| fondamentale à une tierce (mineure) | 14 % | 17 % | 15 % | 16 % |
| bonne fondamentale, septième ou sixte fausse | 14 % | 16 % | 38 % | 38 % |
| bonne fondamentale, famille fausse | 7 % | 9 % | 15 % | 16 % |
| fondamentale à un ton | 7 % | 8 % | 3 % | 3 % |
| fondamentale à un demi-ton | 6 % | 3 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 5 % | 6 % | 13 % | 13 % |
| fondamentale au triton | 1 % | 2 % | 0 % | 0 % |
| aucun accord | 1 % | 1 % | 0 % | 0 % |
| *temps faux / tous les temps* | 34 % | 51 % | 32 % | 34 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → m (16 %) · m7 → 7 (14 %) · 7 → maj (14 %) · maj7 → maj (8 %) · 6 → maj (7 %) · maj → maj7 (6 %) · m7b5 → m7 (6 %) · m6 → m (4 %) · maj → 7 (4 %) · maj → m (3 %) · 7 → m7 (3 %) · sus4 → maj (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 34 % | 56 % | 22 % | 57 % |
| grille détectée | synthèse, vieux disque | 42 % | 73 % | 35 % | 60 % |
| grille détectée | enregistrements réels | 7 % | 73 % | 29 % | 16 % |
| grille détectée | réels, façon vieux disque | 10 % | 69 % | 30 % | 21 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
