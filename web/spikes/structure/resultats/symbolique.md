# Banc de structure — Tier S (symbolique)

Écrit par `FABTICE_STRUCTURE_FULL=1 npx vitest run src/structure/bench.test.ts` (dans `app/`), avec les détecteurs de `app/src/structure/index.ts`.

### Tier S, corpus entier (2 tirages) — erreurs d’analyse : parfait

| Mesure | pistes / sans grille | pistes / grille connue | sans séparation / sans grille | sans séparation / grille connue | sans audio / sans grille | sans audio / grille connue |
|---|---:|---:|---:|---:|---:|---:|
| **Forme** | | | | | | |
| Longueur du chorus exacte | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) |
| Limites de chorus ±1 : précision | – | – | – | – | – | – |
| Limites de chorus ±1 : rappel | 0.0 % (0/290) | 0.0 % (0/290) | 0.0 % (0/290) | 0.0 % (0/290) | 0.0 % (0/290) | 0.0 % (0/290) |
| Limites de sections ±1 : précision | – | – | – | – | – | – |
| Limites de sections ±1 : rappel | 0.0 % (0/904) | 0.0 % (0/904) | 0.0 % (0/904) | 0.0 % (0/904) | 0.0 % (0/904) | 0.0 % (0/904) |
| Limites de sections ±1 : mesure F | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) |
| Lettres : mesure F par paires de mesures | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) |
| Forme (AABA…) exacte | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) |
| Mesures d’intro exactes | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) |
| Mesures d’outro exactes | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) |
| Mode Jazz / Pop juste | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) |
| **Parties** | | | | | | |
| Limites de parties ±1 : précision | – | – | – | – | – | – |
| Limites de parties ±1 : rappel | 0.0 % (0/446) | 0.0 % (0/446) | 0.0 % (0/446) | 0.0 % (0/446) | 0.0 % (0/446) | 0.0 % (0/446) |
| Limites de parties ±1 : mesure F | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) |
| Type de partie juste (thème, solo, intro…) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) |
| Numéro juste (vide lu comme 1) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) |
| Long solo d’un seul instrument non coupé | 0.0 % (0/36) | 0.0 % (0/36) | 0.0 % (0/36) | 0.0 % (0/36) | 0.0 % (0/36) | 0.0 % (0/36) |
| Solos voisins d’instruments différents séparés | 0.0 % (0/90) | 0.0 % (0/90) | 0.0 % (0/90) | 0.0 % (0/90) | 0.0 % (0/90) | 0.0 % (0/90) |
| **Instruments** | | | | | | |
| Instrument juste : piano, guitare, basse, batterie, voix | 0.0 % (0/154) | 0.0 % (0/154) | – | – | – | – |
| Vents et vibraphone : instrument exact | 0.0 % (0/178) | 0.0 % (0/178) | – | – | – | – |
| Vents et vibraphone : « Vents » | 0.0 % (0/178) | 0.0 % (0/178) | – | – | – | – |
| Instrument nommé FAUX (toutes parties) ↓ | 0.0 % (0/332) | 0.0 % (0/332) | – | – | – | – |
| Instrument nommé sans séparation (doit être 0) ↓ | – | – | – | – | – | – |
| **Modulations** | | | | | | |
| Modulations : précision | – | – | – | – | – | – |
| Modulations : rappel | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) |
| Modulations : écart de position (mesures) ↓ | – | – | – | – | – | – |
| Modulations trouvées : tonalité exacte | – | – | – | – | – | – |
| Fausses modulations sur les morceaux sans modulation ↓ | 0 | 0 | 0 | 0 | 0 | 0 |
| Morceaux sans modulation qui en reçoivent une ↓ | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) |
| **Grille simplifiée (structure vraie)** | | | | | | |
| Rien à replier : pas de grille simplifiée | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| Accords écrits justes (famille, par temps) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) |
| Nombre de sections exact | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) |
| Reprises `xN` exactes | 0.0 % (0/190) | 0.0 % (0/190) | 0.0 % (0/190) | 0.0 % (0/190) | 0.0 % (0/190) | 0.0 % (0/190) |
| Mesure jouée → mesure écrite juste | 0.0 % (0/7968) | 0.0 % (0/7968) | 0.0 % (0/7968) | 0.0 % (0/7968) | 0.0 % (0/7968) | 0.0 % (0/7968) |
| **Grille simplifiée (chaîne complète)** | | | | | | |
| Accords écrits justes (famille, par temps) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) |
| Nombre de sections exact | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) |
| Mesure jouée → mesure écrite juste | 0.0 % (0/7968) | 0.0 % (0/7968) | 0.0 % (0/7968) | 0.0 % (0/7968) | 0.0 % (0/7968) | 0.0 % (0/7968) |
| **Autumn Leaves (cahier)** | | | | | | |
| Grille écrite attendue (structure vraie) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) |
| Forme et grille attendues (chaîne complète) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) |
| Cas | 70 | 70 | 70 | 70 | 70 | 70 |
| Temps de calcul (ms) | 3 | 2 | 1 | 3 | 1 | 1 |

### Tier S, corpus entier (2 tirages) — erreurs d’analyse : realiste

| Mesure | pistes / sans grille | pistes / grille connue | sans séparation / sans grille | sans séparation / grille connue | sans audio / sans grille | sans audio / grille connue |
|---|---:|---:|---:|---:|---:|---:|
| **Forme** | | | | | | |
| Longueur du chorus exacte | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) |
| Limites de chorus ±1 : précision | – | – | – | – | – | – |
| Limites de chorus ±1 : rappel | 0.0 % (0/290) | 0.0 % (0/290) | 0.0 % (0/290) | 0.0 % (0/290) | 0.0 % (0/290) | 0.0 % (0/290) |
| Limites de sections ±1 : précision | – | – | – | – | – | – |
| Limites de sections ±1 : rappel | 0.0 % (0/904) | 0.0 % (0/904) | 0.0 % (0/904) | 0.0 % (0/904) | 0.0 % (0/904) | 0.0 % (0/904) |
| Limites de sections ±1 : mesure F | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) |
| Lettres : mesure F par paires de mesures | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) |
| Forme (AABA…) exacte | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) |
| Mesures d’intro exactes | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) |
| Mesures d’outro exactes | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) |
| Mode Jazz / Pop juste | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) |
| **Parties** | | | | | | |
| Limites de parties ±1 : précision | – | – | – | – | – | – |
| Limites de parties ±1 : rappel | 0.0 % (0/446) | 0.0 % (0/446) | 0.0 % (0/446) | 0.0 % (0/446) | 0.0 % (0/446) | 0.0 % (0/446) |
| Limites de parties ±1 : mesure F | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) |
| Type de partie juste (thème, solo, intro…) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) |
| Numéro juste (vide lu comme 1) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) |
| Long solo d’un seul instrument non coupé | 0.0 % (0/36) | 0.0 % (0/36) | 0.0 % (0/36) | 0.0 % (0/36) | 0.0 % (0/36) | 0.0 % (0/36) |
| Solos voisins d’instruments différents séparés | 0.0 % (0/90) | 0.0 % (0/90) | 0.0 % (0/90) | 0.0 % (0/90) | 0.0 % (0/90) | 0.0 % (0/90) |
| **Instruments** | | | | | | |
| Instrument juste : piano, guitare, basse, batterie, voix | 0.0 % (0/154) | 0.0 % (0/154) | – | – | – | – |
| Vents et vibraphone : instrument exact | 0.0 % (0/178) | 0.0 % (0/178) | – | – | – | – |
| Vents et vibraphone : « Vents » | 0.0 % (0/178) | 0.0 % (0/178) | – | – | – | – |
| Instrument nommé FAUX (toutes parties) ↓ | 0.0 % (0/332) | 0.0 % (0/332) | – | – | – | – |
| Instrument nommé sans séparation (doit être 0) ↓ | – | – | – | – | – | – |
| **Modulations** | | | | | | |
| Modulations : précision | – | – | – | – | – | – |
| Modulations : rappel | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) |
| Modulations : écart de position (mesures) ↓ | – | – | – | – | – | – |
| Modulations trouvées : tonalité exacte | – | – | – | – | – | – |
| Fausses modulations sur les morceaux sans modulation ↓ | 0 | 0 | 0 | 0 | 0 | 0 |
| Morceaux sans modulation qui en reçoivent une ↓ | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) |
| **Grille simplifiée (structure vraie)** | | | | | | |
| Rien à replier : pas de grille simplifiée | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| Accords écrits justes (famille, par temps) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) |
| Nombre de sections exact | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) |
| Reprises `xN` exactes | 0.0 % (0/190) | 0.0 % (0/190) | 0.0 % (0/190) | 0.0 % (0/190) | 0.0 % (0/190) | 0.0 % (0/190) |
| Mesure jouée → mesure écrite juste | 0.0 % (0/7900) | 0.0 % (0/7900) | 0.0 % (0/7900) | 0.0 % (0/7900) | 0.0 % (0/7900) | 0.0 % (0/7900) |
| **Grille simplifiée (chaîne complète)** | | | | | | |
| Accords écrits justes (famille, par temps) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) |
| Nombre de sections exact | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) |
| Mesure jouée → mesure écrite juste | 0.0 % (0/7900) | 0.0 % (0/7900) | 0.0 % (0/7900) | 0.0 % (0/7900) | 0.0 % (0/7900) | 0.0 % (0/7900) |
| **Autumn Leaves (cahier)** | | | | | | |
| Grille écrite attendue (structure vraie) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) |
| Forme et grille attendues (chaîne complète) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) |
| Cas | 70 | 70 | 70 | 70 | 70 | 70 |
| Temps de calcul (ms) | 2 | 1 | 1 | 1 | 1 | 1 |

### Tier S, corpus entier (2 tirages) — erreurs d’analyse : mauvais

| Mesure | pistes / sans grille | pistes / grille connue | sans séparation / sans grille | sans séparation / grille connue | sans audio / sans grille | sans audio / grille connue |
|---|---:|---:|---:|---:|---:|---:|
| **Forme** | | | | | | |
| Longueur du chorus exacte | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) |
| Limites de chorus ±1 : précision | – | – | – | – | – | – |
| Limites de chorus ±1 : rappel | 0.0 % (0/290) | 0.0 % (0/290) | 0.0 % (0/290) | 0.0 % (0/290) | 0.0 % (0/290) | 0.0 % (0/290) |
| Limites de sections ±1 : précision | – | – | – | – | – | – |
| Limites de sections ±1 : rappel | 0.0 % (0/904) | 0.0 % (0/904) | 0.0 % (0/904) | 0.0 % (0/904) | 0.0 % (0/904) | 0.0 % (0/904) |
| Limites de sections ±1 : mesure F | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) |
| Lettres : mesure F par paires de mesures | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) |
| Forme (AABA…) exacte | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) | 0.0 % (0/58) |
| Mesures d’intro exactes | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) |
| Mesures d’outro exactes | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) |
| Mode Jazz / Pop juste | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) |
| **Parties** | | | | | | |
| Limites de parties ±1 : précision | – | – | – | – | – | – |
| Limites de parties ±1 : rappel | 0.0 % (0/446) | 0.0 % (0/446) | 0.0 % (0/446) | 0.0 % (0/446) | 0.0 % (0/446) | 0.0 % (0/446) |
| Limites de parties ±1 : mesure F | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) | 0.0 % (0/70) |
| Type de partie juste (thème, solo, intro…) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) |
| Numéro juste (vide lu comme 1) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) | 0.0 % (0/376) |
| Long solo d’un seul instrument non coupé | 0.0 % (0/36) | 0.0 % (0/36) | 0.0 % (0/36) | 0.0 % (0/36) | 0.0 % (0/36) | 0.0 % (0/36) |
| Solos voisins d’instruments différents séparés | 0.0 % (0/90) | 0.0 % (0/90) | 0.0 % (0/90) | 0.0 % (0/90) | 0.0 % (0/90) | 0.0 % (0/90) |
| **Instruments** | | | | | | |
| Instrument juste : piano, guitare, basse, batterie, voix | 0.0 % (0/154) | 0.0 % (0/154) | – | – | – | – |
| Vents et vibraphone : instrument exact | 0.0 % (0/178) | 0.0 % (0/178) | – | – | – | – |
| Vents et vibraphone : « Vents » | 0.0 % (0/178) | 0.0 % (0/178) | – | – | – | – |
| Instrument nommé FAUX (toutes parties) ↓ | 0.0 % (0/332) | 0.0 % (0/332) | – | – | – | – |
| Instrument nommé sans séparation (doit être 0) ↓ | – | – | – | – | – | – |
| **Modulations** | | | | | | |
| Modulations : précision | – | – | – | – | – | – |
| Modulations : rappel | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) | 0.0 % (0/48) |
| Modulations : écart de position (mesures) ↓ | – | – | – | – | – | – |
| Modulations trouvées : tonalité exacte | – | – | – | – | – | – |
| Fausses modulations sur les morceaux sans modulation ↓ | 0 | 0 | 0 | 0 | 0 | 0 |
| Morceaux sans modulation qui en reçoivent une ↓ | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) | 0.0 % (0/60) |
| **Grille simplifiée (structure vraie)** | | | | | | |
| Rien à replier : pas de grille simplifiée | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) | 100.0 % (2/2) |
| Accords écrits justes (famille, par temps) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) |
| Nombre de sections exact | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) |
| Reprises `xN` exactes | 0.0 % (0/190) | 0.0 % (0/190) | 0.0 % (0/190) | 0.0 % (0/190) | 0.0 % (0/190) | 0.0 % (0/190) |
| Mesure jouée → mesure écrite juste | 0.0 % (0/7764) | 0.0 % (0/7764) | 0.0 % (0/7764) | 0.0 % (0/7764) | 0.0 % (0/7764) | 0.0 % (0/7764) |
| **Grille simplifiée (chaîne complète)** | | | | | | |
| Accords écrits justes (famille, par temps) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) | 0.0 % (0/5608) |
| Nombre de sections exact | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) | 0.0 % (0/68) |
| Mesure jouée → mesure écrite juste | 0.0 % (0/7764) | 0.0 % (0/7764) | 0.0 % (0/7764) | 0.0 % (0/7764) | 0.0 % (0/7764) | 0.0 % (0/7764) |
| **Autumn Leaves (cahier)** | | | | | | |
| Grille écrite attendue (structure vraie) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) |
| Forme et grille attendues (chaîne complète) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) | 0.0 % (0/2) |
| Cas | 70 | 70 | 70 | 70 | 70 | 70 |
| Temps de calcul (ms) | 1 | 1 | 1 | 1 | 1 | 2 |

### Autumn Leaves (exemple du cahier, C14)

- parfait / pistes / sans grille : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- parfait / pistes / grille connue : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- parfait / sans séparation / sans grille : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- parfait / sans séparation / grille connue : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- parfait / sans audio / sans grille : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- parfait / sans audio / grille connue : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- realiste / pistes / sans grille : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- realiste / pistes / grille connue : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- realiste / sans séparation / sans grille : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- realiste / sans séparation / grille connue : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- realiste / sans audio / sans grille : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- realiste / sans audio / grille connue : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- mauvais / pistes / sans grille : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- mauvais / pistes / grille connue : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- mauvais / sans séparation / sans grille : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- mauvais / sans séparation / grille connue : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- mauvais / sans audio / sans grille : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
- mauvais / sans audio / grille connue : grille (structure vraie) **échoue** (pas de grille simplifiée) ; chaîne complète **échoue** (pas de structure)
