# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (6 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 83 % | 80 % | 77 % | 37 % | 81 % | 29 % | 15 % | 93 % | 86 % | 86 % |
| grille détectée | synthèse, vieux disque | 7 | 69 % | 66 % | 63 % | 30 % | 65 % | 52 % | 20 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 98 % | 96 % | 85 % | 85 % | 96 % | — | 8 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 91 % | 91 % | 79 % | 75 % | 90 % | — | 15 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 83 % | 77 % | 81 % | 29 % | 15 % | 86 % | 30 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 69 % | 63 % | 65 % | 52 % | 20 % | 71 % | 52 % |
| grille détectée | développement | enregistrements réels | 4 | 98 % | 85 % | 96 % | — | 8 % | 100 % | 89 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 91 % | 79 % | 90 % | — | 15 % | 75 % | 49 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 86 % | 80 % |
| grille détectée | synthèse, vieux disque | 73 % | 66 % |
| grille détectée | enregistrements réels | 97 % | 84 % |
| grille détectée | réels, façon vieux disque | 89 % | 76 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 99 % / 93 % |  | 93 % / 76 % |  |  |  |  |  |
| bossa | 97 % / 94 % |  | 91 % / 89 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 89 % |  | 89 % / 76 % |  |
| guitare-jazz |  |  |  |  | 99 % / 82 % |  | 94 % / 81 % |  |
| shuffle | 91 % / 85 % |  | 88 % / 79 % |  |  |  |  |  |
| swing | 73 % / 67 % |  | 52 % / 46 % |  |  |  |  |  |
| trad | 88 % / 79 % |  | 80 % / 73 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 23 % | 21 % | 4 % | 10 % |
| accord voisin (décalé d’un temps ou plus) | 22 % | 20 % | 11 % | 10 % |
| bonne fondamentale, famille fausse | 12 % | 6 % | 14 % | 0 % |
| bonne fondamentale, septième ou sixte fausse | 11 % | 9 % | 71 % | 59 % |
| fondamentale à une tierce (mineure) | 9 % | 16 % | 0 % | 0 % |
| fondamentale au triton | 7 % | 5 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 6 % | 4 % | 0 % | 17 % |
| fondamentale à un demi-ton | 5 % | 3 % | 0 % | 0 % |
| fondamentale à un ton | 4 % | 11 % | 0 % | 5 % |
| aucun accord | 0 % | 5 % | 0 % | 0 % |
| *temps faux / tous les temps* | 23 % | 37 % | 15 % | 21 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (25 %) · dim7 → dim (18 %) · 7 → maj (13 %) · 7 → m7 (8 %) · 6 → maj (7 %) · maj7 → maj (6 %) · maj → 7 (6 %) · m6 → m7 (5 %) · 7 → 6 (3 %) · 6 → maj7 (2 %) · 7 → maj7 (2 %) · 7sus4 → 7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 14 % | 50 % | 19 % | 30 % |
| grille détectée | synthèse, vieux disque | 31 % | 63 % | 26 % | 52 % |
| grille détectée | enregistrements réels | 21 % | 63 % | 2 % | 89 % |
| grille détectée | réels, façon vieux disque | 20 % | 51 % | 14 % | 49 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
