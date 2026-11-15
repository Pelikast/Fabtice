# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (7 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 78 % | 74 % | 71 % | 34 % | 77 % | 37 % | 18 % | 93 % | 86 % | 86 % |
| grille détectée | synthèse, vieux disque | 7 | 61 % | 58 % | 53 % | 24 % | 57 % | 57 % | 18 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 97 % | 95 % | 81 % | 81 % | 95 % | — | 10 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 85 % | 83 % | 60 % | 60 % | 83 % | — | 17 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 78 % | 71 % | 77 % | 37 % | 18 % | 86 % | 41 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 61 % | 53 % | 57 % | 57 % | 18 % | 71 % | 74 % |
| grille détectée | développement | enregistrements réels | 4 | 97 % | 81 % | 95 % | — | 10 % | 100 % | 95 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 85 % | 60 % | 83 % | — | 17 % | 75 % | 45 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 82 % | 74 % |
| grille détectée | synthèse, vieux disque | 66 % | 56 % |
| grille détectée | enregistrements réels | 97 % | 79 % |
| grille détectée | réels, façon vieux disque | 83 % | 57 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 98 % / 86 % |  | 82 % / 60 % |  |  |  |  |  |
| bossa | 97 % / 94 % |  | 89 % / 78 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 84 % |  | 79 % / 56 % |  |
| guitare-jazz |  |  |  |  | 98 % / 77 % |  | 91 % / 65 % |  |
| shuffle | 93 % / 84 % |  | 81 % / 75 % |  |  |  |  |  |
| swing | 66 % / 57 % |  | 42 % / 36 % |  |  |  |  |  |
| trad | 84 % / 74 % |  | 73 % / 63 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 23 % | 18 % | 5 % | 18 % |
| accord voisin (décalé d’un temps ou plus) | 21 % | 15 % | 5 % | 5 % |
| bonne fondamentale, famille fausse | 13 % | 6 % | 11 % | 4 % |
| bonne fondamentale, septième ou sixte fausse | 10 % | 10 % | 76 % | 58 % |
| fondamentale à un demi-ton | 9 % | 2 % | 0 % | 0 % |
| fondamentale à un ton | 8 % | 7 % | 3 % | 3 % |
| fondamentale à une tierce (mineure) | 7 % | 9 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 4 % | 2 % | 0 % | 12 % |
| fondamentale au triton | 4 % | 3 % | 0 % | 0 % |
| aucun accord | 0 % | 27 % | 0 % | 0 % |
| *temps faux / tous les temps* | 29 % | 47 % | 19 % | 40 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (25 %) · 7 → maj (21 %) · maj7 → maj (17 %) · maj → 7 (9 %) · dim7 → dim (5 %) · 6 → maj (5 %) · 7 → m7 (4 %) · m6 → m7 (4 %) · m7b5 → 7 (2 %) · dim7 → m7b5 (1 %) · 7 → m (1 %) · m7b5 → m7 (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 24 % | 49 % | 23 % | 41 % |
| grille détectée | synthèse, vieux disque | 52 % | 68 % | 25 % | 74 % |
| grille détectée | enregistrements réels | 26 % | 70 % | 1 % | 95 % |
| grille détectée | réels, façon vieux disque | 20 % | 89 % | 27 % | 45 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
