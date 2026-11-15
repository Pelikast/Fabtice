# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (5 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 89 % | 87 % | 86 % | 40 % | 84 % | 8 % | 14 % | 93 % | 86 % | 100 % |
| grille détectée | synthèse, vieux disque | 7 | 79 % | 76 % | 74 % | 34 % | 73 % | 33 % | 20 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 96 % | 96 % | 85 % | 85 % | 98 % | — | 10 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 92 % | 92 % | 86 % | 83 % | 94 % | — | 13 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 89 % | 86 % | 84 % | 8 % | 14 % | 100 % | 16 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 79 % | 74 % | 73 % | 33 % | 20 % | 71 % | 37 % |
| grille détectée | développement | enregistrements réels | 4 | 96 % | 85 % | 98 % | — | 10 % | 100 % | 31 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 92 % | 86 % | 94 % | — | 13 % | 75 % | 56 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 89 % | 87 % |
| grille détectée | synthèse, vieux disque | 82 % | 78 % |
| grille détectée | enregistrements réels | 95 % | 83 % |
| grille détectée | réels, façon vieux disque | 91 % | 83 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 100 % / 100 % |  | 98 % / 92 % |  |  |  |  |  |
| bossa | 98 % / 97 % |  | 96 % / 94 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 93 % |  | 92 % / 92 % |  |
| guitare-jazz |  |  |  |  | 95 % / 77 % |  | 93 % / 80 % |  |
| shuffle | 94 % / 91 % |  | 97 % / 96 % |  |  |  |  |  |
| swing | 83 % / 80 % |  | 67 % / 62 % |  |  |  |  |  |
| trad | 90 % / 87 % |  | 82 % / 72 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| accord voisin (décalé d’un temps ou plus) | 23 % | 25 % | 10 % | 15 % |
| fondamentale à une tierce (mineure) | 19 % | 19 % | 0 % | 0 % |
| fondamentale à la quinte / quarte | 19 % | 19 % | 17 % | 22 % |
| bonne fondamentale, famille fausse | 10 % | 11 % | 0 % | 0 % |
| fondamentale au triton | 9 % | 5 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 7 % | 5 % | 0 % | 15 % |
| bonne fondamentale, septième ou sixte fausse | 6 % | 5 % | 72 % | 44 % |
| fondamentale à un demi-ton | 4 % | 4 % | 0 % | 0 % |
| fondamentale à un ton | 3 % | 6 % | 0 % | 4 % |
| aucun accord | 1 % | 1 % | 0 % | 0 % |
| *temps faux / tous les temps* | 14 % | 26 % | 15 % | 14 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (29 %) · maj → 7 (24 %) · 7 → m7 (15 %) · 7 → maj (9 %) · dim7 → dim (6 %) · m6 → m7 (4 %) · 6 → maj (3 %) · 7 → 6 (2 %) · m7b5 → 7 (1 %) · 7 → dim7 (1 %) · dim7 → 7 (1 %) · m7 → m7b5 (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 4 % | 51 % | 12 % | 16 % |
| grille détectée | synthèse, vieux disque | 21 % | 46 % | 21 % | 37 % |
| grille détectée | enregistrements réels | 5 % | 100 % | 11 % | 31 % |
| grille détectée | réels, façon vieux disque | 8 % | 100 % | 7 % | 56 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
