# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (5 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 91 % | 89 % | 88 % | 41 % | 86 % | 12 % | 7 % | 93 % | 86 % | 100 % |
| grille détectée | synthèse, vieux disque | 7 | 80 % | 76 % | 74 % | 33 % | 74 % | 34 % | 15 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 95 % | 95 % | 84 % | 84 % | 97 % | — | 13 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 95 % | 95 % | 89 % | 85 % | 97 % | — | 13 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 91 % | 88 % | 86 % | 12 % | 7 % | 100 % | 12 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 80 % | 74 % | 74 % | 34 % | 15 % | 71 % | 37 % |
| grille détectée | développement | enregistrements réels | 4 | 95 % | 84 % | 97 % | — | 13 % | 100 % | 0 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 95 % | 89 % | 97 % | — | 13 % | 75 % | 0 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 91 % | 89 % |
| grille détectée | synthèse, vieux disque | 83 % | 78 % |
| grille détectée | enregistrements réels | 94 % | 82 % |
| grille détectée | réels, façon vieux disque | 93 % | 86 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 100 % / 100 % |  | 98 % / 91 % |  |  |  |  |  |
| bossa | 99 % / 98 % |  | 96 % / 93 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 93 % |  | 96 % / 96 % |  |
| guitare-jazz |  |  |  |  | 94 % / 76 % |  | 94 % / 81 % |  |
| shuffle | 93 % / 90 % |  | 98 % / 95 % |  |  |  |  |  |
| swing | 86 % / 83 % |  | 71 % / 64 % |  |  |  |  |  |
| trad | 91 % / 88 % |  | 72 % / 62 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 24 % | 22 % | 17 % | 23 % |
| accord voisin (décalé d’un temps ou plus) | 22 % | 21 % | 13 % | 18 % |
| fondamentale à une tierce (mineure) | 19 % | 15 % | 0 % | 0 % |
| bonne fondamentale, septième ou sixte fausse | 9 % | 9 % | 70 % | 55 % |
| bonne fondamentale, famille fausse | 9 % | 12 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 7 % | 6 % | 0 % | 0 % |
| fondamentale au triton | 6 % | 5 % | 0 % | 0 % |
| fondamentale à un ton | 2 % | 6 % | 0 % | 5 % |
| fondamentale à un demi-ton | 2 % | 5 % | 0 % | 0 % |
| aucun accord | 0 % | 1 % | 0 % | 0 % |
| *temps faux / tous les temps* | 12 % | 26 % | 16 % | 11 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (25 %) · maj → 7 (24 %) · 7 → m7 (15 %) · 7 → maj (8 %) · 6 → maj (6 %) · dim7 → dim (5 %) · m7 → m7b5 (4 %) · m6 → m7 (4 %) · 7 → 6 (3 %) · 6 → maj7 (2 %) · 7 → maj7 (2 %) · 6 → 7 (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 3 % | 49 % | 11 % | 12 % |
| grille détectée | synthèse, vieux disque | 16 % | 60 % | 20 % | 37 % |
| grille détectée | enregistrements réels | 0 % | — | 16 % | 0 % |
| grille détectée | réels, façon vieux disque | 0 % | — | 11 % | 0 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
