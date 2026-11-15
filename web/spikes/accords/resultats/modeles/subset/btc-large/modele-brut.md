# Banc accords — variante `modele-brut`

22 morceaux, mesuré le 2026-11-15 (1 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 14 | 67 % | 63 % | 54 % | 31 % | 68 % | 9 % | 54 % | 96 % | 90 % | 0 % |
| grille détectée | synthèse, vieux disque | 14 | 56 % | 50 % | 41 % | 25 % | 56 % | 14 % | 54 % | 92 % | 76 % | 0 % |
| grille détectée | enregistrements réels | 8 | 87 % | 86 % | 70 % | 67 % | 84 % | — | 26 % | 91 % | 74 % | 0 % |
| grille détectée | réels, façon vieux disque | 8 | 89 % | 88 % | 61 % | 59 % | 78 % | — | 28 % | 79 % | 43 % | 0 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 65 % | 51 % | 66 % | 9 % | 60 % | 0 % | 42 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 54 % | 34 % | 54 % | 12 % | 65 % | 0 % | 46 % |
| grille détectée | développement | enregistrements réels | 4 | 97 % | 83 % | 95 % | — | 23 % | 0 % | 31 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 85 % | 74 % | 83 % | — | 29 % | 0 % | 53 % |
| grille détectée | mis de côté | synthèse, son propre | 7 | 70 % | 58 % | 70 % | 9 % | 50 % | 0 % | 41 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 58 % | 47 % | 59 % | 16 % | 44 % | 0 % | 42 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 77 % | 56 % | 72 % | — | 29 % | 0 % | 16 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 93 % | 48 % | 72 % | — | 27 % | 0 % | 18 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 67 % | 54 % |
| grille détectée | synthèse, vieux disque | 56 % | 40 % |
| grille détectée | enregistrements réels | 89 % | 70 % |
| grille détectée | réels, façon vieux disque | 88 % | 62 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 80 % / 66 % |  | 74 % / 55 % |  |  |  |  |  |
| bossa | 67 % / 56 % |  | 46 % / 33 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 96 % / 72 % |  | 88 % / 55 % |  |
| guitare-jazz |  |  |  |  | 78 % / 67 % |  | 91 % / 68 % |  |
| modal | 36 % / 24 % |  | 23 % / 6 % |  |  |  |  |  |
| shuffle | 72 % / 66 % |  | 60 % / 55 % |  |  |  |  |  |
| swing | 56 % / 43 % |  | 43 % / 27 % |  |  |  |  |  |
| trad | 93 % / 83 % |  | 93 % / 77 % |  |  |  |  |  |
| waltz | 73 % / 48 % |  | 63 % / 44 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 28 % | 28 % | 4 % | 7 % |
| bonne fondamentale, septième ou sixte fausse | 17 % | 16 % | 54 % | 70 % |
| fondamentale à une tierce (mineure) | 13 % | 17 % | 22 % | 0 % |
| accord voisin (décalé d’un temps ou plus) | 11 % | 6 % | 10 % | 5 % |
| bonne fondamentale, famille fausse | 9 % | 9 % | 3 % | 2 % |
| fondamentale à un ton | 7 % | 10 % | 2 % | 3 % |
| fondamentale à une tierce (majeure) | 6 % | 7 % | 3 % | 12 % |
| fondamentale à un demi-ton | 4 % | 4 % | 0 % | 0 % |
| fondamentale au triton | 3 % | 2 % | 0 % | 0 % |
| aucun accord | 1 % | 1 % | 2 % | 1 % |
| *temps faux / tous les temps* | 46 % | 59 % | 30 % | 39 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

7 → maj (19 %) · m7 → m (14 %) · maj7 → maj (12 %) · m7 → 7 (10 %) · maj → maj7 (8 %) · m7b5 → m7 (6 %) · maj → 7 (6 %) · 7 → m7 (5 %) · 6 → maj (3 %) · m7 → maj (2 %) · m6 → m (2 %) · m6 → m7 (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 28 % | 68 % | 37 % | 41 % |
| grille détectée | synthèse, vieux disque | 35 % | 75 % | 51 % | 44 % |
| grille détectée | enregistrements réels | 13 % | 47 % | 28 % | 21 % |
| grille détectée | réels, façon vieux disque | 15 % | 75 % | 32 % | 30 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
