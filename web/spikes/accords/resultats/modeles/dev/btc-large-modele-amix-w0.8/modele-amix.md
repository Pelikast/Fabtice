# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (5 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 81 % | 78 % | 71 % | 34 % | 79 % | 18 % | 24 % | 93 % | 86 % | 100 % |
| grille détectée | synthèse, vieux disque | 7 | 68 % | 64 % | 54 % | 24 % | 65 % | 31 % | 34 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 97 % | 95 % | 85 % | 85 % | 95 % | — | 10 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 87 % | 85 % | 77 % | 74 % | 85 % | — | 15 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 81 % | 71 % | 79 % | 18 % | 24 % | 100 % | 37 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 68 % | 54 % | 65 % | 31 % | 34 % | 71 % | 53 % |
| grille détectée | développement | enregistrements réels | 4 | 97 % | 85 % | 95 % | — | 10 % | 100 % | 31 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 87 % | 77 % | 85 % | — | 15 % | 75 % | 23 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 82 % | 73 % |
| grille détectée | synthèse, vieux disque | 70 % | 57 % |
| grille détectée | enregistrements réels | 97 % | 84 % |
| grille détectée | réels, façon vieux disque | 85 % | 75 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 96 % / 73 % |  | 86 % / 65 % |  |  |  |  |  |
| bossa | 98 % / 95 % |  | 90 % / 85 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 96 % / 83 % |  | 79 % / 67 % |  |
| guitare-jazz |  |  |  |  | 99 % / 86 % |  | 95 % / 88 % |  |
| shuffle | 86 % / 85 % |  | 75 % / 74 % |  |  |  |  |  |
| swing | 71 % / 61 % |  | 53 % / 40 % |  |  |  |  |  |
| trad | 87 % / 72 % |  | 83 % / 48 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| bonne fondamentale, septième ou sixte fausse | 22 % | 21 % | 69 % | 36 % |
| fondamentale à la quinte / quarte | 19 % | 22 % | 7 % | 20 % |
| accord voisin (décalé d’un temps ou plus) | 15 % | 11 % | 7 % | 11 % |
| bonne fondamentale, famille fausse | 11 % | 9 % | 14 % | 7 % |
| fondamentale à une tierce (mineure) | 9 % | 16 % | 0 % | 0 % |
| fondamentale à un ton | 8 % | 9 % | 3 % | 5 % |
| fondamentale à un demi-ton | 7 % | 2 % | 0 % | 0 % |
| fondamentale au triton | 5 % | 3 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 4 % | 5 % | 0 % | 20 % |
| aucun accord | 0 % | 2 % | 0 % | 0 % |
| *temps faux / tous les temps* | 29 % | 46 % | 15 % | 23 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

7 → maj (17 %) · maj → maj7 (14 %) · m7 → 7 (11 %) · 7 → m7 (10 %) · maj → 7 (9 %) · maj7 → maj (7 %) · m7 → m (7 %) · 6 → maj (6 %) · dim7 → dim (5 %) · dim7 → m7 (2 %) · m7b5 → m7 (2 %) · m6 → m7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 21 % | 49 % | 23 % | 37 % |
| grille détectée | synthèse, vieux disque | 46 % | 53 % | 40 % | 53 % |
| grille détectée | enregistrements réels | 13 % | 38 % | 12 % | 31 % |
| grille détectée | réels, façon vieux disque | 18 % | 29 % | 22 % | 23 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
