# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (6 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 89 % | 87 % | 86 % | 40 % | 85 % | 14 % | 9 % | 93 % | 86 % | 100 % |
| grille détectée | synthèse, vieux disque | 7 | 79 % | 76 % | 75 % | 35 % | 74 % | 37 % | 16 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 95 % | 95 % | 81 % | 81 % | 97 % | — | 10 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 93 % | 93 % | 84 % | 81 % | 95 % | — | 10 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 89 % | 86 % | 85 % | 14 % | 9 % | 100 % | 21 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 79 % | 75 % | 74 % | 37 % | 16 % | 71 % | 31 % |
| grille détectée | développement | enregistrements réels | 4 | 95 % | 81 % | 97 % | — | 10 % | 100 % | 44 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 93 % | 84 % | 95 % | — | 10 % | 75 % | 60 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 90 % | 87 % |
| grille détectée | synthèse, vieux disque | 83 % | 78 % |
| grille détectée | enregistrements réels | 94 % | 79 % |
| grille détectée | réels, façon vieux disque | 91 % | 82 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 100 % / 100 % |  | 98 % / 86 % |  |  |  |  |  |
| bossa | 98 % / 97 % |  | 95 % / 93 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 89 % |  | 92 % / 88 % |  |
| guitare-jazz |  |  |  |  | 94 % / 74 % |  | 94 % / 81 % |  |
| shuffle | 94 % / 93 % |  | 95 % / 92 % |  |  |  |  |  |
| swing | 83 % / 80 % |  | 68 % / 63 % |  |  |  |  |  |
| trad | 89 % / 83 % |  | 80 % / 77 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| accord voisin (décalé d’un temps ou plus) | 22 % | 22 % | 11 % | 10 % |
| fondamentale à la quinte / quarte | 19 % | 21 % | 14 % | 20 % |
| fondamentale à une tierce (mineure) | 17 % | 17 % | 0 % | 0 % |
| bonne fondamentale, septième ou sixte fausse | 10 % | 5 % | 75 % | 53 % |
| fondamentale au triton | 9 % | 7 % | 0 % | 0 % |
| bonne fondamentale, famille fausse | 7 % | 11 % | 0 % | 0 % |
| fondamentale à un demi-ton | 6 % | 5 % | 0 % | 0 % |
| fondamentale à un ton | 5 % | 7 % | 0 % | 3 % |
| fondamentale à une tierce (majeure) | 5 % | 4 % | 0 % | 13 % |
| aucun accord | 1 % | 2 % | 0 % | 0 % |
| *temps faux / tous les temps* | 14 % | 25 % | 19 % | 16 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (25 %) · 7 → m7 (14 %) · maj → 7 (13 %) · 7 → maj (11 %) · dim7 → dim (10 %) · 6 → maj (8 %) · m6 → m7 (6 %) · maj7 → maj (5 %) · 7 → 6 (3 %) · m7 → m7b5 (3 %) · 6 → maj7 (1 %) · 7 → dim7 (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 6 % | 52 % | 12 % | 21 % |
| grille détectée | synthèse, vieux disque | 18 % | 44 % | 21 % | 31 % |
| grille détectée | enregistrements réels | 8 % | 100 % | 11 % | 44 % |
| grille détectée | réels, façon vieux disque | 14 % | 69 % | 7 % | 60 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
