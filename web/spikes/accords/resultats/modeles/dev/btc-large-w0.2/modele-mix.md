# Banc accords — variante `modele-mix`

27 morceaux, mesuré le 2026-11-15 (8 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 15 | 73 % | 68 % | 64 % | 33 % | 73 % | 66 % | 10 % | 92 % | 85 % | 67 % |
| grille détectée | synthèse, vieux disque | 15 | 61 % | 57 % | 49 % | 28 % | 61 % | 69 % | 11 % | 94 % | 81 % | 67 % |
| grille détectée | enregistrements réels | 12 | 88 % | 83 % | 70 % | 60 % | 78 % | — | 12 % | 91 % | 78 % | 100 % |
| grille détectée | réels, façon vieux disque | 12 | 84 % | 78 % | 63 % | 52 % | 74 % | — | 15 % | 75 % | 55 % | 83 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 75 % | 67 % |
| grille détectée | synthèse, vieux disque | 64 % | 53 % |
| grille détectée | enregistrements réels | 88 % | 70 % |
| grille détectée | réels, façon vieux disque | 83 % | 62 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 91 % / 88 % |  | 86 % / 75 % |  |  |  |  |  |
| bossa | 89 % / 81 % |  | 74 % / 62 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 92 % / 72 % |  | 87 % / 63 % |  |
| guitare-jazz |  |  |  |  | 84 % / 69 % |  | 82 % / 64 % |  |
| modal | 69 % / 50 % |  | 46 % / 19 % |  |  |  |  |  |
| shuffle | 82 % / 72 % |  | 81 % / 74 % |  |  |  |  |  |
| swing | 60 % / 52 % |  | 44 % / 36 % |  |  |  |  |  |
| trad | 87 % / 78 % |  | 89 % / 71 % |  |  |  |  |  |
| waltz | 59 % / 53 % |  | 45 % / 42 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 29 % | 27 % | 5 % | 11 % |
| accord voisin (décalé d’un temps ou plus) | 22 % | 13 % | 9 % | 5 % |
| bonne fondamentale, famille fausse | 10 % | 7 % | 16 % | 17 % |
| fondamentale à une tierce (mineure) | 10 % | 16 % | 12 % | 10 % |
| bonne fondamentale, septième ou sixte fausse | 10 % | 14 % | 43 % | 40 % |
| fondamentale à un ton | 8 % | 9 % | 2 % | 4 % |
| fondamentale à un demi-ton | 7 % | 4 % | 0 % | 0 % |
| fondamentale au triton | 2 % | 2 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 2 % | 6 % | 12 % | 11 % |
| aucun accord | 0 % | 2 % | 0 % | 0 % |
| *temps faux / tous les temps* | 36 % | 51 % | 30 % | 37 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (20 %) · m7 → m (18 %) · 7 → maj (16 %) · 6 → maj (6 %) · maj7 → maj (6 %) · m6 → m (4 %) · dim7 → dim (3 %) · 7 → m7 (3 %) · maj → m (3 %) · m → maj (3 %) · maj → 7 (3 %) · m6 → m7 (3 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 27 % | 57 % | 28 % | 43 % |
| grille détectée | synthèse, vieux disque | 32 % | 74 % | 40 % | 46 % |
| grille détectée | enregistrements réels | 11 % | 53 % | 27 % | 19 % |
| grille détectée | réels, façon vieux disque | 11 % | 87 % | 31 % | 26 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
