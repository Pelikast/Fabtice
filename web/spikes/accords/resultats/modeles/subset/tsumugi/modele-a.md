# Banc accords — variante `modele-a`

22 morceaux, mesuré le 2026-11-15 (29 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 14 | 92 % | 90 % | 88 % | 65 % | 92 % | 15 % | 6 % | 96 % | 90 % | 86 % |
| grille détectée | synthèse, vieux disque | 14 | 85 % | 82 % | 79 % | 48 % | 86 % | 28 % | 12 % | 92 % | 76 % | 79 % |
| grille détectée | enregistrements réels | 8 | 87 % | 87 % | 79 % | 76 % | 95 % | — | 20 % | 91 % | 74 % | 75 % |
| grille détectée | réels, façon vieux disque | 8 | 92 % | 92 % | 86 % | 78 % | 90 % | — | 15 % | 79 % | 43 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 90 % | 88 % | 90 % | 14 % | 7 % | 100 % | 7 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 81 % | 74 % | 81 % | 33 % | 15 % | 86 % | 34 % |
| grille détectée | développement | enregistrements réels | 4 | 95 % | 83 % | 97 % | — | 17 % | 100 % | 19 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 95 % | 86 % | 97 % | — | 10 % | 100 % | 0 % |
| grille détectée | mis de côté | synthèse, son propre | 7 | 94 % | 89 % | 94 % | 18 % | 4 % | 71 % | 26 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 90 % | 83 % | 90 % | 20 % | 9 % | 71 % | 40 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 79 % | 75 % | 93 % | — | 23 % | 50 % | 23 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 89 % | 85 % | 82 % | — | 19 % | 50 % | 14 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 92 % | 89 % |
| grille détectée | synthèse, vieux disque | 87 % | 80 % |
| grille détectée | enregistrements réels | 88 % | 80 % |
| grille détectée | réels, façon vieux disque | 92 % | 85 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 100 % / 100 % |  | 99 % / 94 % |  |  |  |  |  |
| bossa | 99 % / 98 % |  | 93 % / 89 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 93 % |  | 97 % / 94 % |  |
| guitare-jazz |  |  |  |  | 76 % / 66 % |  | 86 % / 78 % |  |
| modal | 99 % / 99 % |  | 97 % / 88 % |  |  |  |  |  |
| shuffle | 93 % / 90 % |  | 94 % / 93 % |  |  |  |  |  |
| swing | 84 % / 81 % |  | 76 % / 68 % |  |  |  |  |  |
| trad | 97 % / 95 % |  | 87 % / 81 % |  |  |  |  |  |
| waltz | 89 % / 67 % |  | 81 % / 68 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| accord voisin (décalé d’un temps ou plus) | 21 % | 19 % | 13 % | 18 % |
| fondamentale à la quinte / quarte | 18 % | 19 % | 8 % | 15 % |
| bonne fondamentale, septième ou sixte fausse | 15 % | 13 % | 36 % | 42 % |
| bonne fondamentale, famille fausse | 14 % | 16 % | 0 % | 2 % |
| fondamentale à une tierce (mineure) | 13 % | 11 % | 3 % | 0 % |
| fondamentale au triton | 8 % | 6 % | 0 % | 2 % |
| fondamentale à un demi-ton | 4 % | 6 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 4 % | 5 % | 11 % | 18 % |
| fondamentale à un ton | 3 % | 4 % | 26 % | 2 % |
| aucun accord | 0 % | 1 % | 4 % | 2 % |
| *temps faux / tous les temps* | 12 % | 21 % | 21 % | 14 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (28 %) · maj → 7 (12 %) · m → m7 (8 %) · 7 → m7 (7 %) · 6 → maj7 (6 %) · 7 → maj (5 %) · m(maj7) → m7 (5 %) · m6 → maj7 (4 %) · 6 → maj (4 %) · maj7 → 7 (3 %) · m6 → m7 (2 %) · 6 → 7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 3 % | 55 % | 10 % | 16 % |
| grille détectée | synthèse, vieux disque | 14 % | 55 % | 16 % | 36 % |
| grille détectée | enregistrements réels | 8 % | 59 % | 18 % | 21 % |
| grille détectée | réels, façon vieux disque | 1 % | 100 % | 13 % | 7 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
