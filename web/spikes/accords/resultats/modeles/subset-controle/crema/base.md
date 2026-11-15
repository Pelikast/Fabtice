# Banc accords — variante `base`

11 morceaux, mesuré le 2026-11-15 (2 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 69 % | 61 % | 54 % | 31 % | 71 % | 70 % | 13 % | 98 % | 94 % | 57 % |
| grille détectée | synthèse, vieux disque | 7 | 59 % | 54 % | 43 % | 27 % | 59 % | 71 % | 13 % | 90 % | 80 % | 43 % |
| grille détectée | enregistrements réels | 4 | 85 % | 85 % | 80 % | 69 % | 76 % | — | 13 % | 93 % | 75 % | 75 % |
| grille détectée | réels, façon vieux disque | 4 | 90 % | 90 % | 87 % | 69 % | 72 % | — | 15 % | 86 % | 50 % | 100 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | mis de côté | synthèse, son propre | 7 | 69 % | 54 % | 71 % | 70 % | 13 % | 57 % | 44 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 59 % | 43 % | 59 % | 71 % | 13 % | 43 % | 44 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 85 % | 80 % | 76 % | — | 13 % | 75 % | 45 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 90 % | 87 % | 72 % | — | 15 % | 100 % | 0 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 72 % | 56 % |
| grille détectée | synthèse, vieux disque | 61 % | 45 % |
| grille détectée | enregistrements réels | 88 % | 83 % |
| grille détectée | réels, façon vieux disque | 91 % | 88 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 94 % / 89 % |  | 91 % / 82 % |  |  |  |  |  |
| bossa | 80 % / 63 % |  | 52 % / 36 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 92 % |  | 98 % / 95 % |  |
| guitare-jazz |  |  |  |  | 73 % / 69 % |  | 82 % / 79 % |  |
| modal | 65 % / 34 % |  | 50 % / 26 % |  |  |  |  |  |
| swing | 34 % / 29 % |  | 32 % / 19 % |  |  |  |  |  |
| trad | 94 % / 82 % |  | 89 % / 73 % |  |  |  |  |  |
| waltz | 61 % / 40 % |  | 53 % / 35 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 26 % | 25 % | 16 % | 24 % |
| bonne fondamentale, famille fausse | 16 % | 8 % | 0 % | 0 % |
| bonne fondamentale, septième ou sixte fausse | 15 % | 19 % | 26 % | 24 % |
| accord voisin (décalé d’un temps ou plus) | 15 % | 10 % | 13 % | 36 % |
| fondamentale à un ton | 7 % | 8 % | 0 % | 12 % |
| fondamentale à un demi-ton | 7 % | 6 % | 3 % | 0 % |
| fondamentale à une tierce (mineure) | 6 % | 13 % | 21 % | 0 % |
| fondamentale à une tierce (majeure) | 4 % | 5 % | 8 % | 0 % |
| fondamentale au triton | 3 % | 1 % | 11 % | 0 % |
| aucun accord | 0 % | 4 % | 3 % | 4 % |
| *temps faux / tous les temps* | 46 % | 57 % | 20 % | 13 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (28 %) · 7 → maj (24 %) · m7 → m (9 %) · dim7 → dim (4 %) · m6 → m7 (3 %) · maj7 → 7 (3 %) · m → m7 (3 %) · maj7 → maj (3 %) · m(maj7) → m7 (3 %) · m6 → 7 (2 %) · 7 → m (2 %) · m6 → m (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 29 % | 71 % | 36 % | 44 % |
| grille détectée | synthèse, vieux disque | 33 % | 75 % | 48 % | 44 % |
| grille détectée | enregistrements réels | 17 % | 53 % | 13 % | 45 % |
| grille détectée | réels, façon vieux disque | 0 % | — | 13 % | 0 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
