# Banc accords — variante `modele-app`

1 morceaux, mesuré le 2026-11-15 (0 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | enregistrements réels | 1 | 94 % | 94 % | 69 % | 69 % | 94 % | — | 17 % | 99 % | 100 % | 100 % |
| grille détectée | réels, façon vieux disque | 1 | 75 % | 75 % | 0 % | 0 % | 75 % | — | 17 % | 44 % | 25 % | 100 % |
| vraie grille | enregistrements réels | 1 | 94 % | 94 % | 69 % | 69 % | 94 % | — | 17 % | (vraie) | (vraie) | 100 % |
| vraie grille | réels, façon vieux disque | 1 | 79 % | 79 % | 0 % | 0 % | 79 % | — | 17 % | (vraie) | (vraie) | 100 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | enregistrements réels | 93 % | 69 % |
| grille détectée | réels, façon vieux disque | 74 % | 0 % |
| vraie grille | enregistrements réels | 94 % | 69 % |
| vraie grille | réels, façon vieux disque | 79 % | 0 % |

## Par style (fondamentale / couleur, par temps)

| Style | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|
| guitare-bossa | 94 % / 69 % | 94 % / 69 % | 75 % / 0 % | 79 % / 0 % |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|
| bonne fondamentale, septième ou sixte fausse | 80 % | 75 % | 80 % | 79 % |
| fondamentale à un ton | 7 % | 4 % | 7 % | 4 % |
| accord voisin (décalé d’un temps ou plus) | 7 % | 0 % | 7 % | 0 % |
| fondamentale à la quinte / quarte | 7 % | 21 % | 7 % | 4 % |
| fondamentale à une tierce (majeure) | 0 % | 0 % | 0 % | 13 % |
| *temps faux / tous les temps* | 31 % | 100 % | 31 % | 100 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

maj7 → maj (50 %) · 6 → maj7 (17 %) · 7 → maj (17 %) · 6 → maj (17 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | enregistrements réels | 0 % | — | 31 % | 0 % |
| grille détectée | réels, façon vieux disque | 54 % | 100 % | 100 % | 54 % |
| vraie grille | enregistrements réels | 0 % | — | 31 % | 0 % |
| vraie grille | réels, façon vieux disque | 8 % | 100 % | 100 % | 8 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
