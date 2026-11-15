# Banc accords — variante `modele-a`

22 morceaux, mesuré le 2026-11-15 (16 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 14 | 77 % | 72 % | 67 % | 35 % | 77 % | 25 % | 29 % | 96 % | 90 % | 71 % |
| grille détectée | synthèse, vieux disque | 14 | 54 % | 49 % | 44 % | 25 % | 54 % | 52 % | 29 % | 92 % | 76 % | 57 % |
| grille détectée | enregistrements réels | 8 | 70 % | 69 % | 60 % | 60 % | 69 % | — | 18 % | 91 % | 74 % | 75 % |
| grille détectée | réels, façon vieux disque | 8 | 77 % | 77 % | 65 % | 64 % | 76 % | — | 13 % | 79 % | 43 % | 88 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 74 % | 66 % | 74 % | 28 % | 31 % | 71 % | 42 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 53 % | 42 % | 54 % | 53 % | 33 % | 71 % | 65 % |
| grille détectée | développement | enregistrements réels | 4 | 69 % | 57 % | 67 % | — | 17 % | 75 % | 75 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 86 % | 74 % | 85 % | — | 13 % | 75 % | 80 % |
| grille détectée | mis de côté | synthèse, son propre | 7 | 79 % | 68 % | 80 % | 21 % | 28 % | 71 % | 40 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 54 % | 46 % | 54 % | 50 % | 26 % | 43 % | 60 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 70 % | 63 % | 70 % | — | 19 % | 75 % | 79 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 68 % | 56 % | 68 % | — | 13 % | 100 % | 74 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 77 % | 68 % |
| grille détectée | synthèse, vieux disque | 56 % | 46 % |
| grille détectée | enregistrements réels | 76 % | 65 % |
| grille détectée | réels, façon vieux disque | 80 % | 67 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 83 % / 72 % |  | 78 % / 61 % |  |  |  |  |  |
| bossa | 84 % / 80 % |  | 51 % / 40 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 92 % / 83 % |  | 84 % / 68 % |  |
| guitare-jazz |  |  |  |  | 47 % / 37 % |  | 70 % / 63 % |  |
| modal | 88 % / 85 % |  | 27 % / 23 % |  |  |  |  |  |
| shuffle | 85 % / 83 % |  | 76 % / 74 % |  |  |  |  |  |
| swing | 61 % / 50 % |  | 38 % / 31 % |  |  |  |  |  |
| trad | 89 % / 84 % |  | 77 % / 65 % |  |  |  |  |  |
| waltz | 80 % / 55 % |  | 65 % / 47 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 28 % | 24 % | 1 % | 0 % |
| accord voisin (décalé d’un temps ou plus) | 14 % | 8 % | 3 % | 7 % |
| bonne fondamentale, septième ou sixte fausse | 13 % | 9 % | 22 % | 34 % |
| bonne fondamentale, famille fausse | 12 % | 7 % | 3 % | 0 % |
| fondamentale à une tierce (mineure) | 11 % | 11 % | 1 % | 0 % |
| fondamentale à un ton | 8 % | 9 % | 1 % | 1 % |
| fondamentale à un demi-ton | 5 % | 3 % | 0 % | 0 % |
| fondamentale au triton | 4 % | 1 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 4 % | 2 % | 0 % | 12 % |
| aucun accord | 1 % | 24 % | 69 % | 45 % |
| *temps faux / tous les temps* | 33 % | 56 % | 40 % | 35 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (21 %) · 7 → maj (16 %) · maj7 → maj (8 %) · m7b5 → m7 (7 %) · m7 → m (6 %) · m6 → m7 (6 %) · maj → maj7 (5 %) · 7 → m7 (4 %) · maj → 7 (4 %) · m → 7 (3 %) · 6 → maj (2 %) · maj7 → 7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 26 % | 52 % | 26 % | 41 % |
| grille détectée | synthèse, vieux disque | 48 % | 73 % | 41 % | 63 % |
| grille détectée | enregistrements réels | 42 % | 73 % | 16 % | 77 % |
| grille détectée | réels, façon vieux disque | 39 % | 69 % | 14 % | 76 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
