# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (5 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 78 % | 75 % | 70 % | 33 % | 77 % | 41 % | 17 % | 93 % | 86 % | 86 % |
| grille détectée | synthèse, vieux disque | 7 | 65 % | 62 % | 58 % | 28 % | 62 % | 54 % | 20 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 98 % | 96 % | 88 % | 88 % | 96 % | — | 6 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 91 % | 90 % | 77 % | 75 % | 90 % | — | 15 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 78 % | 70 % | 77 % | 41 % | 17 % | 86 % | 44 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 65 % | 58 % | 62 % | 54 % | 20 % | 71 % | 58 % |
| grille détectée | développement | enregistrements réels | 4 | 98 % | 88 % | 96 % | — | 6 % | 100 % | 57 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 91 % | 77 % | 90 % | — | 15 % | 75 % | 57 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 81 % | 73 % |
| grille détectée | synthèse, vieux disque | 70 % | 62 % |
| grille détectée | enregistrements réels | 98 % | 87 % |
| grille détectée | réels, façon vieux disque | 89 % | 74 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 97 % / 79 % |  | 91 % / 69 % |  |  |  |  |  |
| bossa | 97 % / 94 % |  | 90 % / 88 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 85 % |  | 89 % / 76 % |  |
| guitare-jazz |  |  |  |  | 99 % / 91 % |  | 94 % / 78 % |  |
| shuffle | 89 % / 80 % |  | 85 % / 78 % |  |  |  |  |  |
| swing | 65 % / 57 % |  | 47 % / 41 % |  |  |  |  |  |
| trad | 88 % / 74 % |  | 77 % / 69 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 24 % | 21 % | 4 % | 9 % |
| accord voisin (décalé d’un temps ou plus) | 19 % | 17 % | 4 % | 9 % |
| bonne fondamentale, septième ou sixte fausse | 15 % | 8 % | 70 % | 55 % |
| bonne fondamentale, famille fausse | 11 % | 7 % | 17 % | 7 % |
| fondamentale à un ton | 8 % | 12 % | 4 % | 5 % |
| fondamentale à une tierce (mineure) | 8 % | 15 % | 0 % | 0 % |
| fondamentale à un demi-ton | 6 % | 4 % | 0 % | 0 % |
| fondamentale au triton | 5 % | 3 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 4 % | 6 % | 0 % | 16 % |
| aucun accord | 0 % | 7 % | 0 % | 0 % |
| *temps faux / tous les temps* | 30 % | 42 % | 12 % | 23 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (24 %) · 7 → maj (15 %) · dim7 → dim (14 %) · 7 → m7 (7 %) · maj7 → maj (6 %) · maj → 7 (5 %) · 6 → maj7 (5 %) · m6 → m7 (4 %) · 7 → 6 (3 %) · 6 → maj (3 %) · m7 → m (2 %) · m7b5 → m7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 24 % | 55 % | 22 % | 44 % |
| grille détectée | synthèse, vieux disque | 39 % | 61 % | 29 % | 58 % |
| grille détectée | enregistrements réels | 19 % | 36 % | 6 % | 57 % |
| grille détectée | réels, façon vieux disque | 23 % | 56 % | 13 % | 57 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
