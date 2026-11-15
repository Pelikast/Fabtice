# Banc accords — variante `tiges-oracle`

49 morceaux, mesuré le 2026-11-15 (21 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 25 | 75 % | 70 % | 65 % | 37 % | 75 % | 61 % | 9 % | 95 % | 89 % | 68 % |
| grille détectée | synthèse, vieux disque | 25 | 67 % | 63 % | 58 % | 35 % | 67 % | 62 % | 11 % | 94 % | 79 % | 60 % |
| grille détectée | enregistrements réels | 24 | 85 % | 81 % | 70 % | 55 % | 73 % | — | 13 % | 92 % | 79 % | 88 % |
| grille détectée | réels, façon vieux disque | 24 | 83 % | 78 % | 64 % | 47 % | 69 % | — | 17 % | 81 % | 58 % | 83 % |
| vraie grille | synthèse, son propre | 25 | 75 % | 71 % | 66 % | 38 % | 76 % | 60 % | 9 % | (vraie) | (vraie) | 68 % |
| vraie grille | synthèse, vieux disque | 25 | 68 % | 64 % | 59 % | 36 % | 68 % | 62 % | 8 % | (vraie) | (vraie) | 60 % |
| vraie grille | enregistrements réels | 24 | 87 % | 83 % | 71 % | 56 % | 75 % | — | 12 % | (vraie) | (vraie) | 88 % |
| vraie grille | réels, façon vieux disque | 24 | 85 % | 80 % | 66 % | 49 % | 71 % | — | 12 % | (vraie) | (vraie) | 83 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 12 | 74 % | 66 % | 75 % | 59 % | 8 % | 67 % | 60 % |
| grille détectée | développement | synthèse, vieux disque | 12 | 67 % | 60 % | 68 % | 61 % | 9 % | 58 % | 63 % |
| grille détectée | développement | enregistrements réels | 12 | 85 % | 70 % | 76 % | — | 9 % | 100 % | 39 % |
| grille détectée | développement | réels, façon vieux disque | 12 | 77 % | 55 % | 70 % | — | 22 % | 83 % | 32 % |
| grille détectée | mis de côté | synthèse, son propre | 13 | 76 % | 64 % | 76 % | 63 % | 9 % | 69 % | 54 % |
| grille détectée | mis de côté | synthèse, vieux disque | 13 | 66 % | 56 % | 66 % | 64 % | 12 % | 62 % | 59 % |
| grille détectée | mis de côté | enregistrements réels | 12 | 85 % | 69 % | 70 % | — | 16 % | 75 % | 33 % |
| grille détectée | mis de côté | réels, façon vieux disque | 12 | 88 % | 73 % | 69 % | — | 13 % | 83 % | 15 % |
| vraie grille | développement | synthèse, son propre | 12 | 74 % | 67 % | 75 % | 57 % | 8 % | 67 % | 59 % |
| vraie grille | développement | synthèse, vieux disque | 12 | 69 % | 61 % | 69 % | 59 % | 8 % | 58 % | 61 % |
| vraie grille | développement | enregistrements réels | 12 | 86 % | 70 % | 77 % | — | 14 % | 100 % | 22 % |
| vraie grille | développement | réels, façon vieux disque | 12 | 80 % | 57 % | 71 % | — | 14 % | 83 % | 28 % |
| vraie grille | mis de côté | synthèse, son propre | 13 | 76 % | 64 % | 76 % | 63 % | 9 % | 69 % | 54 % |
| vraie grille | mis de côté | synthèse, vieux disque | 13 | 67 % | 57 % | 67 % | 67 % | 9 % | 62 % | 58 % |
| vraie grille | mis de côté | enregistrements réels | 12 | 88 % | 72 % | 73 % | — | 10 % | 75 % | 30 % |
| vraie grille | mis de côté | réels, façon vieux disque | 12 | 90 % | 75 % | 70 % | — | 10 % | 83 % | 5 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 77 % | 67 % |
| grille détectée | synthèse, vieux disque | 69 % | 60 % |
| grille détectée | enregistrements réels | 86 % | 70 % |
| grille détectée | réels, façon vieux disque | 83 % | 63 % |
| vraie grille | synthèse, son propre | 77 % | 67 % |
| vraie grille | synthèse, vieux disque | 71 % | 62 % |
| vraie grille | enregistrements réels | 88 % | 72 % |
| vraie grille | réels, façon vieux disque | 86 % | 66 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 91 % / 83 % | 92 % / 83 % | 89 % / 80 % | 89 % / 80 % |  |  |  |  |
| bossa | 88 % / 81 % | 88 % / 81 % | 75 % / 67 % | 77 % / 70 % |  |  |  |  |
| guitare-bossa |  |  |  |  | 93 % / 74 % | 94 % / 73 % | 88 % / 63 % | 90 % / 65 % |
| guitare-jazz |  |  |  |  | 76 % / 65 % | 80 % / 69 % | 78 % / 65 % | 80 % / 67 % |
| modal | 98 % / 71 % | 98 % / 71 % | 67 % / 39 % | 68 % / 40 % |  |  |  |  |
| shuffle | 84 % / 77 % | 84 % / 74 % | 84 % / 80 % | 84 % / 80 % |  |  |  |  |
| swing | 61 % / 50 % | 61 % / 51 % | 50 % / 43 % | 52 % / 44 % |  |  |  |  |
| trad | 91 % / 82 % | 91 % / 84 % | 92 % / 82 % | 93 % / 84 % |  |  |  |  |
| waltz | 67 % / 54 % | 67 % / 54 % | 57 % / 47 % | 57 % / 47 % |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, vraie grille | enregistrements réels, vraie grille | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| fondamentale à la quinte / quarte | 23 % | 25 % | 11 % | 14 % | 23 % | 25 % | 8 % | 11 % |
| accord voisin (décalé d’un temps ou plus) | 21 % | 17 % | 10 % | 10 % | 20 % | 16 % | 8 % | 8 % |
| bonne fondamentale, septième ou sixte fausse | 14 % | 10 % | 37 % | 38 % | 14 % | 11 % | 41 % | 40 % |
| bonne fondamentale, famille fausse | 12 % | 8 % | 13 % | 14 % | 12 % | 8 % | 14 % | 15 % |
| fondamentale à une tierce (mineure) | 11 % | 16 % | 13 % | 10 % | 11 % | 16 % | 13 % | 10 % |
| fondamentale à un ton | 7 % | 8 % | 4 % | 6 % | 7 % | 8 % | 3 % | 5 % |
| fondamentale à un demi-ton | 7 % | 6 % | 0 % | 1 % | 7 % | 5 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 4 % | 6 % | 11 % | 7 % | 3 % | 7 % | 12 % | 9 % |
| fondamentale au triton | 2 % | 3 % | 1 % | 0 % | 2 % | 2 % | 0 % | 0 % |
| aucun accord | 1 % | 1 % | 0 % | 0 % | 1 % | 1 % | 0 % | 0 % |
| *temps faux / tous les temps* | 35 % | 42 % | 30 % | 36 % | 34 % | 41 % | 29 % | 34 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (19 %) · 7 → maj (15 %) · m7 → m (9 %) · m6 → m7 (7 %) · maj7 → maj (6 %) · 7 → m7 (5 %) · m → maj (4 %) · maj → 7 (3 %) · 6 → maj (3 %) · m6 → m (3 %) · dim7 → dim (3 %) · 6 → maj7 (3 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 36 % | 55 % | 24 % | 57 % |
| grille détectée | synthèse, vieux disque | 41 % | 62 % | 28 % | 61 % |
| grille détectée | enregistrements réels | 18 % | 60 % | 24 % | 36 % |
| grille détectée | réels, façon vieux disque | 13 % | 71 % | 30 % | 26 % |
| vraie grille | synthèse, son propre | 35 % | 55 % | 23 % | 56 % |
| vraie grille | synthèse, vieux disque | 39 % | 62 % | 28 % | 59 % |
| vraie grille | enregistrements réels | 12 % | 60 % | 24 % | 26 % |
| vraie grille | réels, façon vieux disque | 9 % | 70 % | 30 % | 19 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
