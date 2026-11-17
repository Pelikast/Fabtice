# Bilan de l'étape 2 — Interface

## Livré

**C6 — Menu Fabtice, barre de menus, raccourcis.**
- Un clic sur le logo ouvre le menu : Annuler, Rétablir (avec le nom de ce
  qu'on annule), Nouveau projet → À partir d'un lien YouTube… / À partir d'un
  fichier audio…, Ouvrir…, Projets récents, Enregistrer, Enregistrer sous…,
  Exporter → Audio… / iReal Pro → Fichier… et Ouvrir dans iReal Pro / PDF…,
  Imprimer…, Réglages…, Quitter (app Mac). Sous-menus à la souris, au clavier
  (flèches, Entrée, Échap) et au toucher ; sur téléphone, une feuille plein
  écran.
- Les anciens menus « Exporter » et « ⋯ » sont retirés, avec leurs styles et
  leurs textes.
- Barre de menus du Mac : mêmes commandes, mêmes libellés, grisées quand la
  page les dit impossibles ; « Édition → Annuler / Rétablir » agissent sur le
  morceau hors champ de texte, sur la saisie dans un champ ; un raccourci ne
  part qu'une fois.
- Raccourcis : cmd + Z, Maj + cmd + Z, cmd + O, cmd + S, Maj + cmd + S,
  cmd + P, cmd + virgule, cmd + Q (Ctrl hors Mac).
- Défaut de l'étape 1 corrigé : un morceau repris de la sauvegarde
  automatique garde son état « enregistré » et, dans l'app Mac, le chemin de
  son fichier.

**C7 — Réglages à sept onglets.** Général, Instruments, Tempo et analyse,
Détection des accords, Métronome, Affichage, Avancé ; sur téléphone, la liste
des onglets puis la page de l'onglet. Tous les réglages existants y sont,
avec le même comportement. Les petits panneaux (métronome, tempo et mesures,
accordage) restent, avec un lien « Tous les réglages… » vers leur onglet.

**C9 — « Nouveau projet » et grilles.**
- La fenêtre ne montre que ce qu'on a demandé (lien, ou fichier) ; au
  lancement elle montre tout. Case « Séparer les instruments » décochée par
  défaut ; cochée, tous les instruments sont sélectionnés. Plus de ligne
  « Aller plus loin », plus de carte des grilles.
- Message au démarrage : « Voulez-vous importer automatiquement les grilles
  des standards de iReal Pro ? Cela permet d'améliorer la détection des
  accords. », « Oui (recommandé) », « Non merci », « Ne plus afficher ce
  message », dernier message avec « OK ». Téléchargement avec pourcentage
  régulier, « Annuler » et « Continuer en arrière-plan ».
- Réglages → Avancé : la liste des recueils (nom, style, nombre de grilles,
  source, licence), « Télécharger » / « Retirer » par recueil, « Tout
  télécharger », « Vérifier les mises à jour de grilles », import d'un
  fichier.
- Recueils : 15 dans la liste (8 d'avant, 7 trouvés et confirmés lisibles
  depuis les Mac de GitHub : samba de roda, choro, bossa « disco », Real Book
  I, II, III, Beatles). L'app web en lit 5 ; l'app Mac les 15.

**C4 — Impression.** cmd + P, « Imprimer… » du menu ou le bouton de la grille
ouvrent une fenêtre : aperçu page par page à gauche (les mêmes feuilles que
celles qui sortent), options à droite (format A4 ou Lettre, orientation,
marges, échelle ou « Tenir sur une page », instrument, en-tête ; imprimante
et copies dans l'app Mac), « Enregistrer en PDF » et « Imprimer ».

**C1 — Chargement visible.** Le texte d'une analyse ou d'une séparation en
cours est en braise, un peu plus grand, avec un reflet toutes les 2,5 s.

**C3 — Sous-grille.** « Blanches » ajoutées ; « Noires » par défaut.

**C8 — Forme mobile.** Tous les écrans ci-dessus existent au téléphone
(390 × 844, toucher) et ont été repris dans une passe finale (voir
« Vérifications »).

**Captures pour le propriétaire.** Dans `app/` : `npm run build`, puis
`npm run captures -- /un/dossier/hors/du/depot`. Le dossier reçoit les
captures des écrans de l'étape, dans les deux formes (`ordinateur-…`,
`telephone-…`) : menu ouvert et sous-menus, chaque onglet de Réglages,
« Nouveau projet », message des grilles, fenêtre d'impression, chargement en
cours.

## Où c'est dans le code

Le détail (noms exacts, comment ajouter une commande ou un réglage) est dans
`app/README.md`, section « Étape 2 de la 1.0.0 : interface », et dans
`desktop/README.md`, « Barre de menus ». En bref :

- Commandes : `app/src/ui/commands.ts` (`COMMANDS`, `FABTICE_MENU`,
  `commandContext`, `runCommand`), `ui/commandKeys.ts`, `ui/menuBar.ts`,
  `components/FabticeMenu.tsx` ; `desktop/src/menu.js` (`createMenuBar`,
  `MENU_COMMANDS`, `LABELS`, `ACCELERATORS`), canaux `fabtice:menu-state` et
  `fabtice:quit`.
- État enregistré : `storage/savedState.ts`, `project/restoredState.ts`.
- Réglages : `ui.settings`, `openSettings(tab?)`,
  `components/SettingsDialog.tsx`, `components/settings/*Tab.tsx`,
  `store/settingsActions.ts`, `store/preferences.ts`.
- Impression : `chart/printLayout.ts`, `chart/printChart.ts`,
  `chart/PrintSheets.tsx`, `components/PrintDialog.tsx`,
  `desktop/src/printing.js` (canal `fabtice:list-printers`).
- Nouveau projet : `components/NewPieceDialog.tsx`,
  `separation/importChoice.ts`, `ui.newPieceFrom`.
- Grilles : `standards/offer.ts`, `components/StandardsMessage.tsx`,
  `components/settings/StandardsSection.tsx`, `standards/collections.json`.
- Version du document : inchangée (6).
- Tests ajoutés : `npm run test:menu`, `test:settings`, `test:print`,
  `test:new-project` (et `test:standards` réécrit) ; `npm run captures` ;
  `desktop/test/e2e/menu-bar.test.js` ; le pas « Interface - collection
  addresses (online) » de la fabrication, qui lit les adresses des recueils
  depuis les Mac de GitHub (résultat sur la branche `ci-logs`,
  `collections/addresses.txt`).

## Décisions prises sans le propriétaire

Menu et commandes
- Une fenêtre ouverte grise toutes les commandes sauf Nouveau projet, Ouvrir
  et Réglages : une seule fenêtre à la fois.
- « Enregistrer » est grisé pour le morceau de démonstration.
- « PDF… » ouvre la fenêtre d'impression (c'est là qu'est « Enregistrer en
  PDF ») plutôt qu'une seconde fenêtre.
- Pas de raccourci pour « Nouveau projet » : il a deux entrées, aucune n'est
  « la » nouvelle.
- Une analyse qui se termine après un enregistrement remet le projet
  « modifié » : son résultat n'est pas dans le fichier.
- Pas de commande morte : la case « Alléger » et les entrées de mise à jour
  attendent l'étape 6 ; « Dossier pour Logic Pro », « Projet Ableton Live » et
  la nouvelle fenêtre « Audio… » attendent l'étape 3 (« Audio… » ouvre la
  fenêtre d'export actuelle).

Réglages
- Les petits panneaux sont gardés, avec un lien vers l'onglet, plutôt que
  remplacés : ce sont les réglages qu'on touche en jouant.
- Non posés parce qu'ils ne feraient rien encore : « Alléger », mise à jour,
  modulations, structure, vitesse mesurée de l'appareil. Non posé parce qu'il
  contredit C9 : « instruments cochés par défaut ». Non posé parce qu'il
  n'existe pas : le choix carte graphique / processeur.
- Réglages nouveaux, qui agissent vraiment : « À l'ouverture » (reprendre le
  dernier projet, ou ouvrir « Nouveau projet »), « Analyser dès l'import »
  (avec un bouton « Analyser ce morceau » quand c'est décoché), « S'appuyer
  sur les grilles connues », « Rétablir les réglages d'origine ».
- Sous-grille : les appareils qui avaient l'ancien choix par défaut passent
  une fois à « Noires » ; « Triolets » n'est pas touché.
- La saisie du tempo et « battre le tempo » restent dans le petit panneau.

Nouveau projet et grilles
- « Tous » les recueils veut dire ceux que cette forme de l'app sait
  télécharger : 5 sur 15 dans l'app web (les autres pages refusent un
  navigateur), 15 dans l'app Mac. La phrase de fin le dit.
- Les Real Book I à III et le recueil Beatles, déposés sur le forum officiel
  d'iReal Pro, sont dans la liste mais pas « recommandés ». Deux candidats
  retirés : une adresse disparue, un recueil illisible.
- Le message attend la fin du démarrage et des autres fenêtres ; il n'apparaît
  pas quand aucun recueil n'est lisible.
- « Libérer » la place prise par les grilles remet le message au démarrage
  suivant (règle : il revient tant qu'aucun recueil n'est gardé et que « Ne
  plus afficher » n'est pas coché).
- Échap vaut « Non merci », « Continuer en arrière-plan », « Terminer » ou
  « OK » selon le moment.
- « Vérifier les mises à jour de grilles » : relit la liste, installe les
  recueils jamais proposés, relit les recueils gardés et remplace ceux qui
  ont changé ; un recueil retiré à la main ne revient pas.
- Désélectionner tous les instruments décoche la case ; fermer « Nouveau
  projet » sans importer oublie les instruments cochés.
- « Retirer toutes les grilles » est remplacé par « Retirer » par recueil.

Impression
- Marges 10, 15 ou 25 mm ; échelle de 50 à 100 % ; « Tenir sur une page »
  descend jusqu'à 40 % puis dit que le morceau est trop long.
- Le papier par défaut suit la région (Lettre en Amérique du Nord, A4
  ailleurs). L'instrument choisi dans la fenêtre ne change pas celui de
  l'écran et n'est pas retenu.
- Un titre trop long est réduit (jusqu'à 55 %) plutôt que coupé.
- Dans l'app web, « Enregistrer en PDF » passe par l'impression du
  navigateur, avec une phrase qui dit quoi choisir.

Aspect
- Le bouton principal de toutes les fenêtres est à l'encre : la braise reste
  à ce qui joue (et, par exception demandée, au texte de chargement).
- Menus à sous-menus, onglets, fenêtre d'impression, message des grilles et
  texte de chargement sont inscrits dans `DESIGN.md`.

## Pas fait, ou fragile

- **Rien de cette étape n'a été vu sur un vrai Mac.** À essayer en premier :
  cmd + Z dans un champ de texte puis hors champ (une seule annulation à
  chaque fois), cmd + S, cmd + P, la barre de menus grisée pendant qu'une
  fenêtre est ouverte.
- **Impression sur une vraie imprimante jamais essayée** (ici : PDF
  seulement). Le format du papier et les marges passés à macOS sont à
  vérifier sur papier. Safari ignore souvent le format demandé : l'aperçu de
  l'app web peut différer de ce que Safari imprime.
- **Adresses des recueils** : lues une fois depuis les Mac de GitHub ; elles
  peuvent changer. Le téléchargement réel dans l'app n'a été essayé qu'avec de
  faux serveurs.
- Le reflet du texte de chargement et le contraste de la braise sur le papier
  (environ 3,9) sont à juger à l'œil.
- Le test e2e de la barre de menus lit un détail interne d'Electron
  (`ipcMain._invokeHandlers`) : à revoir si Electron change.
- `desktop/test/e2e/analysis-fine.test.js` a été adapté au nouveau chemin des
  réglages mais ne tourne que sur demande (`FABTICE_E2E_ANALYSIS_FINE=1`).
- La barre d'espace lance encore la lecture quand un bouton d'une fenêtre a
  le focus, sauf dans les fenêtres nouvelles, qui l'arrêtent : à régler pour
  toutes à l'étape 4, qui touche à la barre d'espace.
- Tourner l'appareil (ou passer d'une fenêtre large à étroite) pendant que
  Réglages est ouvert n'a pas été essayé à fond.
- Le pourcentage du téléchargement des grilles est lissé, pas mesuré.
- **Téléphone tenu en largeur** (844 × 390) : l'app y prend la forme
  ordinateur, avec des cibles de 34 à 36 px. Seul le menu Fabtice y passe en
  feuille défilante (sinon « Réglages… » était hors de l'écran). Changer le
  seuil reviendrait à redessiner le lecteur : laissé tel quel, à décider.
- Sur téléphone, des commandes du lecteur d'avant cette étape font moins de
  40 px (M / S, liste de la sous-grille, boutons de tonalité et de tempo,
  lettres de section) : notées, pas touchées (hors des écrans de l'étape).
- La passe mobile est une émulation dans Chromium : rien n'a été essayé sur un
  vrai téléphone.
- `npm run captures` a besoin de Playwright et de Chromium : il marche sur
  cette machine de travail, pas tel quel sur le Mac du propriétaire. Les
  captures utilisent le morceau de démonstration, des grilles inventées et une
  fausse liste de projets récents.

## Pièges rencontrés

- **Mémoire de la machine** : plusieurs suites Chromium en même temps (les
  miennes et celles d'un agent) ont fait tuer le conteneur. Une seule suite
  lourde à la fois, agents compris ; ne rien lancer pendant qu'un agent
  teste.
- **Redémarrages** : la machine a redémarré trois fois. Un agent qui commite
  et pousse toutes les vingt minutes ne perd presque rien ; les agents
  interrompus reprennent avec leur contexte.
- **Deux agents sur les mêmes tests** : fusionner le menu puis les réglages a
  donné des conflits dans quatre vérifications. Poser d'abord le contrat
  commun (ici l'état `ui.settings`) et des fichiers d'aide séparés
  (`tests/lib/menu.mjs`, `tests/lib/settings.mjs`), puis faire intégrer la
  première branche par le second agent.
- **Test fragile sur les Mac de GitHub** : `project-file.test.js` comparait
  deux durées ; sous charge, sur le Mac Intel, il échouait. Il compte
  maintenant les encodeurs lancés.
- **Lien `node_modules`** : un agent en a commité un par erreur dans sa
  branche (retiré avant la fusion). Vérifier `git status` avant chaque commit
  dans un arbre de travail d'agent.
- **Une analyse complète vide l'historique d'annulation** (règle de
  l'étape 1). Sur les Mac de GitHub, l'analyse finissait au milieu du test de
  la barre de menus et « Annuler : piste coupée » redevenait « Annuler » : un
  test qui compte des étapes d'annulation attend d'abord la fin de l'analyse.
- `collections.json` : le champ `verified` veut dire « vérifié depuis le bac
  à sable » ; un test le contrôle. Ne pas le passer à vrai pour une adresse
  vérifiée ailleurs.
- Le message des grilles bloquerait tous les tests : il est éteint sur les
  adresses de test (`?debug`, `?demo`, `localhost`) et s'allume avec
  `?grilles=message`. Les tests e2e de l'app Mac tournent à l'adresse réelle :
  ils doivent d'abord y répondre.

## Vérifications

À REMPLIR

## Pour l'étape suivante

- **Étape 3 (Exports)** : le sous-menu « Exporter » existe ; y ajouter les
  deux exports nouveaux et remplacer la fenêtre « Audio… ». La section du
  plan est complétée en ce sens.
- **Étape 4** : la barre d'espace dans les fenêtres (voir « fragile »).
- **Étape 5** : « ce qu'on imprime » (grille complète ou simplifiée) : champ
  `what` dans `PrintOptions`, lu par `printLines`, un groupe dans
  `PrintDialog` avant « Marges ». Les réglages des modulations et de la
  structure se posent dans les onglets « Détection des accords » et
  « Affichage ».
- **Étape 6** : places de la case « Alléger » et des entrées de mise à jour
  notées dans le plan.
- À montrer au propriétaire : le contenu des sept onglets (c'était une
  proposition), les captures (`npm run captures`), et les décisions
  ci-dessus.
