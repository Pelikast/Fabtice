# Banc accords — variante `modele-brut`

11 morceaux, mesuré le 2026-11-15 (1 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 67 % | 57 % | 51 % | 28 % | 67 % | 27 % | 37 % | 98 % | 94 % | 0 % |
| grille détectée | synthèse, vieux disque | 7 | 44 % | 41 % | 30 % | 22 % | 44 % | 55 % | 20 % | 90 % | 80 % | 0 % |
| grille détectée | enregistrements réels | 4 | 73 % | 73 % | 69 % | 68 % | 78 % | — | 29 % | 93 % | 75 % | 0 % |
| grille détectée | réels, façon vieux disque | 4 | 61 % | 61 % | 34 % | 34 % | 63 % | — | 19 % | 86 % | 50 % | 0 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | mis de côté | synthèse, son propre | 7 | 67 % | 51 % | 67 % | 27 % | 37 % | 0 % | 88 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 44 % | 30 % | 44 % | 55 % | 20 % | 0 % | 58 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 73 % | 69 % | 78 % | — | 29 % | 0 % | 78 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 61 % | 34 % | 63 % | — | 19 % | 0 % | 24 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 67 % | 52 % |
| grille détectée | synthèse, vieux disque | 43 % | 26 % |
| grille détectée | enregistrements réels | 79 % | 74 % |
| grille détectée | réels, façon vieux disque | 65 % | 36 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 87 % / 71 % |  | 61 % / 15 % |  |  |  |  |  |
| bossa | 75 % / 33 % |  | 59 % / 45 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 93 % |  | 96 % / 46 % |  |
| guitare-jazz |  |  |  |  | 49 % / 46 % |  | 26 % / 23 % |  |
| modal | 70 % / 68 % |  | 0 % / 0 % |  |  |  |  |  |
| swing | 36 % / 13 % |  | 26 % / 13 % |  |  |  |  |  |
| trad | 99 % / 92 % |  | 94 % / 81 % |  |  |  |  |  |
| waltz | 44 % / 35 % |  | 19 % / 3 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| bonne fondamentale, famille fausse | 19 % | 3 % | 0 % | 0 % |
| fondamentale à un demi-ton | 19 % | 2 % | 0 % | 12 % |
| fondamentale à la quinte / quarte | 17 % | 10 % | 2 % | 1 % |
| bonne fondamentale, septième ou sixte fausse | 12 % | 16 % | 14 % | 40 % |
| fondamentale à une tierce (mineure) | 9 % | 7 % | 51 % | 0 % |
| fondamentale à un ton | 8 % | 5 % | 5 % | 2 % |
| accord voisin (décalé d’un temps ou plus) | 7 % | 5 % | 10 % | 3 % |
| fondamentale à une tierce (majeure) | 5 % | 3 % | 15 % | 0 % |
| fondamentale au triton | 4 % | 0 % | 0 % | 0 % |
| aucun accord | 0 % | 47 % | 3 % | 41 % |
| *temps faux / tous les temps* | 49 % | 70 % | 31 % | 66 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (22 %) · maj7 → 7 (15 %) · maj7 → maj (13 %) · m7 → m (7 %) · m → m7 (7 %) · maj → 7 (6 %) · 7 → maj (5 %) · m7 → maj (4 %) · m6 → m (3 %) · 6 → 7 (3 %) · m → maj (2 %) · 6 → maj (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 64 % | 67 % | 16 % | 88 % |
| grille détectée | synthèse, vieux disque | 52 % | 78 % | 62 % | 58 % |
| grille détectée | enregistrements réels | 29 % | 82 % | 10 % | 78 % |
| grille détectée | réels, façon vieux disque | 30 % | 53 % | 71 % | 24 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
