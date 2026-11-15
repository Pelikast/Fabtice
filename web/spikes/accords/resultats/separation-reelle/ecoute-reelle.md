# Banc accords — variante `ecoute-reelle`

8 morceaux, mesuré le 2026-11-15 (7 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 8 | 77 % | 71 % | 63 % | 36 % | 78 % | 32 % | 24 % | 95 % | 90 % | 63 % |
| grille détectée | synthèse, vieux disque | 8 | 65 % | 60 % | 50 % | 30 % | 65 % | 45 % | 16 % | 91 % | 87 % | 50 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 4 | 79 % | 68 % | 81 % | 39 % | 17 % | 75 % | 67 % |
| grille détectée | développement | synthèse, vieux disque | 4 | 70 % | 57 % | 71 % | 56 % | 11 % | 50 % | 99 % |
| grille détectée | mis de côté | synthèse, son propre | 4 | 75 % | 58 % | 75 % | 12 % | 31 % | 50 % | 90 % |
| grille détectée | mis de côté | synthèse, vieux disque | 4 | 59 % | 43 % | 58 % | 16 % | 21 % | 50 % | 100 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 77 % | 64 % |
| grille détectée | synthèse, vieux disque | 65 % | 51 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille |
|---|---|---|---|---|
| ballad | 88 % / 79 % |  | 82 % / 75 % |  |
| bossa | 82 % / 62 % |  | 54 % / 40 % |  |
| swing | 69 % / 55 % |  | 54 % / 40 % |  |
| trad | 90 % / 78 % |  | 91 % / 69 % |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée |
|---|---|---|
| fondamentale à la quinte / quarte | 24 % | 24 % |
| bonne fondamentale, septième ou sixte fausse | 19 % | 18 % |
| accord voisin (décalé d’un temps ou plus) | 16 % | 13 % |
| bonne fondamentale, famille fausse | 16 % | 10 % |
| fondamentale à une tierce (majeure) | 7 % | 7 % |
| fondamentale à une tierce (mineure) | 5 % | 10 % |
| fondamentale à un demi-ton | 5 % | 4 % |
| fondamentale à un ton | 3 % | 7 % |
| aucun accord | 2 % | 5 % |
| fondamentale au triton | 2 % | 2 % |
| *temps faux / tous les temps* | 37 % | 50 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (17 %) · 7 → maj (16 %) · m7 → m (8 %) · m6 → m7 (8 %) · m → maj (6 %) · dim7 → dim (5 %) · maj7 → maj (4 %) · 6 → maj7 (3 %) · 7 → m7 (3 %) · 7 → maj7 (3 %) · m7b5 → 7 (3 %) · maj7 → 7 (3 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 60 % | 48 % | 19 % | 80 % |
| grille détectée | synthèse, vieux disque | 98 % | 51 % | 15 % | 99 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
