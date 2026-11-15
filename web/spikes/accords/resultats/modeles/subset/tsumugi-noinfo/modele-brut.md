# Banc accords — variante `modele-brut`

22 morceaux, mesuré le 2026-11-15 (2 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 14 | 84 % | 81 % | 79 % | 56 % | 85 % | 10 % | 27 % | 96 % | 90 % | 0 % |
| grille détectée | synthèse, vieux disque | 14 | 78 % | 70 % | 68 % | 41 % | 79 % | 11 % | 42 % | 92 % | 76 % | 0 % |
| grille détectée | enregistrements réels | 8 | 88 % | 87 % | 80 % | 78 % | 93 % | — | 26 % | 91 % | 74 % | 0 % |
| grille détectée | réels, façon vieux disque | 8 | 90 % | 90 % | 84 % | 77 % | 87 % | — | 23 % | 79 % | 43 % | 0 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 84 % | 80 % | 83 % | 11 % | 30 % | 0 % | 45 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 76 % | 70 % | 77 % | 12 % | 50 % | 0 % | 49 % |
| grille détectée | développement | enregistrements réels | 4 | 95 % | 83 % | 95 % | — | 21 % | 0 % | 22 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 92 % | 83 % | 92 % | — | 23 % | 0 % | 28 % |
| grille détectée | mis de côté | synthèse, son propre | 7 | 85 % | 78 % | 87 % | 9 % | 25 % | 0 % | 52 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 81 % | 65 % | 80 % | 10 % | 36 % | 0 % | 70 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 80 % | 77 % | 92 % | — | 31 % | 0 % | 25 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 88 % | 84 % | 82 % | — | 23 % | 0 % | 23 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 84 % | 80 % |
| grille détectée | synthèse, vieux disque | 79 % | 69 % |
| grille détectée | enregistrements réels | 89 % | 81 % |
| grille détectée | réels, façon vieux disque | 90 % | 83 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 98 % / 97 % |  | 98 % / 94 % |  |  |  |  |  |
| bossa | 94 % / 90 % |  | 82 % / 79 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 94 % |  | 96 % / 93 % |  |
| guitare-jazz |  |  |  |  | 78 % / 67 % |  | 84 % / 74 % |  |
| modal | 65 % / 63 % |  | 80 % / 21 % |  |  |  |  |  |
| shuffle | 86 % / 81 % |  | 87 % / 83 % |  |  |  |  |  |
| swing | 76 % / 70 % |  | 70 % / 62 % |  |  |  |  |  |
| trad | 97 % / 96 % |  | 89 % / 84 % |  |  |  |  |  |
| waltz | 76 % / 58 % |  | 64 % / 48 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 21 % | 20 % | 13 % | 8 % |
| accord voisin (décalé d’un temps ou plus) | 21 % | 14 % | 12 % | 13 % |
| fondamentale à une tierce (mineure) | 15 % | 14 % | 1 % | 6 % |
| bonne fondamentale, famille fausse | 12 % | 24 % | 3 % | 0 % |
| bonne fondamentale, septième ou sixte fausse | 8 % | 6 % | 34 % | 38 % |
| fondamentale au triton | 7 % | 6 % | 1 % | 2 % |
| fondamentale à un demi-ton | 6 % | 6 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 5 % | 5 % | 12 % | 22 % |
| fondamentale à un ton | 4 % | 4 % | 21 % | 8 % |
| aucun accord | 0 % | 0 % | 3 % | 3 % |
| *temps faux / tous les temps* | 21 % | 32 % | 20 % | 16 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (50 %) · maj → 7 (6 %) · 7 → m7 (6 %) · m → m7 (5 %) · 7 → maj (4 %) · m(maj7) → m7 (3 %) · 6 → maj (3 %) · maj7 → 7 (2 %) · 6 → maj7 (2 %) · m7b5 → m7 (2 %) · m6 → m7 (2 %) · 7 → maj7 (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 22 % | 46 % | 14 % | 48 % |
| grille détectée | synthèse, vieux disque | 33 % | 59 % | 19 % | 60 % |
| grille détectée | enregistrements réels | 9 % | 51 % | 17 % | 24 % |
| grille détectée | réels, façon vieux disque | 10 % | 42 % | 14 % | 25 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
