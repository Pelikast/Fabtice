# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (6 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 79 % | 75 % | 71 % | 34 % | 77 % | 40 % | 18 % | 93 % | 86 % | 86 % |
| grille détectée | synthèse, vieux disque | 7 | 67 % | 64 % | 60 % | 29 % | 63 % | 52 % | 20 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 98 % | 96 % | 88 % | 88 % | 96 % | — | 6 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 92 % | 91 % | 78 % | 75 % | 91 % | — | 15 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 79 % | 71 % | 77 % | 40 % | 18 % | 86 % | 42 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 67 % | 60 % | 63 % | 52 % | 20 % | 71 % | 54 % |
| grille détectée | développement | enregistrements réels | 4 | 98 % | 88 % | 96 % | — | 6 % | 100 % | 57 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 92 % | 78 % | 91 % | — | 15 % | 75 % | 55 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 82 % | 74 % |
| grille détectée | synthèse, vieux disque | 71 % | 63 % |
| grille détectée | enregistrements réels | 98 % | 87 % |
| grille détectée | réels, façon vieux disque | 90 % | 75 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 98 % / 78 % |  | 89 % / 68 % |  |  |  |  |  |
| bossa | 97 % / 94 % |  | 91 % / 88 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 85 % |  | 89 % / 76 % |  |
| guitare-jazz |  |  |  |  | 99 % / 91 % |  | 96 % / 80 % |  |
| shuffle | 90 % / 81 % |  | 84 % / 79 % |  |  |  |  |  |
| swing | 66 % / 59 % |  | 51 % / 44 % |  |  |  |  |  |
| trad | 88 % / 77 % |  | 76 % / 68 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 25 % | 21 % | 4 % | 5 % |
| accord voisin (décalé d’un temps ou plus) | 19 % | 18 % | 4 % | 10 % |
| bonne fondamentale, septième ou sixte fausse | 14 % | 8 % | 70 % | 57 % |
| bonne fondamentale, famille fausse | 11 % | 8 % | 17 % | 7 % |
| fondamentale à un ton | 8 % | 11 % | 4 % | 5 % |
| fondamentale à une tierce (mineure) | 8 % | 15 % | 0 % | 0 % |
| fondamentale à un demi-ton | 6 % | 4 % | 0 % | 0 % |
| fondamentale au triton | 6 % | 4 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 4 % | 4 % | 0 % | 17 % |
| aucun accord | 0 % | 8 % | 0 % | 0 % |
| *temps faux / tous les temps* | 29 % | 40 % | 12 % | 22 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (24 %) · 7 → maj (16 %) · dim7 → dim (14 %) · 7 → m7 (9 %) · maj7 → maj (7 %) · 6 → maj7 (4 %) · m6 → m7 (4 %) · m7b5 → m7 (4 %) · maj → 7 (3 %) · 6 → maj (3 %) · maj → maj7 (2 %) · 7sus4 → 7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 24 % | 51 % | 22 % | 42 % |
| grille détectée | synthèse, vieux disque | 38 % | 57 % | 29 % | 54 % |
| grille détectée | enregistrements réels | 23 % | 30 % | 7 % | 57 % |
| grille détectée | réels, façon vieux disque | 21 % | 56 % | 13 % | 55 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
