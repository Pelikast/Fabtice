# Banc accords — variante `modele-dec`

22 morceaux, mesuré le 2026-11-15 (5 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 14 | 90 % | 88 % | 86 % | 57 % | 90 % | 20 % | 6 % | 96 % | 90 % | 0 % |
| grille détectée | synthèse, vieux disque | 14 | 83 % | 79 % | 76 % | 44 % | 82 % | 24 % | 11 % | 92 % | 76 % | 0 % |
| grille détectée | enregistrements réels | 8 | 88 % | 88 % | 79 % | 77 % | 96 % | — | 15 % | 91 % | 74 % | 0 % |
| grille détectée | réels, façon vieux disque | 8 | 92 % | 92 % | 84 % | 78 % | 87 % | — | 19 % | 79 % | 43 % | 0 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 89 % | 86 % | 89 % | 19 % | 8 % | 0 % | 0 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 80 % | 75 % | 81 % | 25 % | 15 % | 0 % | 0 % |
| grille détectée | développement | enregistrements réels | 4 | 96 % | 83 % | 94 % | — | 17 % | 0 % | 0 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 94 % | 83 % | 92 % | — | 21 % | 0 % | 0 % |
| grille détectée | mis de côté | synthèse, son propre | 7 | 92 % | 86 % | 92 % | 21 % | 5 % | 0 % | 0 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 87 % | 77 % | 84 % | 23 % | 8 % | 0 % | 0 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 79 % | 76 % | 97 % | — | 13 % | 0 % | 0 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 90 % | 86 % | 81 % | — | 17 % | 0 % | 0 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 90 % | 87 % |
| grille détectée | synthèse, vieux disque | 85 % | 78 % |
| grille détectée | enregistrements réels | 89 % | 80 % |
| grille détectée | réels, façon vieux disque | 92 % | 84 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 100 % / 100 % |  | 100 % / 95 % |  |  |  |  |  |
| bossa | 98 % / 95 % |  | 91 % / 88 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 94 % |  | 97 % / 92 % |  |
| guitare-jazz |  |  |  |  | 77 % / 65 % |  | 87 % / 77 % |  |
| modal | 95 % / 95 % |  | 91 % / 73 % |  |  |  |  |  |
| shuffle | 92 % / 92 % |  | 93 % / 92 % |  |  |  |  |  |
| swing | 83 % / 79 % |  | 75 % / 66 % |  |  |  |  |  |
| trad | 96 % / 95 % |  | 87 % / 85 % |  |  |  |  |  |
| waltz | 79 % / 62 % |  | 71 % / 54 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| accord voisin (décalé d’un temps ou plus) | 22 % | 17 % | 10 % | 15 % |
| fondamentale à la quinte / quarte | 18 % | 21 % | 5 % | 8 % |
| fondamentale à une tierce (mineure) | 14 % | 12 % | 1 % | 2 % |
| bonne fondamentale, septième ou sixte fausse | 13 % | 10 % | 40 % | 47 % |
| bonne fondamentale, famille fausse | 11 % | 18 % | 0 % | 2 % |
| fondamentale à un demi-ton | 9 % | 7 % | 0 % | 0 % |
| fondamentale au triton | 6 % | 6 % | 0 % | 2 % |
| fondamentale à un ton | 4 % | 5 % | 29 % | 12 % |
| fondamentale à une tierce (majeure) | 4 % | 5 % | 14 % | 12 % |
| aucun accord | 0 % | 0 % | 1 % | 2 % |
| *temps faux / tous les temps* | 14 % | 24 % | 21 % | 16 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (34 %) · m → m7 (8 %) · 6 → maj7 (8 %) · maj → 7 (6 %) · 7 → maj (6 %) · 7 → m7 (6 %) · m(maj7) → m7 (5 %) · 6 → maj (5 %) · maj7 → 7 (4 %) · m7 → m7b5 (3 %) · m6 → m7 (3 %) · m7 → m6 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 0 % | — | 14 % | 0 % |
| grille détectée | synthèse, vieux disque | 0 % | — | 24 % | 0 % |
| grille détectée | enregistrements réels | 0 % | — | 21 % | 0 % |
| grille détectée | réels, façon vieux disque | 0 % | — | 16 % | 0 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
