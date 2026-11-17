# Banc de structure — Tier R (rendus, analyse réelle de l’app)

Écrit par `node dist/run.mjs` (dans `web/spikes/structure/`), avec les détecteurs de `app/src/structure/index.ts`.
Grille et accords : l’analyse de l’app sur le mélange rendu. Pistes : les rendus séparés de chaque instrument (séparation PARFAITE, idéalisée) ;
reconnaissance des vents simulée (taux « realiste » du Tier S).

| Condition | Morceaux | Accords de l’analyse justes (famille, par temps) | Barres de mesure trouvées (±70 ms) |
|---|---:|---:|---:|
| propre | 35 | 67.7 % | 98.3 % |
| disque | 9 | 53.5 % | 92.3 % |


### Tier R — erreurs d’analyse : propre

| Mesure | pistes (rendus séparés) / sans grille | pistes (rendus séparés) / grille connue | sans séparation / sans grille | sans séparation / grille connue |
|---|---:|---:|---:|---:|
| **Forme** | | | | |
| Longueur du chorus exacte | 82.8 % (24/29) | 93.1 % (27/29) | 82.8 % (24/29) | 93.1 % (27/29) |
| Limites de chorus ±1 : précision | 88.5 % (138/156) | 92.8 % (129/139) | 82.2 % (129/157) | 92.8 % (129/139) |
| Limites de chorus ±1 : rappel | 95.2 % (138/145) | 89.0 % (129/145) | 89.0 % (129/145) | 89.0 % (129/145) |
| Limites de sections ±1 : précision | 97.0 % (419/432) | 95.5 % (407/426) | 92.4 % (400/433) | 95.5 % (407/426) |
| Limites de sections ±1 : rappel | 92.7 % (419/452) | 90.0 % (407/452) | 88.5 % (400/452) | 90.0 % (407/452) |
| Limites de sections ±1 : mesure F | 90.4 % (32/35) | 86.8 % (30/35) | 84.7 % (30/35) | 86.8 % (30/35) |
| Lettres : mesure F par paires de mesures | 88.8 % (31/35) | 88.0 % (31/35) | 88.2 % (31/35) | 87.7 % (31/35) |
| Forme (AABA…) exacte | 79.3 % (23/29) | 93.1 % (27/29) | 79.3 % (23/29) | 93.1 % (27/29) |
| Mesures d’intro exactes | 77.1 % (27/35) | 74.3 % (26/35) | 68.6 % (24/35) | 77.1 % (27/35) |
| Mesures d’outro exactes | 85.7 % (30/35) | 74.3 % (26/35) | 82.9 % (29/35) | 74.3 % (26/35) |
| Mode Jazz / Pop juste | 100.0 % (35/35) | 100.0 % (35/35) | 100.0 % (35/35) | 100.0 % (35/35) |
| **Parties** | | | | |
| Limites de parties ±1 : précision | 83.7 % (200/239) | 82.7 % (196/237) | 84.5 % (147/174) | 87.1 % (155/178) |
| Limites de parties ±1 : rappel | 89.7 % (200/223) | 87.9 % (196/223) | 65.9 % (147/223) | 69.5 % (155/223) |
| Limites de parties ±1 : mesure F | 88.0 % (31/35) | 86.3 % (30/35) | 72.9 % (26/35) | 76.7 % (27/35) |
| Type de partie juste (thème, solo, intro…) | 93.1 % (175/188) | 87.8 % (165/188) | 81.9 % (154/188) | 79.8 % (150/188) |
| Numéro juste (vide lu comme 1 ; vide juste pour un soliste nommé qui ne revient pas) | 79.8 % (150/188) | 77.1 % (145/188) | 61.2 % (115/188) | 60.1 % (113/188) |
| Long solo d’un seul instrument non coupé | 61.1 % (11/18) | 61.1 % (11/18) | 88.9 % (16/18) | 83.3 % (15/18) |
| Solos voisins d’instruments différents séparés | 77.8 % (35/45) | 75.6 % (34/45) | 17.8 % (8/45) | 22.2 % (10/45) |
| **Instruments** | | | | |
| Instrument juste : piano, guitare, basse, batterie, voix | 84.4 % (65/77) | 84.4 % (65/77) | – | – |
| Vents et vibraphone : instrument exact | 56.2 % (50/89) | 52.8 % (47/89) | – | – |
| Vents et vibraphone : « Vents » | 13.5 % (12/89) | 11.2 % (10/89) | – | – |
| Instrument nommé FAUX (toutes parties) ↓ | 6.6 % (11/166) | 6.0 % (10/166) | – | – |
| Instrument nommé sans séparation (doit être 0) ↓ | – | – | 0.0 % (0/139) | 0.0 % (0/143) |
| **Modulations** | | | | |
| Modulations : précision | 100.0 % (14/14) | 100.0 % (16/16) | 100.0 % (14/14) | 100.0 % (16/16) |
| Modulations : rappel | 58.3 % (14/24) | 66.7 % (16/24) | 58.3 % (14/24) | 66.7 % (16/24) |
| Modulations : écart de position (mesures) ↓ | 0.00 | 0.00 | 0.00 | 0.00 |
| Modulations trouvées : tonalité exacte | 57.1 % (8/14) | 62.5 % (10/16) | 57.1 % (8/14) | 62.5 % (10/16) |
| Fausses modulations sur les morceaux sans modulation ↓ | 0 | 0 | 0 | 0 |
| Morceaux sans modulation qui en reçoivent une ↓ | 0.0 % (0/30) | 0.0 % (0/30) | 0.0 % (0/30) | 0.0 % (0/30) |
| **Grille simplifiée (structure vraie)** | | | | |
| Rien à replier : pas de grille simplifiée | 100.0 % (1/1) | 100.0 % (1/1) | 100.0 % (1/1) | 100.0 % (1/1) |
| Accords écrits justes (famille, par temps) | 77.6 % (2176/2804) | 93.4 % (2619/2804) | 77.6 % (2176/2804) | 93.4 % (2619/2804) |
| Nombre de sections exact | 97.1 % (33/34) | 97.1 % (33/34) | 97.1 % (33/34) | 97.1 % (33/34) |
| Reprises `xN` exactes | 95.8 % (91/95) | 95.8 % (91/95) | 95.8 % (91/95) | 95.8 % (91/95) |
| Mesure jouée → mesure écrite juste | 99.1 % (3924/3959) | 99.1 % (3924/3959) | 99.1 % (3924/3959) | 99.1 % (3924/3959) |
| **Grille simplifiée (chaîne complète)** | | | | |
| Accords écrits justes (famille, par temps) | 61.6 % (1726/2804) | 70.5 % (1978/2804) | 57.3 % (1608/2804) | 70.4 % (1975/2804) |
| Nombre de sections exact | 73.5 % (25/34) | 85.3 % (29/34) | 70.6 % (24/34) | 85.3 % (29/34) |
| Mesure jouée → mesure écrite juste | 75.7 % (2996/3959) | 66.9 % (2648/3959) | 62.6 % (2478/3959) | 62.9 % (2491/3959) |
| **Autumn Leaves (cahier)** | | | | |
| Grille écrite attendue (structure vraie) | 0.0 % (0/1) | 100.0 % (1/1) | 0.0 % (0/1) | 100.0 % (1/1) |
| Forme et grille attendues (chaîne complète) | 0.0 % (0/1) | 100.0 % (1/1) | 0.0 % (0/1) | 0.0 % (0/1) |
| Cas | 35 | 35 | 35 | 35 |
| Temps de calcul (ms) | 679 | 699 | 504 | 588 |

### Tier R — erreurs d’analyse : disque

| Mesure | pistes (rendus séparés) / sans grille | pistes (rendus séparés) / grille connue | sans séparation / sans grille | sans séparation / grille connue |
|---|---:|---:|---:|---:|
| **Forme** | | | | |
| Longueur du chorus exacte | 75.0 % (6/8) | 75.0 % (6/8) | 75.0 % (6/8) | 75.0 % (6/8) |
| Limites de chorus ±1 : précision | 54.3 % (25/46) | 56.5 % (26/46) | 45.7 % (21/46) | 56.5 % (26/46) |
| Limites de chorus ±1 : rappel | 64.1 % (25/39) | 66.7 % (26/39) | 53.8 % (21/39) | 66.7 % (26/39) |
| Limites de sections ±1 : précision | 81.7 % (98/120) | 83.3 % (100/120) | 70.8 % (85/120) | 83.3 % (100/120) |
| Limites de sections ±1 : rappel | 73.1 % (98/134) | 74.6 % (100/134) | 63.4 % (85/134) | 74.6 % (100/134) |
| Limites de sections ±1 : mesure F | 75.4 % (7/9) | 77.3 % (7/9) | 63.2 % (6/9) | 77.3 % (7/9) |
| Lettres : mesure F par paires de mesures | 85.4 % (8/9) | 89.1 % (8/9) | 82.8 % (7/9) | 88.5 % (8/9) |
| Forme (AABA…) exacte | 62.5 % (5/8) | 75.0 % (6/8) | 62.5 % (5/8) | 75.0 % (6/8) |
| Mesures d’intro exactes | 55.6 % (5/9) | 55.6 % (5/9) | 33.3 % (3/9) | 55.6 % (5/9) |
| Mesures d’outro exactes | 55.6 % (5/9) | 55.6 % (5/9) | 55.6 % (5/9) | 55.6 % (5/9) |
| Mode Jazz / Pop juste | 100.0 % (9/9) | 100.0 % (9/9) | 100.0 % (9/9) | 100.0 % (9/9) |
| **Parties** | | | | |
| Limites de parties ±1 : précision | 57.1 % (44/77) | 57.9 % (44/76) | 56.0 % (28/50) | 68.0 % (34/50) |
| Limites de parties ±1 : rappel | 74.6 % (44/59) | 74.6 % (44/59) | 47.5 % (28/59) | 57.6 % (34/59) |
| Limites de parties ±1 : mesure F | 71.5 % (6/9) | 72.1 % (6/9) | 54.5 % (5/9) | 65.8 % (6/9) |
| Type de partie juste (thème, solo, intro…) | 80.0 % (40/50) | 82.0 % (41/50) | 80.0 % (40/50) | 82.0 % (41/50) |
| Numéro juste (vide lu comme 1 ; vide juste pour un soliste nommé qui ne revient pas) | 66.0 % (33/50) | 68.0 % (34/50) | 58.0 % (29/50) | 62.0 % (31/50) |
| Long solo d’un seul instrument non coupé | 50.0 % (2/4) | 50.0 % (2/4) | 75.0 % (3/4) | 75.0 % (3/4) |
| Solos voisins d’instruments différents séparés | 81.8 % (9/11) | 81.8 % (9/11) | 9.1 % (1/11) | 27.3 % (3/11) |
| **Instruments** | | | | |
| Instrument juste : piano, guitare, basse, batterie, voix | 95.0 % (19/20) | 95.0 % (19/20) | – | – |
| Vents et vibraphone : instrument exact | 50.0 % (11/22) | 50.0 % (11/22) | – | – |
| Vents et vibraphone : « Vents » | 31.8 % (7/22) | 31.8 % (7/22) | – | – |
| Instrument nommé FAUX (toutes parties) ↓ | 4.8 % (2/42) | 4.8 % (2/42) | – | – |
| Instrument nommé sans séparation (doit être 0) ↓ | – | – | 0.0 % (0/41) | 0.0 % (0/41) |
| **Modulations** | | | | |
| Modulations : précision | – | – | – | – |
| Modulations : rappel | 0.0 % (0/4) | 0.0 % (0/4) | 0.0 % (0/4) | 0.0 % (0/4) |
| Modulations : écart de position (mesures) ↓ | – | – | – | – |
| Modulations trouvées : tonalité exacte | – | – | – | – |
| Fausses modulations sur les morceaux sans modulation ↓ | 0 | 0 | 0 | 0 |
| Morceaux sans modulation qui en reçoivent une ↓ | 0.0 % (0/8) | 0.0 % (0/8) | 0.0 % (0/8) | 0.0 % (0/8) |
| **Grille simplifiée (structure vraie)** | | | | |
| Rien à replier : pas de grille simplifiée | – | – | – | – |
| Accords écrits justes (famille, par temps) | 62.3 % (568/912) | 78.1 % (712/912) | 62.3 % (568/912) | 78.1 % (712/912) |
| Nombre de sections exact | 77.8 % (7/9) | 77.8 % (7/9) | 77.8 % (7/9) | 77.8 % (7/9) |
| Reprises `xN` exactes | 77.4 % (24/31) | 77.4 % (24/31) | 77.4 % (24/31) | 77.4 % (24/31) |
| Mesure jouée → mesure écrite juste | 94.7 % (1108/1170) | 94.7 % (1108/1170) | 94.7 % (1108/1170) | 94.7 % (1108/1170) |
| **Grille simplifiée (chaîne complète)** | | | | |
| Accords écrits justes (famille, par temps) | 37.9 % (346/912) | 57.9 % (528/912) | 29.8 % (272/912) | 55.9 % (510/912) |
| Nombre de sections exact | 55.6 % (5/9) | 66.7 % (6/9) | 44.4 % (4/9) | 66.7 % (6/9) |
| Mesure jouée → mesure écrite juste | 52.8 % (618/1170) | 63.8 % (746/1170) | 31.8 % (372/1170) | 57.4 % (671/1170) |
| **Autumn Leaves (cahier)** | | | | |
| Grille écrite attendue (structure vraie) | 0.0 % (0/1) | 100.0 % (1/1) | 0.0 % (0/1) | 100.0 % (1/1) |
| Forme et grille attendues (chaîne complète) | 0.0 % (0/1) | 100.0 % (1/1) | 0.0 % (0/1) | 0.0 % (0/1) |
| Cas | 9 | 9 | 9 | 9 |
| Temps de calcul (ms) | 182 | 212 | 145 | 181 |

### Autumn Leaves (exemple du cahier, C14)

- propre / pistes (rendus séparés) / sans grille : grille (structure vraie) **échoue** (A mesure 3 : Dmaj7 attendu ; A mesure 5 : C#m7b5 attendu ; B mesure 1 : C#m7b5 attendu ; +8) ; chaîne complète **échoue** (grille : A mesure 3 : Dmaj7 attendu ; grille : A mesure 5 : C#m7b5 attendu ; grille : B mesure 1 : C#m7b5 attendu ; +8)
- propre / pistes (rendus séparés) / grille connue : grille (structure vraie) **passe** ; chaîne complète **passe**
- propre / sans séparation / sans grille : grille (structure vraie) **échoue** (A mesure 3 : Dmaj7 attendu ; A mesure 5 : C#m7b5 attendu ; B mesure 1 : C#m7b5 attendu ; +8) ; chaîne complète **échoue** (partie 5 : solo au lieu de theme ; partie 5 : numéro 2 attendu ; grille : A mesure 3 : Dmaj7 attendu ; +10)
- propre / sans séparation / grille connue : grille (structure vraie) **passe** ; chaîne complète **échoue** (partie 5 : solo au lieu de theme ; partie 5 : numéro 2 attendu)
- disque / pistes (rendus séparés) / sans grille : grille (structure vraie) **échoue** (A mesure 3 : Dmaj7 attendu ; A mesure 4 : Gmaj7 attendu ; B mesure 5 : Em7 attendu ; +10) ; chaîne complète **échoue** (forme AABA au lieu de AABC ; lettres de la forme ,AABA,AABA,AA,BA au lieu de ,AABC,AABC,AA,BC ; grille : sections intro,A,B au lieu de intro,A,B,C ; +7)
- disque / pistes (rendus séparés) / grille connue : grille (structure vraie) **passe** ; chaîne complète **passe**
- disque / sans séparation / sans grille : grille (structure vraie) **échoue** (A mesure 3 : Dmaj7 attendu ; A mesure 4 : Gmaj7 attendu ; B mesure 5 : Em7 attendu ; +10) ; chaîne complète **échoue** (forme AABA au lieu de AABC ; 3 parties au lieu de 5 ; partie 2 : début décalé ; +19)
- disque / sans séparation / grille connue : grille (structure vraie) **passe** ; chaîne complète **échoue** (partie 5 : solo au lieu de theme ; partie 5 : numéro 2 attendu)
