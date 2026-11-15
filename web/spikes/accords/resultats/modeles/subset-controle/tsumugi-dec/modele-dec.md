# Banc accords — variante `modele-dec`

11 morceaux, mesuré le 2026-11-15 (1 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 92 % | 89 % | 86 % | 56 % | 92 % | 21 % | 5 % | 98 % | 94 % | 0 % |
| grille détectée | synthèse, vieux disque | 7 | 87 % | 81 % | 77 % | 47 % | 84 % | 23 % | 8 % | 90 % | 80 % | 0 % |
| grille détectée | enregistrements réels | 4 | 79 % | 79 % | 76 % | 76 % | 97 % | — | 13 % | 93 % | 75 % | 0 % |
| grille détectée | réels, façon vieux disque | 4 | 90 % | 90 % | 86 % | 74 % | 81 % | — | 17 % | 86 % | 50 % | 0 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | mis de côté | synthèse, son propre | 7 | 92 % | 86 % | 92 % | 21 % | 5 % | 0 % | 0 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 87 % | 77 % | 84 % | 23 % | 8 % | 0 % | 0 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 79 % | 76 % | 97 % | — | 13 % | 0 % | 0 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 90 % | 86 % | 81 % | — | 17 % | 0 % | 0 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 91 % | 86 % |
| grille détectée | synthèse, vieux disque | 87 % | 77 % |
| grille détectée | enregistrements réels | 83 % | 79 % |
| grille détectée | réels, façon vieux disque | 91 % | 87 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 100 % / 100 % |  | 100 % / 97 % |  |  |  |  |  |
| bossa | 98 % / 95 % |  | 88 % / 84 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 99 % / 96 % |  | 99 % / 96 % |  |
| guitare-jazz |  |  |  |  | 59 % / 55 % |  | 80 % / 76 % |  |
| modal | 95 % / 95 % |  | 91 % / 73 % |  |  |  |  |  |
| swing | 85 % / 77 % |  | 78 % / 65 % |  |  |  |  |  |
| trad | 99 % / 99 % |  | 99 % / 99 % |  |  |  |  |  |
| waltz | 79 % / 62 % |  | 71 % / 54 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| accord voisin (décalé d’un temps ou plus) | 20 % | 17 % | 9 % | 19 % |
| fondamentale à la quinte / quarte | 17 % | 15 % | 0 % | 0 % |
| bonne fondamentale, septième ou sixte fausse | 17 % | 15 % | 15 % | 26 % |
| bonne fondamentale, famille fausse | 17 % | 23 % | 0 % | 0 % |
| fondamentale à un demi-ton | 14 % | 9 % | 0 % | 0 % |
| fondamentale au triton | 7 % | 7 % | 0 % | 4 % |
| fondamentale à un ton | 4 % | 5 % | 49 % | 19 % |
| fondamentale à une tierce (mineure) | 2 % | 6 % | 2 % | 4 % |
| fondamentale à une tierce (majeure) | 1 % | 3 % | 23 % | 26 % |
| aucun accord | 0 % | 1 % | 2 % | 4 % |
| *temps faux / tous les temps* | 14 % | 23 % | 24 % | 14 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (40 %) · m → m7 (14 %) · m(maj7) → m7 (8 %) · 6 → maj7 (8 %) · maj7 → 7 (4 %) · m7 → m6 (3 %) · 6 → maj (3 %) · m6 → maj7 (3 %) · dim7 → 7 (3 %) · 7 → maj (3 %) · m6 → m7 (2 %) · m7 → m7b5 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 0 % | — | 14 % | 0 % |
| grille détectée | synthèse, vieux disque | 0 % | — | 23 % | 0 % |
| grille détectée | enregistrements réels | 0 % | — | 24 % | 0 % |
| grille détectée | réels, façon vieux disque | 0 % | — | 14 % | 0 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
