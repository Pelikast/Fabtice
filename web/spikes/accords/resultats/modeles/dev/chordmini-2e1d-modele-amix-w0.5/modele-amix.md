# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (6 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 80 % | 77 % | 72 % | 35 % | 78 % | 30 % | 19 % | 93 % | 86 % | 86 % |
| grille détectée | synthèse, vieux disque | 7 | 67 % | 64 % | 60 % | 28 % | 63 % | 48 % | 20 % | 93 % | 72 % | 71 % |
| grille détectée | enregistrements réels | 4 | 98 % | 96 % | 88 % | 88 % | 96 % | — | 8 % | 90 % | 73 % | 100 % |
| grille détectée | réels, façon vieux disque | 4 | 95 % | 93 % | 83 % | 79 % | 93 % | — | 10 % | 71 % | 35 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 7 | 80 % | 72 % | 78 % | 30 % | 19 % | 86 % | 44 % |
| grille détectée | développement | synthèse, vieux disque | 7 | 67 % | 60 % | 63 % | 48 % | 20 % | 71 % | 57 % |
| grille détectée | développement | enregistrements réels | 4 | 98 % | 88 % | 96 % | — | 8 % | 100 % | 38 % |
| grille détectée | développement | réels, façon vieux disque | 4 | 95 % | 83 % | 93 % | — | 10 % | 75 % | 52 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 82 % | 75 % |
| grille détectée | synthèse, vieux disque | 71 % | 62 % |
| grille détectée | enregistrements réels | 97 % | 86 % |
| grille détectée | réels, façon vieux disque | 93 % | 80 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 97 % / 77 % |  | 86 % / 65 % |  |  |  |  |  |
| bossa | 98 % / 95 % |  | 95 % / 92 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 85 % |  | 92 % / 79 % |  |
| guitare-jazz |  |  |  |  | 98 % / 90 % |  | 98 % / 86 % |  |
| shuffle | 91 % / 87 % |  | 82 % / 77 % |  |  |  |  |  |
| swing | 67 % / 60 % |  | 51 % / 43 % |  |  |  |  |  |
| trad | 88 % / 77 % |  | 75 % / 66 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 24 % | 20 % | 4 % | 0 % |
| accord voisin (décalé d’un temps ou plus) | 19 % | 18 % | 8 % | 12 % |
| bonne fondamentale, septième ou sixte fausse | 15 % | 9 % | 67 % | 61 % |
| fondamentale à une tierce (mineure) | 8 % | 15 % | 0 % | 0 % |
| bonne fondamentale, famille fausse | 8 % | 8 % | 17 % | 9 % |
| fondamentale à un ton | 8 % | 12 % | 4 % | 6 % |
| fondamentale à un demi-ton | 8 % | 4 % | 0 % | 0 % |
| fondamentale au triton | 6 % | 4 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 3 % | 4 % | 0 % | 12 % |
| aucun accord | 0 % | 6 % | 0 % | 0 % |
| *temps faux / tous les temps* | 28 % | 40 % | 13 % | 17 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (22 %) · 7 → maj (15 %) · dim7 → dim (14 %) · maj7 → maj (9 %) · 7 → m7 (8 %) · maj → 7 (5 %) · 6 → maj (4 %) · m6 → m7 (4 %) · maj → maj7 (4 %) · m7b5 → m7 (4 %) · 6 → maj7 (3 %) · m7 → m (3 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 24 % | 52 % | 20 % | 44 % |
| grille détectée | synthèse, vieux disque | 42 % | 55 % | 29 % | 57 % |
| grille détectée | enregistrements réels | 25 % | 19 % | 10 % | 38 % |
| grille détectée | réels, façon vieux disque | 21 % | 41 % | 11 % | 52 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
