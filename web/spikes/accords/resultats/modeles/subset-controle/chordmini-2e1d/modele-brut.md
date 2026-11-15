# Banc accords — variante `modele-brut`

11 morceaux, mesuré le 2026-11-15 (1 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 68 % | 62 % | 57 % | 34 % | 68 % | 14 % | 51 % | 98 % | 94 % | 0 % |
| grille détectée | synthèse, vieux disque | 7 | 55 % | 50 % | 45 % | 29 % | 55 % | 22 % | 47 % | 90 % | 80 % | 0 % |
| grille détectée | enregistrements réels | 4 | 72 % | 72 % | 63 % | 62 % | 68 % | — | 46 % | 93 % | 75 % | 0 % |
| grille détectée | réels, façon vieux disque | 4 | 86 % | 86 % | 76 % | 59 % | 68 % | — | 35 % | 86 % | 50 % | 0 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | mis de côté | synthèse, son propre | 7 | 68 % | 57 % | 68 % | 14 % | 51 % | 0 % | 57 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 55 % | 45 % | 55 % | 22 % | 47 % | 0 % | 58 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 72 % | 63 % | 68 % | — | 46 % | 0 % | 37 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 86 % | 76 % | 68 % | — | 35 % | 0 % | 33 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 67 % | 56 % |
| grille détectée | synthèse, vieux disque | 55 % | 44 % |
| grille détectée | enregistrements réels | 76 % | 68 % |
| grille détectée | réels, façon vieux disque | 87 % | 77 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 75 % / 73 % |  | 73 % / 66 % |  |  |  |  |  |
| bossa | 54 % / 48 % |  | 42 % / 33 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 93 % / 84 % |  | 90 % / 76 % |  |
| guitare-jazz |  |  |  |  | 51 % / 42 % |  | 82 % / 76 % |  |
| modal | 47 % / 39 % |  | 32 % / 22 % |  |  |  |  |  |
| swing | 54 % / 39 % |  | 31 % / 18 % |  |  |  |  |  |
| trad | 96 % / 93 % |  | 90 % / 85 % |  |  |  |  |  |
| waltz | 72 % / 48 % |  | 60 % / 42 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 32 % | 32 % | 13 % | 20 % |
| fondamentale à une tierce (mineure) | 15 % | 16 % | 34 % | 0 % |
| bonne fondamentale, famille fausse | 12 % | 8 % | 0 % | 0 % |
| bonne fondamentale, septième ou sixte fausse | 11 % | 9 % | 24 % | 41 % |
| fondamentale à un ton | 10 % | 10 % | 4 % | 0 % |
| accord voisin (décalé d’un temps ou plus) | 8 % | 7 % | 7 % | 13 % |
| fondamentale à une tierce (majeure) | 5 % | 6 % | 0 % | 0 % |
| fondamentale à un demi-ton | 4 % | 3 % | 0 % | 0 % |
| fondamentale au triton | 3 % | 2 % | 0 % | 0 % |
| aucun accord | 1 % | 7 % | 18 % | 26 % |
| *temps faux / tous les temps* | 43 % | 55 % | 37 % | 24 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (25 %) · 7 → maj (12 %) · maj7 → maj (8 %) · m6 → m7 (8 %) · maj7 → 7 (7 %) · m7b5 → m7 (5 %) · m → m7 (5 %) · 7 → m7 (4 %) · m → 7 (4 %) · m6 → m (4 %) · 6 → maj (3 %) · m7 → maj (3 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 38 % | 65 % | 30 % | 57 % |
| grille détectée | synthèse, vieux disque | 44 % | 73 % | 42 % | 58 % |
| grille détectée | enregistrements réels | 17 % | 81 % | 28 % | 37 % |
| grille détectée | réels, façon vieux disque | 18 % | 43 % | 20 % | 33 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
