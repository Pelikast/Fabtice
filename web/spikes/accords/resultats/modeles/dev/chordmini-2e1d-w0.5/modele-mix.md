# Banc accords — variante `modele-mix`

27 morceaux, mesuré le 2026-11-15 (10 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 15 | 73 % | 69 % | 66 % | 33 % | 73 % | 64 % | 8 % | 92 % | 85 % | 67 % |
| grille détectée | synthèse, vieux disque | 15 | 61 % | 56 % | 52 % | 29 % | 60 % | 71 % | 9 % | 94 % | 81 % | 67 % |
| grille détectée | enregistrements réels | 12 | 82 % | 77 % | 65 % | 56 % | 74 % | — | 16 % | 91 % | 78 % | 100 % |
| grille détectée | réels, façon vieux disque | 12 | 83 % | 78 % | 64 % | 53 % | 76 % | — | 16 % | 75 % | 55 % | 83 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 76 % | 69 % |
| grille détectée | synthèse, vieux disque | 63 % | 55 % |
| grille détectée | enregistrements réels | 83 % | 65 % |
| grille détectée | réels, façon vieux disque | 83 % | 64 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 90 % / 85 % |  | 84 % / 77 % |  |  |  |  |  |
| bossa | 89 % / 81 % |  | 74 % / 63 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 88 % / 69 % |  | 84 % / 64 % |  |
| guitare-jazz |  |  |  |  | 77 % / 61 % |  | 82 % / 64 % |  |
| modal | 82 % / 73 % |  | 44 % / 27 % |  |  |  |  |  |
| shuffle | 87 % / 78 % |  | 81 % / 76 % |  |  |  |  |  |
| swing | 59 % / 51 % |  | 44 % / 37 % |  |  |  |  |  |
| trad | 88 % / 77 % |  | 88 % / 77 % |  |  |  |  |  |
| waltz | 60 % / 56 % |  | 45 % / 40 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 28 % | 30 % | 11 % | 12 % |
| accord voisin (décalé d’un temps ou plus) | 23 % | 14 % | 9 % | 8 % |
| fondamentale à une tierce (mineure) | 11 % | 15 % | 14 % | 11 % |
| bonne fondamentale, famille fausse | 11 % | 9 % | 15 % | 15 % |
| bonne fondamentale, septième ou sixte fausse | 9 % | 8 % | 34 % | 38 % |
| fondamentale à un ton | 7 % | 10 % | 4 % | 6 % |
| fondamentale à un demi-ton | 7 % | 5 % | 0 % | 0 % |
| fondamentale au triton | 2 % | 2 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 2 % | 5 % | 11 % | 10 % |
| aucun accord | 0 % | 3 % | 0 % | 0 % |
| *temps faux / tous les temps* | 34 % | 48 % | 35 % | 36 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (22 %) · m7 → m (14 %) · 7 → maj (12 %) · 6 → maj (7 %) · maj7 → maj (7 %) · m → maj (5 %) · m7b5 → m7 (4 %) · maj → m (4 %) · m6 → m (4 %) · 7 → m7 (3 %) · m6 → m7 (3 %) · sus4 → maj (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 36 % | 56 % | 22 % | 59 % |
| grille détectée | synthèse, vieux disque | 38 % | 71 % | 34 % | 56 % |
| grille détectée | enregistrements réels | 16 % | 77 % | 27 % | 35 % |
| grille détectée | réels, façon vieux disque | 11 % | 82 % | 30 % | 25 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
