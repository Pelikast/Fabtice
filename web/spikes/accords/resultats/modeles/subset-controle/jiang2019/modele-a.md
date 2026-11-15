# Banc accords — variante `modele-a`

11 morceaux, mesuré le 2026-11-15 (7 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 82 % | 66 % | 59 % | 30 % | 83 % | 36 % | 15 % | 98 % | 94 % | 43 % |
| grille détectée | synthèse, vieux disque | 7 | 42 % | 40 % | 29 % | 22 % | 42 % | 66 % | 9 % | 90 % | 80 % | 71 % |
| grille détectée | enregistrements réels | 4 | 74 % | 74 % | 71 % | 69 % | 78 % | — | 17 % | 93 % | 75 % | 75 % |
| grille détectée | réels, façon vieux disque | 4 | 69 % | 69 % | 41 % | 36 % | 69 % | — | 15 % | 86 % | 50 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | mis de côté | synthèse, son propre | 7 | 82 % | 59 % | 83 % | 36 % | 15 % | 43 % | 74 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 42 % | 29 % | 42 % | 66 % | 9 % | 71 % | 72 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 74 % | 71 % | 78 % | — | 17 % | 75 % | 73 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 69 % | 41 % | 69 % | — | 15 % | 75 % | 9 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 84 % | 61 % |
| grille détectée | synthèse, vieux disque | 41 % | 25 % |
| grille détectée | enregistrements réels | 80 % | 76 % |
| grille détectée | réels, façon vieux disque | 74 % | 43 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 91 % / 78 % |  | 63 % / 20 % |  |  |  |  |  |
| bossa | 90 % / 30 % |  | 59 % / 42 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 95 % |  | 98 % / 46 % |  |
| guitare-jazz |  |  |  |  | 51 % / 47 % |  | 40 % / 36 % |  |
| modal | 99 % / 98 % |  | 0 % / 0 % |  |  |  |  |  |
| swing | 48 % / 17 % |  | 26 % / 12 % |  |  |  |  |  |
| trad | 97 % / 94 % |  | 93 % / 79 % |  |  |  |  |  |
| waltz | 77 % / 48 % |  | 12 % / 3 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| bonne fondamentale, famille fausse | 39 % | 3 % | 0 % | 0 % |
| bonne fondamentale, septième ou sixte fausse | 16 % | 15 % | 13 % | 47 % |
| fondamentale à la quinte / quarte | 13 % | 10 % | 0 % | 0 % |
| fondamentale à un demi-ton | 10 % | 3 % | 0 % | 0 % |
| accord voisin (décalé d’un temps ou plus) | 6 % | 4 % | 11 % | 4 % |
| fondamentale à une tierce (mineure) | 5 % | 6 % | 54 % | 0 % |
| fondamentale à un ton | 4 % | 4 % | 2 % | 1 % |
| fondamentale au triton | 3 % | 0 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 3 % | 4 % | 18 % | 0 % |
| aucun accord | 0 % | 53 % | 4 % | 48 % |
| *temps faux / tous les temps* | 41 % | 71 % | 29 % | 59 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (25 %) · maj7 → 7 (16 %) · maj7 → maj (10 %) · 7 → maj (5 %) · m7 → maj (4 %) · maj → 7 (4 %) · m6 → 7 (4 %) · m → m7 (4 %) · m → 7 (4 %) · m7 → m (3 %) · m7b5 → 7 (3 %) · 6 → 7 (3 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 39 % | 76 % | 18 % | 74 % |
| grille détectée | synthèse, vieux disque | 57 % | 90 % | 47 % | 72 % |
| grille détectée | enregistrements réels | 34 % | 63 % | 12 % | 73 % |
| grille détectée | réels, façon vieux disque | 17 % | 30 % | 65 % | 9 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
