# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (5 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 83 % | 79 % | 73 % | 37 % | 82 % | 27 % | 16 % | 98 % | 94 % | 86 % |
| grille détectée | synthèse, vieux disque | 7 | 62 % | 57 % | 51 % | 32 % | 61 % | 47 % | 16 % | 90 % | 80 % | 57 % |
| grille détectée | enregistrements réels | 4 | 78 % | 78 % | 72 % | 68 % | 73 % | — | 15 % | 93 % | 75 % | 75 % |
| grille détectée | réels, façon vieux disque | 4 | 86 % | 86 % | 78 % | 65 % | 72 % | — | 17 % | 86 % | 50 % | 100 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | mis de côté | synthèse, son propre | 7 | 83 % | 73 % | 82 % | 27 % | 16 % | 86 % | 42 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 62 % | 51 % | 61 % | 47 % | 16 % | 57 % | 59 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 78 % | 72 % | 73 % | — | 15 % | 75 % | 76 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 86 % | 78 % | 72 % | — | 17 % | 100 % | 55 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 84 % | 75 % |
| grille détectée | synthèse, vieux disque | 64 % | 53 % |
| grille détectée | enregistrements réels | 83 % | 76 % |
| grille détectée | réels, façon vieux disque | 88 % | 80 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 91 % / 91 % |  | 94 % / 86 % |  |  |  |  |  |
| bossa | 86 % / 80 % |  | 48 % / 41 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 91 % |  | 98 % / 86 % |  |
| guitare-jazz |  |  |  |  | 57 % / 53 % |  | 74 % / 70 % |  |
| modal | 93 % / 88 % |  | 47 % / 32 % |  |  |  |  |  |
| swing | 56 % / 41 % |  | 32 % / 20 % |  |  |  |  |  |
| trad | 98 % / 96 % |  | 96 % / 93 % |  |  |  |  |  |
| waltz | 80 % / 57 % |  | 60 % / 44 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 22 % | 24 % | 0 % | 10 % |
| accord voisin (décalé d’un temps ou plus) | 18 % | 9 % | 7 % | 17 % |
| bonne fondamentale, septième ou sixte fausse | 17 % | 11 % | 20 % | 36 % |
| bonne fondamentale, famille fausse | 15 % | 8 % | 0 % | 0 % |
| fondamentale à une tierce (mineure) | 9 % | 13 % | 39 % | 0 % |
| fondamentale à une tierce (majeure) | 6 % | 4 % | 0 % | 0 % |
| fondamentale à un demi-ton | 5 % | 5 % | 0 % | 0 % |
| fondamentale à un ton | 4 % | 5 % | 2 % | 0 % |
| fondamentale au triton | 4 % | 1 % | 0 % | 0 % |
| aucun accord | 1 % | 18 % | 31 % | 38 % |
| *temps faux / tous les temps* | 27 % | 49 % | 28 % | 22 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (31 %) · m6 → m7 (11 %) · maj7 → 7 (10 %) · 7 → maj (9 %) · maj7 → maj (5 %) · m → m7 (5 %) · m(maj7) → m7 (4 %) · m7b5 → m7 (4 %) · m6 → m (4 %) · 6 → maj (3 %) · m(maj7) → m (3 %) · m7 → m (3 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 22 % | 52 % | 20 % | 42 % |
| grille détectée | synthèse, vieux disque | 40 % | 71 % | 33 % | 59 % |
| grille détectée | enregistrements réels | 21 % | 100 % | 9 % | 76 % |
| grille détectée | réels, façon vieux disque | 12 % | 100 % | 11 % | 55 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
