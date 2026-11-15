# Banc accords — variante `modele-brut`

22 morceaux, mesuré le 2026-11-15 (2 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 14 | 88 % | 86 % | 84 % | 60 % | 90 % | 16 % | 12 % | 96 % | 90 % | 0 % |
| grille détectée | synthèse, vieux disque | 14 | 82 % | 77 % | 74 % | 43 % | 82 % | 16 % | 28 % | 92 % | 76 % | 0 % |
| grille détectée | enregistrements réels | 8 | 87 % | 86 % | 80 % | 78 % | 94 % | — | 24 % | 91 % | 74 % | 0 % |
| grille détectée | réels, façon vieux disque | 8 | 91 % | 91 % | 84 % | 79 % | 88 % | — | 20 % | 79 % | 43 % | 0 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 87 % | 85 % | 89 % | 15 % | 13 % | 0 % | 27 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 79 % | 73 % | 81 % | 16 % | 30 % | 0 % | 41 % |
| grille détectée | développement | enregistrements réels | 4 | 95 % | 84 % | 95 % | — | 19 % | 0 % | 17 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 94 % | 84 % | 93 % | — | 19 % | 0 % | 20 % |
| grille détectée | mis de côté | synthèse, son propre | 7 | 89 % | 84 % | 92 % | 18 % | 12 % | 0 % | 51 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 85 % | 75 % | 83 % | 16 % | 27 % | 0 % | 53 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 78 % | 75 % | 93 % | — | 29 % | 0 % | 8 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 88 % | 84 % | 83 % | — | 21 % | 0 % | 20 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 88 % | 84 % |
| grille détectée | synthèse, vieux disque | 82 % | 75 % |
| grille détectée | enregistrements réels | 88 % | 81 % |
| grille détectée | réels, façon vieux disque | 91 % | 84 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 98 % / 98 % |  | 98 % / 93 % |  |  |  |  |  |
| bossa | 98 % / 97 % |  | 88 % / 86 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 94 % |  | 96 % / 93 % |  |
| guitare-jazz |  |  |  |  | 76 % / 66 % |  | 86 % / 76 % |  |
| modal | 82 % / 81 % |  | 83 % / 56 % |  |  |  |  |  |
| shuffle | 88 % / 85 % |  | 91 % / 86 % |  |  |  |  |  |
| swing | 81 % / 77 % |  | 74 % / 66 % |  |  |  |  |  |
| trad | 97 % / 96 % |  | 87 % / 82 % |  |  |  |  |  |
| waltz | 77 % / 60 % |  | 70 % / 58 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 23 % | 23 % | 10 % | 10 % |
| accord voisin (décalé d’un temps ou plus) | 16 % | 13 % | 13 % | 15 % |
| fondamentale à une tierce (mineure) | 14 % | 13 % | 1 % | 2 % |
| bonne fondamentale, famille fausse | 12 % | 18 % | 1 % | 2 % |
| bonne fondamentale, septième ou sixte fausse | 10 % | 9 % | 33 % | 42 % |
| fondamentale à un demi-ton | 8 % | 7 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 6 % | 6 % | 12 % | 18 % |
| fondamentale au triton | 6 % | 5 % | 1 % | 2 % |
| fondamentale à un ton | 5 % | 5 % | 26 % | 7 % |
| aucun accord | 0 % | 0 % | 3 % | 3 % |
| *temps faux / tous les temps* | 16 % | 26 % | 20 % | 16 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (36 %) · maj → 7 (7 %) · m → m7 (6 %) · 7 → maj (5 %) · 7 → m7 (5 %) · 6 → maj7 (4 %) · m7 → m7b5 (4 %) · 6 → maj (4 %) · m(maj7) → m7 (3 %) · maj7 → 7 (3 %) · 7 → maj7 (2 %) · dim7 → dim (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 12 % | 50 % | 11 % | 39 % |
| grille détectée | synthèse, vieux disque | 22 % | 56 % | 18 % | 47 % |
| grille détectée | enregistrements réels | 6 % | 39 % | 19 % | 12 % |
| grille détectée | réels, façon vieux disque | 5 % | 63 % | 13 % | 20 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
