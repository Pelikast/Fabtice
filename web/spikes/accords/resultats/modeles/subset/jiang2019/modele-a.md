# Banc accords — variante `modele-a`

22 morceaux, mesuré le 2026-11-15 (40 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 14 | 81 % | 67 % | 61 % | 29 % | 81 % | 32 % | 17 % | 96 % | 90 % | 57 % |
| grille détectée | synthèse, vieux disque | 14 | 41 % | 39 % | 22 % | 15 % | 41 % | 74 % | 11 % | 92 % | 76 % | 57 % |
| grille détectée | enregistrements réels | 8 | 86 % | 85 % | 76 % | 74 % | 87 % | — | 14 % | 91 % | 74 % | 88 % |
| grille détectée | réels, façon vieux disque | 8 | 74 % | 74 % | 44 % | 42 % | 74 % | — | 15 % | 79 % | 43 % | 88 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 79 % | 62 % | 80 % | 30 % | 20 % | 71 % | 51 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 41 % | 15 % | 41 % | 79 % | 14 % | 43 % | 94 % |
| grille détectée | développement | enregistrements réels | 4 | 97 % | 80 % | 97 % | — | 10 % | 100 % | 92 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 79 % | 47 % | 80 % | — | 15 % | 100 % | 71 % |
| grille détectée | mis de côté | synthèse, son propre | 7 | 82 % | 59 % | 83 % | 36 % | 15 % | 43 % | 74 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 42 % | 29 % | 42 % | 66 % | 9 % | 71 % | 72 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 74 % | 71 % | 78 % | — | 17 % | 75 % | 73 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 69 % | 41 % | 69 % | — | 15 % | 75 % | 9 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 82 % | 63 % |
| grille détectée | synthèse, vieux disque | 42 % | 20 % |
| grille détectée | enregistrements réels | 88 % | 77 % |
| grille détectée | réels, façon vieux disque | 77 % | 45 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 93 % / 82 % |  | 57 % / 16 % |  |  |  |  |  |
| bossa | 95 % / 67 % |  | 72 % / 19 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 89 % |  | 92 % / 47 % |  |
| guitare-jazz |  |  |  |  | 74 % / 62 % |  | 56 % / 42 % |  |
| modal | 99 % / 98 % |  | 0 % / 0 % |  |  |  |  |  |
| shuffle | 86 % / 79 % |  | 20 % / 17 % |  |  |  |  |  |
| swing | 62 % / 37 % |  | 21 % / 14 % |  |  |  |  |  |
| trad | 93 % / 81 % |  | 83 % / 59 % |  |  |  |  |  |
| waltz | 77 % / 48 % |  | 12 % / 3 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| bonne fondamentale, famille fausse | 34 % | 3 % | 4 % | 0 % |
| fondamentale à la quinte / quarte | 16 % | 7 % | 3 % | 10 % |
| bonne fondamentale, septième ou sixte fausse | 15 % | 22 % | 37 % | 53 % |
| accord voisin (décalé d’un temps ou plus) | 10 % | 3 % | 9 % | 5 % |
| fondamentale à un demi-ton | 7 % | 1 % | 0 % | 0 % |
| fondamentale à un ton | 7 % | 2 % | 2 % | 3 % |
| fondamentale à une tierce (mineure) | 5 % | 4 % | 32 % | 0 % |
| fondamentale à une tierce (majeure) | 4 % | 2 % | 11 % | 0 % |
| fondamentale au triton | 3 % | 0 % | 0 % | 0 % |
| aucun accord | 0 % | 55 % | 2 % | 29 % |
| *temps faux / tous les temps* | 39 % | 78 % | 24 % | 56 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (22 %) · maj → 7 (12 %) · m7 → m (12 %) · 7 → maj (11 %) · maj7 → maj (9 %) · maj7 → 7 (7 %) · m7b5 → dim (3 %) · 7 → m7 (2 %) · 6 → 7 (2 %) · m7 → maj (2 %) · m7b5 → 7 (2 %) · dim7 → m7b5 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 33 % | 74 % | 22 % | 63 % |
| grille détectée | synthèse, vieux disque | 74 % | 89 % | 48 % | 84 % |
| grille détectée | enregistrements réels | 34 % | 58 % | 7 % | 81 % |
| grille détectée | réels, façon vieux disque | 30 % | 71 % | 49 % | 38 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
