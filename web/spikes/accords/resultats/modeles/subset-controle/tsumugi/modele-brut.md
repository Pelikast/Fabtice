# Banc accords — variante `modele-brut`

11 morceaux, mesuré le 2026-11-15 (1 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 7 | 89 % | 86 % | 84 % | 58 % | 92 % | 18 % | 12 % | 98 % | 94 % | 0 % |
| grille détectée | synthèse, vieux disque | 7 | 85 % | 78 % | 75 % | 47 % | 83 % | 16 % | 27 % | 90 % | 80 % | 0 % |
| grille détectée | enregistrements réels | 4 | 78 % | 78 % | 75 % | 74 % | 93 % | — | 29 % | 93 % | 75 % | 0 % |
| grille détectée | réels, façon vieux disque | 4 | 88 % | 88 % | 84 % | 74 % | 83 % | — | 21 % | 86 % | 50 % | 0 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | mis de côté | synthèse, son propre | 7 | 89 % | 84 % | 92 % | 18 % | 12 % | 0 % | 51 % |
| grille détectée | mis de côté | synthèse, vieux disque | 7 | 85 % | 75 % | 83 % | 16 % | 27 % | 0 % | 53 % |
| grille détectée | mis de côté | enregistrements réels | 4 | 78 % | 75 % | 93 % | — | 29 % | 0 % | 8 % |
| grille détectée | mis de côté | réels, façon vieux disque | 4 | 88 % | 84 % | 83 % | — | 21 % | 0 % | 20 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 88 % | 83 % |
| grille détectée | synthèse, vieux disque | 85 % | 75 % |
| grille détectée | enregistrements réels | 82 % | 80 % |
| grille détectée | réels, façon vieux disque | 90 % | 86 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|---|---|---|---|
| ballad | 96 % / 96 % |  | 100 % / 97 % |  |  |  |  |  |
| bossa | 98 % / 97 % |  | 86 % / 84 % |  |  |  |  |  |
| guitare-bossa |  |  |  |  | 98 % / 95 % |  | 98 % / 95 % |  |
| guitare-jazz |  |  |  |  | 58 % / 55 % |  | 78 % / 74 % |  |
| modal | 82 % / 81 % |  | 83 % / 56 % |  |  |  |  |  |
| swing | 84 % / 76 % |  | 76 % / 64 % |  |  |  |  |  |
| trad | 100 % / 100 % |  | 99 % / 98 % |  |  |  |  |  |
| waltz | 77 % / 60 % |  | 70 % / 58 % |  |  |  |  |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée |
|---|---|---|---|---|
| fondamentale à la quinte / quarte | 27 % | 18 % | 6 % | 0 % |
| bonne fondamentale, famille fausse | 17 % | 26 % | 2 % | 0 % |
| accord voisin (décalé d’un temps ou plus) | 14 % | 12 % | 13 % | 20 % |
| fondamentale à un demi-ton | 13 % | 11 % | 0 % | 0 % |
| bonne fondamentale, septième ou sixte fausse | 12 % | 11 % | 10 % | 23 % |
| fondamentale au triton | 6 % | 6 % | 2 % | 3 % |
| fondamentale à un ton | 6 % | 5 % | 42 % | 10 % |
| fondamentale à une tierce (mineure) | 4 % | 7 % | 2 % | 3 % |
| fondamentale à une tierce (majeure) | 1 % | 5 % | 19 % | 33 % |
| aucun accord | 0 % | 0 % | 4 % | 7 % |
| *temps faux / tous les temps* | 16 % | 25 % | 25 % | 16 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (46 %) · m → m7 (11 %) · m(maj7) → m7 (5 %) · 6 → maj7 (3 %) · m6 → maj7 (3 %) · m6 → m7 (3 %) · maj7 → 7 (3 %) · 6 → maj (3 %) · m7 → m7b5 (2 %) · m7 → m6 (2 %) · 7 → maj (2 %) · 7 → m7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 14 % | 57 % | 9 % | 51 % |
| grille détectée | synthèse, vieux disque | 25 % | 53 % | 16 % | 53 % |
| grille détectée | enregistrements réels | 5 % | 44 % | 24 % | 8 % |
| grille détectée | réels, façon vieux disque | 5 % | 60 % | 13 % | 20 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
