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
| Longueur du chorus exacte | 0.0 % (0/29) | 0.0 % (0/29) | 0.0 % (0/29) | 0.0 % (0/29) |
| Limites de chorus ±1 : précision | – | – | – | – |
| Limites de chorus ±1 : rappel | 0.0 % (0/145) | 0.0 % (0/145) | 0.0 % (0/145) | 0.0 % (0/145) |
| Limites de sections ±1 : précision | – | – | – | – |
| Limites de sections ±1 : rappel | 0.0 % (0/452) | 0.0 % (0/452) | 0.0 % (0/452) | 0.0 % (0/452) |
| Limites de sections ±1 : mesure F | 0.0 % (0/35) | 0.0 % (0/35) | 0.0 % (0/35) | 0.0 % (0/35) |
| Lettres : mesure F par paires de mesures | 0.0 % (0/35) | 0.0 % (0/35) | 0.0 % (0/35) | 0.0 % (0/35) |
| Forme (AABA…) exacte | 0.0 % (0/29) | 0.0 % (0/29) | 0.0 % (0/29) | 0.0 % (0/29) |
| Mesures d’intro exactes | 0.0 % (0/35) | 0.0 % (0/35) | 0.0 % (0/35) | 0.0 % (0/35) |
| Mesures d’outro exactes | 0.0 % (0/35) | 0.0 % (0/35) | 0.0 % (0/35) | 0.0 % (0/35) |
| Mode Jazz / Pop juste | 0.0 % (0/35) | 0.0 % (0/35) | 0.0 % (0/35) | 0.0 % (0/35) |
| **Parties** | | | | |
| Limites de parties ±1 : précision | – | – | – | – |
| Limites de parties ±1 : rappel | 0.0 % (0/223) | 0.0 % (0/223) | 0.0 % (0/223) | 0.0 % (0/223) |
| Limites de parties ±1 : mesure F | 0.0 % (0/35) | 0.0 % (0/35) | 0.0 % (0/35) | 0.0 % (0/35) |
| Type de partie juste (thème, solo, intro…) | 0.0 % (0/188) | 0.0 % (0/188) | 0.0 % (0/188) | 0.0 % (0/188) |
| Numéro juste (vide lu comme 1) | 0.0 % (0/188) | 0.0 % (0/188) | 0.0 % (0/188) | 0.0 % (0/188) |
| Long solo d’un seul instrument non coupé | 0.0 % (0/18) | 0.0 % (0/18) | 0.0 % (0/18) | 0.0 % (0/18) |
| Solos voisins d’instruments différents séparés | 0.0 % (0/45) | 0.0 % (0/45) | 0.0 % (0/45) | 0.0 % (0/45) |
| **Instruments** | | | | |
| Instrument juste : piano, guitare, basse, batterie, voix | 0.0 % (0/77) | 0.0 % (0/77) | – | – |
| Vents et vibraphone : instrument exact | 0.0 % (0/89) | 0.0 % (0/89) | – | – |
| Vents et vibraphone : « Vents » | 0.0 % (0/89) | 0.0 % (0/89) | – | – |
| Instrument nommé FAUX (toutes parties) ↓ | 0.0 % (0/166) | 0.0 % (0/166) | – | – |
| Instrument nommé sans séparation (doit être 0) ↓ | – | – | – | – |
| **Modulations** | | | | |
| Modulations : précision | – | – | – | – |
| Modulations : rappel | 0.0 % (0/24) | 0.0 % (0/24) | 0.0 % (0/24) | 0.0 % (0/24) |
| Modulations : écart de position (mesures) ↓ | – | – | – | – |
| Modulations trouvées : tonalité exacte | – | – | – | – |
| Fausses modulations sur les morceaux sans modulation ↓ | 0 | 0 | 0 | 0 |
| Morceaux sans modulation qui en reçoivent une ↓ | 0.0 % (0/30) | 0.0 % (0/30) | 0.0 % (0/30) | 0.0 % (0/30) |
| **Grille simplifiée (structure vraie)** | | | | |
| Rien à replier : pas de grille simplifiée | 100.0 % (1/1) | 100.0 % (1/1) | 100.0 % (1/1) | 100.0 % (1/1) |
| Accords écrits justes (famille, par temps) | 0.0 % (0/2804) | 0.0 % (0/2804) | 0.0 % (0/2804) | 0.0 % (0/2804) |
| Nombre de sections exact | 0.0 % (0/34) | 0.0 % (0/34) | 0.0 % (0/34) | 0.0 % (0/34) |
| Reprises `xN` exactes | 0.0 % (0/95) | 0.0 % (0/95) | 0.0 % (0/95) | 0.0 % (0/95) |
| Mesure jouée → mesure écrite juste | 0.0 % (0/3959) | 0.0 % (0/3959) | 0.0 % (0/3959) | 0.0 % (0/3959) |
| **Grille simplifiée (chaîne complète)** | | | | |
| Accords écrits justes (famille, par temps) | 0.0 % (0/2804) | 0.0 % (0/2804) | 0.0 % (0/2804) | 0.0 % (0/2804) |
| Nombre de sections exact | 0.0 % (0/34) | 0.0 % (0/34) | 0.0 % (0/34) | 0.0 % (0/34) |
| Mesure jouée → mesure écrite juste | 0.0 % (0/3959) | 0.0 % (0/3959) | 0.0 % (0/3959) | 0.0 % (0/3959) |
| **Autumn Leaves (cahier)** | | | | |
| Grille écrite attendue (structure vraie) | 0.0 % (0/1) | 0.0 % (0/1) | 0.0 % (0/1) | 0.0 % (0/1) |
| Forme et grille attendues (chaîne complète) | 0.0 % (0/1) | 0.0 % (0/1) | 0.0 % (0/1) | 0.0 % (0/1) |
| Cas | 35 | 35 | 35 | 35 |
| Temps de calcul (ms) | 2 | 1 | 1 | 1 |

### Tier R — erreurs d’analyse : disque

| Mesure | pistes (rendus séparés) / sans grille | pistes (rendus séparés) / grille connue | sans séparation / sans grille | sans séparation / grille connue |
|---|---:|---:|---:|---:|
| **Forme** | | | | |
| Longueur du chorus exacte | 0.0 % (0/8) | 0.0 % (0/8) | 0.0 % (0/8) | 0.0 % (0/8) |
| Limites de chorus ±1 : précision | – | – | – | – |
| Limites de chorus ±1 : rappel | 0.0 % (0/39) | 0.0 % (0/39) | 0.0 % (0/39) | 0.0 % (0/39) |
| Limites de sections ±1 : précision | – | – | – | – |
| Limites de sections ±1 : rappel | 0.0 % (0/134) | 0.0 % (0/134) | 0.0 % (0/134) | 0.0 % (0/134) |
| Limites de sections ±1 : mesure F | 0.0 % (0/9) | 0.0 % (0/9) | 0.0 % (0/9) | 0.0 % (0/9) |
| Lettres : mesure F par paires de mesures | 0.0 % (0/9) | 0.0 % (0/9) | 0.0 % (0/9) | 0.0 % (0/9) |
| Forme (AABA…) exacte | 0.0 % (0/8) | 0.0 % (0/8) | 0.0 % (0/8) | 0.0 % (0/8) |
| Mesures d’intro exactes | 0.0 % (0/9) | 0.0 % (0/9) | 0.0 % (0/9) | 0.0 % (0/9) |
| Mesures d’outro exactes | 0.0 % (0/9) | 0.0 % (0/9) | 0.0 % (0/9) | 0.0 % (0/9) |
| Mode Jazz / Pop juste | 0.0 % (0/9) | 0.0 % (0/9) | 0.0 % (0/9) | 0.0 % (0/9) |
| **Parties** | | | | |
| Limites de parties ±1 : précision | – | – | – | – |
| Limites de parties ±1 : rappel | 0.0 % (0/59) | 0.0 % (0/59) | 0.0 % (0/59) | 0.0 % (0/59) |
| Limites de parties ±1 : mesure F | 0.0 % (0/9) | 0.0 % (0/9) | 0.0 % (0/9) | 0.0 % (0/9) |
| Type de partie juste (thème, solo, intro…) | 0.0 % (0/50) | 0.0 % (0/50) | 0.0 % (0/50) | 0.0 % (0/50) |
| Numéro juste (vide lu comme 1) | 0.0 % (0/50) | 0.0 % (0/50) | 0.0 % (0/50) | 0.0 % (0/50) |
| Long solo d’un seul instrument non coupé | 0.0 % (0/4) | 0.0 % (0/4) | 0.0 % (0/4) | 0.0 % (0/4) |
| Solos voisins d’instruments différents séparés | 0.0 % (0/11) | 0.0 % (0/11) | 0.0 % (0/11) | 0.0 % (0/11) |
| **Instruments** | | | | |
| Instrument juste : piano, guitare, basse, batterie, voix | 0.0 % (0/20) | 0.0 % (0/20) | – | – |
| Vents et vibraphone : instrument exact | 0.0 % (0/22) | 0.0 % (0/22) | – | – |
| Vents et vibraphone : « Vents » | 0.0 % (0/22) | 0.0 % (0/22) | – | – |
| Instrument nommé FAUX (toutes parties) ↓ | 0.0 % (0/42) | 0.0 % (0/42) | – | – |
| Instrument nommé sans séparation (doit être 0) ↓ | – | – | – | – |
| **Modulations** | | | | |
| Modulations : précision | – | – | – | – |
| Modulations : rappel | 0.0 % (0/4) | 0.0 % (0/4) | 0.0 % (0/4) | 0.0 % (0/4) |
| Modulations : écart de position (mesures) ↓ | – | – | – | – |
| Modulations trouvées : tonalité exacte | – | – | – | – |
| Fausses modulations sur les morceaux sans modulation ↓ | 0 | 0 | 0 | 0 |
| Morceaux sans modulation qui en reçoivent une ↓ | 0.0 % (0/8) | 0.0 % (0/8) | 0.0 % (0/8) | 0.0 % (0/8) |
| **Grille simplifiée (structure vraie)** | | | | |
| Rien à replier : pas de grille simplifiée | – | – | – | – |
| Accords écrits justes (famille, par temps) | 0.0 % (0/912) | 0.0 % (0/912) | 0.0 % (0/912) | 0.0 % (0/912) |
| Nombre de sections exact | 0.0 % (0/9) | 0.0 % (0/9) | 0.0 % (0/9) | 0.0 % (0/9) |
| Reprises `xN` exactes | 0.0 % (0/31) | 0.0 % (0/31) | 0.0 % (0/31) | 0.0 % (0/31) |
| Mesure jouée → mesure écrite juste | 0.0 % (0/1170) | 0.0 % (0/1170) | 0.0 % (0/1170) | 0.0 % (0/1170) |
| **Grille simplifiée (chaîne complète)** | | | | |
| Accords écrits justes (famille, par temps) | 0.0 % (0/912) | 0.0 % (0/912) | 0.0 % (0/912) | 0.0 % (0/912) |
| Nombre de sections exact | 0.0 % (0/9) | 0.0 % (0/9) | 0.0 % (0/9) | 0.0 % (0/9) |
| Mesure jouée → mesure écrite juste | 0.0 % (0/1170) | 0.0 % (0/1170) | 0.0 % (0/1170) | 0.0 % (0/1170) |
| **Autumn Leaves (cahier)** | | | | |
| Grille écrite attendue (structure vraie) | 0.0 % (0/1) | 0.0 % (0/1) | 0.0 % (0/1) | 0.0 % (0/1) |
| Forme et grille attendues (chaîne complète) | 0.0 % (0/1) | 0.0 % (0/1) | 0.0 % (0/1) | 0.0 % (0/1) |
| Cas | 9 | 9 | 9 | 9 |
| Temps de calcul (ms) | 0 | 0 | 0 | 0 |

### Autumn Leaves (exemple du cahier, C14)

- propre / pistes (rendus séparés) / sans grille : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- propre / pistes (rendus séparés) / grille connue : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- propre / sans séparation / sans grille : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- propre / sans séparation / grille connue : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- disque / pistes (rendus séparés) / sans grille : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- disque / pistes (rendus séparés) / grille connue : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- disque / sans séparation / sans grille : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- disque / sans séparation / grille connue : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
