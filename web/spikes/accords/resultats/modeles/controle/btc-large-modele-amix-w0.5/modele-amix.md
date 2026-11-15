# Banc accords — variante `modele-amix`

11 morceaux, mesuré le 2026-11-15 (5 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 82 % | 79 % | 74 % | 36 % | 81 % | 26 % | 21 % | 98 % | 94 % | 86 % |
| grille détectée | synthèse, vieux disque | 7 | 63 % | 60 % | 52 % | 33 % | 62 % | 36 % | 19 % | 90 % | 80 % | 57 % |
| grille détectée | enregistrements réels | 4 | 78 % | 78 % | 70 % | 66 % | 77 % | — | 17 % | 93 % | 75 % | 75 % |
| grille détectée | réels, façon vieux disque | 4 | 94 % | 94 % | 82 % | 60 % | 72 % | — | 21 % | 86 % | 50 % | 100 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | mis de côté | synthèse, son propre | 7 | 82 % | 74 % | 81 % | 26 % | 21 % | 86 % | 39 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 63 % | 52 % | 62 % | 36 % | 19 % | 57 % | 52 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 78 % | 70 % | 77 % | — | 17 % | 75 % | 21 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 94 % | 82 % | 72 % | — | 21 % | 100 % | 23 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 83 % | 74 % |
| grille détectée | synthèse, vieux disque | 64 % | 52 % |
| grille détectée | enregistrements réels | 83 % | 74 % |
| grille détectée | réels, façon vieux disque | 94 % | 80 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 89 % / 89 % |  | 92 % / 84 % |  |  |  |  |  |
| bossa | 84 % / 76 % |  | 48 % / 41 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 86 % |  | 98 % / 78 % |  |
| guitare-jazz |  |  |  |  | 57 % / 53 % |  | 90 % / 85 % |  |
| modal | 89 % / 86 % |  | 41 % / 16 % |  |  |  |  |  |
| swing | 60 % / 50 % |  | 40 % / 28 % |  |  |  |  |  |
| trad | 97 % / 95 % |  | 98 % / 94 % |  |  |  |  |  |
| waltz | 79 % / 55 % |  | 65 % / 50 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 22 % | 27 % | 0 % | 6 % |
| accord voisin (décalé d’un temps ou plus) | 22 % | 9 % | 7 % | 26 % |
| bonne fondamentale, septième ou sixte fausse | 17 % | 16 % | 26 % | 66 % |
| bonne fondamentale, famille fausse | 13 % | 7 % | 0 % | 0 % |
| fondamentale à une tierce (mineure) | 7 % | 15 % | 50 % | 0 % |
| fondamentale à un ton | 5 % | 5 % | 2 % | 0 % |
| fondamentale à un demi-ton | 5 % | 5 % | 0 % | 0 % |
| fondamentale à une tierce (majeure) | 4 % | 3 % | 10 % | 0 % |
| fondamentale au triton | 3 % | 3 % | 2 % | 0 % |
| aucun accord | 2 % | 11 % | 3 % | 3 % |
| *temps faux / tous les temps* | 26 % | 48 % | 30 % | 18 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (23 %) · m7 → m (15 %) · maj7 → maj (12 %) · 7 → maj (11 %) · m6 → m7 (8 %) · m7b5 → m7 (5 %) · m → m7 (4 %) · m(maj7) → m7 (3 %) · m(maj7) → m (3 %) · dim7 → dim (3 %) · 6 → maj (3 %) · m6 → m (3 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 20 % | 50 % | 20 % | 39 % |
| grille détectée | synthèse, vieux disque | 33 % | 76 % | 34 % | 52 % |
| grille détectée | enregistrements réels | 6 % | 100 % | 26 % | 21 % |
| grille détectée | réels, façon vieux disque | 21 % | 20 % | 18 % | 23 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
