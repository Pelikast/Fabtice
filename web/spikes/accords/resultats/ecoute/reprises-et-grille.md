# Banc accords — variante `reprises-et-grille`

49 morceaux, mesuré le 2026-11-15 (16 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 25 | 77 % | 73 % | 68 % | 36 % | 75 % | 51 % | 11 % | 95 % | 89 % | 84 % |
| grille détectée | synthèse, vieux disque | 25 | 68 % | 66 % | 58 % | 33 % | 66 % | 57 % | 13 % | 94 % | 79 % | 76 % |
| grille détectée | enregistrements réels | 24 | 85 % | 81 % | 70 % | 55 % | 73 % | — | 14 % | 92 % | 79 % | 88 % |
| grille détectée | réels, façon vieux disque | 24 | 83 % | 78 % | 65 % | 48 % | 69 % | — | 18 % | 81 % | 58 % | 83 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 12 | 77 % | 70 % | 76 % | 43 % | 11 % | 75 % | 53 % |
| grille détectée | développement | synthèse, vieux disque | 12 | 69 % | 60 % | 66 % | 50 % | 16 % | 67 % | 58 % |
| grille détectée | développement | enregistrements réels | 12 | 85 % | 70 % | 76 % | — | 11 % | 100 % | 44 % |
| grille détectée | développement | réels, façon vieux disque | 12 | 78 % | 57 % | 69 % | — | 24 % | 83 % | 44 % |
| grille détectée | mis de côté | synthèse, son propre | 13 | 76 % | 66 % | 75 % | 65 % | 11 % | 92 % | 50 % |
| grille détectée | mis de côté | synthèse, vieux disque | 13 | 68 % | 57 % | 65 % | 67 % | 11 % | 85 % | 58 % |
| grille détectée | mis de côté | enregistrements réels | 12 | 85 % | 69 % | 71 % | — | 16 % | 75 % | 33 % |
| grille détectée | mis de côté | réels, façon vieux disque | 12 | 88 % | 74 % | 69 % | — | 13 % | 83 % | 30 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 79 % | 70 % |
| grille détectée | synthèse, vieux disque | 71 % | 61 % |
| grille détectée | enregistrements réels | 86 % | 70 % |
| grille détectée | réels, façon vieux disque | 83 % | 64 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 95 % / 85 % |  | 87 % / 72 % |  |  |  |  |  |
| bossa | 93 % / 87 % |  | 80 % / 74 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 93 % / 74 % |  | 88 % / 63 % |  |
| guitare-jazz |  |  |  |  | 76 % / 66 % |  | 79 % / 67 % |  |
| modal | 87 % / 74 % |  | 66 % / 52 % |  |  |  |  |  |
| shuffle | 83 % / 74 % |  | 83 % / 78 % |  |  |  |  |  |
| swing | 63 % / 53 % |  | 54 % / 44 % |  |  |  |  |  |
| trad | 92 % / 88 % |  | 91 % / 81 % |  |  |  |  |  |
| waltz | 65 % / 49 % |  | 53 % / 39 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 25 % | 21 % | 12 % | 14 % |
| accord voisin (décalé d’un temps ou plus) | 18 % | 13 % | 10 % | 11 % |
| bonne fondamentale, septième ou sixte fausse | 15 % | 16 % | 36 % | 38 % |
| bonne fondamentale, famille fausse | 10 % | 6 % | 13 % | 14 % |
| fondamentale à une tierce (mineure) | 10 % | 16 % | 13 % | 10 % |
| fondamentale à un ton | 8 % | 10 % | 3 % | 5 % |
| fondamentale à un demi-ton | 6 % | 5 % | 0 % | 1 % |
| fondamentale à une tierce (majeure) | 5 % | 7 % | 11 % | 8 % |
| fondamentale au triton | 4 % | 3 % | 1 % | 0 % |
| aucun accord | 0 % | 3 % | 0 % | 0 % |
| *temps faux / tous les temps* | 32 % | 42 % | 30 % | 35 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

7 → maj (16 %) · m7 → 7 (12 %) · maj7 → maj (11 %) · m7 → m (11 %) · m6 → m7 (7 %) · 6 → maj (4 %) · dim7 → dim (4 %) · 6 → maj7 (3 %) · 7 → m7 (3 %) · m → maj (3 %) · m6 → m (2 %) · maj → 7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 27 % | 61 % | 22 % | 51 % |
| grille détectée | synthèse, vieux disque | 36 % | 68 % | 27 % | 58 % |
| grille détectée | enregistrements réels | 20 % | 59 % | 23 % | 38 % |
| grille détectée | réels, façon vieux disque | 19 % | 71 % | 26 % | 39 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
