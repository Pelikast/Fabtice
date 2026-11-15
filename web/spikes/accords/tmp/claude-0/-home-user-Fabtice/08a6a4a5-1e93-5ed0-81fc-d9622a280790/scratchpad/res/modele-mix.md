# Banc accords — variante `modele-mix`

1 morceaux, mesuré le 2026-11-15 (0 s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.

| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grille détectée | enregistrements réels | 1 | 96 % | 96 % | 71 % | 71 % | 96 % | — | 17 % | 99 % | 100 % | 100 % |
| grille détectée | réels, façon vieux disque | 1 | 60 % | 60 % | 15 % | 15 % | 60 % | — | 17 % | 44 % | 25 % | 0 % |
| vraie grille | enregistrements réels | 1 | 96 % | 96 % | 71 % | 71 % | 96 % | — | 17 % | (vraie) | (vraie) | 100 % |
| vraie grille | réels, façon vieux disque | 1 | 75 % | 75 % | 13 % | 13 % | 75 % | — | 17 % | (vraie) | (vraie) | 0 % |

Même mesure pondérée par la durée (échantillons toutes les 50 ms) :

| Grille | Son | Fondamentale | Couleur |
|---|---|---|---|
| grille détectée | enregistrements réels | 95 % | 71 % |
| grille détectée | réels, façon vieux disque | 58 % | 13 % |
| vraie grille | enregistrements réels | 96 % | 71 % |
| vraie grille | réels, façon vieux disque | 75 % | 13 % |

## Par style (fondamentale / couleur, par temps)

| Style | enregistrements réels, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, grille détectée | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|
| guitare-bossa | 96 % / 71 % | 96 % / 71 % | 60 % / 15 % | 75 % / 13 % |

## Ce qui est faux (part des temps où fondamentale + couleur est fausse)

| Type d’erreur | enregistrements réels, grille détectée | réels, façon vieux disque, grille détectée | enregistrements réels, vraie grille | réels, façon vieux disque, vraie grille |
|---|---|---|---|---|
| bonne fondamentale, septième ou sixte fausse | 86 % | 54 % | 86 % | 71 % |
| fondamentale à un ton | 7 % | 5 % | 7 % | 5 % |
| accord voisin (décalé d’un temps ou plus) | 7 % | 0 % | 7 % | 0 % |
| fondamentale à une tierce (majeure) | 0 % | 22 % | 0 % | 24 % |
| fondamentale à la quinte / quarte | 0 % | 20 % | 0 % | 0 % |
| *temps faux / tous les temps* | 29 % | 85 % | 29 % | 88 % |

Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :

6 → maj (47 %) · maj7 → maj (29 %) · 7 → maj (24 %)

## Le signal « douteux »

| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |
|---|---|---|---|---|---|
| grille détectée | enregistrements réels | 0 % | — | 29 % | 0 % |
| grille détectée | réels, façon vieux disque | 21 % | 100 % | 82 % | 24 % |
| vraie grille | enregistrements réels | 0 % | — | 29 % | 0 % |
| vraie grille | réels, façon vieux disque | 0 % | — | 88 % | 0 % |

Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.
