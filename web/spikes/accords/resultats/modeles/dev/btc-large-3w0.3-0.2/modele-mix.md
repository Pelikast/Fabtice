# Banc accords — variante `modele-mix`

27 morceaux, mesuré le 2026-11-15 (7 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 15 | 74 % | 71 % | 67 % | 34 % | 74 % | 56 % | 11 % | 92 % | 85 % | 67 % |
| grille détectée | synthèse, vieux disque | 15 | 62 % | 58 % | 51 % | 29 % | 62 % | 62 % | 12 % | 94 % | 81 % | 67 % |
| grille détectée | enregistrements réels | 12 | 87 % | 82 % | 69 % | 59 % | 76 % | — | 12 % | 91 % | 78 % | 100 % |
| grille détectée | réels, façon vieux disque | 12 | 84 % | 78 % | 64 % | 53 % | 74 % | — | 15 % | 75 % | 55 % | 83 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 76 % | 69 % |
| grille détectée | synthèse, vieux disque | 65 % | 54 % |
| grille détectée | enregistrements réels | 87 % | 69 % |
| grille détectée | réels, façon vieux disque | 83 % | 63 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 90 % / 84 % |  | 86 % / 74 % |  |  |  |  |  |
| bossa | 88 % / 82 % |  | 73 % / 63 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 91 % / 71 % |  | 87 % / 64 % |  |
| guitare-jazz |  |  |  |  | 82 % / 67 % |  | 81 % / 65 % |  |
| modal | 64 % / 54 % |  | 42 % / 18 % |  |  |  |  |  |
| shuffle | 87 % / 80 % |  | 78 % / 71 % |  |  |  |  |  |
| swing | 63 % / 54 % |  | 48 % / 38 % |  |  |  |  |  |
| trad | 88 % / 79 % |  | 88 % / 76 % |  |  |  |  |  |
| waltz | 67 % / 61 % |  | 49 % / 44 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 28 % | 28 % | 6 % | 10 % |
| accord voisin (décalé d’un temps ou plus) | 22 % | 14 % | 9 % | 5 % |
| bonne fondamentale, septième ou sixte fausse | 12 % | 12 % | 40 % | 40 % |
| fondamentale à une tierce (mineure) | 11 % | 17 % | 13 % | 13 % |
| bonne fondamentale, famille fausse | 8 % | 8 % | 16 % | 15 % |
| fondamentale à un demi-ton | 7 % | 4 % | 0 % | 0 % |
| fondamentale à un ton | 6 % | 8 % | 2 % | 5 % |
| fondamentale à une tierce (majeure) | 2 % | 6 % | 13 % | 12 % |
| fondamentale au triton | 2 % | 2 % | 0 % | 0 % |
| aucun accord | 0 % | 2 % | 0 % | 0 % |
| *temps faux / tous les temps* | 33 % | 49 % | 31 % | 36 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (18 %) · m7 → m (17 %) · 7 → maj (14 %) · maj7 → maj (8 %) · 6 → maj (7 %) · m6 → m (6 %) · maj → m (3 %) · 7 → m7 (3 %) · m7b5 → m7 (3 %) · maj → 7 (3 %) · m6 → m7 (3 %) · sus4 → maj (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 34 % | 59 % | 20 % | 60 % |
| grille détectée | synthèse, vieux disque | 39 % | 72 % | 34 % | 57 % |
| grille détectée | enregistrements réels | 12 % | 73 % | 25 % | 29 % |
| grille détectée | réels, façon vieux disque | 10 % | 82 % | 31 % | 22 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
