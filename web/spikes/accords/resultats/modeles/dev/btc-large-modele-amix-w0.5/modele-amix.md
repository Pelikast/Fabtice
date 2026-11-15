# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (5 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 82 % | 79 % | 72 % | 34 % | 80 % | 19 % | 21 % | 93 % | 86 % | 100 % |
| grille détectée | synthèse, vieux disque | 7 | 70 % | 66 % | 61 % | 29 % | 67 % | 39 % | 25 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 98 % | 96 % | 88 % | 88 % | 96 % | — | 8 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 88 % | 86 % | 76 % | 72 % | 86 % | — | 13 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 82 % | 72 % | 80 % | 19 % | 21 % | 100 % | 42 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 70 % | 61 % | 67 % | 39 % | 25 % | 71 % | 49 % |
| grille détectée | développement | enregistrements réels | 4 | 98 % | 88 % | 96 % | — | 8 % | 100 % | 21 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 88 % | 76 % | 86 % | — | 13 % | 75 % | 40 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 84 % | 73 % |
| grille détectée | synthèse, vieux disque | 73 % | 63 % |
| grille détectée | enregistrements réels | 97 % | 86 % |
| grille détectée | réels, façon vieux disque | 85 % | 73 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 96 % / 72 % |  | 88 % / 74 % |  |  |  |  |  |
| bossa | 98 % / 95 % |  | 95 % / 91 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 84 % |  | 79 % / 67 % |  |
| guitare-jazz |  |  |  |  | 99 % / 91 % |  | 96 % / 84 % |  |
| shuffle | 88 % / 81 % |  | 76 % / 70 % |  |  |  |  |  |
| swing | 73 % / 62 % |  | 55 % / 44 % |  |  |  |  |  |
| trad | 87 % / 73 % |  | 81 % / 68 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| bonne fondamentale, septième ou sixte fausse | 25 % | 13 % | 67 % | 43 % |
| fondamentale à la quinte / quarte | 18 % | 21 % | 4 % | 21 % |
| accord voisin (décalé d’un temps ou plus) | 17 % | 16 % | 8 % | 6 % |
| fondamentale à une tierce (mineure) | 9 % | 15 % | 0 % | 0 % |
| bonne fondamentale, famille fausse | 9 % | 10 % | 17 % | 6 % |
| fondamentale à un ton | 7 % | 10 % | 4 % | 4 % |
| fondamentale à un demi-ton | 5 % | 3 % | 0 % | 0 % |
| fondamentale au triton | 5 % | 3 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 3 % | 6 % | 0 % | 19 % |
| aucun accord | 0 % | 2 % | 0 % | 0 % |
| *temps faux / tous les temps* | 28 % | 39 % | 13 % | 24 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

7 → maj (16 %) · m7 → 7 (15 %) · dim7 → dim (13 %) · 7 → m7 (10 %) · maj7 → maj (9 %) · 6 → maj (7 %) · maj → 7 (6 %) · m7 → m (5 %) · maj → maj7 (4 %) · m6 → m7 (3 %) · 7 → 6 (2 %) · dim7 → m7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 21 % | 56 % | 21 % | 42 % |
| grille détectée | synthèse, vieux disque | 39 % | 50 % | 33 % | 49 % |
| grille détectée | enregistrements réels | 13 % | 21 % | 11 % | 21 % |
| grille détectée | réels, façon vieux disque | 21 % | 48 % | 18 % | 40 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
