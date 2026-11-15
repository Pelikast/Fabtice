# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (5 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 78 % | 75 % | 70 % | 33 % | 76 % | 28 % | 25 % | 93 % | 86 % | 86 % |
| grille détectée | synthèse, vieux disque | 7 | 64 % | 60 % | 54 % | 24 % | 60 % | 48 % | 21 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 88 % | 85 % | 73 % | 73 % | 85 % | — | 17 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 94 % | 93 % | 82 % | 78 % | 93 % | — | 13 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 78 % | 70 % | 76 % | 28 % | 25 % | 86 % | 43 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 64 % | 54 % | 60 % | 48 % | 21 % | 71 % | 61 % |
| grille détectée | développement | enregistrements réels | 4 | 88 % | 73 % | 85 % | — | 17 % | 100 % | 52 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 94 % | 82 % | 93 % | — | 13 % | 75 % | 50 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 80 % | 72 % |
| grille détectée | synthèse, vieux disque | 68 % | 57 % |
| grille détectée | enregistrements réels | 89 % | 74 % |
| grille détectée | réels, façon vieux disque | 93 % | 80 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 95 % / 77 % |  | 83 % / 59 % |  |  |  |  |  |
| bossa | 98 % / 95 % |  | 93 % / 89 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 95 % / 82 % |  | 92 % / 79 % |  |
| guitare-jazz |  |  |  |  | 80 % / 64 % |  | 97 % / 85 % |  |
| shuffle | 90 % / 89 % |  | 81 % / 79 % |  |  |  |  |  |
| swing | 65 % / 56 % |  | 47 % / 39 % |  |  |  |  |  |
| trad | 84 % / 74 % |  | 71 % / 47 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 25 % | 21 % | 2 % | 0 % |
| accord voisin (décalé d’un temps ou plus) | 18 % | 13 % | 4 % | 15 % |
| bonne fondamentale, septième ou sixte fausse | 14 % | 13 % | 46 % | 59 % |
| fondamentale à une tierce (mineure) | 11 % | 13 % | 0 % | 0 % |
| fondamentale à un ton | 9 % | 12 % | 2 % | 6 % |
| bonne fondamentale, famille fausse | 8 % | 8 % | 8 % | 9 % |
| fondamentale à un demi-ton | 7 % | 4 % | 0 % | 0 % |
| fondamentale au triton | 5 % | 3 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 3 % | 2 % | 0 % | 12 % |
| aucun accord | 0 % | 11 % | 38 % | 0 % |
| *temps faux / tous les temps* | 30 % | 46 % | 27 % | 18 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

7 → maj (18 %) · m7 → 7 (16 %) · maj → maj7 (10 %) · m7 → m (8 %) · maj7 → maj (8 %) · maj → 7 (8 %) · 7 → m7 (6 %) · dim7 → dim (5 %) · 6 → maj (4 %) · m6 → m7 (3 %) · m7b5 → m7 (3 %) · dim7 → m7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 25 % | 51 % | 23 % | 43 % |
| grille détectée | synthèse, vieux disque | 46 % | 60 % | 33 % | 61 % |
| grille détectée | enregistrements réels | 20 % | 69 % | 16 % | 52 % |
| grille détectée | réels, façon vieux disque | 21 % | 43 % | 11 % | 50 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
