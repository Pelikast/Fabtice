# Banc accords — variante `modele-a`

11 morceaux, mesuré le 2026-11-15 (5 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 80 % | 75 % | 69 % | 38 % | 79 % | 21 % | 29 % | 98 % | 94 % | 71 % |
| grille détectée | synthèse, vieux disque | 7 | 61 % | 55 % | 48 % | 34 % | 61 % | 28 % | 31 % | 90 % | 80 % | 71 % |
| grille détectée | enregistrements réels | 4 | 78 % | 78 % | 57 % | 53 % | 73 % | — | 25 % | 93 % | 75 % | 75 % |
| grille détectée | réels, façon vieux disque | 4 | 93 % | 93 % | 51 % | 43 % | 73 % | — | 21 % | 86 % | 50 % | 100 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | mis de côté | synthèse, son propre | 7 | 80 % | 69 % | 79 % | 21 % | 29 % | 71 % | 38 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 61 % | 48 % | 61 % | 28 % | 31 % | 71 % | 39 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 78 % | 57 % | 73 % | — | 25 % | 75 % | 35 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 93 % | 51 % | 73 % | — | 21 % | 100 % | 38 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 79 % | 68 % |
| grille détectée | synthèse, vieux disque | 60 % | 47 % |
| grille détectée | enregistrements réels | 82 % | 59 % |
| grille détectée | réels, façon vieux disque | 93 % | 52 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 79 % / 76 % |  | 78 % / 66 % |  |  |  |  |  |
| bossa | 74 % / 69 % |  | 45 % / 38 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 61 % |  | 98 % / 45 % |  |
| guitare-jazz |  |  |  |  | 59 % / 52 % |  | 89 % / 57 % |  |
| modal | 83 % / 73 % |  | 26 % / 7 % |  |  |  |  |  |
| swing | 63 % / 48 % |  | 42 % / 25 % |  |  |  |  |  |
| trad | 97 % / 95 % |  | 97 % / 95 % |  |  |  |  |  |
| waltz | 78 % / 51 % |  | 72 % / 50 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 27 % | 30 % | 1 % | 1 % |
| bonne fondamentale, septième ou sixte fausse | 20 % | 13 % | 49 % | 86 % |
| accord voisin (décalé d’un temps ou plus) | 17 % | 8 % | 8 % | 6 % |
| bonne fondamentale, famille fausse | 13 % | 11 % | 0 % | 0 % |
| fondamentale à une tierce (mineure) | 6 % | 13 % | 20 % | 0 % |
| fondamentale à un ton | 5 % | 8 % | 1 % | 1 % |
| fondamentale à une tierce (majeure) | 4 % | 4 % | 4 % | 3 % |
| fondamentale à un demi-ton | 4 % | 4 % | 1 % | 0 % |
| aucun accord | 3 % | 8 % | 14 % | 2 % |
| fondamentale au triton | 2 % | 2 % | 0 % | 0 % |
| *temps faux / tous les temps* | 31 % | 52 % | 43 % | 49 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

maj7 → maj (18 %) · 7 → maj (16 %) · m7 → m (14 %) · m7 → 7 (13 %) · m7b5 → m7 (7 %) · 7 → m7 (4 %) · m6 → m (3 %) · maj → 7 (3 %) · m6 → m7 (3 %) · m(maj7) → m (3 %) · m7 → maj (2 %) · 6 → maj (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 30 % | 40 % | 28 % | 38 % |
| grille détectée | synthèse, vieux disque | 27 % | 74 % | 43 % | 39 % |
| grille détectée | enregistrements réels | 15 % | 100 % | 33 % | 35 % |
| grille détectée | réels, façon vieux disque | 29 % | 65 % | 42 % | 38 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
