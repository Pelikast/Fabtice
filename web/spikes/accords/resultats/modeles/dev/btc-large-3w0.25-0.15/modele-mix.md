# Banc accords — variante `modele-mix`

27 morceaux, mesuré le 2026-11-15 (7 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 15 | 74 % | 70 % | 66 % | 34 % | 74 % | 60 % | 11 % | 92 % | 85 % | 67 % |
| grille détectée | synthèse, vieux disque | 15 | 62 % | 57 % | 51 % | 29 % | 62 % | 62 % | 11 % | 94 % | 81 % | 67 % |
| grille détectée | enregistrements réels | 12 | 87 % | 83 % | 70 % | 60 % | 77 % | — | 11 % | 91 % | 78 % | 100 % |
| grille détectée | réels, façon vieux disque | 12 | 84 % | 79 % | 65 % | 53 % | 74 % | — | 16 % | 75 % | 55 % | 83 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 76 % | 69 % |
| grille détectée | synthèse, vieux disque | 65 % | 54 % |
| grille détectée | enregistrements réels | 87 % | 70 % |
| grille détectée | réels, façon vieux disque | 84 % | 64 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 91 % / 87 % |  | 87 % / 77 % |  |  |  |  |  |
| bossa | 89 % / 83 % |  | 73 % / 62 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 91 % / 72 % |  | 87 % / 65 % |  |
| guitare-jazz |  |  |  |  | 83 % / 69 % |  | 82 % / 65 % |  |
| modal | 71 % / 54 % |  | 44 % / 20 % |  |  |  |  |  |
| shuffle | 85 % / 76 % |  | 82 % / 74 % |  |  |  |  |  |
| swing | 61 % / 54 % |  | 47 % / 38 % |  |  |  |  |  |
| trad | 88 % / 78 % |  | 88 % / 76 % |  |  |  |  |  |
| waltz | 64 % / 58 % |  | 48 % / 44 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 28 % | 28 % | 5 % | 12 % |
| accord voisin (décalé d’un temps ou plus) | 22 % | 14 % | 10 % | 6 % |
| fondamentale à une tierce (mineure) | 11 % | 16 % | 13 % | 12 % |
| bonne fondamentale, septième ou sixte fausse | 10 % | 12 % | 41 % | 39 % |
| bonne fondamentale, famille fausse | 10 % | 8 % | 16 % | 16 % |
| fondamentale à un ton | 7 % | 9 % | 2 % | 5 % |
| fondamentale à un demi-ton | 7 % | 5 % | 0 % | 0 % |
| fondamentale au triton | 2 % | 2 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 2 % | 6 % | 11 % | 11 % |
| aucun accord | 0 % | 2 % | 0 % | 0 % |
| *temps faux / tous les temps* | 34 % | 49 % | 30 % | 35 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (21 %) · m7 → m (16 %) · 7 → maj (14 %) · 6 → maj (7 %) · maj7 → maj (6 %) · m6 → m (6 %) · m6 → m7 (3 %) · 7 → m7 (3 %) · maj → m (3 %) · maj → 7 (3 %) · m → maj (3 %) · sus4 → maj (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 30 % | 61 % | 22 % | 54 % |
| grille détectée | synthèse, vieux disque | 35 % | 71 % | 37 % | 51 % |
| grille détectée | enregistrements réels | 9 % | 66 % | 26 % | 21 % |
| grille détectée | réels, façon vieux disque | 10 % | 79 % | 30 % | 22 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
