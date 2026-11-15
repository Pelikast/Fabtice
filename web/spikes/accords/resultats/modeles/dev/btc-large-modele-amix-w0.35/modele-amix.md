# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (5 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 80 % | 76 % | 71 % | 34 % | 78 % | 29 % | 20 % | 93 % | 86 % | 86 % |
| grille détectée | synthèse, vieux disque | 7 | 68 % | 64 % | 60 % | 29 % | 65 % | 46 % | 22 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 98 % | 96 % | 88 % | 88 % | 96 % | — | 8 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 86 % | 85 % | 74 % | 72 % | 85 % | — | 13 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 80 % | 71 % | 78 % | 29 % | 20 % | 86 % | 37 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 68 % | 60 % | 65 % | 46 % | 22 % | 71 % | 53 % |
| grille détectée | développement | enregistrements réels | 4 | 98 % | 88 % | 96 % | — | 8 % | 100 % | 21 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 86 % | 74 % | 85 % | — | 13 % | 75 % | 59 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 82 % | 73 % |
| grille détectée | synthèse, vieux disque | 71 % | 63 % |
| grille détectée | enregistrements réels | 97 % | 86 % |
| grille détectée | réels, façon vieux disque | 84 % | 72 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 96 % / 73 % |  | 90 % / 73 % |  |  |  |  |  |
| bossa | 97 % / 94 % |  | 90 % / 88 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 84 % |  | 79 % / 67 % |  |
| guitare-jazz |  |  |  |  | 99 % / 91 % |  | 94 % / 82 % |  |
| shuffle | 88 % / 81 % |  | 81 % / 76 % |  |  |  |  |  |
| swing | 68 % / 59 % |  | 51 % / 44 % |  |  |  |  |  |
| trad | 86 % / 74 % |  | 80 % / 66 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 23 % | 21 % | 4 % | 24 % |
| accord voisin (décalé d’un temps ou plus) | 20 % | 16 % | 8 % | 6 % |
| bonne fondamentale, septième ou sixte fausse | 18 % | 11 % | 67 % | 41 % |
| fondamentale à une tierce (mineure) | 10 % | 18 % | 0 % | 0 % |
| bonne fondamentale, famille fausse | 9 % | 8 % | 17 % | 6 % |
| fondamentale à un demi-ton | 7 % | 3 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 5 % | 6 % | 0 % | 18 % |
| fondamentale à un ton | 4 % | 9 % | 4 % | 4 % |
| fondamentale au triton | 4 % | 3 % | 0 % | 0 % |
| aucun accord | 0 % | 5 % | 0 % | 0 % |
| *temps faux / tous les temps* | 29 % | 40 % | 13 % | 26 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (20 %) · 7 → maj (18 %) · dim7 → dim (13 %) · maj7 → maj (9 %) · 7 → m7 (7 %) · 6 → maj (6 %) · maj → 7 (6 %) · maj → maj7 (5 %) · m6 → m7 (4 %) · 7 → 6 (3 %) · m7 → m (2 %) · 7sus4 → 7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 19 % | 59 % | 23 % | 37 % |
| grille détectée | synthèse, vieux disque | 38 % | 57 % | 30 % | 53 % |
| grille détectée | enregistrements réels | 17 % | 16 % | 12 % | 21 % |
| grille détectée | réels, façon vieux disque | 26 % | 58 % | 14 % | 59 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
