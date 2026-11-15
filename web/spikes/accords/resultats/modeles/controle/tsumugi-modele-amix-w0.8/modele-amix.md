# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (6 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 95 % | 93 % | 90 % | 43 % | 91 % | 16 % | 5 % | 98 % | 94 % | 86 % |
| grille détectée | synthèse, vieux disque | 7 | 89 % | 85 % | 81 % | 40 % | 83 % | 20 % | 10 % | 90 % | 80 % | 71 % |
| grille détectée | enregistrements réels | 4 | 83 % | 83 % | 79 % | 70 % | 86 % | — | 19 % | 93 % | 75 % | 75 % |
| grille détectée | réels, façon vieux disque | 4 | 90 % | 90 % | 86 % | 69 % | 74 % | — | 23 % | 86 % | 50 % | 100 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | mis de côté | synthèse, son propre | 7 | 95 % | 90 % | 91 % | 16 % | 5 % | 86 % | 33 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 89 % | 81 % | 83 % | 20 % | 10 % | 71 % | 34 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 83 % | 79 % | 86 % | — | 19 % | 75 % | 43 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 90 % | 86 % | 74 % | — | 23 % | 100 % | 15 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 95 % | 90 % |
| grille détectée | synthèse, vieux disque | 89 % | 82 % |
| grille détectée | enregistrements réels | 86 % | 83 % |
| grille détectée | réels, façon vieux disque | 91 % | 87 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 100 % / 100 % |  | 100 % / 100 % |  |  |  |  |  |
| bossa | 100 % / 98 % |  | 89 % / 84 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 95 % |  | 98 % / 95 % |  |
| guitare-jazz |  |  |  |  | 68 % / 64 % |  | 82 % / 77 % |  |
| modal | 99 % / 99 % |  | 97 % / 88 % |  |  |  |  |  |
| swing | 86 % / 79 % |  | 79 % / 65 % |  |  |  |  |  |
| trad | 99 % / 99 % |  | 98 % / 98 % |  |  |  |  |  |
| waltz | 89 % / 71 % |  | 79 % / 63 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| accord voisin (décalé d’un temps ou plus) | 27 % | 24 % | 10 % | 30 % |
| bonne fondamentale, septième ou sixte fausse | 22 % | 17 % | 18 % | 26 % |
| bonne fondamentale, famille fausse | 19 % | 21 % | 0 % | 4 % |
| fondamentale au triton | 12 % | 6 % | 0 % | 0 % |
| fondamentale à la quinte / quarte | 11 % | 13 % | 3 % | 11 % |
| fondamentale à une tierce (mineure) | 4 % | 8 % | 3 % | 0 % |
| fondamentale à un demi-ton | 3 % | 4 % | 3 % | 0 % |
| fondamentale à un ton | 2 % | 3 % | 35 % | 0 % |
| fondamentale à une tierce (majeure) | 0 % | 3 % | 25 % | 26 % |
| aucun accord | 0 % | 2 % | 5 % | 4 % |
| *temps faux / tous les temps* | 10 % | 19 % | 21 % | 14 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (34 %) · m → m7 (13 %) · m(maj7) → m7 (10 %) · maj7 → 7 (9 %) · 6 → maj7 (5 %) · m6 → m7 (4 %) · 6 → maj (4 %) · m6 → maj7 (3 %) · m7b5 → m7 (3 %) · dim7 → 7 (3 %) · 7 → maj (3 %) · 7 → m7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 5 % | 64 % | 7 % | 33 % |
| grille détectée | synthèse, vieux disque | 13 % | 49 % | 14 % | 34 % |
| grille détectée | enregistrements réels | 18 % | 49 % | 15 % | 43 % |
| grille détectée | réels, façon vieux disque | 2 % | 100 % | 12 % | 15 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
