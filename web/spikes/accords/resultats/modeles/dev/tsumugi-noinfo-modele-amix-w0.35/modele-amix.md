# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (6 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 87 % | 84 % | 82 % | 39 % | 83 % | 14 % | 14 % | 93 % | 86 % | 100 % |
| grille détectée | synthèse, vieux disque | 7 | 74 % | 71 % | 68 % | 32 % | 69 % | 41 % | 20 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 96 % | 96 % | 84 % | 84 % | 98 % | — | 8 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 93 % | 93 % | 83 % | 78 % | 92 % | — | 13 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 87 % | 82 % | 83 % | 14 % | 14 % | 100 % | 29 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 74 % | 68 % | 69 % | 41 % | 20 % | 71 % | 46 % |
| grille détectée | développement | enregistrements réels | 4 | 96 % | 84 % | 98 % | — | 8 % | 100 % | 68 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 93 % | 83 % | 92 % | — | 13 % | 75 % | 58 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 88 % | 85 % |
| grille détectée | synthèse, vieux disque | 78 % | 71 % |
| grille détectée | enregistrements réels | 95 % | 82 % |
| grille détectée | réels, façon vieux disque | 92 % | 80 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 100 % / 97 % |  | 96 % / 82 % |  |  |  |  |  |
| bossa | 98 % / 96 % |  | 95 % / 93 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 89 % |  | 89 % / 80 % |  |
| guitare-jazz |  |  |  |  | 95 % / 79 % |  | 98 % / 85 % |  |
| shuffle | 94 % / 92 % |  | 88 % / 79 % |  |  |  |  |  |
| swing | 80 % / 74 % |  | 60 % / 54 % |  |  |  |  |  |
| trad | 88 % / 82 % |  | 82 % / 75 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| accord voisin (décalé d’un temps ou plus) | 22 % | 22 % | 10 % | 12 % |
| fondamentale à la quinte / quarte | 19 % | 20 % | 16 % | 3 % |
| bonne fondamentale, septième ou sixte fausse | 12 % | 8 % | 74 % | 61 % |
| fondamentale à une tierce (mineure) | 12 % | 16 % | 0 % | 0 % |
| bonne fondamentale, famille fausse | 11 % | 9 % | 0 % | 0 % |
| fondamentale au triton | 8 % | 5 % | 0 % | 0 % |
| fondamentale à un ton | 7 % | 8 % | 0 % | 3 % |
| fondamentale à un demi-ton | 5 % | 4 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 4 % | 5 % | 0 % | 21 % |
| aucun accord | 1 % | 3 % | 0 % | 0 % |
| *temps faux / tous les temps* | 18 % | 32 % | 16 % | 17 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (22 %) · dim7 → dim (18 %) · 7 → m7 (14 %) · 7 → maj (14 %) · 6 → maj (8 %) · maj7 → maj (6 %) · m6 → m7 (5 %) · maj → 7 (4 %) · 6 → maj7 (2 %) · dim7 → m7b5 (2 %) · 7 → 6 (2 %) · 6 → 7 (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 10 % | 52 % | 14 % | 29 % |
| grille détectée | synthèse, vieux disque | 26 % | 57 % | 23 % | 46 % |
| grille détectée | enregistrements réels | 11 % | 100 % | 6 % | 68 % |
| grille détectée | réels, façon vieux disque | 16 % | 63 % | 9 % | 58 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
