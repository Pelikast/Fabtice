# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (5 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 90 % | 88 % | 87 % | 40 % | 84 % | 8 % | 13 % | 93 % | 86 % | 100 % |
| grille détectée | synthèse, vieux disque | 7 | 78 % | 75 % | 74 % | 34 % | 73 % | 35 % | 19 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 96 % | 96 % | 85 % | 85 % | 98 % | — | 10 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 92 % | 92 % | 86 % | 83 % | 94 % | — | 13 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 90 % | 87 % | 84 % | 8 % | 13 % | 100 % | 14 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 78 % | 74 % | 73 % | 35 % | 19 % | 71 % | 31 % |
| grille détectée | développement | enregistrements réels | 4 | 96 % | 85 % | 98 % | — | 10 % | 100 % | 17 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 92 % | 86 % | 94 % | — | 13 % | 75 % | 41 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 90 % | 88 % |
| grille détectée | synthèse, vieux disque | 81 % | 77 % |
| grille détectée | enregistrements réels | 95 % | 83 % |
| grille détectée | réels, façon vieux disque | 91 % | 83 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 100 % / 100 % |  | 97 % / 91 % |  |  |  |  |  |
| bossa | 98 % / 97 % |  | 96 % / 94 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 93 % |  | 92 % / 92 % |  |
| guitare-jazz |  |  |  |  | 95 % / 77 % |  | 93 % / 80 % |  |
| shuffle | 95 % / 92 % |  | 97 % / 96 % |  |  |  |  |  |
| swing | 84 % / 81 % |  | 65 % / 61 % |  |  |  |  |  |
| trad | 90 % / 87 % |  | 81 % / 74 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| accord voisin (décalé d’un temps ou plus) | 25 % | 27 % | 10 % | 15 % |
| fondamentale à la quinte / quarte | 17 % | 19 % | 17 % | 22 % |
| fondamentale à une tierce (mineure) | 16 % | 17 % | 0 % | 0 % |
| fondamentale au triton | 11 % | 6 % | 0 % | 0 % |
| bonne fondamentale, famille fausse | 10 % | 11 % | 0 % | 0 % |
| bonne fondamentale, septième ou sixte fausse | 8 % | 3 % | 72 % | 44 % |
| fondamentale à un demi-ton | 5 % | 4 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 4 % | 6 % | 0 % | 15 % |
| fondamentale à un ton | 3 % | 6 % | 0 % | 4 % |
| aucun accord | 1 % | 2 % | 0 % | 0 % |
| *temps faux / tous les temps* | 13 % | 26 % | 15 % | 14 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (28 %) · maj → 7 (19 %) · 7 → m7 (16 %) · 7 → maj (9 %) · dim7 → dim (6 %) · m6 → m7 (5 %) · m7 → m7b5 (3 %) · 6 → maj (3 %) · 7 → 6 (2 %) · dim7 → m7 (2 %) · 6 → maj7 (1 %) · m7b5 → 7 (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 6 % | 33 % | 12 % | 14 % |
| grille détectée | synthèse, vieux disque | 20 % | 41 % | 23 % | 31 % |
| grille détectée | enregistrements réels | 3 % | 100 % | 13 % | 17 % |
| grille détectée | réels, façon vieux disque | 10 % | 58 % | 9 % | 41 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
