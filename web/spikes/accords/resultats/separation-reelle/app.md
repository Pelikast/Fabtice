# Banc accords — variante `app`

8 morceaux, mesuré le 2026-11-15 (13 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 8 | 87 % | 85 % | 79 % | 43 % | 84 % | 13 % | 21 % | 95 % | 90 % | 88 % |
| grille détectée | synthèse, vieux disque | 8 | 79 % | 77 % | 68 % | 37 % | 75 % | 23 % | 18 % | 91 % | 87 % | 75 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 4 | 86 % | 83 % | 84 % | 17 % | 16 % | 100 % | 20 % |
| grille détectée | développement | synthèse, vieux disque | 4 | 79 % | 71 % | 75 % | 27 % | 21 % | 75 % | 34 % |
| grille détectée | mis de côté | synthèse, son propre | 4 | 88 % | 75 % | 83 % | 0 % | 26 % | 75 % | 42 % |
| grille détectée | mis de côté | synthèse, vieux disque | 4 | 80 % | 66 % | 74 % | 12 % | 16 % | 75 % | 63 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 87 % | 79 % |
| grille détectée | synthèse, vieux disque | 78 % | 67 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille |
|---|---|---|---|---|
| ballad | 93 % / 89 % |  | 87 % / 76 % |  |
| bossa | 86 % / 73 % |  | 54 % / 40 % |  |
| swing | 84 % / 74 % |  | 78 % / 67 % |  |
| trad | 94 % / 92 % |  | 94 % / 85 % |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée |
|---|---|---|
| bonne fondamentale, septième ou sixte fausse | 27 % | 26 % |
| fondamentale à la quinte / quarte | 24 % | 21 % |
| accord voisin (décalé d’un temps ou plus) | 17 % | 13 % |
| bonne fondamentale, famille fausse | 8 % | 6 % |
| fondamentale au triton | 6 % | 3 % |
| fondamentale à une tierce (mineure) | 6 % | 11 % |
| fondamentale à un demi-ton | 5 % | 3 % |
| fondamentale à une tierce (majeure) | 4 % | 5 % |
| aucun accord | 1 % | 7 % |
| fondamentale à un ton | 1 % | 4 % |
| *temps faux / tous les temps* | 21 % | 32 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m6 → m7 (21 %) · dim7 → dim (12 %) · 7 → maj (11 %) · m7 → 7 (10 %) · 6 → maj7 (9 %) · m7 → m (6 %) · m6 → m (6 %) · m7b5 → dim (4 %) · 6 → maj (3 %) · 7 → m7 (2 %) · m7b5 → m7 (2 %) · +7 → 7 (2 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 14 % | 47 % | 16 % | 33 % |
| grille détectée | synthèse, vieux disque | 27 % | 59 % | 22 % | 49 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
