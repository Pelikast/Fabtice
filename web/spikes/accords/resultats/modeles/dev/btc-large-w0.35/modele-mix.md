# Banc accords — variante `modele-mix`

27 morceaux, mesuré le 2026-11-15 (9 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 15 | 74 % | 70 % | 66 % | 34 % | 74 % | 57 % | 12 % | 92 % | 85 % | 67 % |
| grille détectée | synthèse, vieux disque | 15 | 62 % | 58 % | 50 % | 28 % | 61 % | 60 % | 14 % | 94 % | 81 % | 67 % |
| grille détectée | enregistrements réels | 12 | 87 % | 82 % | 70 % | 59 % | 77 % | — | 11 % | 91 % | 78 % | 100 % |
| grille détectée | réels, façon vieux disque | 12 | 84 % | 78 % | 64 % | 53 % | 73 % | — | 16 % | 75 % | 55 % | 83 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 76 % | 69 % |
| grille détectée | synthèse, vieux disque | 65 % | 53 % |
| grille détectée | enregistrements réels | 87 % | 70 % |
| grille détectée | réels, façon vieux disque | 83 % | 63 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 91 % / 87 % |  | 87 % / 77 % |  |  |  |  |  |
| bossa | 89 % / 82 % |  | 74 % / 63 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 91 % / 71 % |  | 87 % / 64 % |  |
| guitare-jazz |  |  |  |  | 84 % / 69 % |  | 81 % / 65 % |  |
| modal | 65 % / 48 % |  | 46 % / 19 % |  |  |  |  |  |
| shuffle | 85 % / 76 % |  | 81 % / 74 % |  |  |  |  |  |
| swing | 62 % / 54 % |  | 46 % / 36 % |  |  |  |  |  |
| trad | 89 % / 80 % |  | 88 % / 71 % |  |  |  |  |  |
| waltz | 62 % / 56 % |  | 48 % / 42 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 27 % | 27 % | 5 % | 9 % |
| accord voisin (décalé d’un temps ou plus) | 22 % | 13 % | 9 % | 5 % |
| bonne fondamentale, septième ou sixte fausse | 12 % | 15 % | 41 % | 38 % |
| fondamentale à une tierce (mineure) | 11 % | 16 % | 13 % | 12 % |
| bonne fondamentale, famille fausse | 9 % | 8 % | 17 % | 17 % |
| fondamentale à un demi-ton | 7 % | 4 % | 0 % | 0 % |
| fondamentale à un ton | 6 % | 8 % | 2 % | 5 % |
| fondamentale à une tierce (majeure) | 3 % | 6 % | 11 % | 13 % |
| fondamentale au triton | 2 % | 2 % | 0 % | 0 % |
| aucun accord | 0 % | 1 % | 0 % | 0 % |
| *temps faux / tous les temps* | 34 % | 50 % | 30 % | 36 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → m (18 %) · m7 → 7 (17 %) · 7 → maj (15 %) · 6 → maj (6 %) · maj7 → maj (6 %) · m6 → m (6 %) · maj → 7 (4 %) · 7 → m7 (3 %) · dim7 → dim (3 %) · maj → m (3 %) · m6 → m7 (2 %) · sus4 → maj (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 30 % | 64 % | 21 % | 56 % |
| grille détectée | synthèse, vieux disque | 34 % | 73 % | 38 % | 50 % |
| grille détectée | enregistrements réels | 9 % | 70 % | 26 % | 21 % |
| grille détectée | réels, façon vieux disque | 11 % | 84 % | 30 % | 25 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
