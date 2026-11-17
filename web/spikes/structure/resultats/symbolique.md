# Banc de structure — Tier S (symbolique)

Écrit par `FABTICE_STRUCTURE_FULL=1 npx vitest run src/structure/bench.test.ts` (dans `app/`), avec les détecteurs de `app/src/structure/index.ts`.

### Tier S, corpus entier (2 tirages) — erreurs d’analyse : parfait

| Mesure | pistes / sans grille | pistes / grille connue | sans séparation / sans grille | sans séparation / grille connue | sans audio / sans grille | sans audio / grille connue |
|---|---:|---:|---:|---:|---:|---:|
| **Forme** | | | | | | |
| Longueur du chorus exacte | 96.6 % (56/58) | 100.0 % (58/58) | 96.6 % (56/58) | 100.0 % (58/58) | 96.6 % (56/58) | 100.0 % (58/58) |
| Limites de chorus ±1 : précision | 97.3 % (290/298) | 100.0 % (290/290) | 94.0 % (282/300) | 100.0 % (290/290) | 92.0 % (276/300) | 100.0 % (290/290) |
| Limites de chorus ±1 : rappel | 100.0 % (290/290) | 100.0 % (290/290) | 97.2 % (282/290) | 100.0 % (290/290) | 95.2 % (276/290) | 100.0 % (290/290) |
| Limites de sections ±1 : précision | 98.6 % (868/880) | 98.7 % (884/896) | 97.5 % (860/882) | 98.7 % (884/896) | 94.8 % (836/882) | 98.7 % (884/896) |
| Limites de sections ±1 : rappel | 96.0 % (868/904) | 97.8 % (884/904) | 95.1 % (860/904) | 97.8 % (884/904) | 92.5 % (836/904) | 97.8 % (884/904) |
| Limites de sections ±1 : mesure F | 93.3 % (65/70) | 94.3 % (66/70) | 90.5 % (63/70) | 94.3 % (66/70) | 87.6 % (61/70) | 94.3 % (66/70) |
| Lettres : mesure F par paires de mesures | 93.5 % (65/70) | 95.2 % (67/70) | 93.5 % (65/70) | 95.2 % (67/70) | 92.7 % (65/70) | 95.2 % (67/70) |
| Forme (AABA…) exacte | 96.6 % (56/58) | 100.0 % (58/58) | 96.6 % (56/58) | 100.0 % (58/58) | 96.6 % (56/58) | 100.0 % (58/58) |
| Mesures d’intro exactes | 91.4 % (64/70) | 94.3 % (66/70) | 88.6 % (62/70) | 94.3 % (66/70) | 82.9 % (58/70) | 94.3 % (66/70) |
| Mesures d’outro exactes | 94.3 % (66/70) | 94.3 % (66/70) | 91.4 % (64/70) | 94.3 % (66/70) | 88.6 % (62/70) | 94.3 % (66/70) |
| Mode Jazz / Pop juste | 100.0 % (70/70) | 100.0 % (70/70) | 100.0 % (70/70) | 100.0 % (70/70) | 100.0 % (70/70) | 100.0 % (70/70) |
| **Parties** | | | | | | |
| Limites de parties ±1 : précision | 95.5 % (426/446) | 96.8 % (426/440) | 93.3 % (361/387) | 95.4 % (371/389) | 88.1 % (310/352) | 93.1 % (326/350) |
| Limites de parties ±1 : rappel | 95.5 % (426/446) | 95.5 % (426/446) | 80.9 % (361/446) | 83.2 % (371/446) | 69.5 % (310/446) | 73.1 % (326/446) |
| Limites de parties ±1 : mesure F | 95.9 % (67/70) | 96.6 % (68/70) | 86.4 % (60/70) | 88.9 % (62/70) | 78.1 % (55/70) | 82.6 % (58/70) |
| Type de partie juste (thème, solo, intro…) | 97.9 % (368/376) | 98.4 % (370/376) | 89.4 % (336/376) | 91.5 % (344/376) | 92.0 % (346/376) | 94.1 % (354/376) |
| Numéro juste (vide lu comme 1 ; vide juste pour un soliste nommé qui ne revient pas) | 94.4 % (355/376) | 96.0 % (361/376) | 76.6 % (288/376) | 78.7 % (296/376) | 69.1 % (260/376) | 71.3 % (268/376) |
| Long solo d’un seul instrument non coupé | 100.0 % (36/36) | 100.0 % (36/36) | 100.0 % (36/36) | 100.0 % (36/36) | 100.0 % (36/36) | 100.0 % (36/36) |
| Solos voisins d’instruments différents séparés | 95.6 % (86/90) | 95.6 % (86/90) | 55.6 % (50/90) | 55.6 % (50/90) | 2.2 % (2/90) | 4.4 % (4/90) |
| **Instruments** | | | | | | |
| Instrument juste : piano, guitare, basse, batterie, voix | 96.1 % (148/154) | 96.1 % (148/154) | – | – | – | – |
| Vents et vibraphone : instrument exact | 93.8 % (167/178) | 93.8 % (167/178) | – | – | – | – |
| Vents et vibraphone : « Vents » | 5.6 % (10/178) | 5.6 % (10/178) | – | – | – | – |
| Instrument nommé FAUX (toutes parties) ↓ | 0.9 % (3/332) | 0.9 % (3/332) | – | – | – | – |
| Instrument nommé sans séparation (doit être 0) ↓ | – | – | 0.0 % (0/317) | 0.0 % (0/319) | 0.0 % (0/282) | 0.0 % (0/280) |
| **Modulations** | | | | | | |
| Modulations : précision | 100.0 % (48/48) | 100.0 % (48/48) | 100.0 % (48/48) | 100.0 % (48/48) | 100.0 % (48/48) | 100.0 % (48/48) |
| Modulations : rappel | 100.0 % (48/48) | 100.0 % (48/48) | 100.0 % (48/48) | 100.0 % (48/48) | 100.0 % (48/48) | 100.0 % (48/48) |
| Modulations : écart de position (mesures) ↓ | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Modulations trouvées : tonalité exacte | 95.8 % (46/48) | 95.8 % (46/48) | 95.8 % (46/48) | 95.8 % (46/48) | 95.8 % (46/48) | 95.8 % (46/48) |
| Fausses modulations sur les morceaux sans modulation ↓ | 0 | 0 | 0 | 0 | 0 | 0 |
| Morceaux sans modulation qui en reçoivent une ↓ | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) |
| **Grille simplifiée (structure vraie)** | | | | | | |
| Rien à replier : pas de grille simplifiée | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| Accords écrits justes (famille, par temps) | 96.6 % (5420/5608) | 99.7 % (5592/5608) | 96.6 % (5420/5608) | 99.7 % (5592/5608) | 96.6 % (5420/5608) | 99.7 % (5592/5608) |
| Nombre de sections exact | 100.0 % (68/68) | 100.0 % (68/68) | 100.0 % (68/68) | 100.0 % (68/68) | 100.0 % (68/68) | 100.0 % (68/68) |
| Reprises `xN` exactes | 97.9 % (186/190) | 97.9 % (186/190) | 97.9 % (186/190) | 97.9 % (186/190) | 97.9 % (186/190) | 97.9 % (186/190) |
| Mesure jouée → mesure écrite juste | 100.0 % (7968/7968) | 100.0 % (7968/7968) | 100.0 % (7968/7968) | 100.0 % (7968/7968) | 100.0 % (7968/7968) | 100.0 % (7968/7968) |
| **Grille simplifiée (chaîne complète)** | | | | | | |
| Accords écrits justes (famille, par temps) | 88.9 % (4988/5608) | 94.8 % (5314/5608) | 86.7 % (4860/5608) | 94.8 % (5314/5608) | 82.1 % (4602/5608) | 94.8 % (5314/5608) |
| Nombre de sections exact | 91.2 % (62/68) | 97.1 % (66/68) | 88.2 % (60/68) | 97.1 % (66/68) | 85.3 % (58/68) | 97.1 % (66/68) |
| Mesure jouée → mesure écrite juste | 92.4 % (7364/7968) | 97.0 % (7728/7968) | 90.9 % (7244/7968) | 97.0 % (7728/7968) | 86.8 % (6920/7968) | 97.0 % (7728/7968) |
| **Autumn Leaves (cahier)** | | | | | | |
| Grille écrite attendue (structure vraie) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| Forme et grille attendues (chaîne complète) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 0.0 % (0/2) | 0.0 % (0/2) |
| Cas | 70 | 70 | 70 | 70 | 70 | 70 |
| Temps de calcul (ms) | 1459 | 1417 | 876 | 1385 | 953 | 1586 |

### Tier S, corpus entier (2 tirages) — erreurs d’analyse : realiste

| Mesure | pistes / sans grille | pistes / grille connue | sans séparation / sans grille | sans séparation / grille connue | sans audio / sans grille | sans audio / grille connue |
|---|---:|---:|---:|---:|---:|---:|
| **Forme** | | | | | | |
| Longueur du chorus exacte | 81.0 % (47/58) | 96.6 % (56/58) | 82.8 % (48/58) | 96.6 % (56/58) | 81.0 % (47/58) | 96.6 % (56/58) |
| Limites de chorus ±1 : précision | 87.4 % (256/293) | 100.0 % (290/290) | 82.7 % (243/294) | 100.0 % (290/290) | 78.2 % (230/294) | 100.0 % (290/290) |
| Limites de chorus ±1 : rappel | 88.3 % (256/290) | 100.0 % (290/290) | 83.8 % (243/290) | 100.0 % (290/290) | 79.3 % (230/290) | 100.0 % (290/290) |
| Limites de sections ±1 : précision | 87.3 % (755/865) | 96.7 % (856/885) | 84.6 % (733/866) | 96.7 % (856/885) | 80.7 % (699/866) | 96.7 % (856/885) |
| Limites de sections ±1 : rappel | 83.5 % (755/904) | 94.7 % (856/904) | 81.1 % (733/904) | 94.7 % (856/904) | 77.3 % (699/904) | 94.7 % (856/904) |
| Limites de sections ±1 : mesure F | 80.7 % (56/70) | 90.0 % (63/70) | 75.7 % (53/70) | 90.0 % (63/70) | 71.8 % (50/70) | 90.0 % (63/70) |
| Lettres : mesure F par paires de mesures | 82.0 % (57/70) | 89.6 % (63/70) | 80.7 % (56/70) | 89.6 % (63/70) | 80.2 % (56/70) | 89.6 % (63/70) |
| Forme (AABA…) exacte | 79.3 % (46/58) | 100.0 % (58/58) | 77.6 % (45/58) | 100.0 % (58/58) | 77.6 % (45/58) | 100.0 % (58/58) |
| Mesures d’intro exactes | 78.6 % (55/70) | 82.9 % (58/70) | 61.4 % (43/70) | 82.9 % (58/70) | 62.9 % (44/70) | 82.9 % (58/70) |
| Mesures d’outro exactes | 67.1 % (47/70) | 81.4 % (57/70) | 67.1 % (47/70) | 81.4 % (57/70) | 65.7 % (46/70) | 81.4 % (57/70) |
| Mode Jazz / Pop juste | 100.0 % (70/70) | 100.0 % (70/70) | 100.0 % (70/70) | 100.0 % (70/70) | 100.0 % (70/70) | 100.0 % (70/70) |
| **Parties** | | | | | | |
| Limites de parties ±1 : précision | 84.5 % (360/426) | 89.3 % (369/413) | 79.8 % (269/337) | 90.2 % (296/328) | 75.9 % (258/340) | 89.4 % (296/331) |
| Limites de parties ±1 : rappel | 80.7 % (360/446) | 82.7 % (369/446) | 60.3 % (269/446) | 66.4 % (296/446) | 57.8 % (258/446) | 66.4 % (296/446) |
| Limites de parties ±1 : mesure F | 83.7 % (59/70) | 87.2 % (61/70) | 70.7 % (50/70) | 78.8 % (55/70) | 67.9 % (48/70) | 79.1 % (55/70) |
| Type de partie juste (thème, solo, intro…) | 82.4 % (310/376) | 83.8 % (315/376) | 74.7 % (281/376) | 76.9 % (289/376) | 81.6 % (307/376) | 85.6 % (322/376) |
| Numéro juste (vide lu comme 1 ; vide juste pour un soliste nommé qui ne revient pas) | 69.9 % (263/376) | 72.9 % (274/376) | 50.8 % (191/376) | 53.7 % (202/376) | 57.7 % (217/376) | 61.2 % (230/376) |
| Long solo d’un seul instrument non coupé | 91.7 % (33/36) | 97.2 % (35/36) | 94.4 % (34/36) | 100.0 % (36/36) | 91.7 % (33/36) | 100.0 % (36/36) |
| Solos voisins d’instruments différents séparés | 76.7 % (69/90) | 78.9 % (71/90) | 24.4 % (22/90) | 28.9 % (26/90) | 2.2 % (2/90) | 4.4 % (4/90) |
| **Instruments** | | | | | | |
| Instrument juste : piano, guitare, basse, batterie, voix | 91.6 % (141/154) | 91.6 % (141/154) | – | – | – | – |
| Vents et vibraphone : instrument exact | 41.6 % (74/178) | 42.1 % (75/178) | – | – | – | – |
| Vents et vibraphone : « Vents » | 48.3 % (86/178) | 48.3 % (86/178) | – | – | – | – |
| Instrument nommé FAUX (toutes parties) ↓ | 4.8 % (16/332) | 5.1 % (17/332) | – | – | – | – |
| Instrument nommé sans séparation (doit être 0) ↓ | – | – | 0.0 % (0/267) | 0.0 % (0/258) | 0.0 % (0/270) | 0.0 % (0/261) |
| **Modulations** | | | | | | |
| Modulations : précision | 96.9 % (31/32) | 97.6 % (41/42) | 96.9 % (31/32) | 97.6 % (41/42) | 96.9 % (31/32) | 97.6 % (41/42) |
| Modulations : rappel | 64.6 % (31/48) | 85.4 % (41/48) | 64.6 % (31/48) | 85.4 % (41/48) | 64.6 % (31/48) | 85.4 % (41/48) |
| Modulations : écart de position (mesures) ↓ | 0.45 | 0.24 | 0.45 | 0.24 | 0.45 | 0.24 |
| Modulations trouvées : tonalité exacte | 87.1 % (27/31) | 87.8 % (36/41) | 87.1 % (27/31) | 87.8 % (36/41) | 87.1 % (27/31) | 87.8 % (36/41) |
| Fausses modulations sur les morceaux sans modulation ↓ | 0 | 0 | 0 | 0 | 0 | 0 |
| Morceaux sans modulation qui en reçoivent une ↓ | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) |
| **Grille simplifiée (structure vraie)** | | | | | | |
| Rien à replier : pas de grille simplifiée | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| Accords écrits justes (famille, par temps) | 78.9 % (4427/5608) | 89.6 % (5026/5608) | 78.9 % (4427/5608) | 89.6 % (5026/5608) | 78.9 % (4427/5608) | 89.6 % (5026/5608) |
| Nombre de sections exact | 95.6 % (65/68) | 95.6 % (65/68) | 95.6 % (65/68) | 95.6 % (65/68) | 95.6 % (65/68) | 95.6 % (65/68) |
| Reprises `xN` exactes | 91.1 % (173/190) | 91.1 % (173/190) | 91.1 % (173/190) | 91.1 % (173/190) | 91.1 % (173/190) | 91.1 % (173/190) |
| Mesure jouée → mesure écrite juste | 98.4 % (7776/7900) | 98.4 % (7776/7900) | 98.4 % (7776/7900) | 98.4 % (7776/7900) | 98.4 % (7776/7900) | 98.4 % (7776/7900) |
| **Grille simplifiée (chaîne complète)** | | | | | | |
| Accords écrits justes (famille, par temps) | 51.9 % (2910/5608) | 79.5 % (4460/5608) | 45.0 % (2526/5608) | 79.5 % (4458/5608) | 45.0 % (2526/5608) | 79.5 % (4458/5608) |
| Nombre de sections exact | 63.2 % (43/68) | 80.9 % (55/68) | 55.9 % (38/68) | 80.9 % (55/68) | 57.4 % (39/68) | 80.9 % (55/68) |
| Mesure jouée → mesure écrite juste | 61.6 % (4863/7900) | 90.2 % (7127/7900) | 48.2 % (3811/7900) | 90.2 % (7127/7900) | 51.7 % (4088/7900) | 90.2 % (7127/7900) |
| **Autumn Leaves (cahier)** | | | | | | |
| Grille écrite attendue (structure vraie) | 0.0 % (0/2) | 100.0 % (2/2) | 0.0 % (0/2) | 100.0 % (2/2) | 0.0 % (0/2) | 100.0 % (2/2) |
| Forme et grille attendues (chaîne complète) | 0.0 % (0/2) | 50.0 % (1/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) |
| Cas | 70 | 70 | 70 | 70 | 70 | 70 |
| Temps de calcul (ms) | 1643 | 1939 | 1608 | 2221 | 1651 | 2057 |

### Tier S, corpus entier (2 tirages) — erreurs d’analyse : mauvais

| Mesure | pistes / sans grille | pistes / grille connue | sans séparation / sans grille | sans séparation / grille connue | sans audio / sans grille | sans audio / grille connue |
|---|---:|---:|---:|---:|---:|---:|
| **Forme** | | | | | | |
| Longueur du chorus exacte | 32.8 % (19/58) | 93.1 % (54/58) | 31.0 % (18/58) | 93.1 % (54/58) | 31.0 % (18/58) | 93.1 % (54/58) |
| Limites de chorus ±1 : précision | 49.1 % (131/267) | 97.9 % (274/280) | 41.4 % (110/266) | 97.9 % (274/280) | 43.2 % (115/266) | 97.9 % (274/280) |
| Limites de chorus ±1 : rappel | 45.2 % (131/290) | 94.5 % (274/290) | 37.9 % (110/290) | 94.5 % (274/290) | 39.7 % (115/290) | 94.5 % (274/290) |
| Limites de sections ±1 : précision | 61.5 % (456/741) | 98.2 % (818/833) | 57.2 % (424/741) | 98.2 % (818/833) | 57.1 % (423/741) | 98.2 % (818/833) |
| Limites de sections ±1 : rappel | 50.4 % (456/904) | 90.5 % (818/904) | 46.9 % (424/904) | 90.5 % (818/904) | 46.8 % (423/904) | 90.5 % (818/904) |
| Limites de sections ±1 : mesure F | 44.7 % (31/70) | 84.4 % (59/70) | 39.8 % (28/70) | 84.4 % (59/70) | 40.4 % (28/70) | 84.4 % (59/70) |
| Lettres : mesure F par paires de mesures | 54.7 % (38/70) | 83.2 % (58/70) | 54.4 % (38/70) | 83.2 % (58/70) | 54.4 % (38/70) | 83.2 % (58/70) |
| Forme (AABA…) exacte | 41.4 % (24/58) | 100.0 % (58/58) | 41.4 % (24/58) | 100.0 % (58/58) | 41.4 % (24/58) | 100.0 % (58/58) |
| Mesures d’intro exactes | 40.0 % (28/70) | 75.7 % (53/70) | 34.3 % (24/70) | 75.7 % (53/70) | 32.9 % (23/70) | 75.7 % (53/70) |
| Mesures d’outro exactes | 34.3 % (24/70) | 61.4 % (43/70) | 31.4 % (22/70) | 61.4 % (43/70) | 34.3 % (24/70) | 61.4 % (43/70) |
| Mode Jazz / Pop juste | 98.6 % (69/70) | 98.6 % (69/70) | 98.6 % (69/70) | 98.6 % (69/70) | 98.6 % (69/70) | 98.6 % (69/70) |
| **Parties** | | | | | | |
| Limites de parties ±1 : précision | 65.9 % (275/417) | 82.7 % (324/392) | 62.5 % (177/283) | 89.8 % (230/256) | 60.1 % (182/303) | 88.7 % (260/293) |
| Limites de parties ±1 : rappel | 61.7 % (275/446) | 72.6 % (324/446) | 39.7 % (177/446) | 51.6 % (230/446) | 40.8 % (182/446) | 58.3 % (260/446) |
| Limites de parties ±1 : mesure F | 63.2 % (44/70) | 77.3 % (54/70) | 49.9 % (35/70) | 66.9 % (47/70) | 50.3 % (35/70) | 72.1 % (50/70) |
| Type de partie juste (thème, solo, intro…) | 66.8 % (251/376) | 72.9 % (274/376) | 59.0 % (222/376) | 65.4 % (246/376) | 61.7 % (232/376) | 74.7 % (281/376) |
| Numéro juste (vide lu comme 1 ; vide juste pour un soliste nommé qui ne revient pas) | 54.0 % (203/376) | 63.3 % (238/376) | 33.8 % (127/376) | 42.8 % (161/376) | 40.2 % (151/376) | 52.9 % (199/376) |
| Long solo d’un seul instrument non coupé | 72.2 % (26/36) | 83.3 % (30/36) | 83.3 % (30/36) | 97.2 % (35/36) | 86.1 % (31/36) | 91.7 % (33/36) |
| Solos voisins d’instruments différents séparés | 64.4 % (58/90) | 71.1 % (64/90) | 6.7 % (6/90) | 13.3 % (12/90) | 3.3 % (3/90) | 8.9 % (8/90) |
| **Instruments** | | | | | | |
| Instrument juste : piano, guitare, basse, batterie, voix | 65.6 % (101/154) | 67.5 % (104/154) | – | – | – | – |
| Vents et vibraphone : instrument exact | 29.2 % (52/178) | 37.1 % (66/178) | – | – | – | – |
| Vents et vibraphone : « Vents » | 38.2 % (68/178) | 38.8 % (69/178) | – | – | – | – |
| Instrument nommé FAUX (toutes parties) ↓ | 12.0 % (40/332) | 12.0 % (40/332) | – | – | – | – |
| Instrument nommé sans séparation (doit être 0) ↓ | – | – | 0.0 % (0/218) | 0.0 % (0/191) | 0.0 % (0/238) | 0.0 % (0/228) |
| **Modulations** | | | | | | |
| Modulations : précision | 76.2 % (16/21) | 80.0 % (20/25) | 76.2 % (16/21) | 80.0 % (20/25) | 76.2 % (16/21) | 80.0 % (20/25) |
| Modulations : rappel | 33.3 % (16/48) | 41.7 % (20/48) | 33.3 % (16/48) | 41.7 % (20/48) | 33.3 % (16/48) | 41.7 % (20/48) |
| Modulations : écart de position (mesures) ↓ | 0.63 | 0.35 | 0.63 | 0.35 | 0.63 | 0.35 |
| Modulations trouvées : tonalité exacte | 93.8 % (15/16) | 90.0 % (18/20) | 93.8 % (15/16) | 90.0 % (18/20) | 93.8 % (15/16) | 90.0 % (18/20) |
| Fausses modulations sur les morceaux sans modulation ↓ | 2 | 2 | 2 | 2 | 2 | 2 |
| Morceaux sans modulation qui en reçoivent une ↓ | 1.7 % (1/60) | 1.7 % (1/60) | 1.7 % (1/60) | 1.7 % (1/60) | 1.7 % (1/60) | 1.7 % (1/60) |
| **Grille simplifiée (structure vraie)** | | | | | | |
| Rien à replier : pas de grille simplifiée | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| Accords écrits justes (famille, par temps) | 57.6 % (3233/5608) | 75.0 % (4204/5608) | 57.6 % (3233/5608) | 75.0 % (4204/5608) | 57.6 % (3233/5608) | 75.0 % (4204/5608) |
| Nombre de sections exact | 94.1 % (64/68) | 94.1 % (64/68) | 94.1 % (64/68) | 94.1 % (64/68) | 94.1 % (64/68) | 94.1 % (64/68) |
| Reprises `xN` exactes | 90.0 % (171/190) | 90.0 % (171/190) | 90.0 % (171/190) | 90.0 % (171/190) | 90.0 % (171/190) | 90.0 % (171/190) |
| Mesure jouée → mesure écrite juste | 78.2 % (6068/7764) | 78.2 % (6068/7764) | 78.2 % (6068/7764) | 78.2 % (6068/7764) | 78.2 % (6068/7764) | 78.2 % (6068/7764) |
| **Grille simplifiée (chaîne complète)** | | | | | | |
| Accords écrits justes (famille, par temps) | 18.0 % (1010/5608) | 68.4 % (3834/5608) | 15.6 % (875/5608) | 68.4 % (3834/5608) | 15.8 % (887/5608) | 68.3 % (3828/5608) |
| Nombre de sections exact | 35.3 % (24/68) | 64.7 % (44/68) | 32.4 % (22/68) | 64.7 % (44/68) | 33.8 % (23/68) | 64.7 % (44/68) |
| Mesure jouée → mesure écrite juste | 18.4 % (1425/7764) | 65.5 % (5088/7764) | 14.8 % (1146/7764) | 65.5 % (5088/7764) | 14.8 % (1149/7764) | 65.5 % (5088/7764) |
| **Autumn Leaves (cahier)** | | | | | | |
| Grille écrite attendue (structure vraie) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) |
| Forme et grille attendues (chaîne complète) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) |
| Cas | 70 | 70 | 70 | 70 | 70 | 70 |
| Temps de calcul (ms) | 1550 | 2252 | 1464 | 1889 | 1321 | 2221 |

### Autumn Leaves (exemple du cahier, C14)

- parfait / pistes / sans grille : grille (structure vraie) **passe** ; chaîne complète **passe**
- parfait / pistes / grille connue : grille (structure vraie) **passe** ; chaîne complète **passe**
- parfait / sans séparation / sans grille : grille (structure vraie) **passe** ; chaîne complète **passe**
- parfait / sans séparation / grille connue : grille (structure vraie) **passe** ; chaîne complète **passe**
- parfait / sans audio / sans grille : grille (structure vraie) **passe** ; chaîne complète **échoue** (partie 2 : début décalé ; partie 3 : début décalé ; partie 4 : theme au lieu de solo ; +34)
- parfait / sans audio / grille connue : grille (structure vraie) **passe** ; chaîne complète **échoue** (4 parties au lieu de 5 ; partie 4 : theme au lieu de solo ; lettres de la forme ,AABC,AABC,AABC au lieu de ,AABC,AABC,AA,BC)
- realiste / pistes / sans grille : grille (structure vraie) **échoue** (A mesure 8 : « % » attendu ; C mesure 4 : Am7 G#7 attendu ; C mesure 4 : Am7 G#7 attendu ; +1) ; chaîne complète **échoue** (6 parties au lieu de 5 ; partie 4 : instrument winds au lieu de trumpet ; lettres de la forme ,AABC,AABC,AA,BC, au lieu de ,AABC,AABC,AA,BC ; +10)
- realiste / pistes / grille connue : grille (structure vraie) **passe** ; chaîne complète **échoue** (partie 4 : instrument winds au lieu de trumpet)
- realiste / sans séparation / sans grille : grille (structure vraie) **échoue** (A mesure 8 : « % » attendu ; C mesure 4 : Am7 G#7 attendu ; C mesure 4 : Am7 G#7 attendu ; +1) ; chaîne complète **échoue** (3 parties au lieu de 5 ; lettres de la forme ,AABC,AABCAABC au lieu de ,AABC,AABC,AA,BC ; grille : A mesure 8 : « % » attendu ; +8)
- realiste / sans séparation / grille connue : grille (structure vraie) **passe** ; chaîne complète **échoue** (3 parties au lieu de 5 ; lettres de la forme ,AABC,AABCAABC au lieu de ,AABC,AABC,AA,BC)
- realiste / sans audio / sans grille : grille (structure vraie) **échoue** (A mesure 8 : « % » attendu ; C mesure 4 : Am7 G#7 attendu ; C mesure 4 : Am7 G#7 attendu ; +1) ; chaîne complète **échoue** (partie 2 : début décalé ; partie 3 : début décalé ; partie 4 : theme au lieu de solo ; +23)
- realiste / sans audio / grille connue : grille (structure vraie) **passe** ; chaîne complète **échoue** (4 parties au lieu de 5 ; partie 4 : theme au lieu de solo ; lettres de la forme ,AABC,AABC,AABC au lieu de ,AABC,AABC,AA,BC)
- mauvais / pistes / sans grille : grille (structure vraie) **échoue** (B mesure 1 : C#m7b5 attendu ; B mesure 5 : Em7 attendu ; B mesure 7 : Dmaj7 attendu ; +2) ; chaîne complète **échoue** (6 parties au lieu de 5 ; partie 1 : theme au lieu de intro ; partie 2 : solo au lieu de theme ; +35)
- mauvais / pistes / grille connue : grille (structure vraie) **échoue** (C : 7 mesures au lieu de 8 ; intro : Bm attendu) ; chaîne complète **échoue** (6 parties au lieu de 5 ; partie 2 : instrument null au lieu de voice ; partie 2 : début décalé ; +11)
- mauvais / sans séparation / sans grille : grille (structure vraie) **échoue** (B mesure 1 : C#m7b5 attendu ; B mesure 5 : Em7 attendu ; B mesure 7 : Dmaj7 attendu ; +2) ; chaîne complète **échoue** (3 parties au lieu de 5 ; partie 1 : theme au lieu de intro ; partie 2 : solo au lieu de theme ; +33)
- mauvais / sans séparation / grille connue : grille (structure vraie) **échoue** (C : 7 mesures au lieu de 8 ; intro : Bm attendu) ; chaîne complète **échoue** (3 parties au lieu de 5 ; partie 2 : début décalé ; lettres de la forme ,AABC,AABCAABC au lieu de ,AABC,AABC,AA,BC ; +2)
- mauvais / sans audio / sans grille : grille (structure vraie) **échoue** (B mesure 1 : C#m7b5 attendu ; B mesure 5 : Em7 attendu ; B mesure 7 : Dmaj7 attendu ; +2) ; chaîne complète **échoue** (4 parties au lieu de 5 ; partie 1 : theme au lieu de intro ; partie 2 : solo au lieu de theme ; +36)
- mauvais / sans audio / grille connue : grille (structure vraie) **échoue** (C : 7 mesures au lieu de 8 ; intro : Bm attendu) ; chaîne complète **échoue** (4 parties au lieu de 5 ; partie 2 : début décalé ; partie 4 : theme au lieu de solo ; +3)
