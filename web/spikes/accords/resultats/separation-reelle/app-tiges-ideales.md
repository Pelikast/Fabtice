# Banc accords — variante `app`

8 morceaux, mesuré le 2026-11-15 (12 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 8 | 90 % | 88 % | 82 % | 47 % | 87 % | 8 % | 18 % | 95 % | 90 % | 88 % |
| grille détectée | synthèse, vieux disque | 8 | 86 % | 84 % | 79 % | 43 % | 81 % | 23 % | 20 % | 91 % | 87 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 4 | 88 % | 84 % | 87 % | 11 % | 16 % | 100 % | 20 % |
| grille détectée | développement | synthèse, vieux disque | 4 | 85 % | 81 % | 80 % | 26 % | 24 % | 75 % | 21 % |
| grille détectée | mis de côté | synthèse, son propre | 4 | 93 % | 80 % | 87 % | 0 % | 19 % | 75 % | 51 % |
| grille détectée | mis de côté | synthèse, vieux disque | 4 | 86 % | 77 % | 83 % | 16 % | 16 % | 75 % | 46 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 90 % | 82 % |
| grille détectée | synthèse, vieux disque | 85 % | 78 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille |
|---|---|---|---|---|
| ballad | 93 % / 88 % |  | 94 % / 87 % |  |
| bossa | 85 % / 73 % |  | 65 % / 55 % |  |
| swing | 90 % / 80 % |  | 85 % / 78 % |  |
| trad | 93 % / 90 % |  | 95 % / 91 % |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée |
|---|---|---|
| bonne fondamentale, septième ou sixte fausse | 33 % | 24 % |
| fondamentale à la quinte / quarte | 22 % | 22 % |
| accord voisin (décalé d’un temps ou plus) | 20 % | 21 % |
| bonne fondamentale, famille fausse | 8 % | 5 % |
| fondamentale au triton | 7 % | 6 % |
| fondamentale à un demi-ton | 5 % | 6 % |
| fondamentale à une tierce (mineure) | 3 % | 9 % |
| fondamentale à une tierce (majeure) | 1 % | 3 % |
| fondamentale à un ton | 1 % | 2 % |
| aucun accord | 0 % | 3 % |
| *temps faux / tous les temps* | 18 % | 21 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m6 → m7 (24 %) · 6 → maj7 (16 %) · dim7 → dim (16 %) · m6 → m (6 %) · 7 → maj (5 %) · m7b5 → dim (4 %) · 7 → maj7 (4 %) · m6 → 6 (3 %) · m7b5 → m7 (3 %) · +7 → 7 (3 %) · m7 → 7 (2 %) · 6 → maj (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 12 % | 54 % | 13 % | 37 % |
| grille détectée | synthèse, vieux disque | 17 % | 42 % | 17 % | 34 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
