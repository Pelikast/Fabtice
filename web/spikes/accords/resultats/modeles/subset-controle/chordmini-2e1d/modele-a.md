# Banc accords — variante `modele-a`

11 morceaux, mesuré le 2026-11-15 (5 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 79 % | 74 % | 68 % | 38 % | 80 % | 21 % | 28 % | 98 % | 94 % | 71 % |
| grille détectée | synthèse, vieux disque | 7 | 54 % | 51 % | 46 % | 29 % | 54 % | 50 % | 26 % | 90 % | 80 % | 43 % |
| grille détectée | enregistrements réels | 4 | 70 % | 70 % | 63 % | 63 % | 70 % | — | 19 % | 93 % | 75 % | 75 % |
| grille détectée | réels, façon vieux disque | 4 | 68 % | 68 % | 56 % | 56 % | 68 % | — | 13 % | 86 % | 50 % | 100 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | mis de côté | synthèse, son propre | 7 | 79 % | 68 % | 80 % | 21 % | 28 % | 71 % | 40 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 54 % | 46 % | 54 % | 50 % | 26 % | 43 % | 60 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 70 % | 63 % | 70 % | — | 19 % | 75 % | 79 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 68 % | 56 % | 68 % | — | 13 % | 100 % | 74 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 79 % | 69 % |
| grille détectée | synthèse, vieux disque | 55 % | 46 % |
| grille détectée | enregistrements réels | 76 % | 68 % |
| grille détectée | réels, façon vieux disque | 74 % | 60 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 80 % / 80 % |  | 79 % / 70 % |  |  |  |  |  |
| bossa | 68 % / 61 % |  | 43 % / 35 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 96 % / 85 % |  | 89 % / 69 % |  |
| guitare-jazz |  |  |  |  | 45 % / 41 % |  | 47 % / 43 % |  |
| modal | 88 % / 85 % |  | 27 % / 23 % |  |  |  |  |  |
| swing | 59 % / 40 % |  | 22 % / 15 % |  |  |  |  |  |
| trad | 98 % / 95 % |  | 91 % / 85 % |  |  |  |  |  |
| waltz | 80 % / 55 % |  | 65 % / 47 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 30 % | 25 % | 1 % | 0 % |
| bonne fondamentale, famille fausse | 16 % | 6 % | 0 % | 0 % |
| bonne fondamentale, septième ou sixte fausse | 15 % | 8 % | 20 % | 27 % |
| accord voisin (décalé d’un temps ou plus) | 13 % | 5 % | 4 % | 7 % |
| fondamentale à une tierce (mineure) | 8 % | 9 % | 3 % | 0 % |
| fondamentale à un demi-ton | 5 % | 3 % | 0 % | 0 % |
| fondamentale à un ton | 4 % | 6 % | 0 % | 0 % |
| fondamentale au triton | 4 % | 1 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 3 % | 2 % | 0 % | 0 % |
| aucun accord | 2 % | 33 % | 72 % | 66 % |
| *temps faux / tous les temps* | 32 % | 54 % | 37 % | 44 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (24 %) · 7 → maj (11 %) · m6 → m7 (11 %) · maj7 → maj (9 %) · m7b5 → m7 (7 %) · m → 7 (6 %) · maj7 → 7 (5 %) · m → m7 (5 %) · 7 → m7 (4 %) · m(maj7) → m (4 %) · 6 → maj (3 %) · m(maj7) → m7 (3 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 24 % | 53 % | 25 % | 40 % |
| grille détectée | synthèse, vieux disque | 41 % | 79 % | 37 % | 60 % |
| grille détectée | enregistrements réels | 46 % | 64 % | 14 % | 79 % |
| grille détectée | réels, façon vieux disque | 49 % | 66 % | 23 % | 74 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
