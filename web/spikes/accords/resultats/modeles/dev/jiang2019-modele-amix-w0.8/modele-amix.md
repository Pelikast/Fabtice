# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (7 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 79 % | 70 % | 67 % | 32 % | 78 % | 30 % | 21 % | 93 % | 86 % | 86 % |
| grille détectée | synthèse, vieux disque | 7 | 49 % | 47 % | 25 % | 13 % | 46 % | 72 % | 16 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 97 % | 95 % | 80 % | 80 % | 95 % | — | 10 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 82 % | 81 % | 54 % | 54 % | 83 % | — | 15 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 79 % | 67 % | 78 % | 30 % | 21 % | 86 % | 50 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 49 % | 25 % | 46 % | 72 % | 16 % | 71 % | 94 % |
| grille détectée | développement | enregistrements réels | 4 | 97 % | 80 % | 95 % | — | 10 % | 100 % | 92 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 82 % | 54 % | 83 % | — | 15 % | 75 % | 38 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 81 % | 69 % |
| grille détectée | synthèse, vieux disque | 52 % | 28 % |
| grille détectée | enregistrements réels | 96 % | 78 % |
| grille détectée | réels, façon vieux disque | 80 % | 51 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 97 % / 84 % |  | 62 % / 33 % |  |  |  |  |  |
| bossa | 98 % / 95 % |  | 88 % / 2 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 96 % / 83 % |  | 78 % / 48 % |  |
| guitare-jazz |  |  |  |  | 98 % / 77 % |  | 85 % / 59 % |  |
| shuffle | 86 % / 78 % |  | 42 % / 40 % |  |  |  |  |  |
| swing | 67 % / 51 % |  | 30 % / 26 % |  |  |  |  |  |
| trad | 85 % / 73 % |  | 68 % / 35 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| bonne fondamentale, famille fausse | 24 % | 3 % | 11 % | 1 % |
| fondamentale à la quinte / quarte | 20 % | 7 % | 8 % | 22 % |
| accord voisin (décalé d’un temps ou plus) | 16 % | 5 % | 5 % | 3 % |
| bonne fondamentale, septième ou sixte fausse | 10 % | 29 % | 74 % | 60 % |
| fondamentale à un ton | 9 % | 2 % | 3 % | 3 % |
| fondamentale à un demi-ton | 7 % | 1 % | 0 % | 0 % |
| fondamentale à une tierce (mineure) | 5 % | 4 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 4 % | 0 % | 0 % | 10 % |
| fondamentale au triton | 3 % | 1 % | 0 % | 0 % |
| aucun accord | 0 % | 49 % | 0 % | 0 % |
| *temps faux / tous les temps* | 33 % | 75 % | 20 % | 46 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → m (21 %) · m7 → 7 (18 %) · 7 → maj (16 %) · maj → 7 (14 %) · maj7 → maj (10 %) · m7b5 → dim (6 %) · 7 → m7 (3 %) · m7b5 → m7 (1 %) · 6 → 7 (1 %) · dim7 → m7b5 (1 %) · m7b5 → 7 (1 %) · m6 → m (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 27 % | 62 % | 23 % | 50 % |
| grille détectée | synthèse, vieux disque | 85 % | 83 % | 31 % | 94 % |
| grille détectée | enregistrements réels | 34 % | 53 % | 2 % | 92 % |
| grille détectée | réels, façon vieux disque | 19 % | 94 % | 35 % | 38 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
