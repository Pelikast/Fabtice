# Banc de structure — Tier R, modèle d’accords détaillé

Écrit par `node dist/run.mjs` (dans `web/spikes/structure/`), avec les détecteurs de `app/src/structure/index.ts`.
Grille et accords : l’analyse de l’app sur le mélange rendu, avec le **modèle d’accords détaillé** (Tsumugi-Chords, `banc/fin.ts`) ; seulement les morceaux de `analyses-fin/`. Pistes : les rendus séparés de chaque instrument (séparation PARFAITE, idéalisée) ;
reconnaissance des vents simulée (taux « realiste » du Tier S).

| Condition | Morceaux | Accords de l’analyse justes (famille, par temps) | Barres de mesure trouvées (±70 ms) |
|---|---:|---:|---:|
| propre | 14 | 86.0 % | 96.7 % |
| disque | 2 | 81.0 % | 98.6 % |

Sans analyse ni rendu (ignorés) : aaba-chant-vibes.propre, aaba-cinq-solistes.propre, aabc-clarinette.propre, abac-quatre-vents.propre, abac-quatre-vents.disque, abac-trompette.propre, abac-trompette.disque, blue-bossa-flute.propre, blues-mineur-vents.propre, blues-shuffle-chant.propre, demi-chorus.propre, ipanema-chant.propre, ipanema-chant.disque, mineur-pont-majeur.propre, pont-autre-ton.propre, pont-autre-ton.disque, pont-en-mi.propre, pop-ballade.propre, pop-ballade.disque, pop-mineur.propre, pop-rock.propre, pop-valse.propre, relatif-va-et-vient.propre, rhythm-tenor-long.propre, rhythm-tenor-long.disque, satin-doll-tag.propre, satin-doll-tag.disque, so-what-modal.propre.

### Tier R — erreurs d’analyse : propre

| Mesure | pistes (rendus séparés) / sans grille | pistes (rendus séparés) / grille connue | sans séparation / sans grille | sans séparation / grille connue |
|---|---:|---:|---:|---:|
| **Forme** | | | | |
| Longueur du chorus exacte | 75.0 % (9/12) | 91.7 % (11/12) | 83.3 % (10/12) | 91.7 % (11/12) |
| Limites de chorus ±1 : précision | 91.5 % (54/59) | 86.0 % (43/50) | 93.2 % (55/59) | 86.0 % (43/50) |
| Limites de chorus ±1 : rappel | 87.1 % (54/62) | 69.4 % (43/62) | 88.7 % (55/62) | 69.4 % (43/62) |
| Limites de sections ±1 : précision | 94.9 % (130/137) | 82.4 % (108/131) | 95.6 % (131/137) | 82.4 % (108/131) |
| Limites de sections ±1 : rappel | 85.0 % (130/153) | 70.6 % (108/153) | 85.6 % (131/153) | 70.6 % (108/153) |
| Limites de sections ±1 : mesure F | 84.8 % (12/14) | 70.9 % (10/14) | 85.7 % (12/14) | 70.9 % (10/14) |
| Lettres : mesure F par paires de mesures | 83.8 % (12/14) | 75.9 % (11/14) | 83.6 % (12/14) | 75.9 % (11/14) |
| Forme (AABA…) exacte | 83.3 % (10/12) | 91.7 % (11/12) | 83.3 % (10/12) | 91.7 % (11/12) |
| Mesures d’intro exactes | 71.4 % (10/14) | 57.1 % (8/14) | 78.6 % (11/14) | 57.1 % (8/14) |
| Mesures d’outro exactes | 85.7 % (12/14) | 57.1 % (8/14) | 92.9 % (13/14) | 57.1 % (8/14) |
| Mode Jazz / Pop juste | 100.0 % (14/14) | 100.0 % (14/14) | 100.0 % (14/14) | 100.0 % (14/14) |
| **Parties** | | | | |
| Limites de parties ±1 : précision | 83.3 % (75/90) | 81.2 % (69/85) | 93.3 % (56/60) | 86.2 % (56/65) |
| Limites de parties ±1 : rappel | 90.4 % (75/83) | 83.1 % (69/83) | 67.5 % (56/83) | 67.5 % (56/83) |
| Limites de parties ±1 : mesure F | 88.7 % (12/14) | 83.0 % (12/14) | 78.2 % (11/14) | 75.8 % (11/14) |
| Type de partie juste (thème, solo, intro…) | 94.2 % (65/69) | 84.1 % (58/69) | 81.2 % (56/69) | 71.0 % (49/69) |
| Numéro juste (vide lu comme 1 ; vide juste pour un soliste nommé qui ne revient pas) | 73.9 % (51/69) | 66.7 % (46/69) | 52.2 % (36/69) | 42.0 % (29/69) |
| Long solo d’un seul instrument non coupé | 66.7 % (6/9) | 66.7 % (6/9) | 100.0 % (9/9) | 77.8 % (7/9) |
| Solos voisins d’instruments différents séparés | 61.9 % (13/21) | 57.1 % (12/21) | 23.8 % (5/21) | 33.3 % (7/21) |
| **Instruments** | | | | |
| Instrument juste : piano, guitare, basse, batterie, voix | 73.3 % (22/30) | 73.3 % (22/30) | – | – |
| Vents et vibraphone : instrument exact | 64.7 % (22/34) | 47.1 % (16/34) | – | – |
| Vents et vibraphone : « Vents » | 5.9 % (2/34) | 5.9 % (2/34) | – | – |
| Instrument nommé FAUX (toutes parties) ↓ | 4.7 % (3/64) | 4.7 % (3/64) | – | – |
| Instrument nommé sans séparation (doit être 0) ↓ | – | – | 0.0 % (0/46) | 0.0 % (0/51) |
| **Modulations** | | | | |
| Modulations : précision | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| Modulations : rappel | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| Modulations : écart de position (mesures) ↓ | 0.00 | 0.00 | 0.00 | 0.00 |
| Modulations trouvées : tonalité exacte | 50.0 % (1/2) | 50.0 % (1/2) | 50.0 % (1/2) | 50.0 % (1/2) |
| Fausses modulations sur les morceaux sans modulation ↓ | 0 | 0 | 0 | 0 |
| Morceaux sans modulation qui en reçoivent une ↓ | 0.0 % (0/12) | 0.0 % (0/12) | 0.0 % (0/12) | 0.0 % (0/12) |
| **Grille simplifiée (structure vraie)** | | | | |
| Rien à replier : pas de grille simplifiée | 100.0 % (1/1) | 100.0 % (1/1) | 100.0 % (1/1) | 100.0 % (1/1) |
| Accords écrits justes (famille, par temps) | 92.9 % (903/972) | 99.6 % (968/972) | 92.9 % (903/972) | 99.6 % (968/972) |
| Nombre de sections exact | 100.0 % (13/13) | 100.0 % (13/13) | 100.0 % (13/13) | 100.0 % (13/13) |
| Reprises `xN` exactes | 96.8 % (30/31) | 96.8 % (30/31) | 96.8 % (30/31) | 96.8 % (30/31) |
| Mesure jouée → mesure écrite juste | 98.7 % (1333/1350) | 98.7 % (1333/1350) | 98.7 % (1333/1350) | 98.7 % (1333/1350) |
| **Grille simplifiée (chaîne complète)** | | | | |
| Accords écrits justes (famille, par temps) | 71.4 % (694/972) | 63.5 % (617/972) | 76.1 % (740/972) | 63.5 % (617/972) |
| Nombre de sections exact | 76.9 % (10/13) | 61.5 % (8/13) | 76.9 % (10/13) | 61.5 % (8/13) |
| Mesure jouée → mesure écrite juste | 71.4 % (964/1350) | 52.5 % (709/1350) | 67.9 % (917/1350) | 52.5 % (709/1350) |
| **Autumn Leaves (cahier)** | | | | |
| Grille écrite attendue (structure vraie) | 0.0 % (0/1) | 100.0 % (1/1) | 0.0 % (0/1) | 100.0 % (1/1) |
| Forme et grille attendues (chaîne complète) | 0.0 % (0/1) | 100.0 % (1/1) | 0.0 % (0/1) | 0.0 % (0/1) |
| Cas | 14 | 14 | 14 | 14 |
| Temps de calcul (ms) | 250 | 251 | 152 | 179 |

### Tier R — erreurs d’analyse : disque

| Mesure | pistes (rendus séparés) / sans grille | pistes (rendus séparés) / grille connue | sans séparation / sans grille | sans séparation / grille connue |
|---|---:|---:|---:|---:|
| **Forme** | | | | |
| Longueur du chorus exacte | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| Limites de chorus ±1 : précision | 100.0 % (13/13) | 100.0 % (13/13) | 100.0 % (13/13) | 100.0 % (13/13) |
| Limites de chorus ±1 : rappel | 100.0 % (13/13) | 100.0 % (13/13) | 100.0 % (13/13) | 100.0 % (13/13) |
| Limites de sections ±1 : précision | 100.0 % (22/22) | 100.0 % (22/22) | 100.0 % (22/22) | 100.0 % (22/22) |
| Limites de sections ±1 : rappel | 100.0 % (22/22) | 100.0 % (22/22) | 100.0 % (22/22) | 100.0 % (22/22) |
| Limites de sections ±1 : mesure F | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| Lettres : mesure F par paires de mesures | 87.2 % (2/2) | 100.0 % (2/2) | 86.8 % (2/2) | 100.0 % (2/2) |
| Forme (AABA…) exacte | 50.0 % (1/2) | 100.0 % (2/2) | 50.0 % (1/2) | 100.0 % (2/2) |
| Mesures d’intro exactes | 100.0 % (2/2) | 100.0 % (2/2) | 50.0 % (1/2) | 100.0 % (2/2) |
| Mesures d’outro exactes | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| Mode Jazz / Pop juste | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| **Parties** | | | | |
| Limites de parties ±1 : précision | 100.0 % (13/13) | 100.0 % (13/13) | 92.3 % (12/13) | 100.0 % (12/12) |
| Limites de parties ±1 : rappel | 100.0 % (13/13) | 100.0 % (13/13) | 92.3 % (12/13) | 92.3 % (12/13) |
| Limites de parties ±1 : mesure F | 100.0 % (2/2) | 100.0 % (2/2) | 92.9 % (2/2) | 96.2 % (2/2) |
| Type de partie juste (thème, solo, intro…) | 100.0 % (11/11) | 100.0 % (11/11) | 90.9 % (10/11) | 90.9 % (10/11) |
| Numéro juste (vide lu comme 1 ; vide juste pour un soliste nommé qui ne revient pas) | 100.0 % (11/11) | 100.0 % (11/11) | 63.6 % (7/11) | 63.6 % (7/11) |
| Long solo d’un seul instrument non coupé | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| Solos voisins d’instruments différents séparés | 100.0 % (4/4) | 100.0 % (4/4) | 75.0 % (3/4) | 75.0 % (3/4) |
| **Instruments** | | | | |
| Instrument juste : piano, guitare, basse, batterie, voix | 85.7 % (6/7) | 85.7 % (6/7) | – | – |
| Vents et vibraphone : instrument exact | 100.0 % (3/3) | 100.0 % (3/3) | – | – |
| Vents et vibraphone : « Vents » | 0.0 % (0/3) | 0.0 % (0/3) | – | – |
| Instrument nommé FAUX (toutes parties) ↓ | 0.0 % (0/10) | 0.0 % (0/10) | – | – |
| Instrument nommé sans séparation (doit être 0) ↓ | – | – | 0.0 % (0/11) | 0.0 % (0/10) |
| **Modulations** | | | | |
| Modulations : précision | – | – | – | – |
| Modulations : rappel | – | – | – | – |
| Modulations : écart de position (mesures) ↓ | – | – | – | – |
| Modulations trouvées : tonalité exacte | – | – | – | – |
| Fausses modulations sur les morceaux sans modulation ↓ | 0 | 0 | 0 | 0 |
| Morceaux sans modulation qui en reçoivent une ↓ | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) |
| **Grille simplifiée (structure vraie)** | | | | |
| Rien à replier : pas de grille simplifiée | – | – | – | – |
| Accords écrits justes (famille, par temps) | 88.8 % (142/160) | 100.0 % (160/160) | 88.8 % (142/160) | 100.0 % (160/160) |
| Nombre de sections exact | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| Reprises `xN` exactes | 100.0 % (5/5) | 100.0 % (5/5) | 100.0 % (5/5) | 100.0 % (5/5) |
| Mesure jouée → mesure écrite juste | 95.3 % (221/232) | 95.3 % (221/232) | 95.3 % (221/232) | 95.3 % (221/232) |
| **Grille simplifiée (chaîne complète)** | | | | |
| Accords écrits justes (famille, par temps) | 75.0 % (120/160) | 100.0 % (160/160) | 46.3 % (74/160) | 100.0 % (160/160) |
| Nombre de sections exact | 50.0 % (1/2) | 100.0 % (2/2) | 0.0 % (0/2) | 100.0 % (2/2) |
| Mesure jouée → mesure écrite juste | 84.5 % (196/232) | 95.3 % (221/232) | 32.8 % (76/232) | 95.3 % (221/232) |
| **Autumn Leaves (cahier)** | | | | |
| Grille écrite attendue (structure vraie) | 0.0 % (0/1) | 100.0 % (1/1) | 0.0 % (0/1) | 100.0 % (1/1) |
| Forme et grille attendues (chaîne complète) | 0.0 % (0/1) | 100.0 % (1/1) | 0.0 % (0/1) | 0.0 % (0/1) |
| Cas | 2 | 2 | 2 | 2 |
| Temps de calcul (ms) | 27 | 32 | 28 | 27 |

### Autumn Leaves (exemple du cahier, C14)

- propre / pistes (rendus séparés) / sans grille : grille (structure vraie) **échoue** (B mesure 5 : Em7 attendu ; C mesure 1 : C#m7b5 attendu ; C mesure 3 : Bm Bb7 attendu ; +2) ; chaîne complète **échoue** (grille : B mesure 5 : Em7 attendu ; grille : C mesure 1 : C#m7b5 attendu ; grille : C mesure 3 : Bm Bb7 attendu ; +2)
- propre / pistes (rendus séparés) / grille connue : grille (structure vraie) **passe** ; chaîne complète **passe**
- propre / sans séparation / sans grille : grille (structure vraie) **échoue** (B mesure 5 : Em7 attendu ; C mesure 1 : C#m7b5 attendu ; C mesure 3 : Bm Bb7 attendu ; +2) ; chaîne complète **échoue** (partie 5 : solo au lieu de theme ; partie 5 : numéro 2 attendu ; grille : B mesure 5 : Em7 attendu ; +4)
- propre / sans séparation / grille connue : grille (structure vraie) **passe** ; chaîne complète **échoue** (partie 5 : solo au lieu de theme ; partie 5 : numéro 2 attendu)
- disque / pistes (rendus séparés) / sans grille : grille (structure vraie) **échoue** (A mesure 3 : Dmaj7 attendu ; B mesure 5 : Em7 attendu ; C mesure 3 : Bm Bb7 attendu ; +5) ; chaîne complète **échoue** (forme AABA au lieu de AABC ; lettres de la forme ,AABA,AABA,AA,BA au lieu de ,AABC,AABC,AA,BC ; grille : sections intro,A,B au lieu de intro,A,B,C ; +2)
- disque / pistes (rendus séparés) / grille connue : grille (structure vraie) **passe** ; chaîne complète **passe**
- disque / sans séparation / sans grille : grille (structure vraie) **échoue** (A mesure 3 : Dmaj7 attendu ; B mesure 5 : Em7 attendu ; C mesure 3 : Bm Bb7 attendu ; +5) ; chaîne complète **échoue** (forme AABA au lieu de AABC ; partie 5 : solo au lieu de theme ; partie 5 : numéro 2 attendu ; +4)
- disque / sans séparation / grille connue : grille (structure vraie) **passe** ; chaîne complète **échoue** (partie 5 : solo au lieu de theme ; partie 5 : numéro 2 attendu)
