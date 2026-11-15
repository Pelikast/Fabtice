# Banc accords — variante `modele-brut`

11 morceaux, mesuré le 2026-11-15 (1 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 85 % | 81 % | 78 % | 54 % | 87 % | 9 % | 25 % | 98 % | 94 % | 0 % |
| grille détectée | synthèse, vieux disque | 7 | 81 % | 68 % | 65 % | 43 % | 80 % | 10 % | 36 % | 90 % | 80 % | 0 % |
| grille détectée | enregistrements réels | 4 | 80 % | 80 % | 77 % | 75 % | 92 % | — | 31 % | 93 % | 75 % | 0 % |
| grille détectée | réels, façon vieux disque | 4 | 88 % | 88 % | 84 % | 73 % | 82 % | — | 23 % | 86 % | 50 % | 0 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | mis de côté | synthèse, son propre | 7 | 85 % | 78 % | 87 % | 9 % | 25 % | 0 % | 52 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 81 % | 65 % | 80 % | 10 % | 36 % | 0 % | 70 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 80 % | 77 % | 92 % | — | 31 % | 0 % | 25 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 88 % | 84 % | 82 % | — | 23 % | 0 % | 23 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 84 % | 77 % |
| grille détectée | synthèse, vieux disque | 81 % | 65 % |
| grille détectée | enregistrements réels | 84 % | 81 % |
| grille détectée | réels, façon vieux disque | 89 % | 85 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 95 % / 95 % |  | 99 % / 98 % |  |  |  |  |  |
| bossa | 93 % / 90 % |  | 80 % / 78 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 95 % |  | 98 % / 95 % |  |
| guitare-jazz |  |  |  |  | 63 % / 59 % |  | 77 % / 73 % |  |
| modal | 65 % / 63 % |  | 80 % / 21 % |  |  |  |  |  |
| swing | 82 % / 70 % |  | 72 % / 59 % |  |  |  |  |  |
| trad | 99 % / 99 % |  | 97 % / 96 % |  |  |  |  |  |
| waltz | 76 % / 58 % |  | 64 % / 48 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 27 % | 16 % | 7 % | 0 % |
| accord voisin (décalé d’un temps ou plus) | 19 % | 11 % | 14 % | 16 % |
| bonne fondamentale, famille fausse | 16 % | 34 % | 2 % | 0 % |
| bonne fondamentale, septième ou sixte fausse | 10 % | 7 % | 11 % | 23 % |
| fondamentale à un demi-ton | 8 % | 8 % | 0 % | 0 % |
| fondamentale à une tierce (mineure) | 8 % | 8 % | 2 % | 6 % |
| fondamentale au triton | 7 % | 8 % | 2 % | 3 % |
| fondamentale à un ton | 4 % | 4 % | 36 % | 10 % |
| fondamentale à une tierce (majeure) | 1 % | 3 % | 20 % | 35 % |
| aucun accord | 0 % | 1 % | 5 % | 6 % |
| *temps faux / tous les temps* | 22 % | 35 % | 23 % | 16 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (62 %) · m → m7 (7 %) · m(maj7) → m7 (4 %) · 7 → m7 (4 %) · maj7 → 7 (3 %) · m6 → m7 (3 %) · m7 → m6 (2 %) · 6 → maj (2 %) · 7 → maj (2 %) · 6 → maj7 (1 %) · m → 7 (1 %) · m6 → maj7 (1 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 24 % | 47 % | 14 % | 52 % |
| grille détectée | synthèse, vieux disque | 37 % | 66 % | 16 % | 70 % |
| grille détectée | enregistrements réels | 9 % | 61 % | 19 % | 25 % |
| grille détectée | réels, façon vieux disque | 7 % | 54 % | 13 % | 23 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
