# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (5 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 82 % | 79 % | 72 % | 33 % | 80 % | 16 % | 24 % | 93 % | 86 % | 100 % |
| grille détectée | synthèse, vieux disque | 7 | 69 % | 65 % | 57 % | 26 % | 66 % | 36 % | 29 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 98 % | 96 % | 85 % | 85 % | 96 % | — | 8 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 88 % | 86 % | 78 % | 74 % | 86 % | — | 13 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 82 % | 72 % | 80 % | 16 % | 24 % | 100 % | 35 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 69 % | 57 % | 66 % | 36 % | 29 % | 71 % | 55 % |
| grille détectée | développement | enregistrements réels | 4 | 98 % | 85 % | 96 % | — | 8 % | 100 % | 32 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 88 % | 78 % | 86 % | — | 13 % | 75 % | 23 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 83 % | 73 % |
| grille détectée | synthèse, vieux disque | 72 % | 60 % |
| grille détectée | enregistrements réels | 97 % | 84 % |
| grille détectée | réels, façon vieux disque | 85 % | 75 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 96 % / 73 % |  | 88 % / 71 % |  |  |  |  |  |
| bossa | 98 % / 95 % |  | 94 % / 90 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 84 % |  | 79 % / 67 % |  |
| guitare-jazz |  |  |  |  | 99 % / 86 % |  | 96 % / 89 % |  |
| shuffle | 87 % / 80 % |  | 76 % / 70 % |  |  |  |  |  |
| swing | 73 % / 62 % |  | 53 % / 41 % |  |  |  |  |  |
| trad | 86 % / 71 % |  | 81 % / 55 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| bonne fondamentale, septième ou sixte fausse | 25 % | 18 % | 71 % | 37 % |
| fondamentale à la quinte / quarte | 18 % | 21 % | 4 % | 21 % |
| accord voisin (décalé d’un temps ou plus) | 16 % | 13 % | 7 % | 9 % |
| bonne fondamentale, famille fausse | 11 % | 9 % | 14 % | 7 % |
| fondamentale à une tierce (mineure) | 9 % | 15 % | 0 % | 0 % |
| fondamentale à un demi-ton | 7 % | 3 % | 0 % | 0 % |
| fondamentale à un ton | 6 % | 10 % | 4 % | 5 % |
| fondamentale au triton | 5 % | 3 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 3 % | 6 % | 0 % | 21 % |
| aucun accord | 0 % | 2 % | 0 % | 0 % |
| *temps faux / tous les temps* | 28 % | 43 % | 15 % | 22 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

7 → maj (16 %) · m7 → 7 (12 %) · dim7 → dim (12 %) · 7 → m7 (10 %) · maj → maj7 (10 %) · maj7 → maj (8 %) · maj → 7 (8 %) · 6 → maj (6 %) · m7 → m (5 %) · m6 → m7 (3 %) · 7 → 6 (2 %) · dim7 → m7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 19 % | 53 % | 23 % | 35 % |
| grille détectée | synthèse, vieux disque | 40 % | 59 % | 33 % | 55 % |
| grille détectée | enregistrements réels | 13 % | 38 % | 11 % | 32 % |
| grille détectée | réels, façon vieux disque | 18 % | 29 % | 21 % | 23 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
