# Banc accords — variante `modele-mix`

27 morceaux, mesuré le 2026-11-15 (10 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 15 | 71 % | 66 % | 62 % | 32 % | 72 % | 71 % | 9 % | 92 % | 85 % | 67 % |
| grille détectée | synthèse, vieux disque | 15 | 59 % | 55 % | 49 % | 28 % | 59 % | 74 % | 10 % | 94 % | 81 % | 67 % |
| grille détectée | enregistrements réels | 12 | 87 % | 82 % | 68 % | 58 % | 78 % | — | 12 % | 91 % | 78 % | 100 % |
| grille détectée | réels, façon vieux disque | 12 | 85 % | 79 % | 64 % | 53 % | 75 % | — | 15 % | 75 % | 55 % | 83 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 74 % | 65 % |
| grille détectée | synthèse, vieux disque | 63 % | 53 % |
| grille détectée | enregistrements réels | 87 % | 68 % |
| grille détectée | réels, façon vieux disque | 85 % | 63 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 92 % / 86 % |  | 86 % / 75 % |  |  |  |  |  |
| bossa | 88 % / 81 % |  | 74 % / 64 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 91 % / 70 % |  | 89 % / 64 % |  |
| guitare-jazz |  |  |  |  | 84 % / 67 % |  | 82 % / 64 % |  |
| modal | 79 % / 56 % |  | 45 % / 27 % |  |  |  |  |  |
| shuffle | 83 % / 72 % |  | 82 % / 78 % |  |  |  |  |  |
| swing | 55 % / 47 % |  | 42 % / 35 % |  |  |  |  |  |
| trad | 85 % / 74 % |  | 87 % / 69 % |  |  |  |  |  |
| waltz | 58 % / 52 % |  | 41 % / 38 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 29 % | 27 % | 8 % | 9 % |
| accord voisin (décalé d’un temps ou plus) | 21 % | 13 % | 9 % | 6 % |
| bonne fondamentale, famille fausse | 12 % | 8 % | 18 % | 17 % |
| bonne fondamentale, septième ou sixte fausse | 9 % | 10 % | 42 % | 42 % |
| fondamentale à un ton | 8 % | 11 % | 4 % | 5 % |
| fondamentale à une tierce (mineure) | 8 % | 14 % | 9 % | 9 % |
| fondamentale à un demi-ton | 7 % | 5 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 2 % | 6 % | 9 % | 10 % |
| fondamentale au triton | 2 % | 2 % | 0 % | 0 % |
| aucun accord | 0 % | 3 % | 0 % | 0 % |
| *temps faux / tous les temps* | 38 % | 51 % | 32 % | 36 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (25 %) · 7 → maj (16 %) · m7 → m (13 %) · maj7 → maj (7 %) · 6 → maj (5 %) · m → maj (4 %) · 7 → m7 (3 %) · maj → m (3 %) · m6 → m7 (3 %) · dim7 → dim (2 %) · maj → 7 (2 %) · sus4 → maj (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 29 % | 62 % | 29 % | 47 % |
| grille détectée | synthèse, vieux disque | 32 % | 73 % | 40 % | 46 % |
| grille détectée | enregistrements réels | 14 % | 65 % | 26 % | 29 % |
| grille détectée | réels, façon vieux disque | 12 % | 83 % | 30 % | 28 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
