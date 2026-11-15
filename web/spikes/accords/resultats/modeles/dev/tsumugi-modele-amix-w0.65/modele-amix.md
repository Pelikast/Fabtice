# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (5 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 89 % | 88 % | 87 % | 41 % | 86 % | 14 % | 6 % | 93 % | 86 % | 100 % |
| grille détectée | synthèse, vieux disque | 7 | 80 % | 77 % | 76 % | 35 % | 74 % | 34 % | 13 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 95 % | 95 % | 83 % | 83 % | 97 % | — | 10 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 93 % | 93 % | 84 % | 81 % | 95 % | — | 10 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 89 % | 87 % | 86 % | 14 % | 6 % | 100 % | 19 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 80 % | 76 % | 74 % | 34 % | 13 % | 71 % | 35 % |
| grille détectée | développement | enregistrements réels | 4 | 95 % | 83 % | 97 % | — | 10 % | 100 % | 0 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 93 % | 84 % | 95 % | — | 10 % | 75 % | 63 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 90 % | 88 % |
| grille détectée | synthèse, vieux disque | 84 % | 80 % |
| grille détectée | enregistrements réels | 94 % | 81 % |
| grille détectée | réels, façon vieux disque | 91 % | 82 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 100 % / 100 % |  | 98 % / 92 % |  |  |  |  |  |
| bossa | 99 % / 97 % |  | 95 % / 93 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 93 % |  | 92 % / 88 % |  |
| guitare-jazz |  |  |  |  | 94 % / 74 % |  | 94 % / 81 % |  |
| shuffle | 93 % / 90 % |  | 98 % / 95 % |  |  |  |  |  |
| swing | 84 % / 81 % |  | 70 % / 65 % |  |  |  |  |  |
| trad | 90 % / 87 % |  | 80 % / 74 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 22 % | 20 % | 16 % | 20 % |
| accord voisin (décalé d’un temps ou plus) | 21 % | 22 % | 13 % | 10 % |
| fondamentale à une tierce (mineure) | 17 % | 16 % | 0 % | 0 % |
| bonne fondamentale, famille fausse | 9 % | 11 % | 0 % | 0 % |
| bonne fondamentale, septième ou sixte fausse | 8 % | 5 % | 72 % | 53 % |
| fondamentale au triton | 8 % | 7 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 6 % | 6 % | 0 % | 13 % |
| fondamentale à un ton | 4 % | 8 % | 0 % | 3 % |
| fondamentale à un demi-ton | 3 % | 4 % | 0 % | 0 % |
| aucun accord | 1 % | 1 % | 0 % | 0 % |
| *temps faux / tous les temps* | 13 % | 24 % | 17 % | 16 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (24 %) · maj → 7 (18 %) · 7 → m7 (15 %) · 7 → maj (12 %) · m6 → m7 (6 %) · dim7 → dim (5 %) · m7 → m7b5 (5 %) · 6 → maj (5 %) · 7 → 6 (3 %) · 6 → 7 (1 %) · 6 → maj7 (1 %) · 7 → dim7 (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 4 % | 58 % | 11 % | 19 % |
| grille détectée | synthèse, vieux disque | 17 % | 49 % | 19 % | 35 % |
| grille détectée | enregistrements réels | 0 % | — | 17 % | 0 % |
| grille détectée | réels, façon vieux disque | 14 % | 70 % | 7 % | 63 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
