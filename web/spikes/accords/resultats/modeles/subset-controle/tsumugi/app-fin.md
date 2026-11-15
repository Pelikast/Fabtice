# Banc accords — variante `app-fin`

11 morceaux, mesuré le 2026-11-15 (5 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 94 % | 92 % | 89 % | 64 % | 94 % | 18 % | 4 % | 98 % | 94 % | 71 % |
| grille détectée | synthèse, vieux disque | 7 | 90 % | 86 % | 83 % | 51 % | 90 % | 20 % | 9 % | 90 % | 80 % | 71 % |
| grille détectée | enregistrements réels | 4 | 79 % | 79 % | 75 % | 73 % | 93 % | — | 23 % | 93 % | 75 % | 50 % |
| grille détectée | réels, façon vieux disque | 4 | 89 % | 89 % | 85 % | 73 % | 82 % | — | 19 % | 86 % | 50 % | 50 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | mis de côté | synthèse, son propre | 7 | 94 % | 89 % | 94 % | 18 % | 4 % | 71 % | 26 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 90 % | 83 % | 90 % | 20 % | 9 % | 71 % | 40 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 79 % | 75 % | 93 % | — | 23 % | 50 % | 23 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 89 % | 85 % | 82 % | — | 19 % | 50 % | 14 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 94 % | 89 % |
| grille détectée | synthèse, vieux disque | 90 % | 83 % |
| grille détectée | enregistrements réels | 83 % | 79 % |
| grille détectée | réels, façon vieux disque | 90 % | 86 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 100 % / 100 % |  | 100 % / 97 % |  |  |  |  |  |
| bossa | 100 % / 98 % |  | 89 % / 84 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 95 % |  | 99 % / 96 % |  |
| guitare-jazz |  |  |  |  | 59 % / 55 % |  | 79 % / 74 % |  |
| modal | 99 % / 99 % |  | 97 % / 88 % |  |  |  |  |  |
| swing | 84 % / 79 % |  | 82 % / 70 % |  |  |  |  |  |
| trad | 99 % / 99 % |  | 98 % / 98 % |  |  |  |  |  |
| waltz | 89 % / 67 % |  | 81 % / 68 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| accord voisin (décalé d’un temps ou plus) | 22 % | 19 % | 13 % | 21 % |
| bonne fondamentale, famille fausse | 22 % | 24 % | 0 % | 3 % |
| bonne fondamentale, septième ou sixte fausse | 20 % | 15 % | 15 % | 24 % |
| fondamentale à la quinte / quarte | 14 % | 14 % | 2 % | 10 % |
| fondamentale au triton | 9 % | 8 % | 0 % | 3 % |
| fondamentale à un demi-ton | 6 % | 6 % | 0 % | 0 % |
| fondamentale à une tierce (mineure) | 5 % | 6 % | 4 % | 0 % |
| fondamentale à un ton | 2 % | 2 % | 44 % | 0 % |
| fondamentale à une tierce (majeure) | 0 % | 3 % | 19 % | 34 % |
| aucun accord | 0 % | 2 % | 4 % | 3 % |
| *temps faux / tous les temps* | 11 % | 17 % | 25 % | 15 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (36 %) · m → m7 (15 %) · m(maj7) → m7 (9 %) · m6 → maj7 (7 %) · 6 → maj7 (7 %) · 6 → maj (4 %) · m7 → m6 (3 %) · m7 → maj7 (3 %) · m7b5 → m7 (3 %) · maj7 → 7 (3 %) · 7 → maj (3 %) · 7 → m7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 5 % | 63 % | 9 % | 26 % |
| grille détectée | synthèse, vieux disque | 13 % | 53 % | 12 % | 40 % |
| grille détectée | enregistrements réels | 12 % | 48 % | 22 % | 23 % |
| grille détectée | réels, façon vieux disque | 2 % | 100 % | 13 % | 14 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
