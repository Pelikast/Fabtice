# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (7 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 88 % | 86 % | 84 % | 39 % | 84 % | 18 % | 10 % | 93 % | 86 % | 100 % |
| grille détectée | synthèse, vieux disque | 7 | 76 % | 73 % | 70 % | 34 % | 71 % | 41 % | 18 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 96 % | 96 % | 84 % | 84 % | 98 % | — | 8 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 95 % | 95 % | 84 % | 79 % | 93 % | — | 10 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 88 % | 84 % | 84 % | 18 % | 10 % | 100 % | 33 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 76 % | 70 % | 71 % | 41 % | 18 % | 71 % | 39 % |
| grille détectée | développement | enregistrements réels | 4 | 96 % | 84 % | 98 % | — | 8 % | 100 % | 61 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 95 % | 84 % | 93 % | — | 10 % | 75 % | 63 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 89 % | 86 % |
| grille détectée | synthèse, vieux disque | 79 % | 74 % |
| grille détectée | enregistrements réels | 95 % | 82 % |
| grille détectée | réels, façon vieux disque | 93 % | 82 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 100 % / 97 % |  | 98 % / 84 % |  |  |  |  |  |
| bossa | 98 % / 96 % |  | 95 % / 93 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 90 % |  | 92 % / 83 % |  |
| guitare-jazz |  |  |  |  | 94 % / 78 % |  | 98 % / 85 % |  |
| shuffle | 96 % / 94 % |  | 87 % / 84 % |  |  |  |  |  |
| swing | 81 % / 76 % |  | 63 % / 57 % |  |  |  |  |  |
| trad | 89 % / 83 % |  | 80 % / 76 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| accord voisin (décalé d’un temps ou plus) | 21 % | 22 % | 10 % | 13 % |
| fondamentale à la quinte / quarte | 18 % | 18 % | 16 % | 3 % |
| fondamentale à une tierce (mineure) | 12 % | 18 % | 0 % | 0 % |
| bonne fondamentale, septième ou sixte fausse | 12 % | 7 % | 74 % | 67 % |
| bonne fondamentale, famille fausse | 11 % | 9 % | 0 % | 0 % |
| fondamentale au triton | 9 % | 5 % | 0 % | 0 % |
| fondamentale à un demi-ton | 7 % | 5 % | 0 % | 0 % |
| fondamentale à un ton | 6 % | 8 % | 0 % | 3 % |
| fondamentale à une tierce (majeure) | 4 % | 4 % | 0 % | 13 % |
| aucun accord | 1 % | 4 % | 0 % | 0 % |
| *temps faux / tous les temps* | 16 % | 30 % | 16 % | 16 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (25 %) · dim7 → dim (14 %) · 7 → maj (13 %) · 7 → m7 (13 %) · 6 → maj (8 %) · maj7 → maj (6 %) · m6 → m7 (6 %) · maj → 7 (4 %) · 6 → maj7 (2 %) · dim7 → m7b5 (2 %) · 7 → 6 (2 %) · 7 → dim7 (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 10 % | 57 % | 12 % | 33 % |
| grille détectée | synthèse, vieux disque | 21 % | 54 % | 23 % | 39 % |
| grille détectée | enregistrements réels | 16 % | 61 % | 7 % | 61 % |
| grille détectée | réels, façon vieux disque | 16 % | 63 % | 7 % | 63 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
