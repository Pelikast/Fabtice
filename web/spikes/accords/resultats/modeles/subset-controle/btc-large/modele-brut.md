# Banc accords — variante `modele-brut`

11 morceaux, mesuré le 2026-11-15 (1 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 70 % | 65 % | 58 % | 36 % | 70 % | 9 % | 50 % | 98 % | 94 % | 0 % |
| grille détectée | synthèse, vieux disque | 7 | 58 % | 53 % | 47 % | 33 % | 59 % | 16 % | 44 % | 90 % | 80 % | 0 % |
| grille détectée | enregistrements réels | 4 | 77 % | 77 % | 56 % | 52 % | 72 % | — | 29 % | 93 % | 75 % | 0 % |
| grille détectée | réels, façon vieux disque | 4 | 93 % | 93 % | 48 % | 43 % | 72 % | — | 27 % | 86 % | 50 % | 0 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | mis de côté | synthèse, son propre | 7 | 70 % | 58 % | 70 % | 9 % | 50 % | 0 % | 41 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 58 % | 47 % | 59 % | 16 % | 44 % | 0 % | 42 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 77 % | 56 % | 72 % | — | 29 % | 0 % | 16 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 93 % | 48 % | 72 % | — | 27 % | 0 % | 18 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 68 % | 56 % |
| grille détectée | synthèse, vieux disque | 57 % | 45 % |
| grille détectée | enregistrements réels | 81 % | 58 % |
| grille détectée | réels, façon vieux disque | 93 % | 51 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 78 % / 73 % |  | 72 % / 59 % |  |  |  |  |  |
| bossa | 62 % / 53 % |  | 43 % / 39 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 97 % / 61 % |  | 98 % / 44 % |  |
| guitare-jazz |  |  |  |  | 56 % / 50 % |  | 89 % / 53 % |  |
| modal | 36 % / 24 % |  | 23 % / 6 % |  |  |  |  |  |
| swing | 63 % / 49 % |  | 42 % / 27 % |  |  |  |  |  |
| trad | 97 % / 95 % |  | 98 % / 95 % |  |  |  |  |  |
| waltz | 73 % / 48 % |  | 63 % / 44 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 33 % | 34 % | 4 % | 5 % |
| bonne fondamentale, septième ou sixte fausse | 15 % | 10 % | 47 % | 87 % |
| accord voisin (décalé d’un temps ou plus) | 11 % | 7 % | 11 % | 3 % |
| bonne fondamentale, famille fausse | 11 % | 10 % | 0 % | 0 % |
| fondamentale à une tierce (mineure) | 10 % | 14 % | 31 % | 0 % |
| fondamentale à un ton | 8 % | 8 % | 2 % | 3 % |
| fondamentale à une tierce (majeure) | 6 % | 6 % | 4 % | 0 % |
| fondamentale à un demi-ton | 3 % | 5 % | 0 % | 0 % |
| fondamentale au triton | 2 % | 2 % | 0 % | 0 % |
| aucun accord | 1 % | 3 % | 2 % | 2 % |
| *temps faux / tous les temps* | 42 % | 53 % | 44 % | 52 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

maj7 → maj (18 %) · 7 → maj (16 %) · m7 → m (13 %) · m7 → 7 (12 %) · m7b5 → m7 (6 %) · m7 → maj (4 %) · 7 → m7 (4 %) · maj → 7 (3 %) · m6 → m (3 %) · m(maj7) → m (3 %) · 6 → maj (3 %) · m6 → m7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 26 % | 67 % | 33 % | 41 % |
| grille détectée | synthèse, vieux disque | 31 % | 72 % | 45 % | 42 % |
| grille détectée | enregistrements réels | 18 % | 41 % | 45 % | 16 % |
| grille détectée | réels, façon vieux disque | 10 % | 90 % | 47 % | 18 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
