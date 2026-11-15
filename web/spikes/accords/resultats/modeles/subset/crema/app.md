# Banc accords — variante `app`

22 morceaux, mesuré le 2026-11-15 (10 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 14 | 79 % | 73 % | 67 % | 34 % | 78 % | 40 % | 18 % | 96 % | 90 % | 86 % |
| grille détectée | synthèse, vieux disque | 14 | 65 % | 62 % | 55 % | 29 % | 63 % | 54 % | 17 % | 92 % | 76 % | 71 % |
| grille détectée | enregistrements réels | 8 | 91 % | 90 % | 84 % | 79 % | 86 % | — | 11 % | 91 % | 74 % | 88 % |
| grille détectée | réels, façon vieux disque | 8 | 89 % | 88 % | 77 % | 68 % | 79 % | — | 18 % | 79 % | 43 % | 88 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 77 % | 67 % | 76 % | 39 % | 18 % | 86 % | 39 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 65 % | 58 % | 62 % | 54 % | 20 % | 71 % | 53 % |
| grille détectée | développement | enregistrements réels | 4 | 98 % | 90 % | 96 % | — | 6 % | 100 % | 74 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 86 % | 66 % | 84 % | — | 19 % | 75 % | 75 % |
| grille détectée | mis de côté | synthèse, son propre | 7 | 80 % | 67 % | 79 % | 43 % | 18 % | 86 % | 42 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 65 % | 52 % | 64 % | 56 % | 14 % | 71 % | 48 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 84 % | 79 % | 75 % | — | 17 % | 75 % | 63 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 92 % | 89 % | 73 % | — | 17 % | 100 % | 14 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 81 % | 69 % |
| grille détectée | synthèse, vieux disque | 69 % | 58 % |
| grille détectée | enregistrements réels | 92 % | 85 % |
| grille détectée | réels, façon vieux disque | 88 % | 76 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 95 % / 84 % |  | 91 % / 74 % |  |  |  |  |  |
| bossa | 92 % / 85 % |  | 74 % / 66 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 89 % |  | 90 % / 82 % |  |
| guitare-jazz |  |  |  |  | 84 % / 80 % |  | 89 % / 73 % |  |
| modal | 93 % / 74 % |  | 66 % / 52 % |  |  |  |  |  |
| shuffle | 83 % / 72 % |  | 88 % / 78 % |  |  |  |  |  |
| swing | 60 % / 49 % |  | 43 % / 35 % |  |  |  |  |  |
| trad | 93 % / 84 % |  | 89 % / 78 % |  |  |  |  |  |
| waltz | 73 % / 50 % |  | 58 % / 40 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 22 % | 22 % | 10 % | 21 % |
| accord voisin (décalé d’un temps ou plus) | 18 % | 14 % | 12 % | 13 % |
| bonne fondamentale, famille fausse | 16 % | 6 % | 7 % | 3 % |
| bonne fondamentale, septième ou sixte fausse | 16 % | 16 % | 37 % | 48 % |
| fondamentale à une tierce (mineure) | 7 % | 14 % | 17 % | 0 % |
| fondamentale à un ton | 7 % | 8 % | 2 % | 2 % |
| fondamentale à une tierce (majeure) | 5 % | 6 % | 5 % | 8 % |
| fondamentale à un demi-ton | 5 % | 4 % | 2 % | 0 % |
| fondamentale au triton | 4 % | 2 % | 7 % | 0 % |
| aucun accord | 0 % | 8 % | 3 % | 5 % |
| *temps faux / tous les temps* | 33 % | 45 % | 16 % | 23 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (22 %) · 7 → maj (17 %) · dim7 → dim (9 %) · m7 → m (9 %) · m6 → m7 (5 %) · maj7 → maj (4 %) · 7 → m7 (3 %) · 6 → maj7 (3 %) · maj7 → 7 (2 %) · maj → 7 (2 %) · 6 → maj (2 %) · 7 → 6 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 25 % | 54 % | 26 % | 41 % |
| grille détectée | synthèse, vieux disque | 36 % | 64 % | 35 % | 51 % |
| grille détectée | enregistrements réels | 23 % | 46 % | 7 % | 67 % |
| grille détectée | réels, façon vieux disque | 16 % | 84 % | 11 % | 60 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
