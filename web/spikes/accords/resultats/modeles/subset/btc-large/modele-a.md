# Banc accords — variante `modele-a`

22 morceaux, mesuré le 2026-11-15 (13 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 14 | 79 % | 75 % | 68 % | 35 % | 79 % | 19 % | 29 % | 96 % | 90 % | 86 % |
| grille détectée | synthèse, vieux disque | 14 | 62 % | 57 % | 47 % | 29 % | 61 % | 28 % | 35 % | 92 % | 76 % | 71 % |
| grille détectée | enregistrements réels | 8 | 88 % | 86 % | 71 % | 68 % | 84 % | — | 19 % | 91 % | 74 % | 75 % |
| grille détectée | réels, façon vieux disque | 8 | 89 % | 88 % | 63 % | 59 % | 78 % | — | 16 % | 79 % | 43 % | 88 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 79 % | 67 % | 78 % | 17 % | 29 % | 100 % | 38 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 63 % | 46 % | 61 % | 27 % | 41 % | 71 % | 46 % |
| grille détectée | développement | enregistrements réels | 4 | 97 % | 84 % | 95 % | — | 13 % | 75 % | 0 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 84 % | 74 % | 82 % | — | 10 % | 75 % | 50 % |
| grille détectée | mis de côté | synthèse, son propre | 7 | 80 % | 69 % | 79 % | 21 % | 29 % | 71 % | 38 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 61 % | 48 % | 61 % | 28 % | 31 % | 71 % | 39 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 78 % | 57 % | 73 % | — | 25 % | 75 % | 35 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 93 % | 51 % | 73 % | — | 21 % | 100 % | 38 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 80 % | 68 % |
| grille détectée | synthèse, vieux disque | 63 % | 48 % |
| grille détectée | enregistrements réels | 89 % | 71 % |
| grille détectée | réels, façon vieux disque | 87 % | 62 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 86 % / 73 % |  | 79 % / 62 % |  |  |  |  |  |
| bossa | 87 % / 84 % |  | 66 % / 57 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 96 % / 72 % |  | 85 % / 52 % |  |
| guitare-jazz |  |  |  |  | 79 % / 69 % |  | 92 % / 73 % |  |
| modal | 83 % / 73 % |  | 26 % / 7 % |  |  |  |  |  |
| shuffle | 79 % / 74 % |  | 65 % / 63 % |  |  |  |  |  |
| swing | 67 % / 53 % |  | 47 % / 31 % |  |  |  |  |  |
| trad | 93 % / 86 % |  | 90 % / 74 % |  |  |  |  |  |
| waltz | 78 % / 51 % |  | 72 % / 50 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 24 % | 26 % | 4 % | 8 % |
| bonne fondamentale, septième ou sixte fausse | 22 % | 18 % | 54 % | 67 % |
| accord voisin (décalé d’un temps ou plus) | 15 % | 8 % | 8 % | 6 % |
| bonne fondamentale, famille fausse | 12 % | 9 % | 4 % | 2 % |
| fondamentale à une tierce (mineure) | 8 % | 15 % | 15 % | 0 % |
| fondamentale à un ton | 6 % | 8 % | 2 % | 2 % |
| fondamentale à une tierce (majeure) | 4 % | 5 % | 3 % | 13 % |
| fondamentale à un demi-ton | 4 % | 3 % | 1 % | 0 % |
| fondamentale au triton | 3 % | 2 % | 0 % | 0 % |
| aucun accord | 2 % | 5 % | 11 % | 1 % |
| *temps faux / tous les temps* | 32 % | 53 % | 29 % | 38 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

7 → maj (17 %) · m7 → m (14 %) · maj7 → maj (12 %) · m7 → 7 (11 %) · maj → 7 (7 %) · maj → maj7 (6 %) · 7 → m7 (5 %) · m7b5 → m7 (4 %) · 6 → maj (4 %) · m6 → m7 (2 %) · m6 → m (2 %) · m(maj7) → m (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 28 % | 44 % | 28 % | 38 % |
| grille détectée | synthèse, vieux disque | 35 % | 65 % | 47 % | 43 % |
| grille détectée | enregistrements réels | 15 % | 49 % | 26 % | 26 % |
| grille détectée | réels, façon vieux disque | 27 % | 58 % | 30 % | 42 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
