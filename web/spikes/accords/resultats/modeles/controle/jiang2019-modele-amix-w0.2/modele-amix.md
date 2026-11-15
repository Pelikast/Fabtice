# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (6 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 83 % | 75 % | 69 % | 36 % | 82 % | 33 % | 14 % | 98 % | 94 % | 86 % |
| grille détectée | synthèse, vieux disque | 7 | 62 % | 58 % | 48 % | 31 % | 61 % | 60 % | 15 % | 90 % | 80 % | 57 % |
| grille détectée | enregistrements réels | 4 | 78 % | 78 % | 72 % | 68 % | 75 % | — | 17 % | 93 % | 75 % | 75 % |
| grille détectée | réels, façon vieux disque | 4 | 83 % | 83 % | 80 % | 69 % | 73 % | — | 19 % | 86 % | 50 % | 100 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | mis de côté | synthèse, son propre | 7 | 83 % | 69 % | 82 % | 33 % | 14 % | 86 % | 44 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 62 % | 48 % | 61 % | 60 % | 15 % | 57 % | 56 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 78 % | 72 % | 75 % | — | 17 % | 75 % | 74 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 83 % | 80 % | 73 % | — | 19 % | 100 % | 67 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 84 % | 71 % |
| grille détectée | synthèse, vieux disque | 64 % | 49 % |
| grille détectée | enregistrements réels | 83 % | 77 % |
| grille détectée | réels, façon vieux disque | 86 % | 83 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 92 % / 91 % |  | 93 % / 85 % |  |  |  |  |  |
| bossa | 92 % / 79 % |  | 54 % / 39 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 92 % |  | 98 % / 95 % |  |
| guitare-jazz |  |  |  |  | 57 % / 53 % |  | 69 % / 65 % |  |
| modal | 95 % / 78 % |  | 46 % / 25 % |  |  |  |  |  |
| swing | 54 % / 35 % |  | 34 % / 23 % |  |  |  |  |  |
| trad | 97 % / 92 % |  | 97 % / 89 % |  |  |  |  |  |
| waltz | 76 % / 53 % |  | 58 % / 37 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| bonne fondamentale, famille fausse | 25 % | 7 % | 0 % | 0 % |
| fondamentale à la quinte / quarte | 17 % | 22 % | 4 % | 0 % |
| accord voisin (décalé d’un temps ou plus) | 16 % | 9 % | 8 % | 13 % |
| bonne fondamentale, septième ou sixte fausse | 16 % | 19 % | 19 % | 18 % |
| fondamentale à un ton | 6 % | 7 % | 2 % | 0 % |
| fondamentale à une tierce (mineure) | 6 % | 15 % | 49 % | 0 % |
| fondamentale à une tierce (majeure) | 5 % | 4 % | 6 % | 0 % |
| fondamentale à un demi-ton | 4 % | 5 % | 2 % | 0 % |
| fondamentale au triton | 4 % | 1 % | 8 % | 0 % |
| aucun accord | 0 % | 11 % | 4 % | 69 % |
| *temps faux / tous les temps* | 31 % | 52 % | 28 % | 20 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (32 %) · 7 → maj (14 %) · m7 → m (9 %) · maj7 → 7 (7 %) · m6 → m7 (7 %) · dim7 → dim (4 %) · m6 → 7 (3 %) · 6 → maj (3 %) · m(maj7) → m7 (3 %) · m6 → m (3 %) · maj7 → maj (2 %) · m(maj7) → m (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 25 % | 55 % | 23 % | 44 % |
| grille détectée | synthèse, vieux disque | 40 % | 73 % | 38 % | 56 % |
| grille détectée | enregistrements réels | 24 % | 83 % | 10 % | 74 % |
| grille détectée | réels, façon vieux disque | 18 % | 76 % | 8 % | 67 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
