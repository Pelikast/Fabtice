# Banc accords — variante `modele-a`

11 morceaux, mesuré le 2026-11-15 (6 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 93 % | 90 % | 87 % | 64 % | 93 % | 13 % | 10 % | 98 % | 94 % | 71 % |
| grille détectée | synthèse, vieux disque | 7 | 88 % | 79 % | 76 % | 50 % | 87 % | 12 % | 13 % | 90 % | 80 % | 71 % |
| grille détectée | enregistrements réels | 4 | 79 % | 79 % | 75 % | 73 % | 91 % | — | 25 % | 93 % | 75 % | 50 % |
| grille détectée | réels, façon vieux disque | 4 | 88 % | 88 % | 84 % | 71 % | 82 % | — | 23 % | 86 % | 50 % | 50 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | mis de côté | synthèse, son propre | 7 | 93 % | 87 % | 93 % | 13 % | 10 % | 71 % | 23 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 88 % | 76 % | 87 % | 12 % | 13 % | 71 % | 56 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 79 % | 75 % | 91 % | — | 25 % | 50 % | 46 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 88 % | 84 % | 82 % | — | 23 % | 50 % | 23 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 93 % | 87 % |
| grille détectée | synthèse, vieux disque | 88 % | 75 % |
| grille détectée | enregistrements réels | 83 % | 79 % |
| grille détectée | réels, façon vieux disque | 89 % | 85 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 100 % / 100 % |  | 100 % / 97 % |  |  |  |  |  |
| bossa | 97 % / 95 % |  | 89 % / 85 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 95 % |  | 98 % / 95 % |  |
| guitare-jazz |  |  |  |  | 60 % / 55 % |  | 77 % / 73 % |  |
| modal | 98 % / 98 % |  | 91 % / 57 % |  |  |  |  |  |
| swing | 86 % / 77 % |  | 83 % / 69 % |  |  |  |  |  |
| trad | 99 % / 99 % |  | 97 % / 97 % |  |  |  |  |  |
| waltz | 85 % / 65 % |  | 73 % / 56 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| accord voisin (décalé d’un temps ou plus) | 27 % | 16 % | 13 % | 19 % |
| bonne fondamentale, famille fausse | 21 % | 35 % | 2 % | 0 % |
| fondamentale à la quinte / quarte | 17 % | 11 % | 8 % | 0 % |
| bonne fondamentale, septième ou sixte fausse | 17 % | 11 % | 15 % | 23 % |
| fondamentale au triton | 10 % | 7 % | 0 % | 3 % |
| fondamentale à un demi-ton | 5 % | 4 % | 0 % | 0 % |
| fondamentale à une tierce (mineure) | 1 % | 5 % | 2 % | 3 % |
| fondamentale à un ton | 1 % | 2 % | 44 % | 10 % |
| fondamentale à une tierce (majeure) | 0 % | 3 % | 13 % | 35 % |
| aucun accord | 0 % | 6 % | 4 % | 6 % |
| *temps faux / tous les temps* | 13 % | 24 % | 25 % | 16 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (51 %) · m → m7 (9 %) · m(maj7) → m7 (6 %) · m6 → maj7 (5 %) · maj7 → 7 (4 %) · 6 → maj7 (4 %) · m7 → m6 (3 %) · 6 → maj (3 %) · dim7 → 7 (2 %) · 7 → m7 (2 %) · m → 7 (2 %) · 7 → maj (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 6 % | 45 % | 10 % | 23 % |
| grille détectée | synthèse, vieux disque | 24 % | 58 % | 14 % | 56 % |
| grille détectée | enregistrements réels | 13 % | 88 % | 16 % | 46 % |
| grille détectée | réels, façon vieux disque | 4 % | 100 % | 13 % | 23 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
