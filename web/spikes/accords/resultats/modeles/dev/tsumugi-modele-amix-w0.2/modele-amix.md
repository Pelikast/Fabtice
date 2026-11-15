# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (6 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 84 % | 81 % | 79 % | 37 % | 82 % | 31 % | 12 % | 93 % | 86 % | 86 % |
| grille détectée | synthèse, vieux disque | 7 | 70 % | 67 % | 64 % | 31 % | 65 % | 48 % | 19 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 98 % | 96 % | 86 % | 86 % | 96 % | — | 6 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 92 % | 92 % | 80 % | 75 % | 91 % | — | 15 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 84 % | 79 % | 82 % | 31 % | 12 % | 86 % | 31 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 70 % | 64 % | 65 % | 48 % | 19 % | 71 % | 47 % |
| grille détectée | développement | enregistrements réels | 4 | 98 % | 86 % | 96 % | — | 6 % | 100 % | 74 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 92 % | 80 % | 91 % | — | 15 % | 75 % | 46 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 87 % | 82 % |
| grille détectée | synthèse, vieux disque | 74 % | 67 % |
| grille détectée | enregistrements réels | 98 % | 84 % |
| grille détectée | réels, façon vieux disque | 91 % | 77 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 99 % / 93 % |  | 93 % / 74 % |  |  |  |  |  |
| bossa | 97 % / 94 % |  | 91 % / 89 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 90 % |  | 89 % / 76 % |  |
| guitare-jazz |  |  |  |  | 99 % / 82 % |  | 96 % / 83 % |  |
| shuffle | 93 % / 89 % |  | 85 % / 81 % |  |  |  |  |  |
| swing | 75 % / 68 % |  | 55 % / 49 % |  |  |  |  |  |
| trad | 88 % / 82 % |  | 78 % / 73 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 23 % | 19 % | 4 % | 5 % |
| accord voisin (décalé d’un temps ou plus) | 21 % | 20 % | 7 % | 10 % |
| bonne fondamentale, famille fausse | 13 % | 8 % | 15 % | 0 % |
| bonne fondamentale, septième ou sixte fausse | 10 % | 7 % | 74 % | 62 % |
| fondamentale à une tierce (mineure) | 8 % | 16 % | 0 % | 0 % |
| fondamentale à un demi-ton | 7 % | 4 % | 0 % | 0 % |
| fondamentale au triton | 7 % | 5 % | 0 % | 0 % |
| fondamentale à un ton | 5 % | 10 % | 0 % | 5 % |
| fondamentale à une tierce (majeure) | 4 % | 6 % | 0 % | 18 % |
| aucun accord | 1 % | 5 % | 0 % | 0 % |
| *temps faux / tous les temps* | 21 % | 36 % | 14 % | 20 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (31 %) · 7 → maj (14 %) · dim7 → dim (14 %) · 7 → m7 (9 %) · 6 → maj (7 %) · maj7 → maj (7 %) · m6 → m7 (5 %) · maj → 7 (4 %) · 7 → 6 (3 %) · 6 → maj7 (2 %) · 7sus4 → 7 (2 %) · 7 → m7b5 (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 13 % | 51 % | 17 % | 31 % |
| grille détectée | synthèse, vieux disque | 28 % | 61 % | 26 % | 47 % |
| grille détectée | enregistrements réels | 18 % | 57 % | 4 % | 74 % |
| grille détectée | réels, façon vieux disque | 20 % | 46 % | 14 % | 46 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
