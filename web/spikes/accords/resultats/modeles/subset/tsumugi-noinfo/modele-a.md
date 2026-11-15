# Banc accords — variante `modele-a`

22 morceaux, mesuré le 2026-11-15 (27 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 14 | 91 % | 89 % | 87 % | 65 % | 91 % | 10 % | 11 % | 96 % | 90 % | 79 % |
| grille détectée | synthèse, vieux disque | 14 | 84 % | 78 % | 74 % | 47 % | 85 % | 20 % | 17 % | 92 % | 76 % | 79 % |
| grille détectée | enregistrements réels | 8 | 87 % | 87 % | 80 % | 77 % | 94 % | — | 21 % | 91 % | 74 % | 75 % |
| grille détectée | réels, façon vieux disque | 8 | 91 % | 91 % | 85 % | 77 % | 89 % | — | 17 % | 79 % | 43 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 89 % | 86 % | 89 % | 8 % | 13 % | 86 % | 17 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 81 % | 73 % | 82 % | 26 % | 22 % | 86 % | 40 % |
| grille détectée | développement | enregistrements réels | 4 | 95 % | 85 % | 97 % | — | 17 % | 100 % | 24 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 95 % | 86 % | 96 % | — | 10 % | 100 % | 23 % |
| grille détectée | mis de côté | synthèse, son propre | 7 | 93 % | 87 % | 93 % | 13 % | 10 % | 71 % | 23 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 88 % | 76 % | 87 % | 12 % | 13 % | 71 % | 56 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 79 % | 75 % | 91 % | — | 25 % | 50 % | 46 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 88 % | 84 % | 82 % | — | 23 % | 50 % | 23 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 91 % | 87 % |
| grille détectée | synthèse, vieux disque | 86 % | 76 % |
| grille détectée | enregistrements réels | 89 % | 81 % |
| grille détectée | réels, façon vieux disque | 91 % | 84 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 100 % / 100 % |  | 99 % / 94 % |  |  |  |  |  |
| bossa | 97 % / 96 % |  | 92 % / 89 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 94 % |  | 97 % / 93 % |  |
| guitare-jazz |  |  |  |  | 77 % / 66 % |  | 85 % / 77 % |  |
| modal | 98 % / 98 % |  | 91 % / 57 % |  |  |  |  |  |
| shuffle | 94 % / 91 % |  | 97 % / 96 % |  |  |  |  |  |
| swing | 84 % / 79 % |  | 74 % / 66 % |  |  |  |  |  |
| trad | 95 % / 94 % |  | 92 % / 80 % |  |  |  |  |  |
| waltz | 85 % / 65 % |  | 73 % / 56 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| accord voisin (décalé d’un temps ou plus) | 24 % | 19 % | 13 % | 16 % |
| fondamentale à la quinte / quarte | 18 % | 14 % | 12 % | 9 % |
| bonne fondamentale, famille fausse | 14 % | 23 % | 1 % | 0 % |
| bonne fondamentale, septième ou sixte fausse | 12 % | 13 % | 34 % | 40 % |
| fondamentale à une tierce (mineure) | 11 % | 11 % | 1 % | 2 % |
| fondamentale au triton | 9 % | 5 % | 0 % | 2 % |
| fondamentale à une tierce (majeure) | 4 % | 4 % | 8 % | 19 % |
| fondamentale à un demi-ton | 3 % | 3 % | 0 % | 0 % |
| fondamentale à un ton | 3 % | 4 % | 27 % | 9 % |
| aucun accord | 0 % | 3 % | 4 % | 4 % |
| *temps faux / tous les temps* | 13 % | 26 % | 20 % | 15 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (39 %) · maj → 7 (14 %) · 7 → m7 (6 %) · m → m7 (5 %) · 7 → maj (4 %) · 6 → maj (3 %) · maj7 → 7 (3 %) · m(maj7) → m7 (3 %) · m6 → maj7 (3 %) · dim7 → 7 (3 %) · 6 → maj7 (2 %) · m6 → m7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 6 % | 47 % | 11 % | 20 % |
| grille détectée | synthèse, vieux disque | 21 % | 57 % | 17 % | 48 % |
| grille détectée | enregistrements réels | 10 % | 73 % | 14 % | 38 % |
| grille détectée | réels, façon vieux disque | 5 % | 62 % | 12 % | 23 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
