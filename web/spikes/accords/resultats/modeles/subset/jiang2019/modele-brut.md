# Banc accords — variante `modele-brut`

22 morceaux, mesuré le 2026-11-15 (3 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 14 | 70 % | 60 % | 54 % | 27 % | 70 % | 23 % | 36 % | 96 % | 90 % | 0 % |
| grille détectée | synthèse, vieux disque | 14 | 43 % | 39 % | 23 % | 15 % | 43 % | 55 % | 29 % | 92 % | 76 % | 0 % |
| grille détectée | enregistrements réels | 8 | 83 % | 83 % | 74 % | 73 % | 86 % | — | 25 % | 91 % | 74 % | 0 % |
| grille détectée | réels, façon vieux disque | 8 | 71 % | 71 % | 42 % | 42 % | 71 % | — | 24 % | 79 % | 43 % | 0 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 73 % | 57 % | 73 % | 21 % | 36 % | 0 % | 77 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 42 % | 16 % | 43 % | 55 % | 40 % | 0 % | 87 % |
| grille détectée | développement | enregistrements réels | 4 | 93 % | 79 % | 94 % | — | 21 % | 0 % | 53 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 81 % | 49 % | 78 % | — | 29 % | 0 % | 94 % |
| grille détectée | mis de côté | synthèse, son propre | 7 | 67 % | 51 % | 67 % | 27 % | 37 % | 0 % | 88 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 44 % | 30 % | 44 % | 55 % | 20 % | 0 % | 58 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 73 % | 69 % | 78 % | — | 29 % | 0 % | 78 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 61 % | 34 % | 63 % | — | 19 % | 0 % | 24 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 72 % | 56 % |
| grille détectée | synthèse, vieux disque | 44 % | 21 % |
| grille détectée | enregistrements réels | 85 % | 76 % |
| grille détectée | réels, façon vieux disque | 73 % | 42 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 91 % / 76 % |  | 60 % / 13 % |  |  |  |  |  |
| bossa | 82 % / 56 % |  | 59 % / 20 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 88 % |  | 92 % / 47 % |  |
| guitare-jazz |  |  |  |  | 70 % / 61 % |  | 50 % / 37 % |  |
| modal | 70 % / 68 % |  | 0 % / 0 % |  |  |  |  |  |
| shuffle | 81 % / 71 % |  | 33 % / 28 % |  |  |  |  |  |
| swing | 53 % / 34 % |  | 27 % / 16 % |  |  |  |  |  |
| trad | 95 % / 83 % |  | 84 % / 61 % |  |  |  |  |  |
| waltz | 44 % / 35 % |  | 19 % / 3 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| bonne fondamentale, famille fausse | 22 % | 5 % | 1 % | 0 % |
| fondamentale à la quinte / quarte | 20 % | 12 % | 11 % | 6 % |
| fondamentale à un demi-ton | 12 % | 1 % | 0 % | 7 % |
| bonne fondamentale, septième ou sixte fausse | 11 % | 20 % | 34 % | 50 % |
| accord voisin (décalé d’un temps ou plus) | 10 % | 4 % | 9 % | 4 % |
| fondamentale à un ton | 9 % | 4 % | 3 % | 3 % |
| fondamentale à une tierce (mineure) | 7 % | 6 % | 30 % | 0 % |
| fondamentale à une tierce (majeure) | 5 % | 2 % | 9 % | 3 % |
| fondamentale au triton | 3 % | 0 % | 0 % | 0 % |
| aucun accord | 0 % | 45 % | 2 % | 27 % |
| *temps faux / tous les temps* | 46 % | 77 % | 26 % | 58 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (20 %) · 7 → maj (14 %) · maj → 7 (12 %) · m7 → m (11 %) · maj7 → maj (10 %) · maj7 → 7 (6 %) · m7 → maj (3 %) · m → m7 (3 %) · m7b5 → m7 (2 %) · 7 → m7 (2 %) · 6 → 7 (2 %) · m6 → m (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 59 % | 64 % | 19 % | 83 % |
| grille détectée | synthèse, vieux disque | 68 % | 84 % | 63 % | 74 % |
| grille détectée | enregistrements réels | 27 % | 64 % | 11 % | 68 % |
| grille détectée | réels, façon vieux disque | 49 % | 64 % | 52 % | 54 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
