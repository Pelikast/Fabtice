# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (5 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 79 % | 76 % | 72 % | 34 % | 77 % | 29 % | 21 % | 93 % | 86 % | 86 % |
| grille détectée | synthèse, vieux disque | 7 | 67 % | 63 % | 58 % | 27 % | 63 % | 47 % | 20 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 95 % | 93 % | 82 % | 82 % | 93 % | — | 13 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 94 % | 93 % | 82 % | 78 % | 93 % | — | 13 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 79 % | 72 % | 77 % | 29 % | 21 % | 86 % | 47 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 67 % | 58 % | 63 % | 47 % | 20 % | 71 % | 64 % |
| grille détectée | développement | enregistrements réels | 4 | 95 % | 82 % | 93 % | — | 13 % | 100 % | 56 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 94 % | 82 % | 93 % | — | 13 % | 75 % | 50 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 82 % | 74 % |
| grille détectée | synthèse, vieux disque | 70 % | 60 % |
| grille détectée | enregistrements réels | 95 % | 82 % |
| grille détectée | réels, façon vieux disque | 93 % | 80 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 97 % / 78 % |  | 84 % / 63 % |  |  |  |  |  |
| bossa | 98 % / 95 % |  | 93 % / 90 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 96 % / 83 % |  | 92 % / 79 % |  |
| guitare-jazz |  |  |  |  | 94 % / 81 % |  | 97 % / 85 % |  |
| shuffle | 90 % / 86 % |  | 78 % / 74 % |  |  |  |  |  |
| swing | 66 % / 59 % |  | 51 % / 43 % |  |  |  |  |  |
| trad | 87 % / 78 % |  | 75 % / 60 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 25 % | 22 % | 3 % | 0 % |
| accord voisin (décalé d’un temps ou plus) | 18 % | 17 % | 6 % | 15 % |
| bonne fondamentale, septième ou sixte fausse | 14 % | 11 % | 59 % | 59 % |
| fondamentale à une tierce (mineure) | 9 % | 14 % | 0 % | 0 % |
| fondamentale à un ton | 9 % | 12 % | 3 % | 6 % |
| bonne fondamentale, famille fausse | 8 % | 8 % | 12 % | 9 % |
| fondamentale à un demi-ton | 8 % | 5 % | 0 % | 0 % |
| fondamentale au triton | 5 % | 4 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 3 % | 3 % | 0 % | 12 % |
| aucun accord | 0 % | 4 % | 18 % | 0 % |
| *temps faux / tous les temps* | 28 % | 42 % | 18 % | 18 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (19 %) · 7 → maj (17 %) · dim7 → dim (10 %) · maj7 → maj (8 %) · 7 → m7 (7 %) · m7 → m (6 %) · maj → maj7 (6 %) · maj → 7 (5 %) · 6 → maj (4 %) · m6 → m7 (4 %) · 6 → maj7 (3 %) · m7b5 → m7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 24 % | 55 % | 20 % | 47 % |
| grille détectée | synthèse, vieux disque | 46 % | 58 % | 28 % | 64 % |
| grille détectée | enregistrements réels | 23 % | 42 % | 10 % | 56 % |
| grille détectée | réels, façon vieux disque | 21 % | 43 % | 11 % | 50 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
