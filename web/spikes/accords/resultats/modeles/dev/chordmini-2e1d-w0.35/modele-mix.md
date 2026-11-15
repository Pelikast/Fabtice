# Banc accords — variante `modele-mix`

27 morceaux, mesuré le 2026-11-15 (10 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 15 | 72 % | 68 % | 64 % | 32 % | 73 % | 67 % | 9 % | 92 % | 85 % | 67 % |
| grille détectée | synthèse, vieux disque | 15 | 60 % | 55 % | 51 % | 29 % | 60 % | 72 % | 8 % | 94 % | 81 % | 67 % |
| grille détectée | enregistrements réels | 12 | 86 % | 81 % | 68 % | 58 % | 78 % | — | 11 % | 91 % | 78 % | 100 % |
| grille détectée | réels, façon vieux disque | 12 | 84 % | 79 % | 65 % | 54 % | 77 % | — | 16 % | 75 % | 55 % | 83 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 75 % | 68 % |
| grille détectée | synthèse, vieux disque | 63 % | 55 % |
| grille détectée | enregistrements réels | 87 % | 68 % |
| grille détectée | réels, façon vieux disque | 84 % | 64 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 92 % / 87 % |  | 87 % / 77 % |  |  |  |  |  |
| bossa | 89 % / 81 % |  | 76 % / 66 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 90 % / 70 % |  | 86 % / 65 % |  |
| guitare-jazz |  |  |  |  | 82 % / 66 % |  | 82 % / 64 % |  |
| modal | 79 % / 64 % |  | 43 % / 25 % |  |  |  |  |  |
| shuffle | 85 % / 77 % |  | 83 % / 78 % |  |  |  |  |  |
| swing | 58 % / 51 % |  | 42 % / 36 % |  |  |  |  |  |
| trad | 88 % / 77 % |  | 89 % / 75 % |  |  |  |  |  |
| waltz | 57 % / 52 % |  | 44 % / 39 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 28 % | 29 % | 8 % | 11 % |
| accord voisin (décalé d’un temps ou plus) | 22 % | 14 % | 9 % | 8 % |
| bonne fondamentale, famille fausse | 10 % | 8 % | 17 % | 15 % |
| fondamentale à une tierce (mineure) | 10 % | 13 % | 12 % | 10 % |
| bonne fondamentale, septième ou sixte fausse | 9 % | 8 % | 40 % | 41 % |
| fondamentale à un ton | 8 % | 12 % | 4 % | 6 % |
| fondamentale à un demi-ton | 7 % | 6 % | 0 % | 0 % |
| fondamentale au triton | 2 % | 2 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 2 % | 5 % | 9 % | 10 % |
| aucun accord | 0 % | 3 % | 0 % | 0 % |
| *temps faux / tous les temps* | 36 % | 49 % | 32 % | 35 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (24 %) · m7 → m (15 %) · 7 → maj (14 %) · maj7 → maj (7 %) · 6 → maj (6 %) · m → maj (4 %) · maj → m (4 %) · m6 → m7 (3 %) · 7 → m7 (3 %) · sus4 → maj (2 %) · m6 → m (2 %) · dim7 → dim (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 31 % | 57 % | 26 % | 50 % |
| grille détectée | synthèse, vieux disque | 36 % | 72 % | 35 % | 53 % |
| grille détectée | enregistrements réels | 15 % | 78 % | 24 % | 38 % |
| grille détectée | réels, façon vieux disque | 10 % | 81 % | 30 % | 22 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
