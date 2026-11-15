# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (5 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 79 % | 75 % | 70 % | 34 % | 77 % | 37 % | 18 % | 93 % | 86 % | 86 % |
| grille détectée | synthèse, vieux disque | 7 | 67 % | 64 % | 59 % | 29 % | 64 % | 50 % | 22 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 98 % | 96 % | 88 % | 88 % | 96 % | — | 6 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 87 % | 85 % | 75 % | 73 % | 85 % | — | 15 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 79 % | 70 % | 77 % | 37 % | 18 % | 86 % | 36 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 67 % | 59 % | 64 % | 50 % | 22 % | 71 % | 50 % |
| grille détectée | développement | enregistrements réels | 4 | 98 % | 88 % | 96 % | — | 6 % | 100 % | 57 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 87 % | 75 % | 85 % | — | 15 % | 75 % | 54 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 82 % | 73 % |
| grille détectée | synthèse, vieux disque | 71 % | 63 % |
| grille détectée | enregistrements réels | 98 % | 87 % |
| grille détectée | réels, façon vieux disque | 85 % | 73 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 97 % / 77 % |  | 90 % / 69 % |  |  |  |  |  |
| bossa | 96 % / 94 % |  | 90 % / 88 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 85 % |  | 81 % / 69 % |  |
| guitare-jazz |  |  |  |  | 99 % / 91 % |  | 93 % / 81 % |  |
| shuffle | 88 % / 81 % |  | 84 % / 78 % |  |  |  |  |  |
| swing | 67 % / 58 % |  | 49 % / 42 % |  |  |  |  |  |
| trad | 87 % / 74 % |  | 80 % / 70 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 24 % | 22 % | 4 % | 25 % |
| accord voisin (décalé d’un temps ou plus) | 19 % | 17 % | 4 % | 8 % |
| bonne fondamentale, septième ou sixte fausse | 16 % | 9 % | 70 % | 42 % |
| bonne fondamentale, famille fausse | 10 % | 7 % | 17 % | 6 % |
| fondamentale à une tierce (mineure) | 9 % | 17 % | 0 % | 0 % |
| fondamentale à un ton | 7 % | 9 % | 4 % | 4 % |
| fondamentale à un demi-ton | 5 % | 3 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 5 % | 6 % | 0 % | 15 % |
| fondamentale au triton | 4 % | 3 % | 0 % | 0 % |
| aucun accord | 0 % | 6 % | 0 % | 0 % |
| *temps faux / tous les temps* | 30 % | 41 % | 12 % | 25 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (23 %) · 7 → maj (17 %) · dim7 → dim (13 %) · maj7 → maj (8 %) · 7 → m7 (7 %) · 6 → maj (6 %) · maj → 7 (5 %) · m6 → m7 (4 %) · 7 → 6 (3 %) · maj → maj7 (2 %) · 7sus4 → 7 (2 %) · m7 → m (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 20 % | 55 % | 24 % | 36 % |
| grille détectée | synthèse, vieux disque | 35 % | 58 % | 31 % | 50 % |
| grille détectée | enregistrements réels | 19 % | 36 % | 6 % | 57 % |
| grille détectée | réels, façon vieux disque | 24 % | 55 % | 15 % | 54 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
