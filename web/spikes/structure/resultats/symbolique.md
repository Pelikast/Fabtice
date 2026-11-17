# Banc de structure — Tier S (symbolique)

Écrit par `FABTICE_STRUCTURE_FULL=1 npx vitest run src/structure/bench.test.ts` (dans `app/`), avec les détecteurs de `app/src/structure/index.ts`.

### Tier S, corpus entier (2 tirages) — erreurs d’analyse : parfait

| Mesure | pistes / sans grille | pistes / grille connue | sans séparation / sans grille | sans séparation / grille connue | sans audio / sans grille | sans audio / grille connue |
|---|---:|---:|---:|---:|---:|---:|
| **Forme** | | | | | | |
| Longueur du chorus exacte | 96.6 % (56/58) | 100.0 % (58/58) | 96.6 % (56/58) | 100.0 % (58/58) | 96.6 % (56/58) | 100.0 % (58/58) |
| Limites de chorus ±1 : précision | 97.3 % (290/298) | 100.0 % (288/288) | 94.0 % (282/300) | 100.0 % (288/288) | 92.0 % (276/300) | 100.0 % (288/288) |
| Limites de chorus ±1 : rappel | 100.0 % (290/290) | 99.3 % (288/290) | 97.2 % (282/290) | 99.3 % (288/290) | 95.2 % (276/290) | 99.3 % (288/290) |
| Limites de sections ±1 : précision | 98.6 % (868/880) | 98.6 % (876/888) | 97.5 % (860/882) | 98.6 % (876/888) | 94.8 % (836/882) | 98.6 % (876/888) |
| Limites de sections ±1 : rappel | 96.0 % (868/904) | 96.9 % (876/904) | 95.1 % (860/904) | 96.9 % (876/904) | 92.5 % (836/904) | 96.9 % (876/904) |
| Limites de sections ±1 : mesure F | 93.3 % (65/70) | 93.9 % (66/70) | 90.5 % (63/70) | 93.9 % (66/70) | 87.6 % (61/70) | 93.9 % (66/70) |
| Lettres : mesure F par paires de mesures | 93.5 % (65/70) | 94.9 % (66/70) | 93.5 % (65/70) | 94.9 % (66/70) | 92.7 % (65/70) | 94.9 % (66/70) |
| Forme (AABA…) exacte | 96.6 % (56/58) | 100.0 % (58/58) | 96.6 % (56/58) | 100.0 % (58/58) | 96.6 % (56/58) | 100.0 % (58/58) |
| Mesures d’intro exactes | 91.4 % (64/70) | 94.3 % (66/70) | 88.6 % (62/70) | 94.3 % (66/70) | 82.9 % (58/70) | 94.3 % (66/70) |
| Mesures d’outro exactes | 94.3 % (66/70) | 91.4 % (64/70) | 91.4 % (64/70) | 91.4 % (64/70) | 88.6 % (62/70) | 91.4 % (64/70) |
| Mode Jazz / Pop juste | 100.0 % (70/70) | 100.0 % (70/70) | 100.0 % (70/70) | 100.0 % (70/70) | 100.0 % (70/70) | 100.0 % (70/70) |
| **Parties** | | | | | | |
| Limites de parties ±1 : précision | 95.5 % (426/446) | 96.8 % (426/440) | 93.3 % (361/387) | 95.4 % (371/389) | 88.1 % (310/352) | 93.2 % (328/352) |
| Limites de parties ±1 : rappel | 95.5 % (426/446) | 95.5 % (426/446) | 80.9 % (361/446) | 83.2 % (371/446) | 69.5 % (310/446) | 73.5 % (328/446) |
| Limites de parties ±1 : mesure F | 95.9 % (67/70) | 96.6 % (68/70) | 86.4 % (60/70) | 88.9 % (62/70) | 78.1 % (55/70) | 82.9 % (58/70) |
| Type de partie juste (thème, solo, intro…) | 97.9 % (368/376) | 97.9 % (368/376) | 89.4 % (336/376) | 91.0 % (342/376) | 92.0 % (346/376) | 93.1 % (350/376) |
| Numéro juste (vide lu comme 1) | 77.1 % (290/376) | 77.7 % (292/376) | 76.6 % (288/376) | 78.2 % (294/376) | 69.1 % (260/376) | 70.7 % (266/376) |
| Long solo d’un seul instrument non coupé | 100.0 % (36/36) | 100.0 % (36/36) | 100.0 % (36/36) | 100.0 % (36/36) | 100.0 % (36/36) | 100.0 % (36/36) |
| Solos voisins d’instruments différents séparés | 95.6 % (86/90) | 95.6 % (86/90) | 55.6 % (50/90) | 55.6 % (50/90) | 2.2 % (2/90) | 6.7 % (6/90) |
| **Instruments** | | | | | | |
| Instrument juste : piano, guitare, basse, batterie, voix | 96.1 % (148/154) | 94.8 % (146/154) | – | – | – | – |
| Vents et vibraphone : instrument exact | 93.8 % (167/178) | 93.8 % (167/178) | – | – | – | – |
| Vents et vibraphone : « Vents » | 5.6 % (10/178) | 5.6 % (10/178) | – | – | – | – |
| Instrument nommé FAUX (toutes parties) ↓ | 0.9 % (3/332) | 0.9 % (3/332) | – | – | – | – |
| Instrument nommé sans séparation (doit être 0) ↓ | – | – | 0.0 % (0/317) | 0.0 % (0/319) | 0.0 % (0/282) | 0.0 % (0/282) |
| **Modulations** | | | | | | |
| Modulations : précision | – | – | – | – | – | – |
| Modulations : rappel | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) |
| Modulations : écart de position (mesures) ↓ | – | – | – | – | – | – |
| Modulations trouvées : tonalité exacte | – | – | – | – | – | – |
| Fausses modulations sur les morceaux sans modulation ↓ | 0 | 0 | 0 | 0 | 0 | 0 |
| Morceaux sans modulation qui en reçoivent une ↓ | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) |
| **Grille simplifiée (structure vraie)** | | | | | | |
| Rien à replier : pas de grille simplifiée | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| Accords écrits justes (famille, par temps) | 96.6 % (5420/5608) | 96.9 % (5436/5608) | 96.6 % (5420/5608) | 96.9 % (5436/5608) | 96.6 % (5420/5608) | 96.9 % (5436/5608) |
| Nombre de sections exact | 100.0 % (68/68) | 100.0 % (68/68) | 100.0 % (68/68) | 100.0 % (68/68) | 100.0 % (68/68) | 100.0 % (68/68) |
| Reprises `xN` exactes | 97.9 % (186/190) | 97.9 % (186/190) | 97.9 % (186/190) | 97.9 % (186/190) | 97.9 % (186/190) | 97.9 % (186/190) |
| Mesure jouée → mesure écrite juste | 100.0 % (7968/7968) | 100.0 % (7968/7968) | 100.0 % (7968/7968) | 100.0 % (7968/7968) | 100.0 % (7968/7968) | 100.0 % (7968/7968) |
| **Grille simplifiée (chaîne complète)** | | | | | | |
| Accords écrits justes (famille, par temps) | 85.5 % (4796/5608) | 88.6 % (4966/5608) | 83.2 % (4668/5608) | 88.8 % (4978/5608) | 78.6 % (4410/5608) | 88.4 % (4958/5608) |
| Nombre de sections exact | 85.3 % (58/68) | 91.2 % (62/68) | 82.4 % (56/68) | 91.2 % (62/68) | 79.4 % (54/68) | 91.2 % (62/68) |
| Mesure jouée → mesure écrite juste | 92.4 % (7364/7968) | 96.2 % (7664/7968) | 90.9 % (7244/7968) | 96.2 % (7664/7968) | 86.8 % (6920/7968) | 96.2 % (7664/7968) |
| **Autumn Leaves (cahier)** | | | | | | |
| Grille écrite attendue (structure vraie) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| Forme et grille attendues (chaîne complète) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 0.0 % (0/2) | 0.0 % (0/2) |
| Cas | 70 | 70 | 70 | 70 | 70 | 70 |
| Temps de calcul (ms) | 919 | 1152 | 693 | 911 | 633 | 933 |

### Tier S, corpus entier (2 tirages) — erreurs d’analyse : realiste

| Mesure | pistes / sans grille | pistes / grille connue | sans séparation / sans grille | sans séparation / grille connue | sans audio / sans grille | sans audio / grille connue |
|---|---:|---:|---:|---:|---:|---:|
| **Forme** | | | | | | |
| Longueur du chorus exacte | 81.0 % (47/58) | 96.6 % (56/58) | 82.8 % (48/58) | 96.6 % (56/58) | 81.0 % (47/58) | 96.6 % (56/58) |
| Limites de chorus ±1 : précision | 87.7 % (256/292) | 100.0 % (288/288) | 81.8 % (239/292) | 100.0 % (288/288) | 77.4 % (226/292) | 100.0 % (288/288) |
| Limites de chorus ±1 : rappel | 88.3 % (256/290) | 99.3 % (288/290) | 82.4 % (239/290) | 99.3 % (288/290) | 77.9 % (226/290) | 99.3 % (288/290) |
| Limites de sections ±1 : précision | 87.3 % (753/863) | 96.7 % (848/877) | 83.2 % (717/862) | 96.7 % (848/877) | 79.2 % (683/862) | 96.7 % (848/877) |
| Limites de sections ±1 : rappel | 83.3 % (753/904) | 93.8 % (848/904) | 79.3 % (717/904) | 93.8 % (848/904) | 75.6 % (683/904) | 93.8 % (848/904) |
| Limites de sections ±1 : mesure F | 80.6 % (56/70) | 89.6 % (63/70) | 74.2 % (52/70) | 89.6 % (63/70) | 70.4 % (49/70) | 89.6 % (63/70) |
| Lettres : mesure F par paires de mesures | 82.0 % (57/70) | 89.4 % (63/70) | 80.6 % (56/70) | 89.4 % (63/70) | 80.2 % (56/70) | 89.4 % (63/70) |
| Forme (AABA…) exacte | 79.3 % (46/58) | 100.0 % (58/58) | 77.6 % (45/58) | 100.0 % (58/58) | 77.6 % (45/58) | 100.0 % (58/58) |
| Mesures d’intro exactes | 78.6 % (55/70) | 82.9 % (58/70) | 60.0 % (42/70) | 82.9 % (58/70) | 61.4 % (43/70) | 82.9 % (58/70) |
| Mesures d’outro exactes | 65.7 % (46/70) | 78.6 % (55/70) | 65.7 % (46/70) | 78.6 % (55/70) | 64.3 % (45/70) | 78.6 % (55/70) |
| Mode Jazz / Pop juste | 100.0 % (70/70) | 100.0 % (70/70) | 100.0 % (70/70) | 100.0 % (70/70) | 100.0 % (70/70) | 100.0 % (70/70) |
| **Parties** | | | | | | |
| Limites de parties ±1 : précision | 84.5 % (360/426) | 89.3 % (369/413) | 79.4 % (269/339) | 90.3 % (298/330) | 75.4 % (258/342) | 89.5 % (298/333) |
| Limites de parties ±1 : rappel | 80.7 % (360/446) | 82.7 % (369/446) | 60.3 % (269/446) | 66.8 % (298/446) | 57.8 % (258/446) | 66.8 % (298/446) |
| Limites de parties ±1 : mesure F | 83.7 % (59/70) | 87.2 % (61/70) | 70.6 % (49/70) | 79.2 % (55/70) | 67.8 % (47/70) | 79.4 % (56/70) |
| Type de partie juste (thème, solo, intro…) | 82.4 % (310/376) | 83.2 % (313/376) | 74.7 % (281/376) | 76.9 % (289/376) | 81.6 % (307/376) | 84.6 % (318/376) |
| Numéro juste (vide lu comme 1) | 61.4 % (231/376) | 62.8 % (236/376) | 50.8 % (191/376) | 53.7 % (202/376) | 57.7 % (217/376) | 60.6 % (228/376) |
| Long solo d’un seul instrument non coupé | 91.7 % (33/36) | 97.2 % (35/36) | 94.4 % (34/36) | 100.0 % (36/36) | 91.7 % (33/36) | 100.0 % (36/36) |
| Solos voisins d’instruments différents séparés | 76.7 % (69/90) | 78.9 % (71/90) | 24.4 % (22/90) | 28.9 % (26/90) | 2.2 % (2/90) | 6.7 % (6/90) |
| **Instruments** | | | | | | |
| Instrument juste : piano, guitare, basse, batterie, voix | 91.6 % (141/154) | 90.3 % (139/154) | – | – | – | – |
| Vents et vibraphone : instrument exact | 41.6 % (74/178) | 42.1 % (75/178) | – | – | – | – |
| Vents et vibraphone : « Vents » | 48.3 % (86/178) | 48.3 % (86/178) | – | – | – | – |
| Instrument nommé FAUX (toutes parties) ↓ | 4.8 % (16/332) | 5.1 % (17/332) | – | – | – | – |
| Instrument nommé sans séparation (doit être 0) ↓ | – | – | 0.0 % (0/269) | 0.0 % (0/260) | 0.0 % (0/272) | 0.0 % (0/263) |
| **Modulations** | | | | | | |
| Modulations : précision | – | – | – | – | – | – |
| Modulations : rappel | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) |
| Modulations : écart de position (mesures) ↓ | – | – | – | – | – | – |
| Modulations trouvées : tonalité exacte | – | – | – | – | – | – |
| Fausses modulations sur les morceaux sans modulation ↓ | 0 | 0 | 0 | 0 | 0 | 0 |
| Morceaux sans modulation qui en reçoivent une ↓ | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) |
| **Grille simplifiée (structure vraie)** | | | | | | |
| Rien à replier : pas de grille simplifiée | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| Accords écrits justes (famille, par temps) | 78.4 % (4397/5608) | 81.5 % (4572/5608) | 78.4 % (4397/5608) | 81.5 % (4572/5608) | 78.4 % (4397/5608) | 81.5 % (4572/5608) |
| Nombre de sections exact | 95.6 % (65/68) | 95.6 % (65/68) | 95.6 % (65/68) | 95.6 % (65/68) | 95.6 % (65/68) | 95.6 % (65/68) |
| Reprises `xN` exactes | 91.1 % (173/190) | 91.1 % (173/190) | 91.1 % (173/190) | 91.1 % (173/190) | 91.1 % (173/190) | 91.1 % (173/190) |
| Mesure jouée → mesure écrite juste | 98.3 % (7764/7900) | 98.3 % (7764/7900) | 98.3 % (7764/7900) | 98.3 % (7764/7900) | 98.3 % (7764/7900) | 98.3 % (7764/7900) |
| **Grille simplifiée (chaîne complète)** | | | | | | |
| Accords écrits justes (famille, par temps) | 51.1 % (2866/5608) | 70.3 % (3944/5608) | 44.1 % (2474/5608) | 70.8 % (3968/5608) | 44.1 % (2474/5608) | 70.4 % (3948/5608) |
| Nombre de sections exact | 66.2 % (45/68) | 77.9 % (53/68) | 58.8 % (40/68) | 77.9 % (53/68) | 60.3 % (41/68) | 77.9 % (53/68) |
| Mesure jouée → mesure écrite juste | 61.7 % (4877/7900) | 89.4 % (7063/7900) | 47.9 % (3781/7900) | 89.4 % (7063/7900) | 51.4 % (4058/7900) | 89.4 % (7063/7900) |
| **Autumn Leaves (cahier)** | | | | | | |
| Grille écrite attendue (structure vraie) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) |
| Forme et grille attendues (chaîne complète) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) |
| Cas | 70 | 70 | 70 | 70 | 70 | 70 |
| Temps de calcul (ms) | 1220 | 1412 | 1096 | 1209 | 942 | 1119 |

### Tier S, corpus entier (2 tirages) — erreurs d’analyse : mauvais

| Mesure | pistes / sans grille | pistes / grille connue | sans séparation / sans grille | sans séparation / grille connue | sans audio / sans grille | sans audio / grille connue |
|---|---:|---:|---:|---:|---:|---:|
| **Forme** | | | | | | |
| Longueur du chorus exacte | 32.8 % (19/58) | 93.1 % (54/58) | 31.0 % (18/58) | 93.1 % (54/58) | 31.0 % (18/58) | 93.1 % (54/58) |
| Limites de chorus ±1 : précision | 48.9 % (130/266) | 97.8 % (272/278) | 40.4 % (107/265) | 97.8 % (272/278) | 42.3 % (112/265) | 97.8 % (272/278) |
| Limites de chorus ±1 : rappel | 44.8 % (130/290) | 93.8 % (272/290) | 36.9 % (107/290) | 93.8 % (272/290) | 38.6 % (112/290) | 93.8 % (272/290) |
| Limites de sections ±1 : précision | 61.6 % (455/739) | 98.2 % (810/825) | 57.1 % (422/739) | 98.2 % (810/825) | 57.0 % (421/739) | 98.2 % (810/825) |
| Limites de sections ±1 : rappel | 50.3 % (455/904) | 89.6 % (810/904) | 46.7 % (422/904) | 89.6 % (810/904) | 46.6 % (421/904) | 89.6 % (810/904) |
| Limites de sections ±1 : mesure F | 44.6 % (31/70) | 84.0 % (59/70) | 39.6 % (28/70) | 84.0 % (59/70) | 40.3 % (28/70) | 84.0 % (59/70) |
| Lettres : mesure F par paires de mesures | 54.5 % (38/70) | 83.0 % (58/70) | 54.3 % (38/70) | 83.0 % (58/70) | 54.3 % (38/70) | 83.0 % (58/70) |
| Forme (AABA…) exacte | 41.4 % (24/58) | 100.0 % (58/58) | 41.4 % (24/58) | 100.0 % (58/58) | 41.4 % (24/58) | 100.0 % (58/58) |
| Mesures d’intro exactes | 40.0 % (28/70) | 75.7 % (53/70) | 34.3 % (24/70) | 75.7 % (53/70) | 32.9 % (23/70) | 75.7 % (53/70) |
| Mesures d’outro exactes | 34.3 % (24/70) | 58.6 % (41/70) | 30.0 % (21/70) | 58.6 % (41/70) | 32.9 % (23/70) | 58.6 % (41/70) |
| Mode Jazz / Pop juste | 98.6 % (69/70) | 98.6 % (69/70) | 98.6 % (69/70) | 98.6 % (69/70) | 98.6 % (69/70) | 98.6 % (69/70) |
| **Parties** | | | | | | |
| Limites de parties ±1 : précision | 65.9 % (275/417) | 82.9 % (324/391) | 62.3 % (177/284) | 89.9 % (232/258) | 59.9 % (182/304) | 88.8 % (262/295) |
| Limites de parties ±1 : rappel | 61.7 % (275/446) | 72.6 % (324/446) | 39.7 % (177/446) | 52.0 % (232/446) | 40.8 % (182/446) | 58.7 % (262/446) |
| Limites de parties ±1 : mesure F | 63.2 % (44/70) | 77.4 % (54/70) | 49.8 % (35/70) | 67.3 % (47/70) | 50.2 % (35/70) | 72.4 % (51/70) |
| Type de partie juste (thème, solo, intro…) | 66.8 % (251/376) | 72.3 % (272/376) | 59.0 % (222/376) | 65.4 % (246/376) | 62.0 % (233/376) | 73.7 % (277/376) |
| Numéro juste (vide lu comme 1) | 42.0 % (158/376) | 50.8 % (191/376) | 33.8 % (127/376) | 42.8 % (161/376) | 40.4 % (152/376) | 52.4 % (197/376) |
| Long solo d’un seul instrument non coupé | 72.2 % (26/36) | 83.3 % (30/36) | 83.3 % (30/36) | 97.2 % (35/36) | 86.1 % (31/36) | 91.7 % (33/36) |
| Solos voisins d’instruments différents séparés | 64.4 % (58/90) | 71.1 % (64/90) | 6.7 % (6/90) | 13.3 % (12/90) | 3.3 % (3/90) | 11.1 % (10/90) |
| **Instruments** | | | | | | |
| Instrument juste : piano, guitare, basse, batterie, voix | 65.6 % (101/154) | 66.2 % (102/154) | – | – | – | – |
| Vents et vibraphone : instrument exact | 29.2 % (52/178) | 37.1 % (66/178) | – | – | – | – |
| Vents et vibraphone : « Vents » | 38.2 % (68/178) | 38.8 % (69/178) | – | – | – | – |
| Instrument nommé FAUX (toutes parties) ↓ | 12.0 % (40/332) | 12.0 % (40/332) | – | – | – | – |
| Instrument nommé sans séparation (doit être 0) ↓ | – | – | 0.0 % (0/219) | 0.0 % (0/193) | 0.0 % (0/239) | 0.0 % (0/230) |
| **Modulations** | | | | | | |
| Modulations : précision | – | – | – | – | – | – |
| Modulations : rappel | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) |
| Modulations : écart de position (mesures) ↓ | – | – | – | – | – | – |
| Modulations trouvées : tonalité exacte | – | – | – | – | – | – |
| Fausses modulations sur les morceaux sans modulation ↓ | 0 | 0 | 0 | 0 | 0 | 0 |
| Morceaux sans modulation qui en reçoivent une ↓ | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) |
| **Grille simplifiée (structure vraie)** | | | | | | |
| Rien à replier : pas de grille simplifiée | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| Accords écrits justes (famille, par temps) | 56.9 % (3191/5608) | 61.5 % (3447/5608) | 56.9 % (3191/5608) | 61.5 % (3447/5608) | 56.9 % (3191/5608) | 61.5 % (3447/5608) |
| Nombre de sections exact | 94.1 % (64/68) | 94.1 % (64/68) | 94.1 % (64/68) | 94.1 % (64/68) | 94.1 % (64/68) | 94.1 % (64/68) |
| Reprises `xN` exactes | 90.0 % (171/190) | 90.0 % (171/190) | 90.0 % (171/190) | 90.0 % (171/190) | 90.0 % (171/190) | 90.0 % (171/190) |
| Mesure jouée → mesure écrite juste | 78.0 % (6056/7764) | 78.0 % (6056/7764) | 78.0 % (6056/7764) | 78.0 % (6056/7764) | 78.0 % (6056/7764) | 78.0 % (6056/7764) |
| **Grille simplifiée (chaîne complète)** | | | | | | |
| Accords écrits justes (famille, par temps) | 17.7 % (994/5608) | 55.2 % (3095/5608) | 15.5 % (867/5608) | 54.7 % (3070/5608) | 15.6 % (875/5608) | 55.0 % (3084/5608) |
| Nombre de sections exact | 35.3 % (24/68) | 66.2 % (45/68) | 33.8 % (23/68) | 66.2 % (45/68) | 35.3 % (24/68) | 66.2 % (45/68) |
| Mesure jouée → mesure écrite juste | 18.6 % (1446/7764) | 65.4 % (5075/7764) | 15.2 % (1178/7764) | 65.4 % (5075/7764) | 15.2 % (1181/7764) | 65.4 % (5075/7764) |
| **Autumn Leaves (cahier)** | | | | | | |
| Grille écrite attendue (structure vraie) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) |
| Forme et grille attendues (chaîne complète) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) |
| Cas | 70 | 70 | 70 | 70 | 70 | 70 |
| Temps de calcul (ms) | 1046 | 1451 | 1026 | 1444 | 927 | 1259 |

### Autumn Leaves (exemple du cahier, C14)

- parfait / pistes / sans grille : grille (structure vraie) **passe** ; chaîne complète **passe**
- parfait / pistes / grille connue : grille (structure vraie) **passe** ; chaîne complète **passe**
- parfait / sans séparation / sans grille : grille (structure vraie) **passe** ; chaîne complète **passe**
- parfait / sans séparation / grille connue : grille (structure vraie) **passe** ; chaîne complète **passe**
- parfait / sans audio / sans grille : grille (structure vraie) **passe** ; chaîne complète **échoue** (partie 2 : début décalé ; partie 3 : début décalé ; partie 4 : theme au lieu de solo ; +34)
- parfait / sans audio / grille connue : grille (structure vraie) **passe** ; chaîne complète **échoue** (4 parties au lieu de 5 ; partie 4 : theme au lieu de solo ; lettres de la forme ,AABC,AABC,AABC au lieu de ,AABC,AABC,AA,BC)
- realiste / pistes / sans grille : grille (structure vraie) **échoue** (A mesure 8 : « % » attendu ; C mesure 4 : Am7 G#7 attendu ; C mesure 4 : Am7 G#7 attendu ; +1) ; chaîne complète **échoue** (6 parties au lieu de 5 ; partie 4 : instrument winds au lieu de trumpet ; lettres de la forme ,AABC,AABC,AA,BC, au lieu de ,AABC,AABC,AA,BC ; +10)
- realiste / pistes / grille connue : grille (structure vraie) **échoue** (A mesure 8 : « % » attendu ; C mesure 4 : Am7 G#7 attendu ; C mesure 4 : deux accords attendus) ; chaîne complète **échoue** (partie 4 : instrument winds au lieu de trumpet ; grille : A mesure 8 : « % » attendu ; grille : C mesure 4 : Am7 G#7 attendu ; +1)
- realiste / sans séparation / sans grille : grille (structure vraie) **échoue** (A mesure 8 : « % » attendu ; C mesure 4 : Am7 G#7 attendu ; C mesure 4 : Am7 G#7 attendu ; +1) ; chaîne complète **échoue** (3 parties au lieu de 5 ; lettres de la forme ,AABC,AABCAABC au lieu de ,AABC,AABC,AA,BC ; grille : A mesure 8 : « % » attendu ; +8)
- realiste / sans séparation / grille connue : grille (structure vraie) **échoue** (A mesure 8 : « % » attendu ; C mesure 4 : Am7 G#7 attendu ; C mesure 4 : deux accords attendus) ; chaîne complète **échoue** (3 parties au lieu de 5 ; lettres de la forme ,AABC,AABCAABC au lieu de ,AABC,AABC,AA,BC ; grille : A mesure 8 : « % » attendu ; +2)
- realiste / sans audio / sans grille : grille (structure vraie) **échoue** (A mesure 8 : « % » attendu ; C mesure 4 : Am7 G#7 attendu ; C mesure 4 : Am7 G#7 attendu ; +1) ; chaîne complète **échoue** (partie 2 : début décalé ; partie 3 : début décalé ; partie 4 : theme au lieu de solo ; +23)
- realiste / sans audio / grille connue : grille (structure vraie) **échoue** (A mesure 8 : « % » attendu ; C mesure 4 : Am7 G#7 attendu ; C mesure 4 : deux accords attendus) ; chaîne complète **échoue** (4 parties au lieu de 5 ; partie 4 : theme au lieu de solo ; lettres de la forme ,AABC,AABC,AABC au lieu de ,AABC,AABC,AA,BC ; +3)
- mauvais / pistes / sans grille : grille (structure vraie) **échoue** (B mesure 1 : C#m7b5 attendu ; B mesure 5 : Em7 attendu ; B mesure 7 : Dmaj7 attendu ; +2) ; chaîne complète **échoue** (6 parties au lieu de 5 ; partie 1 : theme au lieu de intro ; partie 2 : solo au lieu de theme ; +35)
- mauvais / pistes / grille connue : grille (structure vraie) **échoue** (B mesure 5 : Em7 attendu ; C : 7 mesures au lieu de 8 ; intro : Bm attendu) ; chaîne complète **échoue** (6 parties au lieu de 5 ; partie 2 : instrument null au lieu de voice ; partie 2 : début décalé ; +12)
- mauvais / sans séparation / sans grille : grille (structure vraie) **échoue** (B mesure 1 : C#m7b5 attendu ; B mesure 5 : Em7 attendu ; B mesure 7 : Dmaj7 attendu ; +2) ; chaîne complète **échoue** (3 parties au lieu de 5 ; partie 1 : theme au lieu de intro ; partie 2 : solo au lieu de theme ; +33)
- mauvais / sans séparation / grille connue : grille (structure vraie) **échoue** (B mesure 5 : Em7 attendu ; C : 7 mesures au lieu de 8 ; intro : Bm attendu) ; chaîne complète **échoue** (3 parties au lieu de 5 ; partie 2 : début décalé ; lettres de la forme ,AABC,AABCAABC au lieu de ,AABC,AABC,AA,BC ; +3)
- mauvais / sans audio / sans grille : grille (structure vraie) **échoue** (B mesure 1 : C#m7b5 attendu ; B mesure 5 : Em7 attendu ; B mesure 7 : Dmaj7 attendu ; +2) ; chaîne complète **échoue** (4 parties au lieu de 5 ; partie 1 : theme au lieu de intro ; partie 2 : solo au lieu de theme ; +36)
- mauvais / sans audio / grille connue : grille (structure vraie) **échoue** (B mesure 5 : Em7 attendu ; C : 7 mesures au lieu de 8 ; intro : Bm attendu) ; chaîne complète **échoue** (4 parties au lieu de 5 ; partie 2 : début décalé ; partie 4 : theme au lieu de solo ; +4)
