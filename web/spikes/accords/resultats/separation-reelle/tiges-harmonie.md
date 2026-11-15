# Banc accords — variante `tiges-harmonie`

8 morceaux, mesuré le 2026-11-15 (4 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 8 | 76 % | 71 % | 65 % | 40 % | 77 % | 46 % | 12 % | 95 % | 90 % | 63 % |
| grille détectée | synthèse, vieux disque | 8 | 70 % | 66 % | 59 % | 36 % | 70 % | 51 % | 13 % | 91 % | 87 % | 50 % |

Développement (réglages faits dessus) et morceaux mis de côté (jamais regardés pour régler), voir `banc/partage.json` :

| Grille | Partie | Son | Morceaux | Fondamentale | Couleur | Basse | Accords manqués | Accords en trop | Tonalité | Erreurs signalées |
|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | développement | synthèse, son propre | 4 | 77 % | 68 % | 79 % | 59 % | 8 % | 75 % | 43 % |
| grille détectée | développement | synthèse, vieux disque | 4 | 72 % | 64 % | 74 % | 63 % | 6 % | 50 % | 36 % |
| grille détectée | mis de côté | synthèse, son propre | 4 | 74 % | 61 % | 74 % | 12 % | 16 % | 50 % | 64 % |
| grille détectée | mis de côté | synthèse, vieux disque | 4 | 66 % | 54 % | 66 % | 16 % | 19 % | 50 % | 68 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | synthèse, son propre | 76 % | 66 % |
| grille détectée | synthèse, vieux disque | 70 % | 60 % |

## Par style (fondamentale / couleur, par temps)

| Style | synthèse, son propre, grille détectée | synthèse, son propre, vraie grille | synthèse, vieux disque, grille détectée | synthèse, vieux disque, vraie grille |
|---|---|---|---|---|
| ballad | 93 % / 84 % |  | 93 % / 83 % |  |
| bossa | 84 % / 74 % |  | 63 % / 48 % |  |
| swing | 65 % / 54 % |  | 58 % / 49 % |  |
| trad | 90 % / 78 % |  | 92 % / 79 % |  |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | synthèse, son propre, grille détectée | synthèse, vieux disque, grille détectée |
|---|---|---|
| fondamentale à la quinte / quarte | 23 % | 26 % |
| accord voisin (décalé d’un temps ou plus) | 23 % | 21 % |
| bonne fondamentale, septième ou sixte fausse | 17 % | 14 % |
| bonne fondamentale, famille fausse | 11 % | 8 % |
| fondamentale à une tierce (mineure) | 10 % | 11 % |
| fondamentale à un demi-ton | 6 % | 6 % |
| fondamentale à une tierce (majeure) | 4 % | 5 % |
| fondamentale à un ton | 4 % | 4 % |
| fondamentale au triton | 2 % | 4 % |
| *temps faux / tous les temps* | 35 % | 41 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

m7 → 7 (15 %) · m6 → m7 (15 %) · 7 → maj (14 %) · m → maj (9 %) · dim7 → dim (6 %) · m6 → m (6 %) · m7 → m (4 %) · 6 → maj (4 %) · 6 → maj7 (3 %) · 7 → m7 (3 %) · 7 → maj7 (3 %) · maj7 → 7 (3 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | synthèse, son propre | 34 % | 55 % | 25 % | 54 % |
| grille détectée | synthèse, vieux disque | 39 % | 55 % | 31 % | 53 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
