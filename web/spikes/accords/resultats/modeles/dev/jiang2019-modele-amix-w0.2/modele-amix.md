# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (6 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 78 % | 74 % | 70 % | 33 % | 77 % | 42 % | 16 % | 93 % | 86 % | 86 % |
| grille détectée | synthèse, vieux disque | 7 | 65 % | 62 % | 58 % | 28 % | 61 % | 56 % | 20 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 98 % | 96 % | 81 % | 81 % | 96 % | — | 8 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 89 % | 87 % | 65 % | 65 % | 87 % | — | 21 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 78 % | 70 % | 77 % | 42 % | 16 % | 86 % | 40 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 65 % | 58 % | 61 % | 56 % | 20 % | 71 % | 53 % |
| grille détectée | développement | enregistrements réels | 4 | 98 % | 81 % | 96 % | — | 8 % | 100 % | 86 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 89 % | 65 % | 87 % | — | 21 % | 75 % | 72 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 82 % | 73 % |
| grille détectée | synthèse, vieux disque | 69 % | 62 % |
| grille détectée | enregistrements réels | 97 % | 79 % |
| grille détectée | réels, façon vieux disque | 87 % | 62 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 97 % / 80 % |  | 88 % / 67 % |  |  |  |  |  |
| bossa | 97 % / 94 % |  | 90 % / 87 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 85 % |  | 86 % / 67 % |  |
| guitare-jazz |  |  |  |  | 98 % / 77 % |  | 91 % / 64 % |  |
| shuffle | 89 % / 78 % |  | 88 % / 80 % |  |  |  |  |  |
| swing | 66 % / 57 % |  | 46 % / 40 % |  |  |  |  |  |
| trad | 86 % / 74 % |  | 77 % / 71 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 24 % | 22 % | 6 % | 10 % |
| accord voisin (décalé d’un temps ou plus) | 21 % | 18 % | 3 % | 6 % |
| bonne fondamentale, septième ou sixte fausse | 13 % | 8 % | 78 % | 63 % |
| bonne fondamentale, famille fausse | 12 % | 7 % | 11 % | 4 % |
| fondamentale à une tierce (mineure) | 8 % | 14 % | 0 % | 0 % |
| fondamentale à un ton | 7 % | 11 % | 3 % | 3 % |
| fondamentale à un demi-ton | 6 % | 3 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 5 % | 5 % | 0 % | 13 % |
| fondamentale au triton | 4 % | 3 % | 0 % | 0 % |
| aucun accord | 0 % | 9 % | 0 % | 0 % |
| *temps faux / tous les temps* | 30 % | 42 % | 19 % | 35 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (22 %) · 7 → maj (21 %) · dim7 → dim (11 %) · maj7 → maj (10 %) · 7 → m7 (8 %) · maj → 7 (5 %) · 6 → maj (5 %) · m6 → m7 (4 %) · m7 → m (2 %) · 6 → maj7 (2 %) · m7b5 → m7 (2 %) · 7 → 6 (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 22 % | 55 % | 23 % | 40 % |
| grille détectée | synthèse, vieux disque | 36 % | 61 % | 31 % | 53 % |
| grille détectée | enregistrements réels | 28 % | 57 % | 4 % | 86 % |
| grille détectée | réels, façon vieux disque | 29 % | 86 % | 14 % | 72 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
