# Banc accords — variante `modele-brut`

1 morceaux, mesuré le 2026-11-15 (0 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | enregistrements réels | 1 | 94 % | 94 % | 67 % | 67 % | 92 % | — | 42 % | 99 % | 100 % | 0 % |
| grille détectée | réels, façon vieux disque | 1 | 81 % | 81 % | 0 % | 0 % | 67 % | — | 42 % | 44 % | 25 % | 0 % |
| vraie grille | enregistrements réels | 1 | 94 % | 94 % | 67 % | 67 % | 92 % | — | 42 % | (vraie) | (vraie) | 0 % |
| vraie grille | réels, façon vieux disque | 1 | 77 % | 77 % | 0 % | 0 % | 79 % | — | 42 % | (vraie) | (vraie) | 0 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | enregistrements réels | 93 % | 67 % |
| grille détectée | réels, façon vieux disque | 80 % | 0 % |
| vraie grille | enregistrements réels | 94 % | 67 % |
| vraie grille | réels, façon vieux disque | 77 % | 0 % |

## Par style (fondamentale / couleur, par temps)

| Style | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|
| guitare-bossa | 94 % / 67 % | 94 % / 67 % | 81 % / 0 % | 77 % / 0 % |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|
| bonne fondamentale, septième ou sixte fausse | 81 % | 81 % | 81 % | 77 % |
| accord voisin (décalé d’un temps ou plus) | 13 % | 0 % | 13 % | 0 % |
| fondamentale à la quinte / quarte | 6 % | 2 % | 6 % | 4 % |
| fondamentale à une tierce (majeure) | 0 % | 13 % | 0 % | 15 % |
| fondamentale à un ton | 0 % | 4 % | 0 % | 4 % |
| *temps faux / tous les temps* | 33 % | 100 % | 33 % | 100 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

maj7 → maj (54 %) · 6 → maj (19 %) · 7 → maj (15 %) · 6 → maj7 (12 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | enregistrements réels | 50 % | 29 % | 38 % | 44 % |
| grille détectée | réels, façon vieux disque | 88 % | 100 % | 100 % | 88 % |
| vraie grille | enregistrements réels | 48 % | 26 % | 40 % | 38 % |
| vraie grille | réels, façon vieux disque | 88 % | 100 % | 100 % | 88 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
