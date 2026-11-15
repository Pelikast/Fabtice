# Banc accords — variante `app`

11 morceaux, mesuré le 2026-11-15 (6 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 80 % | 73 % | 67 % | 36 % | 79 % | 43 % | 18 % | 98 % | 94 % | 86 % |
| grille détectée | synthèse, vieux disque | 7 | 65 % | 63 % | 52 % | 30 % | 64 % | 56 % | 14 % | 90 % | 80 % | 71 % |
| grille détectée | enregistrements réels | 4 | 84 % | 84 % | 79 % | 68 % | 75 % | — | 17 % | 93 % | 75 % | 75 % |
| grille détectée | réels, façon vieux disque | 4 | 92 % | 92 % | 89 % | 69 % | 73 % | — | 17 % | 86 % | 50 % | 100 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | mis de côté | synthèse, son propre | 7 | 80 % | 67 % | 79 % | 43 % | 18 % | 86 % | 42 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 65 % | 52 % | 64 % | 56 % | 14 % | 71 % | 48 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 84 % | 79 % | 75 % | — | 17 % | 75 % | 63 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 92 % | 89 % | 73 % | — | 17 % | 100 % | 14 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 81 % | 69 % |
| grille détectée | synthèse, vieux disque | 67 % | 53 % |
| grille détectée | enregistrements réels | 87 % | 81 % |
| grille détectée | réels, façon vieux disque | 93 % | 89 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 91 % / 90 % |  | 91 % / 81 % |  |  |  |  |  |
| bossa | 86 % / 73 % |  | 54 % / 40 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 92 % |  | 98 % / 95 % |  |
| guitare-jazz |  |  |  |  | 70 % / 66 % |  | 86 % / 82 % |  |
| modal | 93 % / 74 % |  | 66 % / 52 % |  |  |  |  |  |
| swing | 49 % / 36 % |  | 35 % / 23 % |  |  |  |  |  |
| trad | 96 % / 91 % |  | 96 % / 84 % |  |  |  |  |  |
| waltz | 73 % / 50 % |  | 58 % / 40 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 20 % | 22 % | 15 % | 18 % |
| bonne fondamentale, famille fausse | 20 % | 5 % | 0 % | 0 % |
| accord voisin (décalé d’un temps ou plus) | 19 % | 11 % | 12 % | 32 % |
| bonne fondamentale, septième ou sixte fausse | 16 % | 21 % | 24 % | 32 % |
| fondamentale à un ton | 6 % | 7 % | 0 % | 0 % |
| fondamentale à une tierce (mineure) | 6 % | 14 % | 24 % | 0 % |
| fondamentale à un demi-ton | 4 % | 5 % | 2 % | 0 % |
| fondamentale à une tierce (majeure) | 4 % | 5 % | 7 % | 0 % |
| fondamentale au triton | 4 % | 1 % | 10 % | 0 % |
| aucun accord | 0 % | 10 % | 5 % | 18 % |
| *temps faux / tous les temps* | 33 % | 48 % | 21 % | 11 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (23 %) · 7 → maj (18 %) · m7 → m (12 %) · m6 → m7 (6 %) · dim7 → dim (5 %) · maj7 → 7 (4 %) · m(maj7) → m7 (3 %) · m → m7 (3 %) · m6 → 7 (3 %) · maj7 → maj (3 %) · m6 → m (3 %) · 6 → maj7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 25 % | 55 % | 26 % | 42 % |
| grille détectée | synthèse, vieux disque | 34 % | 69 % | 38 % | 48 % |
| grille détectée | enregistrements réels | 18 % | 76 % | 9 % | 63 % |
| grille détectée | réels, façon vieux disque | 6 % | 27 % | 10 % | 14 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
