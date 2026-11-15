# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (6 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 78 % | 72 % | 69 % | 33 % | 77 % | 32 % | 20 % | 93 % | 86 % | 86 % |
| grille détectée | synthèse, vieux disque | 7 | 57 % | 54 % | 46 % | 22 % | 53 % | 65 % | 18 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 97 % | 95 % | 81 % | 81 % | 95 % | — | 10 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 85 % | 84 % | 59 % | 59 % | 84 % | — | 13 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 78 % | 69 % | 77 % | 32 % | 20 % | 86 % | 48 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 57 % | 46 % | 53 % | 65 % | 18 % | 71 % | 82 % |
| grille détectée | développement | enregistrements réels | 4 | 97 % | 81 % | 95 % | — | 10 % | 100 % | 84 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 85 % | 59 % | 84 % | — | 13 % | 75 % | 45 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 81 % | 72 % |
| grille détectée | synthèse, vieux disque | 61 % | 50 % |
| grille détectée | enregistrements réels | 97 % | 79 % |
| grille détectée | réels, façon vieux disque | 83 % | 56 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 98 % / 86 % |  | 71 % / 48 % |  |  |  |  |  |
| bossa | 98 % / 95 % |  | 89 % / 70 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 84 % |  | 79 % / 56 % |  |
| guitare-jazz |  |  |  |  | 98 % / 77 % |  | 92 % / 63 % |  |
| shuffle | 90 % / 80 % |  | 68 % / 65 % |  |  |  |  |  |
| swing | 65 % / 54 % |  | 37 % / 33 % |  |  |  |  |  |
| trad | 84 % / 74 % |  | 71 % / 53 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 22 % | 14 % | 5 % | 18 % |
| accord voisin (décalé d’un temps ou plus) | 18 % | 10 % | 5 % | 4 % |
| bonne fondamentale, famille fausse | 18 % | 5 % | 11 % | 4 % |
| bonne fondamentale, septième ou sixte fausse | 10 % | 14 % | 76 % | 60 % |
| fondamentale à un ton | 9 % | 3 % | 3 % | 3 % |
| fondamentale à un demi-ton | 7 % | 1 % | 0 % | 0 % |
| fondamentale à une tierce (mineure) | 6 % | 6 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 5 % | 1 % | 0 % | 12 % |
| fondamentale au triton | 4 % | 2 % | 0 % | 0 % |
| aucun accord | 0 % | 45 % | 0 % | 0 % |
| *temps faux / tous les temps* | 31 % | 54 % | 19 % | 41 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (26 %) · 7 → maj (17 %) · maj7 → maj (15 %) · maj → 7 (13 %) · m7 → m (5 %) · 7 → m7 (3 %) · 6 → maj (3 %) · dim7 → m7b5 (3 %) · m6 → m7 (2 %) · m7b5 → 7 (2 %) · m7b5 → m7 (2 %) · 7 → m (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 27 % | 56 % | 22 % | 48 % |
| grille détectée | synthèse, vieux disque | 62 % | 72 % | 25 % | 82 % |
| grille détectée | enregistrements réels | 32 % | 50 % | 5 % | 84 % |
| grille détectée | réels, façon vieux disque | 24 % | 76 % | 29 % | 45 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
