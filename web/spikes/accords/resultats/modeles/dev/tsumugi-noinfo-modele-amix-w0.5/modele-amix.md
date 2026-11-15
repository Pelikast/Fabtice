# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (6 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 89 % | 87 % | 85 % | 40 % | 84 % | 10 % | 13 % | 93 % | 86 % | 100 % |
| grille détectée | synthèse, vieux disque | 7 | 77 % | 74 % | 72 % | 33 % | 72 % | 36 % | 19 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 96 % | 96 % | 86 % | 86 % | 98 % | — | 8 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 94 % | 94 % | 88 % | 83 % | 93 % | — | 13 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 89 % | 85 % | 84 % | 10 % | 13 % | 100 % | 24 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 77 % | 72 % | 72 % | 36 % | 19 % | 71 % | 41 % |
| grille détectée | développement | enregistrements réels | 4 | 96 % | 86 % | 98 % | — | 8 % | 100 % | 19 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 94 % | 88 % | 93 % | — | 13 % | 75 % | 48 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 90 % | 87 % |
| grille détectée | synthèse, vieux disque | 81 % | 76 % |
| grille détectée | enregistrements réels | 95 % | 84 % |
| grille détectée | réels, façon vieux disque | 93 % | 86 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 100 % / 100 % |  | 98 % / 86 % |  |  |  |  |  |
| bossa | 98 % / 97 % |  | 96 % / 93 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 93 % |  | 92 % / 83 % |  |
| guitare-jazz |  |  |  |  | 95 % / 79 % |  | 97 % / 93 % |  |
| shuffle | 95 % / 94 % |  | 94 % / 91 % |  |  |  |  |  |
| swing | 83 % / 78 % |  | 64 % / 59 % |  |  |  |  |  |
| trad | 89 % / 83 % |  | 82 % / 78 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| accord voisin (décalé d’un temps ou plus) | 25 % | 24 % | 11 % | 26 % |
| fondamentale à une tierce (mineure) | 15 % | 16 % | 0 % | 0 % |
| fondamentale à la quinte / quarte | 14 % | 19 % | 19 % | 0 % |
| bonne fondamentale, famille fausse | 11 % | 11 % | 0 % | 0 % |
| fondamentale au triton | 10 % | 6 % | 0 % | 0 % |
| bonne fondamentale, septième ou sixte fausse | 9 % | 4 % | 70 % | 52 % |
| fondamentale à un demi-ton | 6 % | 4 % | 0 % | 0 % |
| fondamentale à un ton | 5 % | 7 % | 0 % | 4 % |
| fondamentale à une tierce (majeure) | 4 % | 6 % | 0 % | 17 % |
| aucun accord | 1 % | 1 % | 0 % | 0 % |
| *temps faux / tous les temps* | 15 % | 28 % | 14 % | 12 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (29 %) · 7 → m7 (16 %) · dim7 → dim (10 %) · maj → 7 (8 %) · 7 → maj (8 %) · 6 → maj (8 %) · m6 → m7 (6 %) · maj7 → maj (5 %) · 7 → 6 (3 %) · 6 → maj7 (1 %) · m7b5 → 7 (1 %) · m7 → m7b5 (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 8 % | 45 % | 12 % | 24 % |
| grille détectée | synthèse, vieux disque | 24 % | 47 % | 21 % | 41 % |
| grille détectée | enregistrements réels | 5 % | 56 % | 12 % | 19 % |
| grille détectée | réels, façon vieux disque | 21 % | 28 % | 8 % | 48 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
