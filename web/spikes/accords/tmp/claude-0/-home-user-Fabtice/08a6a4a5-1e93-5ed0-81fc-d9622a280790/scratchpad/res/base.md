# Banc accords — variante `base`

1 morceaux, mesuré le 2026-11-15 (0 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | enregistrements réels | 1 | 98 % | 98 % | 73 % | 73 % | 98 % | — | 8 % | 99 % | 100 % | 100 % |
| grille détectée | réels, façon vieux disque | 1 | 65 % | 65 % | 40 % | 40 % | 65 % | — | 17 % | 44 % | 25 % | 0 % |
| vraie grille | enregistrements réels | 1 | 98 % | 98 % | 73 % | 73 % | 98 % | — | 8 % | (vraie) | (vraie) | 100 % |
| vraie grille | réels, façon vieux disque | 1 | 79 % | 79 % | 54 % | 54 % | 79 % | — | 17 % | (vraie) | (vraie) | 0 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | enregistrements réels | 97 % | 73 % |
| grille détectée | réels, façon vieux disque | 62 % | 38 % |
| vraie grille | enregistrements réels | 98 % | 73 % |
| vraie grille | réels, façon vieux disque | 79 % | 54 % |

## Par style (fondamentale / couleur, par temps)

| Style | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|
| guitare-bossa | 98 % / 73 % | 98 % / 73 % | 65 % / 40 % | 79 % / 54 % |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|
| bonne fondamentale, septième ou sixte fausse | 92 % | 41 % | 92 % | 55 % |
| fondamentale à un ton | 8 % | 7 % | 8 % | 5 % |
| fondamentale à une tierce (majeure) | 0 % | 24 % | 0 % | 36 % |
| accord voisin (décalé d’un temps ou plus) | 0 % | 3 % | 0 % | 5 % |
| fondamentale à la quinte / quarte | 0 % | 24 % | 0 % | 0 % |
| *temps faux / tous les temps* | 27 % | 60 % | 27 % | 46 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

6 → maj (33 %) · 7 → maj (33 %) · 6 → maj7 (33 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | enregistrements réels | 0 % | — | 27 % | 0 % |
| grille détectée | réels, façon vieux disque | 38 % | 89 % | 43 % | 55 % |
| vraie grille | enregistrements réels | 0 % | — | 27 % | 0 % |
| vraie grille | réels, façon vieux disque | 0 % | — | 46 % | 0 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
