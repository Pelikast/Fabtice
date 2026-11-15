# Banc accords — variante `app`

8 morceaux, mesuré le 2026-11-15 (12 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 8 | 87 % | 85 % | 78 % | 42 % | 85 % | 12 % | 23 % | 95 % | 90 % | 88 % |
| grille détectée | synthèse, vieux disque | 8 | 77 % | 74 % | 66 % | 37 % | 73 % | 28 % | 18 % | 91 % | 87 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 4 | 86 % | 81 % | 85 % | 16 % | 18 % | 100 % | 18 % |
| grille détectée | développement | synthèse, vieux disque | 4 | 77 % | 71 % | 74 % | 36 % | 18 % | 75 % | 37 % |
| grille détectée | mis de côté | synthèse, son propre | 4 | 88 % | 74 % | 86 % | 0 % | 28 % | 75 % | 34 % |
| grille détectée | mis de côté | synthèse, vieux disque | 4 | 77 % | 60 % | 72 % | 8 % | 19 % | 75 % | 56 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 86 % | 77 % |
| grille détectée | synthèse, vieux disque | 76 % | 65 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille |
|---|---|---|---|---|
| ballad | 90 % / 81 % |  | 84 % / 77 % |  |
| bossa | 83 % / 66 % |  | 54 % / 40 % |  |
| swing | 84 % / 75 % |  | 74 % / 62 % |  |
| trad | 94 % / 90 % |  | 96 % / 87 % |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée |
|---|---|---|
| bonne fondamentale, septième ou sixte fausse | 30 % | 22 % |
| fondamentale à la quinte / quarte | 23 % | 23 % |
| accord voisin (décalé d’un temps ou plus) | 17 % | 14 % |
| bonne fondamentale, famille fausse | 8 % | 8 % |
| fondamentale au triton | 5 % | 4 % |
| fondamentale à une tierce (mineure) | 5 % | 10 % |
| fondamentale à une tierce (majeure) | 4 % | 5 % |
| fondamentale à un demi-ton | 4 % | 4 % |
| fondamentale à un ton | 2 % | 6 % |
| aucun accord | 2 % | 3 % |
| *temps faux / tous les temps* | 22 % | 34 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m6 → m7 (22 %) · dim7 → dim (11 %) · 6 → maj7 (10 %) · 7 → maj (10 %) · m7 → 7 (8 %) · m6 → m (6 %) · m7 → m (6 %) · 6 → maj (4 %) · 7 → maj7 (3 %) · m6 → 6 (2 %) · m7b5 → m7 (2 %) · +7 → 7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 13 % | 45 % | 19 % | 27 % |
| grille détectée | synthèse, vieux disque | 28 % | 57 % | 25 % | 47 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
