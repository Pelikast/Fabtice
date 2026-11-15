# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (6 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 91 % | 88 % | 84 % | 40 % | 88 % | 24 % | 9 % | 98 % | 94 % | 86 % |
| grille détectée | synthèse, vieux disque | 7 | 79 % | 74 % | 70 % | 38 % | 76 % | 33 % | 9 % | 90 % | 80 % | 71 % |
| grille détectée | enregistrements réels | 4 | 91 % | 91 % | 88 % | 70 % | 77 % | — | 19 % | 93 % | 75 % | 75 % |
| grille détectée | réels, façon vieux disque | 4 | 94 % | 94 % | 91 % | 69 % | 72 % | — | 19 % | 86 % | 50 % | 100 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | mis de côté | synthèse, son propre | 7 | 91 % | 84 % | 88 % | 24 % | 9 % | 86 % | 26 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 79 % | 70 % | 76 % | 33 % | 9 % | 71 % | 41 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 91 % | 88 % | 77 % | — | 19 % | 75 % | 8 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 94 % | 91 % | 72 % | — | 19 % | 100 % | 0 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 91 % | 85 % |
| grille détectée | synthèse, vieux disque | 80 % | 71 % |
| grille détectée | enregistrements réels | 93 % | 89 % |
| grille détectée | réels, façon vieux disque | 94 % | 90 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 100 % / 100 % |  | 100 % / 97 % |  |  |  |  |  |
| bossa | 96 % / 91 % |  | 77 % / 73 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 95 % |  | 98 % / 95 % |  |
| guitare-jazz |  |  |  |  | 84 % / 80 % |  | 91 % / 86 % |  |
| modal | 98 % / 98 % |  | 85 % / 66 % |  |  |  |  |  |
| swing | 79 % / 68 % |  | 63 % / 48 % |  |  |  |  |  |
| trad | 98 % / 98 % |  | 98 % / 98 % |  |  |  |  |  |
| waltz | 80 % / 60 % |  | 64 % / 51 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| accord voisin (décalé d’un temps ou plus) | 30 % | 17 % | 21 % | 44 % |
| bonne fondamentale, septième ou sixte fausse | 19 % | 12 % | 29 % | 39 % |
| bonne fondamentale, famille fausse | 15 % | 16 % | 0 % | 0 % |
| fondamentale à la quinte / quarte | 13 % | 20 % | 0 % | 11 % |
| fondamentale au triton | 9 % | 5 % | 13 % | 0 % |
| fondamentale à un demi-ton | 6 % | 5 % | 4 % | 0 % |
| fondamentale à une tierce (mineure) | 3 % | 12 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 3 % | 3 % | 17 % | 0 % |
| fondamentale à un ton | 2 % | 5 % | 8 % | 0 % |
| aucun accord | 0 % | 5 % | 8 % | 6 % |
| *temps faux / tous les temps* | 16 % | 30 % | 13 % | 9 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (38 %) · maj7 → 7 (10 %) · m6 → m7 (8 %) · m → m7 (7 %) · m(maj7) → m7 (7 %) · 6 → maj7 (6 %) · m(maj7) → m (3 %) · 6 → maj (3 %) · m → 7 (3 %) · 7 → maj (3 %) · m7b5 → m7 (2 %) · m6 → maj7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 10 % | 39 % | 13 % | 26 % |
| grille détectée | synthèse, vieux disque | 23 % | 53 % | 23 % | 41 % |
| grille détectée | enregistrements réels | 1 % | 100 % | 12 % | 8 % |
| grille détectée | réels, façon vieux disque | 0 % | — | 9 % | 0 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
