# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (6 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 79 % | 75 % | 71 % | 33 % | 77 % | 39 % | 17 % | 93 % | 86 % | 86 % |
| grille détectée | synthèse, vieux disque | 7 | 65 % | 61 % | 58 % | 27 % | 61 % | 57 % | 19 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 97 % | 95 % | 81 % | 81 % | 95 % | — | 10 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 85 % | 83 % | 60 % | 60 % | 83 % | — | 19 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 79 % | 71 % | 77 % | 39 % | 17 % | 86 % | 40 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 65 % | 58 % | 61 % | 57 % | 19 % | 71 % | 57 % |
| grille détectée | développement | enregistrements réels | 4 | 97 % | 81 % | 95 % | — | 10 % | 100 % | 84 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 85 % | 60 % | 83 % | — | 19 % | 75 % | 66 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 83 % | 74 % |
| grille détectée | synthèse, vieux disque | 69 % | 61 % |
| grille détectée | enregistrements réels | 97 % | 79 % |
| grille détectée | réels, façon vieux disque | 83 % | 57 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 98 % / 84 % |  | 82 % / 62 % |  |  |  |  |  |
| bossa | 97 % / 94 % |  | 90 % / 86 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 84 % |  | 79 % / 56 % |  |
| guitare-jazz |  |  |  |  | 98 % / 77 % |  | 91 % / 64 % |  |
| shuffle | 94 % / 82 % |  | 85 % / 78 % |  |  |  |  |  |
| swing | 66 % / 58 % |  | 46 % / 40 % |  |  |  |  |  |
| trad | 86 % / 74 % |  | 77 % / 71 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 24 % | 22 % | 5 % | 19 % |
| accord voisin (décalé d’un temps ou plus) | 21 % | 18 % | 5 % | 4 % |
| bonne fondamentale, famille fausse | 13 % | 7 % | 11 % | 4 % |
| bonne fondamentale, septième ou sixte fausse | 12 % | 8 % | 76 % | 58 % |
| fondamentale à un demi-ton | 8 % | 4 % | 0 % | 0 % |
| fondamentale à une tierce (mineure) | 7 % | 12 % | 0 % | 0 % |
| fondamentale à un ton | 7 % | 11 % | 3 % | 3 % |
| fondamentale au triton | 5 % | 4 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 4 % | 3 % | 0 % | 12 % |
| aucun accord | 0 % | 12 % | 0 % | 0 % |
| *temps faux / tous les temps* | 29 % | 42 % | 19 % | 40 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (23 %) · 7 → maj (22 %) · maj7 → maj (11 %) · dim7 → dim (10 %) · 7 → m7 (8 %) · maj → 7 (6 %) · 6 → maj (5 %) · m6 → m7 (4 %) · m7b5 → 7 (2 %) · m7b5 → m7 (2 %) · dim7 → m7b5 (1 %) · 7sus4 → 7 (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 23 % | 52 % | 22 % | 40 % |
| grille détectée | synthèse, vieux disque | 40 % | 60 % | 30 % | 57 % |
| grille détectée | enregistrements réels | 24 % | 67 % | 4 % | 84 % |
| grille détectée | réels, façon vieux disque | 27 % | 100 % | 18 % | 66 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
