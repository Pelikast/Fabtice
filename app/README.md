# Fabtice — l'interface (`app/`)

Sources de l'interface, communes à l'app web et à l'app Mac : Vite, React et
TypeScript strict, un petit magasin d'état (zustand), des feuilles de style
écrites à la main d'après `DESIGN.md` et la maquette (`web/maquette/`). Pas de
bibliothèque de composants.

Ce document s'adresse à ceux qui reprennent le code : il décrit l'organisation,
les commandes et les **contrats** entre l'écran, le moteur audio, l'app Mac et
le stockage.

## Commandes

À lancer dans `app/` (Node 22.12 ou plus récent) :

| Commande | Effet |
|---|---|
| `npm ci` | installe les dépendances (versions figées par `package-lock.json`) |
| `npm run dev` | serveur de développement, avec les en-têtes d'isolation (COOP/COEP) |
| `npm run build` | construit dans `../web/` : `index.html` et `assets/` seulement ; `maquette/` et `spikes/` restent intacts |
| `npm run build:desktop` | même construction dans `../desktop/ui/` (vidé avant) |
| `npm run preview` | sert le résultat de `build`, avec les en-têtes d'isolation |
| `npm run typecheck` | vérification des types |
| `npm test` | tests unitaires (Vitest, dans Node) |
| `npm run test:smoke` | après `build` : vérifications dans Chromium (Playwright préinstallé) et captures d'écran dans un dossier temporaire (`FABTICE_SMOKE_OUT` pour le choisir) |
| `npm run test:import` | après `build` : import des cinq formats (sélecteur et glisser-déposer), rouverture du projet après rechargement (dont des morceaux de **taille réelle**, 0,5 à 32 Mo, dans un profil de navigateur persistant), morceau gardé mais impossible à rouvrir (offre « Rouvrir » / « Oublier »), autosauvegarde, stockage en échec, import par lien contre un faux `window.fabtice`, coût d'un morceau de cinq minutes (captures dans `FABTICE_IMPORT_OUT`) |
| `npm run test:timeline` | après `build` : vérifications de la frise dans Chromium (formes d'onde, grille, boucle, défilement, zoom, suivi, téléphone, morceau de dix minutes) |
| `npm run test:export` | après `build` : le menu « Exporter », le fichier iReal Pro téléchargé par le navigateur, et son lien relu (par un lecteur écrit dans le test) et comparé aux accords de la grille, avec une transposition et un instrument réglés, un accord tapé à la main, une analyse qui se termine |
| `npm run test:engine` | après `build` (et, en option, `build:desktop`) : mesures du vrai moteur audio dans Chromium (tonalité, tempo, boucle, métronome, limiteur, charge ; sections 14 à 18 : le rendu d'« Appliquer » joué tel quel, passages préécoute/rendu, boucle, métronome, sept pistes ; sections 19 à 22, lot 4 : 4/4 avec temps forts et faibles et volume, 7/8 regroupé, boucle avec décompte, boucle qui accélère, mesurés contre la grille) |
| `npm run test:analysis` | après `build` : le **vrai** analyseur dans Chromium (télécharge les outils d'analyse depuis Hugging Face : réseau nécessaire). Le morceau d'essai du prototype passe par l'interface et le résultat est comparé à ce qu'on en sait et à ce que le prototype trouve ; deuxième usage sans téléchargement ; le panneau d'état qui s'ouvre seul au premier téléchargement (il se referme seul à la fin de l'analyse, reste ouvert si l'utilisateur y a touché ou en cas d'erreur) ; annulation (panneau, nouvel import, pendant le téléchargement) ; réseau absent ; téléchargement abîmé (refusé, repris, refusé pour de bon) ; reprise d'un téléchargement interrompu ; lecture pendant l'analyse ; morceau de 4 minutes ; chiffres de durée, de mémoire et de plus longue tâche du fil principal. `FABTICE_ANALYSIS_ONLY=<nom>` n'en lance qu'une partie |
| `npm run test:separation` | après `build` : les écrans du lot 3 dans Chromium (séparation : fenêtre « Nouveau morceau », panneau, téléchargement, progression, repli, annulation, échec, pistes dans leurs teintes, morceau entier et retour, « Libérer la place » ; réglages avancés ; « Appliquer » ; « Exporter le son » avec un WAV et une archive téléchargés et relus) à 1280 × 800, 960 × 640 et 390 × 844 (dans la fenêtre, au-dessus du transport), puis des instruments de **taille réelle** gardés et rouverts après rechargement (profil persistant). `FABTICE_SEPARATION_OUT` pour les captures, `FABTICE_SEPARATION_ONLY=screens\|flows\|export\|storage` |
| `npm run test:separation-real` | après `build` : le **vrai** séparateur dans Chromium, sur le processeur (télécharge SCNet, 13 Mo, depuis Hugging Face : réseau nécessaire ; quelques minutes) : 25 s du morceau d'essai de l'analyse importées puis séparées par l'interface (progression qui ne recule pas, temps restant, longueurs exactes, somme des parties comparée au morceau, « Copier le rapport »), deuxième séparation sans téléchargement puis `forgetTools`, annulation en cours de route, repli du chemin « graphique » simulé au segment 3 (`&repli-essai=2`) avec un résultat identique. `FABTICE_SEPARATION_TOOLS=1` : HTDemucs et BS-RoFormer sur 12 s (409 Mo téléchargés) ; `FABTICE_SEPARATION_MEMORY=1` : mémoire de pointe de chaque outil sur un morceau de quatre minutes (long ; `FABTICE_SEPARATION_MEMORY_TOOLS`, `FABTICE_SEPARATION_MEMORY_SECONDS`). `FABTICE_SEPARATION_REAL_ONLY=first\|cancel\|fallback\|tools\|memory` |
| `npm run test:separation-prototype` | après `build` : le port contre le prototype, dans Chromium sur le processeur : pour chaque outil, le code du prototype et celui de l'app sur la même entrée à 44,1 kHz avec la même session ; chaque partie doit coïncider à moins de −80 dB. Télécharge les trois outils (422 Mo) ; quelques minutes. `FABTICE_PROTO_TOOLS` pour en choisir, `FABTICE_PROTO_FP32=1` pour comparer aussi HTDemucs en poids 32 bits |
| `npm run test:memory` | après `build`, au premier plan : la mémoire d'un morceau de cinq minutes stéréo en une piste puis en sept, avec le vrai moteur ; puis le jeu « Appliquer » de ces sept pistes à 0,7 (taille, budget de l'appareil, libération) (chiffres affichés) |
| `npm run test:render` | après `build`, au premier plan : le vrai rendu (Rubber Band R3 dans un worker) dans Chromium : alignement d'un train de clics à plusieurs tempos et hauteurs, cinq minutes sans dérive, vitesse (secondes de calcul par minute stéréo, gain de plusieurs workers), annulation, binaire chargé au premier rendu seulement et licence servie ; puis « Appliquer » dans l'app avec le vrai moteur (progression réelle, rendu joué tel quel, retour à la préécoute, refus calme d'un appareil trop petit) à 1280 × 800 et 390 × 844. `FABTICE_RENDER_OUT` pour les captures, `FABTICE_RENDER_ONLY=renderer\|app`, `FABTICE_RENDER_QUICK=1` saute les cinq minutes |
| `npm run test:export-audio` | après `build` : « Exporter » ▸ « Audio… » avec les vrais encodeurs MP3 et FLAC (WAV, MP3, FLAC relus et comparés ; Wave à chaque fréquence et quantification relu par un lecteur écrit dans le test et par ffprobe ; chaque débit MP3 de 96 à 320 ; pistes en un fichier ou en archive ; boucle, annulation, encodeur qui ne se charge pas, export à une autre tonalité et un autre tempo par le rendu), vitesses, la fenêtre dans les deux formes (réglages, case « Un fichier par piste », téléchargements relus) et ses captures (`FABTICE_EXPORT_OUT`) |
| `npm run test:export-audio` | après `build` : « Exporter le son » avec les vrais encodeurs MP3 et FLAC (WAV, MP3, FLAC relus et comparés, archive, boucle, annulation, encodeur qui ne se charge pas, export à une autre tonalité et un autre tempo par le rendu), vitesses, captures du dialogue |
| `npm run test:export-ableton` | après `build` : « Projet Ableton Live… » (C15.5) dans les deux formes sur le morceau de démonstration à +2 demi-tons et 90 % : l'entrée après « Dossier pour Logic Pro… », la fenêtre « à l'essai » (aucun texte coupé), le pourcentage, « Annuler », l'archive relue (dossier « … Project », pistes dans `Samples/Imported`, les deux `.als` décompressés et lus par l'analyseur XML de Python, leurs clips nommant des fichiers présents, chaque temps à moins d'une milliseconde sur la courbe de tempo de Live, le MIDI relu par `midi-file`, `Lisez-moi.txt`). Captures dans `FABTICE_CAPTURES` (par défaut `/tmp/fabtice-captures-D`), le dossier décompressé dans `FABTICE_ESSAIS` (par défaut `/tmp/fabtice-essais-D`) |
| `npm run test:export-logic` | après `build` : « Dossier pour Logic Pro… » (C15.4) dans les deux formes (1280 × 800 à la souris, 390 × 844 au toucher) sur le morceau de démonstration à +2 demi-tons et 90 % : l'entrée du menu après « PDF… », la fenêtre, le pourcentage qui monte, « Annuler », l'archive .zip relue (un dossier, les Wave 48 kHz 16 bits de même longueur, le fichier MIDI relu par `midi-file` : chaque temps à moins d'une milliseconde, signatures, armure, marqueurs ; `Lisez-moi.txt`). Captures et archives dans `FABTICE_CAPTURES` (par défaut `/tmp/fabtice-captures-C`) |
| `npm run essais -- <dossier>` | construit puis fabrique les **fichiers d'essai** des exports pour le propriétaire (vrai rendu) : dossier pour Logic Pro, chaque format audio, projet Ableton s'il existe, et un `LISEZ-MOI.txt` ; voir « Étape 3 de la 1.0.0 : exports » |
| `npm run test:export-memory` | après `build`, au premier plan : la mémoire de l'export de sept pistes de cinq minutes (archive de WAV, de MP3, mélange en WAV, FLAC et MP3), chiffres affichés |
| `npm run test:metronome` | après `build` (lot 4) : le panneau du métronome (volume, décompte, mesure et regroupement, temps forts et faibles, accélération), ce qui arrive au moteur factice (piste de clics, volume, plan, décompte au moment de Lecture), le palier et le décompte affichés, le panneau dans la fenêtre à 1280 × 800, 960 × 640 et 390 × 844, puis les réglages retrouvés après rechargement (profil persistant). `FABTICE_METRONOME_OUT` pour les captures |
| `npm run test:markers` | après `build` (lot 4) : boucles gardées (garder, rappeler, renommer, ordonner, supprimer), sections (les lettres de la grille : listées, bouclées, ajoutées, renommées, supprimées, les mêmes dans la grille d'accords), la rangée « Repères » de la règle (clic), le clavier, le téléphone, puis tout retrouvé après rechargement (profil persistant). `FABTICE_MARKERS_OUT` pour les captures |
| `npm run test:project-file` | après `build` (lot 4) : les projets `.fab` avec des tailles réelles et des profils persistants : un WAV d'une minute importé (vrai moteur), séparé avec deux outils (séparateur factice : de vrais instruments 16 bits), un mixage dans chacun, corrigé, boucle nommée, métronome, transposition, « Appliquer » (rendu factice) ; enregistré avec le **vrai libFLAC** (fichier téléchargé et vérifié : nom, signature, dossiers, tout en FLAC, plus petit que les blocs 16 bits) ; ouvert dans un autre profil (tout revient, instruments à l'échantillon près, rendu entendu tel quel, pas de nouvelle analyse), « Écouter » l'autre séparation (à l'échantillon près, son mixage), rechargé ; copie abîmée, fichier audio choisi comme projet ; projet déposé sur la fenêtre ; mesure du magasin de l'appareil (six instruments de quatre minutes ; `FABTICE_PROJECT_LONG=1` : douze aussi) ; « Nouveau morceau », « Séparations gardées » et les réglages à 1280 × 800 et 390 × 844 ; **étape 1 (C5)** : « Enregistrer sous… » (volet du système remplacé par une poignée sur un fichier du système de fichiers privé), puis cmd/Ctrl + S par-dessus le **même** fichier, rapide (aucun worker d'encodage lancé : les sons déjà encodés sont recopiés), titre « modifié » puis « enregistré », fichier relu avec le changement ; rechargement (la poignée n'est pas gardée : « Enregistrer » redemande où), « Ouvrir un projet » avec une poignée (le fichier ouvert devient celui du projet) ; sans poignée (Safari, Firefox) le lien d'avant. Captures dans `FABTICE_PROJECT_OUT` |
| `npm run test:undo` | après `build` (étape 1, C11) : « Annuler » / « Rétablir » dans Chromium, sur le morceau de démonstration, au bureau (1280 × 800, souris, aussi en Mac) et au téléphone (390 × 844, toucher), moteur silencieux : un clic (muet), un curseur tiré lentement (une seule étape, quelles que soient les pauses), un accord tapé dans la grille, une boucle tracée ; Ctrl + Z, Ctrl + Maj + Z, Ctrl + Y (cmd sur Mac) remettent ce qui est à l'écran ; dans un champ de texte, le raccourci défait la saisie et pas le morceau |
| `npm run test:alert` | après `build` (étape 1, C5) : l'alerte « Les modifications du projet en cours n'ont pas été sauvegardées… » sur un morceau vraiment importé (donc « modifié ») et gardé sur l'appareil, au bureau et au téléphone : texte exact et trois boutons, « Enregistrer » ayant le focus ; « Annuler » (bouton et Échap) ; « Ne pas enregistrer » ; « Enregistrer » (et Entrée) pour un morceau jamais enregistré (demande où, le volet du système étant remplacé par un fichier du système de fichiers privé de la page) puis pour un morceau déjà enregistré (écrase sans fenêtre) ; un enregistrement qui échoue garde l'utilisateur où il est ; morceau non modifié : pas d'alerte. Captures dans `FABTICE_ALERT_OUT` |
| `npm run test:menu` | après `build` (étape 2, C6) : le menu Fabtice au bureau et au téléphone : chaque commande atteinte à la souris, au clavier et au toucher, sous-menus, commandes grisées, raccourcis, anciens menus disparus, projet repris de la sauvegarde automatique donné « enregistré » quand il l'est |
| `npm run test:settings` | après `build` (étape 2, C7) : Réglages à sept onglets (liste puis page au téléphone), chaque réglage retrouvé à l'identique après déplacement, liens « Tous les réglages… », sous-grille « Noires » par défaut et « Blanches », « Rétablir les réglages d'origine » |
| `npm run test:print` | après `build` (étape 2, C4) : la fenêtre d'impression (cmd + P, menu, bouton), l'aperçu page par page comparé au PDF produit par Chromium (mêmes pages), options, téléphone |
| `npm run test:new-project` | après `build` (étape 2, C9 et C1) : la fenêtre « Nouveau projet » (lancement, lien, fichier, case « Séparer les instruments »), le texte de chargement en braise |
| `npm run test:standards` | après `build` : le message des grilles au démarrage (les quatre chemins), le téléchargement et son pourcentage, la section des grilles de Réglages → Avancé, « Vérifier les mises à jour de grilles », faux serveurs |
| `npm run captures -- <dossier>` | après `build` : les captures des écrans de l'étape 2 dans les deux formes, dans un dossier **hors du dépôt** (voir « Étape 2 de la 1.0.0 ») |
| `npm run test:offline` | après `build` (lot 4) : la version web hors ligne dans Chromium, profil persistant, **vrai moteur** : le service worker s'installe (adresse `?horsligne&debug`), garde les petits fichiers de l'app mais pas les gros WebAssembly d'ONNX Runtime ; un morceau de 5 Mo importé ; réseau coupé (`setOffline`), rechargement : l'app s'ouvre, `crossOriginIsolated` est vrai, le morceau gardé revient et **joue** ; un gros fichier demandé en ligne est gardé et resservi hors ligne avec les en-têtes d'isolation ; la maquette voisine n'est pas touchée ; en ligne, une nouvelle page sur le serveur est celle qu'on voit au chargement suivant ; manifeste et icônes. Captures dans `FABTICE_OFFLINE_OUT` |
| `npm run test:chart` | après `build` : la grille d'accords comparée à la maquette (même balisage des accords, mêmes tailles, sections, boucle, mesure en cours, instruments, états vide et « analyse en cours », téléphone), puis les gestes (clic, glisser, suivi), l'éditeur d'accord (toujours entier et dans la fenêtre, à 1280 × 800 et 960 × 640), tous les panneaux flottants (Tempo, analyse, réglages, Exporter, accord fin, tonalité : dans la fenêtre, au-dessus du transport, dernier bouton cliquable, à 1280 × 800, 1024 × 700 et 960 × 640 ; `ui/useFitPanel.ts` leur donne une hauteur maximale et un défilement propre quand la fenêtre est trop basse), la tonalité, les sections, le clavier, l'autosauvegarde (rechargement d'un morceau gardé), le toucher réel sur téléphone (390 × 844) et l'impression (feuille de style d'impression, PDF A4 et Letter lus avec `pdftotext`, sauts de page) ; panneaux de corrections et d'accordage ; captures de l'app, de la maquette et des pages imprimées dans `FABTICE_CHART_OUT` (`pdftotext`, `pdfinfo` et `pdftoppm` de poppler sont nécessaires pour la partie impression) |

Les fichiers audio de test de `test:import` sont dans `tests/fixtures/` (quelques
dizaines de ko, tons synthétiques ; `make_fixtures.py` dit comment ils sont faits ;
le m4a est `desktop/test/fixtures/tone-dash.m4a`).

`?moteur=factice` force le moteur factice (aucun son) ; les tests d'interface
(`test:smoke`, `test:import`, `test:chart`) l'utilisent. `?demo` à la fin de l'adresse (`http://localhost:5173/?demo`) ouvre un morceau
synthétique de quatre pistes, généré dans le code, sans fichier audio, **déjà
analysé** : tempo qui bouge un peu à partir de la mesure 5, grille d'accords de
la maquette (un accord douteux mesure 12, deux accords mesure 15), sections A,
B, A « posées à la main », enregistrement accordé un peu haut (+18 cents).
Variantes :

| Adresse | Effet |
|---|---|
| `?demo&vue=grille` | ouvre directement l'affichage Grille d'accords |
| `?demo&analyse=lente` | pas encore analysé : l'analyse (factice) tourne lentement, avec un premier « téléchargement » des outils |
| `?demo&analyse=instant` | pas encore analysé : l'analyse (factice) se fait aussitôt |
| `?demo&analyse=echec` | l'analyse (factice) échoue |
| `?demo&analyse=aucune` | le morceau du lot 1 : 110 BPM fixe saisi à la main, pas d'analyse automatique (les vérifications de la frise s'en servent) |
| `?demo&separation=entier\|faite\|lente\|repli\|echec` | lot 3 : le morceau en une piste entière, pas encore séparé, déjà séparé, en cours (lent, premier téléchargement), avec repli sur le processeur, en échec |
| `?demo&rendu=lent`, `?demo&export=ouvert` | lot 3 : « Appliquer » assez lent pour voir l'attente (rendu factice) ; « Exporter le son » ouvert |
| `?rendu=reel`, `?rendu=factice` | lot 3 : le vrai rendu (Rubber Band) même sur une page de test (c'est ce que font `test:render` et le test de l'app Mac), ou le factice |

En mode démo, `window.__fabtice` donne accès au magasin, au moteur, aux actions
et, sous `lot2`, aux actions d'analyse, de grille et d'harmonie, sous `lot3` à la
séparation, au rendu, à l'export, au registre et au stockage ; `?debug` donne
le même accès (sans `lot2`) sans morceau de démonstration (tests du navigateur).
Le morceau de démonstration n'est jamais gardé sur l'appareil.

**Quel analyseur ?** Dans un navigateur, le **vrai** analyseur est celui par
défaut. Le factice (`MockAnalyzer`, l'extrait du prototype) sert dans Node (tests
unitaires), dans un navigateur qui ne sait pas faire tourner un worker, et sur les
adresses des suites de tests et de la démo : `?analyse=factice|lente|instant|echec`,
`?demo` (qui pose le sien), et les pages de test, c'est-à-dire `?moteur=factice` ou
`?debug`, **sauf** `?analyse=reel`, qui demande le vrai (c'est ce que font
`test:analysis` et le test de bout en bout de l'app Mac). Raison : les suites
existantes importent des fichiers à longueur de temps et ne doivent ni télécharger
des outils ni charger la machine. `?modele=complet` choisit le grand réseau
Beat This! (83 Mo) au lieu du léger (10 Mo), pour comparer.

Les fichiers construits (`web/index.html`, `web/assets/`, `desktop/ui/`) ne
sont pas versionnés. Netlify lance `npm ci && npm run build` dans `app/`.

## Organisation

```
src/
  main.tsx            démarrage : langue, préférences, branchement du moteur, ?demo,
                      réouverture du morceau gardé, vérification de l'outil d'import
  model/              types des données (projet, pistes, carte de tempo, document,
                      harmonie, résultat d'analyse, corrections à la main)
  grid/               calculs de grille, purs et testés : temps <-> mesures,
                      traits de mesure et de sous-grille, magnétisme, boucles
                      (loops.ts : sélection et bords calés sur la sous-grille ou
                      libres ; loopText.ts : leur lecture « 2.2 à 4.3 (4e double) »),
                      clics du métronome (metronome.ts, lot 4 : métriques, regroupements,
                      temps forts et faibles, décompte, paliers d'accélération),
                      formats d'affichage, « Battre le tempo »,
                      carte de tempo à partir de temps analysés, corrections
                      (× 2, ÷ 2, premier temps), courbe de tempo par mesure
  markers/            repères (lot 4), purs et testés : sections comme plages, boucles
                      gardées (liste ordonnée, noms)
  harmony/            accords et tonalités, purs et testés : vocabulaire, lecture
                      (saisie et étiquettes Harte), orthographe par degré,
                      transposition, instruments ; composant <ChordSymbol>
  analysis/           contrat de l'analyseur, analyseur factice, vrai analyseur
                      (fabtice.ts + worker/ + engine/ + models/), lancement
                      automatique et état (runner.ts), progression fine
  chart/              affichage Grille d'accords : mise en page pure (layout.ts),
                      corrections pures (edits.ts), gestes (gesture.ts, hit.ts,
                      useChartGestures.ts), éditeur (editor.ts, ChordEditor.tsx,
                      KeyEditor.tsx), clavier (stops.ts), suivi (useFollowLine.ts),
                      impression (print.ts), feuille et mesure en cours
  export/             représentation de la grille pour l'export, codage iReal Pro
                      (IREAL-FORMAT.md : le format et ses sources) ; audio/ : export
                      du son (lot 3 : plan, rendu, encodeurs, archive, remise)
  separation/         séparation des instruments (lot 3) : contrat, liste des outils
                      (models.json), choix selon l'appareil, séparateur factice, vrai
                      séparateur (onnx.ts + worker/ + engine/), rapport, lancement
  render/             rendu hors ligne et « Appliquer » (lot 3) : contrat, rendu réel
                      (rubberband.ts + rubberband/ : worker, wasm, licence), rendu
                      factice, budget de mémoire, contrôleur
  store/              état de l'app (store.ts), actions (actions.ts), valeurs
                      dérivées (derived.ts), préférences, document de projet
  audio/              contrat du moteur (AudioEngine.ts), vrai moteur
                      (WorkletEngine.ts + worklet/), moteur factice
                      (MockEngine.ts), fabrique (index.ts), branchement au
                      magasin (connect.ts), registre de l'audio décodé, forme
                      16 bits partagée unique (pcm.ts, storage.ts), binaire wasm
                      de Signalsmith et ses licences (wasm/) ; la lecture du rendu
                      d'« Appliquer » (worklet/core.ts)
  timeline/           TOUT ce qui se dessine le long du temps : formes d'onde,
                      grille, règle, boucle, tête de lecture, défilement, zoom
  components/         l'écran : barre du haut, en-têtes de pistes, transport,
                      outils d'affichage, fenêtres, affichage Grille d'accords
  ui/                 boucle d'animation, icônes, clavier, glisser-déposer
  import/             import d'un fichier ou d'un lien : lecture, décodage à 48 kHz
                      (Web Audio, lecteur AIFF et rééchantillonnage à nous), limites,
                      outil d'import de l'app Mac, contrôleur de la fenêtre
  platform/           l'app Mac vue depuis la page (window.fabtice)
  storage/            projet courant sur l'appareil : contrat, IndexedDB, gardien
                      (autosauvegarde), réouverture au lancement
  project/            fichiers de projet `.fab` (lot 4) : conteneur ZIP lu et écrit
                      par tranches (zip.ts), format (fileFormat.ts, FORMAT.md),
                      dialogue « Enregistrer le projet » (save.ts), « Enregistrer » et
                      « Enregistrer sous… » (saveFlow.ts), fichier du projet ouvert
                      (currentFile.ts), alerte avant de quitter un projet modifié
                      (leave.ts), titre de la fenêtre et fermeture de l'app Mac
                      (windowState.ts), ouverture (open.ts, choose.ts),
                      fichiers ouverts depuis le Finder (fromDesktop.ts)
  pwa/                version web hors ligne (lot 4) : service worker écrit à la main
                      (sw.js, complété par la construction) et son inscription
  settings/           « Place sur cet appareil » (lot 4) : tailles et « Libérer »
  i18n/               tous les textes (fr.ts) et t()
  demo/               le morceau synthétique de ?demo
  styles/             jetons, base, une feuille par zone, téléphone
  assets/fonts/       polices (woff2) et leurs licences OFL
tests/                vérifications dans Chromium (smoke.mjs, timeline.mjs, import.mjs, chart.mjs, export.mjs),
                      fichiers audio de test (fixtures/) et petit serveur
```

## Règles de fond

- **La position de lecture ne passe jamais par React.** Les vues la lisent avec
  `getEngine().getPosition()` dans `useFrame()` / `onFrame()`
  (`ui/frameLoop.ts`, une seule boucle `requestAnimationFrame` pour toute
  l'app) et écrivent directement dans le DOM ou un canvas. Exemple :
  `PositionReadout` dans `components/Transport.tsx`.
- **Tout changement d'état passe par `store/actions.ts`.** Les réglages
  (tonalité, tempo, boucle, mixage, métronome, carte de tempo) vont au magasin
  et `audio/connect.ts` les transmet au moteur ; les commandes de transport
  (lecture, pause, déplacement) vont directement au moteur, dont l'état revient
  au magasin (`transport.engine`).
- **Temps source.** Toutes les positions, bornes de boucle et clics sont en
  secondes dans l'enregistrement d'origine, quel que soit le tempo joué.
- **Textes.** Tous dans `i18n/fr.ts`, lus avec `t('clé', { param })`. Code et
  commentaires en anglais. Vocabulaire : « piste », « instrument »,
  « tonalité ».
- **Design.** `DESIGN.md` fait référence : une seule chose rouge (lecture et
  tête de lecture), filets de 1 px, grain du papier, cibles de 40 px,
  140 ms / 220 ms, `prefers-reduced-motion`. Les classes reprennent celles de
  la maquette.

## Modèle de données (`model/`, `store/store.ts`)

- `Project` : identifiant, titre, source (`file`, `link`, `demo`), durée, taux
  d'échantillonnage (48 kHz).
- `Track` : identifiant, nom, rôle de couleur (`morceau`, `voix`, `batterie`,
  `basse`, `guitare`, `piano`, `vents`, `autres` → `var(--<rôle>)`), muet,
  solo, volume, et une référence `AudioRef` vers son audio. Les échantillons
  eux-mêmes sont dans `audio/registry.ts` (`getAudio(track.audio.id)`).
- `TempoMap` (`model/tempoMap.ts`) : segments de tempo constant (temps, temps
  musical, BPM) et changements de métrique (mesure, numérateur, dénominateur ;
  depuis la version 6, de 1 à 64 sur 4, 8, 16 ou 32 : `METER_NUMERATOR`,
  `METER_DENOMINATORS`, `isValidMeter`, et plusieurs signatures dans un même
  morceau : voir « Signatures par mesure »). Prévue pour un tempo variable ; le
  lot 1 n'en crée qu'un segment, saisi à la main. Le temps 0 est le premier temps de la mesure 1. **Avant le premier
  temps (levée)**, le premier segment et la première métrique se prolongent :
  la mesure d'indice −1 s'affiche « 0 », la −2 « −1 », etc. (numéro affiché =
  indice + 1).
- `LoopState` (zone et marche/arrêt ; la zone est un intervalle de **secondes
  source**, pas des mesures : voir « Boucles qui ne sont pas des mesures
  entières » plus bas), `PlaybackSettings` (demi-tons −12…+12,
  cents −50…+50, tempo en rapport 0,25…2, métronome), `ViewSettings`
  (affichage, échelle en pixels par seconde, hauteur de piste, Auto,
  sous-grille 1/2/4/8, triolets, magnétisme, suivi, instrument de la grille), `AppSettings` (notation
  des accords mineurs).
- Le tempo cible affiché vient de `targetBpm()` (`store/derived.ts`) ; tant que
  le tempo du morceau n'est pas saisi, le transport parle en pourcentage. Depuis
  le lot 4 il est donné **par temps ressenti** (noire pointée en 6/8 : voir
  `grid/metronome.ts#feltUnits`).

### Document version 6 (étape 1 de la 1.0.0)

La version courante du document est la **6** (`PROJECT_DOCUMENT_VERSION` dans
`model/document.ts`, qui garde l'historique des versions en tête) : c'est celle
du `.fab` aussi (`project/FORMAT.md`). Elle **reste la 6** pendant tout le
travail de la 1.0.0 : un champ de plus va dans la version 6 (type dans
`model/`, valeur par défaut dans la migration `5:` de
`storage/documentFormat.ts`, contrôle de forme au même endroit, lecture
tolérante dans `store/document.ts#fromProjectDocument`, une ligne dans
`FORMAT.md`), jamais dans une 7. Aucun champ nouveau au premier niveau : tout
est dans `analysis` et `corrections`.

- **Tonalité par passage** : `analysis.keyChanges` (détectées) et
  `corrections.keyChanges: KeyChange[] | null` (`null` : suivre l'analyse ; dès
  que l'utilisateur y touche, la liste entière est la sienne). `KeyChange { time,
  key }` est dans `model/harmony.ts`. La tonalité principale reste
  `analysis.key` / `corrections.key`.
- **Structure** : `analysis.structure: DetectedStructure | null` et
  `corrections.structure: StructureCorrections` (`model/structure.ts` : mode,
  parties, lettres ; la règle de fusion est en tête du fichier). Les lettres de
  section restent `corrections.sections`.
- **Résultat d'analyse** : `ANALYSIS_RESULT_VERSION = 2` (`model/analysis.ts`) ;
  un résultat de version 1 est mis à niveau (jamais jeté) par
  `storage/documentFormat.ts#readAnalysis`.
- **Signatures** de 1 à 64 sur 4, 8, 16 ou 32, plusieurs par morceau
  (`tempoMap.meters`, voir plus bas).
- **Correction de tempo « tapée »** : `TempoFix = AnalysedTempoFix |
  TappedTempoFix` (`model/corrections.ts`), le second ayant `kind: 'tapped'`,
  les tapes brutes (`taps`, en secondes) et la fin du passage (`end`). Le type
  attend ses tapes : la fenêtre est de l'étape 4.
- **Migration exacte depuis la version 5** (celle de la version publiée), testée
  sur trois vrais documents (`storage/fixtures/v5-*.json`,
  `storage/documentVersion6.test.ts`) : un `.fab` publié s'ouvre sans rien perdre.

### Lot 2 : analyse, corrections, harmonie (document version 2)

Principe : **ce que l'analyse a produit et ce que l'utilisateur a changé sont
rangés à part**, si bien que « pas encore analysé », « analysé » et « corrigé à
la main » se distinguent toujours, et qu'une nouvelle analyse n'écrase jamais
une correction sans qu'on le demande. Tout est stocké **en temps source
(secondes)**, jamais en mesures : un accord ou une section reste sur la musique
quand on corrige la grille ; l'affichage le pose sur le temps (accord) ou la
barre de mesure (section) les plus proches de la grille en vigueur.

| Donnée | Où | Contenu |
|---|---|---|
| Résultat d'analyse | `AppState.analysis`, `model/analysis.ts#AnalysisResult` | tel qu'il est sorti, jamais modifié : temps analysés (`beats.times`, indice du premier temps, métrique et sa sûreté), tonalité (tonique, mode, sûreté, autres lectures), accordage (écart à La 440 en cents, sûreté), accords (`time`, accord ou `null` pour N.C., sûreté, `doubtful`, autres lectures), analyseur et modèles, date. `null` = pas encore analysé |
| Grille en vigueur | `AppState.tempoMap` (inchangé, lu par le moteur et la frise) | son `origin` dit qui l'a faite : `default` (personne), `manual` (panneau du lot 1, tempo fixe), `analysis` (temps analysés, un segment par temps : `grid/beats.ts#tempoMapFromBeats`), `corrected` (temps analysés corrigés à la main : × 2, ÷ 2, premier temps, métrique). Les temps analysés restent dans le résultat : « Revenir à l'analyse » est toujours possible |
| Corrections | `AppState.corrections`, `model/corrections.ts#Corrections` | tonalité choisie (`key`, `null` = celle de l'analyse), accordage corrigé (`tuningCents`), offre d'accordage refusée, accords écrits à la main (`chords` : temps et accord), plages réécrites à la main (`handSpans` : là, l'analyse est masquée), lettres de section (`sections` : temps de la barre et texte), corrections du tempo à partir d'une mesure (`tempoFixes` : début de la mesure, action, grille d'avant) |
| Instrument | `view.instrument` (`ut`, `sib`, `mib`) | affichage seul, gardé avec le morceau |
| État de l'analyse | `AppState.analysisRun` (non gardé) | `idle`, `running` (projet, étape), `error` (code). La progression fine (fraction, octets téléchargés) est dans un petit magasin à part, `analysis/progress.ts`, pour ne pas réveiller tout l'écran (ni l'autosauvegarde, qui attend que le magasin se calme) plusieurs fois par seconde |

Un accord (`model/harmony.ts#ChordSymbol`) : fondamentale (classe de hauteur
0–11, sans orthographe), qualité (les quatorze du décodeur du prototype, mêmes
noms, plus `7sus4` et `aug7`), extensions (`b9`, `9`, `#11`, `13`, `alt`… :
suggestions quand elles viennent de l'analyse), basse. L'orthographe se fait à
l'affichage, par degré dans la tonalité (`harmony/pitch.ts`) : tonalités en
bémols en bémols, en dièses en dièses, ♭2 ♭3 ♯4 ♭6 ♭7 pour les degrés
chromatiques, septième diminuée de passage en degré haussé (C, C♯°7, Dm7), jamais
de double altération ni de C♭, F♭, E♯, B♯ (le nom simple à la place).

Les accords sont gardés **en Ut, dans la tonalité d'origine**. La transposition
(demi-tons du transport) et l'instrument (Si♭ : une seconde majeure au-dessus ;
Mi♭ : une sixte majeure au-dessus) ne servent qu'à l'affichage et à l'export :
`harmony/display.ts#displayContext`, `store/chartSelectors.ts#selectDisplayContext`.

**Ce qui est en vigueur** se lit par `store/chartSelectors.ts` : `keyInForce`,
`tuningInForce`, `tuningOffer` (proposer de ramener à 440), `selectChords` (accords
de l'analyse hors des plages réécrites, plus les accords à la main, posés sur la
grille en vigueur), `selectChartBars` (toutes les mesures de la grille),
`selectBarChords(s, n)` (« les accords de la mesure n tels qu'affichés » : accords
gardés et contexte d'affichage pour les écrire), `selectAnalysisStatus`,
`selectHasCorrections`. Sélecteurs mémorisés ; dans un composant, ne sélectionner
que des valeurs stables (un nouvel objet à chaque appel fait boucler React).

**Actions** (nouveaux fichiers ; `actions.ts` n'a gagné que la remise à zéro de
l'analyse et des corrections à l'ouverture d'un morceau) :

| Fichier | Actions |
|---|---|
| `store/analysisActions.ts` | `applyAnalysis(result, { replaceCorrections })` : la grille analysée remplace la grille en vigueur sauf si l'utilisateur en a fait une (`manual`, `corrected`) ; rien de ce qui est fait à la main n'est touché, sauf demande expresse (alors seules les sections restent). `setAnalysisRun` |
| `store/gridActions.ts` | `doubleTheTempo`, `halveTheTempo`, `moveDownbeat(±1)`, `setBeatsPerBar`, `placeDownbeatAtPlayhead` (sur des temps analysés : le temps le plus proche devient le premier temps), `resetGridToAnalysis`, `gridCorrectionsAvailable` |
| `store/harmonyActions.ts` | `setBarChords(mesure, [{ beatInBar, chord }])` (toute correction d'accord réécrit la mesure entière), `replaceChord`, `splitBar`, `removeChord`, `confirmBar` (l'accord douteux est validé), `resetBar` (rendre la mesure à l'analyse), `resetChordCorrections`, `setKey`, `setTuningCorrection`, `compensateTuning`, `dismissTuningOffer`, `setSection`, `setInstrument`, `resetHarmonyCorrections`, `untransposeForStorage` (un accord tapé tel qu'affiché, ramené en Ut dans la tonalité d'origine) |

**Document version 2** (`model/document.ts`) : `analysis` et `corrections` en plus,
origine de grille `corrected`, `view.instrument`. La migration 1 → 2
(`storage/documentFormat.ts#MIGRATIONS`) ouvre un morceau du lot 1 comme « pas
encore analysé », sa grille gardée telle quelle. À la lecture, un résultat
d'analyse abîmé ou d'une version inconnue est **abandonné** (il se recalcule) :
un morceau n'est jamais perdu pour lui ; les corrections, elles, doivent se
relire exactement, sinon le document est `corrupt`.

**Autosauvegarde** : `storage/keeper.ts` utilise `store/document.ts#documentChanged`,
qui donne la liste complète (analyse et corrections comprises) : une correction
d'accord, de tonalité ou de section est gardée comme le reste. `test:chart`
le vérifie (correction, rechargement, correction retrouvée).

### Lot 3 : le socle (document version 3)

Le socle du lot 3 est en place : modèle et document v3, une seule copie de
l'audio décodé, stockage des instruments séparés, trois contrats avec chacun
un remplaçant factice branché sur l'écran, écrans de la séparation, de
« Appliquer » et de « Exporter le son », réglages avancés, `test:separation` et
`test:memory`. Trois chantiers suivent, chacun dans son dossier (plus bas).

#### Modèle

| Donnée | Où | Contenu |
|---|---|---|
| Pistes jouées | `AppState.tracks` (inchangé) | toujours les pistes **affichées et jouées** : le morceau entier, ou les instruments séparés. Une piste séparée porte `stem` (`model/separation.ts#StemId` : `vocals`, `drums`, `bass`, `guitar`, `piano`, `winds`, `other`, et les parties détaillées `kick`, `snare`, `hihat`, `toms`, `cymbals`, `saxophone`, `brass`) et `audio.origin: 'separated'` ; sa couleur vient de `STEM_ROLE` (les teintes de `DESIGN.md`, une partie détaillée prend celle de sa famille) |
| Séparation | `AppState.separation`, `model/separation.ts#SeparationState` | `result` (dernière séparation finie : identifiant, outil et son SHA-256, carte graphique ou processeur, repli, parties données, parties gardées, dates, durée du calcul, durée du morceau ; `null` = jamais séparé ou place libérée), `showing` (`whole` ou `instruments`), `aside` : **l'autre jeu de pistes, avec son mixage**. C'est ce qui permet « Revenir au morceau entier » et « Revoir les instruments » sans rien recalculer : les deux jeux s'échangent. Invariants (vérifiés à la lecture) : sans résultat, le morceau entier est affiché et rien n'est de côté ; avec un résultat, un des deux jeux est le morceau entier, l'autre les instruments |
| Séparation en cours | `AppState.separationRun` (non gardé) | `idle`, `running` (outil, étape `download`/`prepare`/`separate`/`finish`, carte graphique ou processeur, `fellBack`), `error` (code). Fraction, temps restant et octets téléchargés : `separation/progress.ts` (petit magasin à part, comme l'analyse) |
| Rendu « Appliquer » | `AppState.render`, `model/render.ts` | `none`, `rendering`, `applied`, `error`, chacun avec la cible (`RenderTarget` : demi-tons, cents, tempo, formants, pistes) ; un rendu dont la cible n'est plus celle de l'état est périmé. Ce que l'écran montre : `render/controller.ts#selectApplyState` (`original`, `preview`, `rendering`, `applied`). Depuis le document version 5, le **dernier** rendu est gardé avec le morceau (`AppState.keptRender` : voir « Le dernier rendu « Appliquer », gardé avec le morceau ») |
| Préférences d'export | `AppState.exportPrefs`, `model/audioExport.ts` | quoi (`mix`, `tracks`), durée (`whole`, `loop`), format (`wav`, `mp3`, `flac`) ; gardées avec le morceau |
| Réglages avancés | `AppState.settings.advanced`, `model/project.ts#AdvancedSettings` | outil de séparation (`auto` ou l'identifiant d'un outil de la liste) et « Conserver le timbre » (formants). **Par appareil** (`localStorage`, `store/preferences.ts`), pas par morceau : le bon outil dépend de la machine, le timbre est une habitude |
| Choix de la fenêtre « Nouveau morceau » | `AppState.ui.importStems` | les instruments cochés (aucun par défaut) ; la séparation démarre seule quand le morceau importé peut jouer, puis la liste est vidée |

**Document version 3** (`model/document.ts`) : `separation` et `exportPrefs` en
plus ; `tracks` contient les pistes affichées, `separation.aside` l'autre jeu.
Migration 2 → 3 (`storage/documentFormat.ts#MIGRATIONS`) : jamais séparé,
préférences d'export par défaut. À la lecture : la séparation et les pistes
doivent se relire exactement (sinon `corrupt`, comme les corrections), une
préférence d'export illisible redevient celle par défaut.
`store/document.ts#documentChanged` suit `separation` et `exportPrefs` (pas les
états de calcul) : l'autosauvegarde les garde.

**Actions** : `store/separationActions.ts` (`toggleImportStem`,
`applySeparation`, `showWholePiece`, `showInstruments`, `dropSeparation`,
`setSeparationModel`, `setFormants`, `setSeparationRun`, `stemName`…). Changer
de jeu ne recharge jamais le moteur : les pistes de l'autre jeu sont ajoutées
(`addTrack`, alignées à 0) puis les anciennes retirées ; la position et la
lecture continuent. `store/exportActions.ts` : la fenêtre d'export et ses
préférences.

#### Une seule copie de l'audio décodé (`audio/pcm.ts`)

Jusqu'au lot 2, chaque piste était gardée deux fois : en Float32 dans le
registre (formes d'onde, analyse) **et** en 16 bits dans le moteur. Désormais
le registre (`audio/registry.ts`) ne garde que la forme 16 bits du moteur,
`PcmAudio` : blocs de 32 768 images en `SharedArrayBuffer` (mémoire ordinaire si
la page n'est pas isolée), deux canaux égaux gardés une fois. **Le moteur reçoit
ces mêmes blocs** (`EngineTrack.pcm`, `engineTrack()`), sans copie : la mémoire
partagée est partagée avec le fil audio, pas copiée. La frise lit les blocs
(`timeline/peaks.ts`), l'analyse reçoit une copie Float32 mono **passagère**
(`pcmToMono`, le mélange `(g + d) / 2` qu'elle faisait déjà), la séparation, le
rendu et l'export lisent par plages (`readPcm`) ou font une copie passagère
(`pcmToChannels`) puis la lâchent. L'ouverture d'un morceau convertit par
tranches (`pcmFromChannelsInSlices` : aucune tâche longue, 50 ms au plus pour un
morceau de quatre minutes contre 270 ms d'un bloc), la réouverture d'un coup,
une piste à la fois, pendant « Ouverture… ». 16 bits, c'est la précision que le
moteur a toujours jouée (96 dB), sous le bruit des mp3, m4a et vieux disques.
Pour écrire progressivement (séparateur, rendu) : `PcmWriter`. Après une
séparation, le morceau entier reste en mémoire à côté des instruments (une piste
de plus, 58 Mo pour cinq minutes) : l'analyse l'écoute, et le retour au morceau
entier est immédiat.

Mesures (`npm run test:memory`, Chromium sans carte graphique, vrai moteur,
mémoire résidente de tous les processus Chromium, avant → après ouverture) :

| Morceau | Avant (lot 2) | Après (lot 3) | Échantillons Float32 / 16 bits |
|---|---|---|---|
| 5 min stéréo, 1 piste | +272 Mo | +166 Mo | 110 / 55 Mo |
| 5 min stéréo, 7 pistes | +1 250 Mo | +485 Mo | 769 / 385 Mo |

#### Où restent les instruments séparés (`storage/`)

**IndexedDB**, base `fabtice` passée en version 2 : deux magasins de plus,
`pcm` (blocs de 16 morceaux de 32 768 images, 1 Mo par canal, clé `[audioId,
bloc]`) et `pcmInfo` (une fiche par piste, écrite **en dernier** : une écriture
interrompue ne laisse rien de lisible, jamais une demi-piste). Contrat :
`ProjectStorage.saveTrackAudio`, `loadTrackAudio` (relue directement en mémoire
partagée, prête pour le moteur, sans décodage), `deleteTrackAudio`,
`pruneTrackAudio` (restes d'une écriture coupée, balayés à la réouverture),
`trackAudioUsage` (place prise). Un nouveau morceau (`replaceCurrent`) et
« Oublier » (`clearCurrent`) effacent aussi les instruments. Les octets
d'origine du morceau restent gardés comme avant (le morceau entier se décode à
nouveau). Le séparateur écrit les instruments **avant** que le document ne les
cite (`separation/runner.ts`) ; le morceau de démonstration et un morceau pas
encore gardé n'écrivent rien.

Pourquoi pas le système de fichiers privé de l'origine : IndexedDB est le
magasin que l'app utilise déjà partout où elle tourne (pages http(s), origine
`fabtice://app` de l'app Mac, workers), avec le même quota et la même
« persistance » ; un seul endroit à vider quand un morceau en remplace un autre ;
les flux d'écriture du système de fichiers privé sont arrivés tard dans Safari.
Vérifié dans l'app Mac par `desktop/test/e2e/separated-storage.test.js` (deux
pistes stéréo de 2 min 30, 58 Mo, écrites, app quittée et relancée, relues à
l'échantillon près en mémoire partagée, puis effacées ; mesuré ici : 57,7 Mo
écrits en 2,0 s, relus en 0,1 s après la relance. Le même test écrit un fichier de
même taille dans le système de fichiers privé : il marche aussi sur cette
origine et revient après la relance ; le choix d'IndexedDB tient aux raisons
ci-dessus, pas à une panne de l'autre),
et dans Chromium avec un profil persistant par `test:separation` (morceau de
2 min 30, six pistes, rechargement, puis « Libérer la place »).

**Réouverture** (`storage/restore.ts`, dans le même parcours qui ne bloque
jamais et ne détruit jamais) : l'original est relu et décodé, puis les
instruments sont relus tels quels (étape « Lecture des instruments
séparés… », limite `RESTORE_LIMITS.instrument`). S'il en manque un (effacé par
le navigateur, abîmé, trop lent), le morceau s'ouvre **entier**, le résumé de
séparation est abandonné et une phrase calme le dit
(`separation.lostAtRestore`) : le morceau, lui, n'est jamais perdu.

#### Contrats pour les trois chantiers suivants

##### Séparateur — `src/separation/`

| Fichier | Rôle |
|---|---|
| `types.ts` | le contrat : `Separator` (`separate(request)`, `isCached`, `toolsUsage`, `forgetTools`), `SeparationRequest` (audio `PcmAudio`, outil, `backend: 'auto' \| 'cpu'`, `onProgress`, `onTrack` facultatif, `signal`), `SeparationProgress` (étape, fraction qui ne recule jamais, **temps restant mesuré**, octets, carte graphique ou processeur, `fellBack`), `SeparationOutput`, `SeparationError` (`cancelled`, `download-failed`, `unsupported`, `memory`, `unknown-model`, `failed`), `SeparationModelSpec`, `DeviceProfile`, `ModelChoice` |
| `models.json` | **la liste des outils**, gardée dans ce dépôt : les trois paliers du prototype (BS-RoFormer SW, HTDemucs 6 sources, SCNet), adresse figée, taille, SHA-256 (identiques au prototype, un test le vérifie), page source, licence connue en français, `licenceUnclear`, vitesses (mesurées ou estimées, dit), mémoire, réglages du prototype (`config`, opaque pour l'app) |
| `models.ts` | lecture de la liste : copie embarquée, et au lancement `refreshModelList()` va chercher `models.json` à son adresse brute publique (`REMOTE_MODEL_LIST_URL`, branche `main`), avec une limite de temps ; **validation stricte** (`validateModelList` : https, hôte autorisé `huggingface.co`, révision de 40 caractères, SHA-256, taille, parties connues ; un document qui échoue est ignoré en entier, jamais à moitié). Une liste distante vide est valable : tous les outils sont retirés. Pas de requête sur les adresses de test et de démonstration, ni depuis la machine elle-même (développement, vérifications), sauf `?outils=distant` |
| `device.ts` | **choix automatique, pur et testé** : `assessDevice` (téléphone, navigateur, puce graphique, mémoire, cœurs), `chooseModel` (téléphone → le plus léger ; Safari → processeur, le meilleur outil sur puce Apple ; puce Apple ailleurs → le meilleur sur la carte graphique ; autre puce ou aucune → l'outil équilibré ; un outil que la mémoire ne tient pas est sauté), `resolveModel` (le réglage avancé gagne tant que son outil est dans la liste), `estimateSeconds` (vitesse de la liste × durée, plus lent avec peu de cœurs) ; `probeDevice()` (WebGPU, mémoire) une fois par page |
| `mock.ts` | `MockSeparator` : copies filtrées par bandes (graves pour la basse, médium pour la voix…), au rythme voulu, avec premier téléchargement, repli sur le processeur, annulation et erreurs ; le panneau dit « Outil d'essai » quand il est en service |
| `index.ts` | la fabrique `getSeparator()` : le vrai séparateur par défaut dans un navigateur, le factice dans Node et sur les adresses de test et de démonstration (`?separation=lente\|instant\|repli\|echec`…), `?separation=reel` pour forcer le vrai ; `SEPARATION_TOOLS_DB` |
| `runner.ts` | lancement (`startSeparation({ stems })`, `startAutoSeparation` après un import), annulation, rassemblement des parties non demandées dans « Autres » (`gatherParts`), écriture sur l'appareil puis mise en place, `freeSeparatedTracks`, `separationUsage` |
| `progress.ts`, `useChoice.ts` | progression fine ; l'outil et l'estimation pour l'écran (`formatWait`, `formatSize`) |
| `onnx.ts` | **le vrai séparateur**, `OnnxSeparator` (côté fil principal, léger : ONNX Runtime n'est chargé que par son worker, quand une séparation démarre) : donne le morceau au worker tel qu'il est en mémoire (blocs 16 bits partagés, aucune copie), écrit les parties que le worker rend, tronçon par tronçon, dans une piste 16 bits par partie (`PcmWriter`), progression et temps restant, repli, annulation, rapport ; `isCached`, `toolsUsage`, `forgetTools` lisent et vident la base des outils |
| `worker/` | `separation.worker.ts` (le worker : outil depuis l'appareil ou téléchargé et vérifié, ONNX Runtime Web sur la carte graphique ou le processeur, le calcul) et `protocol.ts` (les messages) |
| `engine/` | les calculs, **purs** et testés dans Node : `stft.ts` (FFT, STFT / iSTFT au sens de torch pour deux canaux à la fois, fenêtres, reflets : le portage de `dsp.js`), `resample.ts` (48 kHz ⇄ 44,1 kHz), `plan.ts` (réglages d'un outil, découpage en segments), `runners.ts` (ce que chaque réseau prend et rend), `pipeline.ts` (le morceau entier, segment après segment) |
| `report.ts` | le rapport de mesure d'une vraie séparation (texte à copier, sans donnée personnelle), gardé par l'appareil et transmis à l'app Mac |
| `toolsDb.ts` | `SEPARATION_TOOLS_DB` et sa façon d'ouvrir la base (fichiers gardés en `Blob`) |

**Quel séparateur ?** Comme pour l'analyseur : dans un navigateur, le **vrai**
est celui par défaut. Le factice sert dans Node (tests unitaires) et sur les
adresses des suites de tests et de la démo : `?separation=lente|instant|repli|echec|entier|faite`,
`?demo`, `?debug`, `?moteur=factice`, **sauf** `?separation=reel`, qui demande
le vrai (c'est ce que font `test:separation-real` et le test de bout en bout de
l'app Mac). Un navigateur qui ne sait pas le faire tourner (pas de worker, pas de
WebAssembly) reçoit quand même le vrai, qui le dit (`unsupported`) au lieu de
rendre des copies filtrées comme si c'étaient des instruments. Le panneau ne dit
« Outil d'essai » que quand le factice est en service.

#### Le vrai séparateur (ce qui existe)

**Le calcul**, porté du prototype `web/spikes/separation/` (mêmes adaptateurs de
réseau, même STFT, même normalisation, mêmes segments et pondérations que les
implémentations de référence, MSST pour SCNet et BS-RoFormer, Demucs pour
HTDemucs ; les trois outils de `models.json`), avec une différence de fond : **où
vivent les échantillons**. Le prototype gardait le morceau et chaque partie en
Float32 sur toute la durée, plusieurs fois (entrée, copie normalisée,
accumulateurs, résultat : une vingtaine de copies du morceau). Ici
(`engine/pipeline.ts`) :

- le morceau est lu **par plages** (`readPcm`) à 48 kHz, et seule la plage d'un
  segment est passée à 44,1 kHz, au moment de ce segment ;
- les parties du réseau sont additionnées (recouvrement pondéré) dans des
  tampons **longs d'un segment** ; dès qu'un tronçon ne peut plus changer (aucun
  segment suivant ne le touche), il est repassé à 48 kHz, envoyé au fil principal
  (transfert, sans copie) et oublié ; le fil principal l'écrit en 16 bits ;
- un seul segment à la fois sur le processeur ; sur la carte graphique, le
  segment suivant est préparé pendant que le courant calcule (comme le
  prototype) ;
- un morceau mono (le cas du vieux jazz) donne des parties mono (la moyenne des
  deux canaux du réseau) : moitié moins de mémoire, comme le morceau.

**Rééchantillonnage 48 ⇄ 44,1 kHz** (`engine/resample.ts`) : polyphasé
rationnel exact (160/147), noyau sinc fenêtré de Kaiser, phase linéaire centrée
(aucun retard : un aller-retour garde chaque échantillon à sa place), plat
jusqu'à 20 kHz, coupé à 21,5 kHz, au moins 100 dB d'atténuation dès 23 kHz (ce
qui se trouve entre 22,05 et 23 kHz ne peut se replier qu'au-dessus de 21 kHz).
Accès direct à n'importe quelle plage (chaque échantillon est lu deux fois avec
le recouvrement de 2). **Mesuré** (`engine/engine.test.ts`) : un la à 1 kHz
revient de l'aller-retour avec une erreur de −129 dB, aucune autre composante
au-dessus de −116 dB ; un balayage de 20 Hz à 20 kHz revient à −109 dB (−111 dB
jusqu'à 18 kHz) ; 23,2 et 23,9 kHz à 48 kHz sortent à −102 et −104 dB à 44,1 kHz
(rien ne se replie dans l'audible) ; dans l'autre sens, l'image d'un 10 kHz est
à −117 dB.

**Le worker et ONNX Runtime** (`worker/separation.worker.ts`) : la version npm
déjà dans l'app (1.31.1), chargée **seulement quand une séparation démarre** (le
démarrage de l'app n'y perd rien) et seulement la variante du chemin choisi :
carte graphique, `ort.webgpu.min.mjs` et son WebAssembly (`asyncify`, 28,7 Mo,
servi par l'app, alias dans `vite.config.ts`) ; processeur, la variante
WebAssembly simple, celle de l'analyse (14,8 Mo, déjà servie). Fils de calcul :
tous les cœurs moins un (la page, le son), huit au plus, un seul si la page
n'est pas isolée.

**Repli sur le processeur, avec le même outil.** Tout échec du chemin graphique
— pas de WebGPU dans le worker, outil qui ne se charge pas, segment qui échoue,
résultat absurde (valeurs non numériques, ou parties presque muettes pour un
segment sonore : le contrôle du prototype), périphérique perdu, worker qui
s'arrête ou ne répond plus (plus de 5 min pour le premier segment, ou dix fois
le temps habituel) — termine ce worker et en lance un sur le processeur **avec
le même outil**, qui **reprend à partir des images déjà écrites** : le pipeline
sait repartir de n'importe quelle image de sortie (il recalcule les un ou deux
segments qui touchent encore ce qui reste à écrire). `fellBack` est annoncé tout
de suite. L'outil n'est jamais changé seul. Vérifié dans Chromium : le chemin
« graphique » simulé (`?separation=reel&repli-essai=2`) échoue au segment 3, le
processeur reprend, et le résultat est **identique** à l'échantillon près à
celui d'une séparation sans échec.

**Temps restant et progression** (`onnx.ts`) : une fraction pour tout (premier
téléchargement 15 %, préparation, séparation selon les images écrites et le
segment en cours à l'horloge, jamais jusqu'à son bout, mise en place), qui ne
recule jamais ; le temps restant est **mesuré** sur le rythme réel des segments
du chemin en cours, dit dès que deux segments sont chronométrés (le premier, qui
comprend la mise en route, est laissé de côté ensuite), et recalculé de zéro
après un repli.

**Annulation** : la promesse rejette tout de suite (`cancelled`), le worker est
prié de s'arrêter puis terminé 200 ms après. L'écran est revenu au repos en
0,1 s ; le worker, lui, disparaît **environ 4 s** plus tard quand il est au milieu
d'un segment sur le processeur (Chromium termine le fil quand le calcul de
WebAssembly rend la main) ; sa mémoire est alors rendue.

**Téléchargement et place** : `analysis/models/download.ts` (reprise, SHA-256,
trois essais) avec `openModelStore(SEPARATION_TOOLS_DB, { blobs: true })`. Deux
changements dans ce module partagé, sans effet sur l'analyse : le fichier est
désormais assemblé dans **un seul tampon** de sa taille (avant : les morceaux de
2 Mo plus leur concaténation, soit 706 Mo pour les 353 Mo de BS-RoFormer), et la
base des outils de séparation garde chaque fichier en **`Blob`** (le navigateur
le laisse sur le disque : vérifier qu'il est là ou lister les outils ne le relit
jamais, alors qu'un enregistrement `ArrayBuffer` de 353 Mo était chargé en
entier par chaque `hasFile`) ; `listFiles()` ajouté au magasin. Le panneau
« Instruments » montre la place des outils et propose « Effacer les outils
téléchargés » (`forgetTools`) quand il y en a.

**Rapport de mesure** (`report.ts`) : après chaque vraie séparation, un court
texte (outil et son empreinte, demandé / terminé sur la carte graphique ou le
processeur, adaptateur graphique tel que le navigateur le décrit, repli et à
quel segment, durée du morceau et canaux, segments, temps total et par segment
sur chaque chemin, chargement de l'outil, téléchargement ou relecture, fils,
cœurs, mémoire annoncée, isolation, moteur, navigateur). Aucune donnée
personnelle : ni titre, ni nom de fichier, ni chemin. Gardé avec l'identifiant
de la séparation (`localStorage`) : le panneau, une fois séparé, offre
« Copier le rapport » ; dans l'app Mac le même texte part par le pont
(`reportSeparation`, `desktop/src/main.js` le garde dans le dossier de l'app) et
paraît dans Aide → Diagnostic… (« Dernière séparation »).

**Liste distante dans l'app Mac** : `connect-src` de `desktop/src/protocol.js`
ouvre `https://raw.githubusercontent.com` (et rien d'autre de nouveau) ; l'app
Mac va chercher la liste comme l'app web (`main.tsx`). La liste n'est pas
encore sur `main` : la requête reçoit un 404 et la copie embarquée reste en
service, sans un mot à l'écran (Chromium note seulement le 404 dans sa
console) ; une liste illisible ou invalide fait de même (tests unitaires de
`models.test.ts`, test de bout en bout de l'app Mac).

#### Mesures (cette machine : 4 cœurs, pas de carte graphique, Chromium sans tête ; d'autres travaux tournaient en même temps : elles ne valent pas pour les appareils du propriétaire)

Toutes sur le **processeur** (WebAssembly, 3 fils), aucune sur une carte
graphique. Les temps varient du simple au double selon la charge de la machine
(SCNet : 10,8 s par segment au calme, 25 s quand d'autres calculs tournaient).

| Outil | Essai | Par segment | Fois la durée | Somme des parties / morceau | Mémoire de pointe, morceau de 4 min stéréo |
|---|---|---|---|---|---|
| SCNet (11 s par segment, un tous les 5,5 s) | 25 s du morceau d'essai, 7 segments | 10,8 s | 1,95 | −40,9 dB | **+1,5 Go** (calcul complet : 913 s, machine chargée), plus 176 Mo de pistes |
| HTDemucs 6 sources (7,8 s, un tous les 5,85 s) | 12 s | 15,6 s | 2,7 | −13,8 dB | **+2,9 Go** (calcul complet : 386 s), plus 264 Mo de pistes |
| BS-RoFormer SW (4 s, un tous les 2 s) | 12 s | 35,3 s | 17,7 | −29,9 dB | **+4,7 Go** sur les six premières minutes de calcul (arrêté là : 122 segments à 35 s), plus 264 Mo de pistes |

- Mémoire : résidente du navigateur et de tous ses processus (son arbre de
  processus seulement, pas les autres Chromium de la machine), de l'ouverture du
  morceau à la pointe pendant la séparation. Elle tient presque toute au réseau
  dans ONNX Runtime (ses poids, élargis en 32 bits sur le processeur, et ses
  activations pour un segment) : pour SCNet, ni l'arène désactivée, ni le plan
  mémoire désactivé, ni l'optimisation « basic », ni un seul fil ne la font
  descendre sous +1,3 Go. Ce qui dépend du morceau est compté une fois : les
  pistes en 16 bits (176 Mo pour les quatre parties stéréo de SCNet, 264 Mo
  pour six) et des tampons d'un segment.
- La somme des parties n'est pas exacte par construction (aucun de ces réseaux
  n'y est contraint) ; −40,9 dB pour SCNet veut dire qu'il ne perd presque rien
  du morceau. Les longueurs, elles, sont exactes à l'image près pour les trois.
- **Le port donne les parties du prototype** (`npm run test:separation-prototype`) :
  le code du prototype (`separator.js` + `dsp.js`, avec son propre ONNX Runtime)
  et le pipeline de l'app tournent sur la **même entrée à 44,1 kHz** (le morceau
  d'essai rendu stéréo) avec **la même session** du réseau, sur au moins deux
  segments (recouvrement ; pour SCNet, 12,5 s : cinq segments et les bords en
  miroir). Écart par partie, relatif au niveau de la partie : SCNet de −98,5 à
  −145,7 dB ; HTDemucs de −202 dB à l'identité ; BS-RoFormer identique à
  l'échantillon près. Les réglages de `models.json` sont vérifiés égaux à ceux du
  prototype. Ce qui diffère volontairement n'est pas dans ce test : le passage
  48 ⇄ 44,1 kHz (le prototype laissait le décodeur du navigateur produire du
  44,1 kHz) et la moyenne des deux canaux de sortie pour un morceau mono.
- **Pourquoi HTDemucs ne se « reboucle » qu'à −13 dB** : c'est le réseau, pas le
  port. Le prototype donne le même résidu (−12,8 dB, au centième près) ; un
  recouvrement de 0,5 au lieu de 0,25 n'y change presque rien (−13,1 dB) ; les
  poids en 32 bits du même dépôt, à la même révision, donnent des parties
  **identiques** aux poids en 16 bits sur le processeur (les poids publiés de
  Demucs sont déjà en demi-précision). Sur ce morceau d'essai synthétique, ce
  réseau met l'essentiel du son dans « piano » et « guitare » et ses six parties
  ne somment pas au mélange (rien ne l'y contraint, comme pour les deux autres).
- Repli simulé au segment 3 (SCNet) : résultat identique à celui d'une
  séparation sans repli (écart nul sur les échantillons 16 bits comparés).
- App Mac (Electron 43, ce Linux, `xvfb`) : SCNet sur les 37,6 s du morceau
  d'essai, de l'import aux quatre pistes affichées, 251 s téléchargement compris
  (machine chargée) ; le rapport paraît dans Aide → Diagnostic… ; la liste
  distante répond 404, la copie embarquée est utilisée, rien à l'écran.
- Annulation : écran au repos en 0,1 s, worker disparu environ 4 s après.

#### Ce qui reste

- **Le chemin graphique n'a été mesuré nulle part ici** (pas de carte
  graphique) : sa vitesse, sa mémoire et son repli réel (périphérique perdu dans
  Safari) sont à relever sur le Mac du propriétaire avec « Copier le rapport ».
  Les vitesses de `models.json` restent celles du propriétaire pour BS-RoFormer
  (`measured: true`) et des estimations pour les deux autres (`measured: false`).
- **Mémoire de SCNet** : le réseau lui-même demande plus d'un gigaoctet pendant
  un segment sur le processeur, quels que soient les réglages de session
  essayés (arène désactivée, plan mémoire désactivé, optimisation « basic »,
  un seul fil : entre +1,3 et +2,2 Go), et son graphe a une durée de segment
  **figée** à 11 s (476 trames : un segment plus court est refusé). La page de
  l'iPhone sera donc probablement encore fermée par le système avec cet outil,
  même si tout ce qui dépend du morceau est désormais compté une seule fois en
  16 bits. Pistes : une conversion du réseau à durée libre (segments de 3 à 4 s),
  ou un outil plus petit pour le téléphone ; à décider.
- Les séparations détaillées (batterie détaillée, saxophone) : aucun outil dans
  la liste, rien de fait.
- Le chemin graphique libère sa mémoire en terminant le worker ; une seconde
  séparation sur la carte graphique dans la même page recharge l'outil (quelques
  secondes, relu depuis l'appareil).

##### Rendu hors ligne et « Appliquer » — `src/render/`

**Nom à l'écran.** Le bouton se lit « Appliquer meilleure qualité » (deux lignes
dans le bouton ; textes `apply.*` de `i18n/fr.ts`), l'état appliqué
« meilleure qualité appliquée » et l'écran d'attente « Meilleure qualité » :
« Appliquer » seul ne disait pas ce que le bouton fait. Le nom du code et des
tests (`appliquer`, `applique`, `apply*`) n'a pas changé. Sur téléphone le
bouton fait 92 px de large au plus (police 11 px) pour que Tonalité et Tempo
gardent la place de leurs deux boutons ; `tests/separation.mjs` vérifie que le
transport tient à 1280×800, 960×640 et 390×844. Jamais en braise.

**Fait** (rendu réel, lecteur du rendu, mémoire, écran). Rubber Band R3
« finer » rend les pistes hors ligne dans des workers, le moteur joue le rendu
tel quel, et tout se vérifie par des mesures : `npm test` (Node, vrai wasm),
`npm run test:render` et `npm run test:engine` (Chromium), `npm run test:memory`,
et dans l'app Mac `desktop/test/e2e/apply-render.test.js`.

| Fichier | Rôle |
|---|---|
| `types.ts` | le contrat : `OfflineRenderer.render(request)` → `PcmAudio` ; `RenderRequest` (audio, demi-tons, cents, rapport de tempo, formants, plage en temps source facultative, progression, annulation), `supportsFormants`, `parallel` (combien de rendus à la fois valent la peine), `RenderError`. La sortie dure **exactement** `round(images de la plage / tempo)`, est **alignée** (l'image k correspond au temps source `début + k × tempo / 48 000`), commence et finit sans clic |
| `rubberband.ts` | `RubberBandRenderer` : côté page. Lit l'audio **par blocs de 16 384 images** (`readPcm`) et les transfère au worker (au plus trois en vol, le worker en accuse réception : un rendu lent n'entasse rien), écrit la sortie qui revient avec `PcmWriter` ; jamais une copie Float32 d'une piste entière. Un piste stockée une seule fois (mono, ou deux canaux égaux : le cas du jazz ancien) n'est calculée qu'**une fois** (moitié moins de calcul). Un worker par rendu, terminé à la fin ou à l'annulation (la mémoire d'une instance WebAssembly ne se rend que comme cela) : annulation en moins d'une milliseconde mesurée |
| `rubberband/` | `worker.ts` (le worker : récupère le binaire sur l'origine de l'app, au premier rendu seulement), `job.ts` (le travail du worker, séparé de sa plomberie pour les tests Node), `protocol.ts`, `stretcher.ts` (Rubber Band hors ligne : flux d'entrée, silence derrière la fin jusqu'à la dernière image voulue, retard mesuré, fondus de bord), `rubberband-nosimd.wasm` (**le binaire du prototype tel quel**), `LICENSE-rubberband-GPL.txt` (copiée dans `assets/` à la construction), `SOURCES.md`, `testing.ts` |
| `budget.ts` | ce que l'appareil peut tenir (voir « Mémoire ») et combien de pistes rendre à la fois |
| `mock.ts` | `MockRenderer` : grains fenêtrés superposés, sans rééchantillonnage : durées et alignement justes, ni transposition ni timbre |
| `index.ts` | la fabrique `getRenderer()` : **le vrai rendu dans un navigateur**, le factice dans Node, sur `?demo`, `?debug`, `?moteur=factice`, `?rendu=lent` (à voir : l'attente) ; `?rendu=reel` force le vrai sur une page de test, `?rendu=factice` le factice (comme `analysis/index.ts`) |
| `controller.ts` | « Appliquer » : refuse d'emblée ce que l'appareil ne tiendrait pas (`memory`), rend les pistes affichées **les plus longues d'abord, `renderer.parallel` à la fois** (progression comptée en images : le travail y est proportionnel), la première erreur arrête les autres, garde **la seule copie** du rendu (16 bits partagés) et la donne au moteur ; tout changement de tonalité, tempo, formants ou pistes le périme : il est lâché aussitôt, retour à la préécoute ; `appliedAudioFor` (l'export s'en sert quand il correspond) |

**Ajout au contrat du moteur** (`audio/AudioEngine.ts`, rétrocompatible) :
`setRenderedTracks(set | null)` et `isRenderedInUse()`. Un `RenderedSet` donne,
pour chaque piste chargée, l'audio rendu et les réglages qu'il contient
(demi-tons, cents, tempo). Le moteur le fait entendre **tel quel** (ni étirement
ni transposition) seulement tant que ses réglages en direct sont ceux du jeu et
qu'il couvre toutes les pistes ; sinon il joue la préécoute. **Tout reste en
temps source** pour l'interface : position, déplacement, boucle, clics, durée ;
correspondance linéaire (image rendue k = temps source `k × tempo / 48 000`).
Mixage, boucle (fondu au repli), métronome et limiteur comme en préécoute.
`loadTracks()` et `clear()` lâchent le jeu, `removeTrack()` retire l'entrée de la
piste. `MockEngine` l'implémente (`snapshot().rendered`), `WorkletEngine` aussi
(voir « Le lecteur du rendu » ; `renderedBytes()` donne la mémoire du jeu).

**Le binaire est celui du prototype, sans recompilation.** Son interface
(`fe_*`) est celle du temps réel (`OptionProcessRealTime`, R3 « finer »,
`OptionPitchHighConsistency`), mais elle porte tout ce qu'un rendu hors ligne
demande : échelle de hauteur (demi-tons et cents ensemble), rapport de temps,
option de timbre (`fe_set` : formants conservés ou déplacés, avant la première
image), et la recette d'alignement de Rubber Band (`fe_reset` donne le début de
silence préféré et retire le retard de démarrage). Le mode hors ligne
d'origine (`OptionProcessOffline`, `study()`) n'est pas atteignable par cette
interface ; il n'a pas semblé nécessaire (voir « Alignement »), et sa
compilation demanderait Zig et de nouvelles mesures. La variante SIMD (509 Ko)
n'est pas livrée : mesurée sur 30 s de mono, 2,7 s contre 3,1 s sans SIMD, 4,4 s
contre 4,1 s selon le réglage : dans le bruit, pour un fichier de plus. Le
binaire (486 Ko) n'est demandé que **quand « Appliquer » (ou un export)
démarre**, par le worker, sur l'origine de l'app (`fabtice://app` : vérifié
sous sa politique de sécurité), et sa licence GPL (Rubber Band est
GPL-2.0-or-later, compatible avec ce projet) est servie à côté.

**Alignement : ce qui est mesuré.** Au rapport 1 et sans transposition le
binaire tombe juste (0,07 ms). Ailleurs son retard de démarrage est faux de
plusieurs millisecondes (jusqu'à −10 ms à 0,5 fois le tempo et +7 demi-tons),
toujours du même montant pour les mêmes réglages et **sans dérive** le long d'un
fichier. `measureDelay` mesure ce retard sur un court signal de clics (11
clics, 3 s, 0,4 s de calcul, gardé pour la vie de la page) et le rendu décale
sa sortie d'autant (images retirées, ou silence devant). Reste la gigue propre
à Rubber Band (sa grille de sauts de 128 à 256 images, soit 2,7 à 5,3 ms) : on
ne peut pas l'enlever. Un train de clics de 20 s (un clic toutes les 0,27 s,
bruit de 1 ms), rendu dans Chromium, position de chaque clic contre sa place
(`npm run test:render`, erreur du premier au dernier clic, pire écart) :

| Tempo | −3 demi-tons | +2 | +7 |
|---|---|---|---|
| 0,5 | 97 % à ±2 ms, pire 2,2 ms | 90 % à ±2 ms, **pire 4,2 ms** | 99 % à ±2 ms, pire 2,6 ms |
| 0,7 | pire 0,6 ms | pire 1,1 ms | pire 1,4 ms |
| 1,25 | pire 1,1 ms | pire 0,3 ms | pire 0,3 ms |

Donc **±2 ms pour tous les clics aux tempos 0,7 et 1,25, pas à 0,5** : là, un
clic sur dix s'écarte de plus (jusqu'à 4,2 ms mesurés) ; c'est le pas de
l'algorithme, pas un retard. Cinq minutes (155 clics, tempo 0,7, +2 demi-tons,
mono, 35 s de calcul) : moyenne des 20 premiers clics −0,22 ms, des 20 derniers
−0,19 ms (dérive 0,03 ms), pire 1,24 ms, longueur exacte. 

**Justesse et timbre.** Hauteur à moins de 5 cents sur un sinus (+7 demi-tons ; −5 à 0,7 ;
+2 et 30 cents à 1,25 ; −40 cents ; +3 et 50 cents à 0,8 : test Node) ; les cents sont
pris en compte. « Conserver le timbre » (formants) ne change le résultat que
demandé : deux rendus sans sont identiques, avec, la fréquence moyenne d'une
voix synthétique reste à 15 % de l'origine à +7 demi-tons, contre +30 % ou plus
sans. Il coûte un tiers de calcul en plus (24,7 à 25,9 s contre 19 à 21 s par
minute stéréo à 0,7). Sans clic : la sortie démarre et finit en douceur ; sur
une plage prise **dans** l'audio (export de boucle) l'audio d'avant et d'après
(170 ms) nourrit le moteur pour que son démarrage ne soit pas dans ce qu'on
garde, plus un fondu de 2 ms au bord. Image stéréo : les deux canaux passent
ensemble dans une seule instance (un son à gauche reste à gauche, niveaux et
phase tiennent, vérifié).

**Vitesse (ce poste, Xeon virtuel à 4 cœurs, 2,1 GHz : ne dit rien des autres
machines).** Une minute d'audio **stéréo**, un worker, +2 demi-tons : **15 à 16
secondes à tempo 1, 19 à 21 secondes à 0,7** (23 à 26 en conservant le timbre).
Une piste stockée une fois (mono) en demande la moitié. Quatre pistes stéréo
d'une minute à 0,7, trois essais : 77 à 86 s avec un worker, 40 à 55 s avec deux
(1,5 à 1,9 fois plus vite), 44 à 57 s avec trois, 30 à 51 s avec quatre : un gain
net avec deux, incertain au-delà (la machine est partagée ; les chiffres varient
du simple au double d'un essai à l'autre). `renderParallelism()` : un worker par
cœur moins un (le fil audio et la page gardent le leur pendant que la préécoute
joue), trois au plus, un seul sur téléphone. **Sept pistes stéréo de cinq minutes
demanderaient ici de l'ordre de onze minutes de calcul, cinq à six avec deux ou
trois workers** (la moitié en mono) : l'attente d'« Appliquer » est longue sur une
grosse pièce, avec une estimation du temps restant sur l'écran ; elle n'a pas été
mesurée sur un Mac.

**Le lecteur du rendu (`audio/worklet/core.ts`, `WorkletEngine.ts`).**
`setRenderedTracks` envoie au fil audio **les blocs mêmes de la page**
(mémoire partagée, rien n'est copié) ; `isRenderedInUse()` dit ce qu'on
entend. Le lecteur a deux curseurs : celui de la préécoute (ce qui est
**donné** aux étireurs, en avance de leur latence) et celui du rendu (ce qui est
**lu**, donc entendu : pas de latence). Le rendu est lu tel quel, une image
rendue par image de sortie, à la position `source / rapport` ; position, boucle,
clics et durée restent en temps source. Il est utilisé tant que la tonalité
(demi-tons et cents) et le tempo vivants sont exactement ceux du jeu (le lissage
du tempo est fini) et que le jeu couvre toutes les pistes. Mixage, sourdine, solo,
volume, boucle (même fondu de 20 ms au repli), métronome et limiteur sont ceux de
la préécoute ; la préécoute elle-même, sans jeu utilisable, est **identique au
bit près** (test : deux lecteurs, avec et sans jeu inutilisable, même sortie).
`loadTracks()`, `clear()` et `removeTrack()` lâchent ce qu'ils doivent ; une piste
ajoutée n'a pas de rendu, donc le jeu cesse d'être entendu jusqu'à un nouveau.
- *Préécoute → rendu* : immédiat, au même endroit entendu, fondu enchaîné de
  15 ms (puissances égales).
- *Rendu → préécoute* : **différent de ce que la spécification dit**, voir plus
  bas : les étireurs doivent être nourris depuis la position entendue et
  mettent leur latence (152 ms à vitesse normale, 340 ms à 0,25 fois, mesurées)
  avant de sonner ; le rendu continue, à son propre tempo, pendant ce temps
  (0,17 s vers un tempo de 0,9 ou 1, 0,22 s vers 0,5), puis fondu de 15 ms ;
  le curseur des étireurs est calculé pour que leur son et le rendu se
  retrouvent à la même position (le lissage du tempo est pris en compte :
  l'écart entre les deux au moment du fondu est de 0,7 ms, contre 6 ms avant ce
  calcul).
- Le métronome suit le chemin le plus entendu : au changement, les clics pas
  encore commencés sont oubliés et placés de nouveau d'après la nouvelle
  position (aucun clic perdu ni doublé, mesuré sur quatre allers-retours).

Mesures (`npm test` : `audio/worklet/core.test.ts`, 13 vérifications du rendu ;
`npm run test:engine`, sections 14 à 18, vrai moteur dans Chromium) :
- le rendu est joué **échantillon pour échantillon** (écart au rendu 1,5 e-5,
  l'arrondi 16 bits), retardé du seul limiteur ;
- position entendue (`getPosition`) contre la fréquence d'un glissando qui dit
  la seconde source entendue, avant, pendant et après les deux passages : 1 à 3
  ms d'écart en régime, 5 à 9 ms au plus aux passages (les instants où les deux
  rendus sont mélangés pendant 15 ms ne sont pas comparés : une fréquence lue
  sur 43 ms n'y veut rien dire) ; la position rapportée ne saute jamais (entre
  deux relevés distants de moins de 20 ms, elle avance de ce que l'horloge dit à
  12 ms près au pire sur plusieurs essais (21 ms une fois, la machine chargée), le
  plus souvent à 1 ou 2 ms ; un saut de la latence du moteur serait de 152 ms) ;
- pas de discontinuité : le plus grand pas d'échantillon reste à **1,3 à 1,4
  fois** celui d'un sinus stable de 2 kHz (un clic serait bien plus), dans les
  deux sens (seuil du test : 1,5) ;
- boucle : 100 tours à 0,7 dans Node, 14 en réel : chaque repère revient
  exactement un tour plus tard (écart ≤ 0,02 ms, tour moyen juste à 0 µs sur 13
  tours), la position reste dans la boucle ;
- métronome à 0,7 : chaque clic tombe sur le battement du rendu (même espacement
  à 0,02 ms) ;
- processeur, sept pistes stéréo, métronome : **rendu 1,0 à 1,4 % du budget d'un
  quantum, préécoute 23 à 26 %** (Node 1,0–1,2 contre 23,4–23,6 ; Chromium 1,4
  contre 26,1) : environ vingt fois moins ;
- sept pistes stéréo de 120 s lues en rendu : aucun quantum hors budget, aucun
  trou (plus longue suite d'échantillons nuls : 1), aucune sous-alimentation.

**Mémoire : le rendu vit en mémoire, pas dans des fichiers temporaires.**
Un jeu appliqué est une copie de plus des pistes **à la vitesse jouée** (16 bits,
en mémoire partagée : le moteur lit les blocs de la page, sans copie) : à 0,7 fois
le tempo, 1,43 fois la taille des sources. Mesuré avec sept pistes stéréo de
cinq minutes (`npm run test:memory`) : sources 385 Mo, jeu appliqué **550 Mo**
(1,43) ; ces tailles sont exactes (les blocs sont comptés). La mémoire résidente
de Chromium que le test relève avec `ps` est trop bruitée ici pour être citée
(de −1,4 Go à +0,6 Go selon l'essai, des processus d'autres essais finissant
entre-temps ; le test construit aussi les pistes en Float32, une à une). Lâché, le
moteur n'en tient plus aucun octet. Pourquoi pas des fichiers temporaires (la question ouverte du lot) : le
lecteur lit des blocs de 64 Ko dans la mémoire partagée du fil audio, au quantum ;
il n'y a pas de lecture de fichier possible dans un AudioWorklet, il faudrait un
second flux fait de messages, des tampons de préchargement, et rater un
quantum se paie par un trou sonore, pour garder des octets que l'appareil sait
déjà tenir ; et IndexedDB (la seule place disponible partout, y compris
`fabtice://app`) relirait les blocs par des promesses. En contrepartie un
**budget** (`budget.ts`) refuse calmement ce qui ne tiendrait pas : un dixième de
`navigator.deviceMemory` quand il est donné (un quinzième sur téléphone, entre
128 Mo et 1,5 Go), sinon 768 Mo sur ordinateur et 192 Mo sur téléphone (la page
d'un iPhone 14 Pro Max a été fermée par le système pendant une séparation). Sept
pistes stéréo de cinq minutes à 0,7 (550 Mo) passent sur un ordinateur de 8 Go ;
elles ne passeraient pas sur un téléphone ; à 0,25 fois le tempo elles
demandent 1,5 Go. Le refus se fait **avant tout calcul** : « Cet appareil ne peut
pas contenir le rendu de qualité de ce morceau ; la préécoute continue. »
Le même texte sert si la mémoire manque pendant le calcul (une erreur de
mémoire du worker ou de la page). Rien ne plante la page : un jeu refusé n'est
simplement pas construit.

**L'écran** (`components/ApplyRender.tsx`, inchangé dans son principe) :
progression **réelle** (la part des images rendues, qui ne recule pas), le
temps restant une fois le rythme connu (cinq secondes, 3 %), « Annuler » (le
worker est terminé aussitôt), la phrase du refus ou de l'échec avec « Compris »,
jamais la braise. Vérifié à 1280 × 800 et 390 × 844 (captures de `test:render`).

**Écarts avec la spécification.**
1. *Rendu → préécoute pas instantané* : voir plus haut. La préécoute en direct
   suit un changement de tonalité ou de tempo sans attendre parce que ses
   étireurs tournent déjà ; revenus du rendu ils ne tournent plus et leur latence
   (152 ms à vitesse normale) est incompressible avec le binaire actuel (`outputSeek` de
   Signalsmith, qui la supprimerait au prix d'un pic de calcul, n'est pas exporté
   par le wasm). Le **nouveau réglage s'entend donc 0,17 s (vers 0,9 ou 1) à 0,22 s (vers 0,5), jusqu'à 0,35 s (0,25 fois) après le geste**
   (ancien rendu entre-temps), sans arrêt ni clic ni saut de position. Un
   changement continu (curseur) ne paie ce délai qu'une fois.
2. *Même tonalité = mêmes demi-tons et cents au centième* : le moteur compare la
   hauteur totale (`demi-tons + cents / 100`), pas la paire ; (1, −50) et (0, +50)
   sont le même son et le même jeu. `MockEngine` compare les paires.
3. *±2 ms pour tous les clics* : tenu à 0,7 et 1,25, **pas à 0,5** (voir plus
   haut).
4. *Rubber Band hors ligne (`OptionProcessOffline`)* : non utilisé, voir plus haut.

**Ce qui reste.**
- Mesurer sur un **Mac** (M1, et Intel sous Monterey, jamais essayé) la vitesse
  du rendu et le parallélisme ; sept pistes de cinq minutes demandent des
  minutes ici. Pistes : ne rendre d'abord que ce qui s'entend (solo, sourdine),
  rendre en tâche de fond pendant que la préécoute joue, regrouper les pistes
  mono.
- Le temps restant est une règle de trois sur la part déjà faite ; pas calibré.
- Le mode hors ligne de Rubber Band ou un plus petit pas (`WindowShort`) pour
  descendre la gigue sous ±2 ms à 0,5 : demande de recompiler.
- Le rendu n'est pas gardé : un jeu appliqué ne survit pas à un rechargement ou à
  un changement de pistes (voulu).
- Safari : le worker de module, WebAssembly et la mémoire partagée viennent d'être
  essayés dans Chromium seulement.

##### Export audio — `src/export/audio/`

| Fichier | Rôle |
|---|---|
| `types.ts` | le contrat : `AudioEncoder.encode(PcmAudio, { onProgress, signal })` → `Blob` (lecture par blocs, jamais une copie Float32 entière), `ExportPlan` (format, plage, tonalité, tempo, formants, fichiers et leurs pistes avec leur gain, archive), `ExportError` (`cancelled`, `nothing`, `encoder-missing`, `memory`, `failed`) |
| `plan.ts` | ce qu'on fabrique, pur et testé (`plan.test.ts`) : **le mélange tel qu'on l'entend** (muet, solo et volumes compris) en un fichier, ou **les pistes cochées** (muet et solo ignorés : une piste séparée est une matière première) : **un fichier par piste à son plein niveau, en une archive** (`separate` vrai, par défaut), ou **un seul fichier qui les mélange à leurs volumes** (`separate` faux ; une seule piste cochée = toujours un fichier) ; `ExportRequest` : les choix de la 1.0.0 (`waveRate`, `waveBits`, `mp3Kbps`, `separate`) peuvent manquer, leurs défauts s'appliquent ; le morceau entier ou la boucle ; noms de fichiers lisibles (« Blues du dimanche – Basse – boucle 2.2 à 4.3 (4e double) (+2 demi-tons, tempo 80 %).wav » ; pour une boucle de mesures entières « boucle 5–8 ») |
| `run.ts` | rend chaque piste par le rendu hors ligne (ou reprend le rendu appliqué s'il correspond, ou copie la plage telle quelle à la tonalité et au tempo d'origine), mélange dans un seul accumulateur (une piste rendue à la fois en mémoire), baisse le tout uniformément si le mélange dépasse la pleine échelle (jamais d'écrêtage), encode, met en archive |
| `encoders.ts`, `wav.ts`, `resample.ts` | le registre des encodeurs (`registerEncoder` ; WAV, MP3 et FLAC y sont inscrits) ; WAV 16, 24 bits ou 32 bits flottant, à 44,1, 48, 88,2 ou 96 kHz, écrit par blocs (le `Blob` construit par groupes de 4 Mo) : au rythme de l'audio, les blocs 16 bits sont élargis tels quels (exact) ; à un autre rythme, `SincResampler` (sinus cardinal fenêtré de Kaiser, polyphasé, 128 points en descendant et 64 en montant, sans état d'un bloc à l'autre) convertit un bloc à la fois, jamais une copie Float32 du morceau |
| `encoders/` | MP3 et FLAC : `workerEncoder.ts` (côté page : un worker par fichier, les blocs 16 bits partent un à un, au plus trois en vol, annulation = `terminate()`), `encode.worker.ts` (côté worker : charge l'encodeur au premier fichier de son format, convertit un bloc en Float32, encode, renvoie les morceaux), `protocol.ts`, `settings.ts` (débit MP3 par défaut 320, niveau FLAC), `id3.ts` (titre), `mp3Info.ts` (trame « Info »), `assets.ts` (adresse du `.wasm` du MP3), `LICENSE-*.txt` |
| `zip.ts` | archive ZIP sans compression (l'audio ne se compresse guère), noms UTF-8, CRC lu par tranches (le fichier reste un `Blob`) |
| `deliver.ts` | remise : un lien normal vers le fichier (`download`), comme pour iReal Pro ; le navigateur l'enregistre, l'app Mac en fait un vrai téléchargement (`desktop/src/downloads.js`) |

**Ce qui existe (agent de l'export)**

*Encodeurs.* Deux bibliothèques libres, compilées en WebAssembly, prises sur npm à
version figée (exacte dans `package.json`), chargées **au premier fichier de leur
format**, dans un Web Worker (le worker, donc la mémoire de WebAssembly, n'existe
que le temps d'un fichier) :

| Format | Paquet npm (version) | Ce qu'il contient | Licence |
|---|---|---|---|
| MP3 | `wasm-media-encoders` 0.7.0 | LAME 3.100 en WebAssembly (133 Ko, servi comme fichier de l'app : `assets/mp3-….wasm`) | enveloppe MIT ; **LAME : LGPL 2.1 ou ultérieure** (texte complet dans `LICENSE-lame.txt`), compatible avec la GPL-3.0-or-later du projet |
| FLAC | `@audio/encode-flac` 1.4.3 | libFLAC compilée par libflac.js 5.6.0, binaire dans le module JavaScript (244 Ko, aucun accès réseau) | enveloppe MIT ; **libFLAC : BSD-3-Clause** (Xiph.Org) ; libflac.js : MIT |

Les textes (`LICENSE-lame.txt`, `LICENSE-wasm-media-encoders.txt`,
`LICENSE-libflac.txt`, `LICENSE-audio-encode-flac.txt`) sont dans
`src/export/audio/encoders/` et copiés dans `assets/` à la construction, comme
ceux du moteur audio (`vite.config.ts`). Le paquet `wasm-media-encoders` a une
faute dans sa table d'exports (`./wasm/mp3.wasm` pointe vers un chemin qui
n'existe pas) : on importe `wasm-media-encoders/wasm/mp3?url`, qui marche, et
`assets.ts` le dit.

*Qualité* (`encoders/settings.ts`, `model/audioExport.ts`) :

- **MP3 : débit constant au choix, 96, 128, 160, 192, 256 ou 320 kbit/s, 320 par
  défaut (1.0.0 ; c'était 256 fixe), stéréo conjointe (réglage par défaut de LAME
  pour deux canaux), 48 kHz.** Le débit **constant** parce qu'un MP3 à débit variable
  sans en-tête Xing affiche une durée fausse et se déplace mal dans beaucoup de
  lecteurs (et cet encodeur n'en écrit aucun). 2,4 Mo par minute à 320, 0,7 à 96.
  Titre dans l'étiquette ID3v2.3 (UTF-16, accents conservés).
- **Trame « Info » (`mp3Info.ts`)** : l'encodeur n'écrit pas l'en-tête de LAME ; sans
  lui un lecteur ne peut pas savoir qu'il y a 576 échantillons de silence devant
  (+ 529 de retard du décodeur) ni combien de remplissage à la fin : le fichier
  jouerait 23 ms en retard et un peu trop long, et une boucle exportée ne
  retomberait pas sur le temps. L'app écrit donc en tête une trame « Info » (nombre de
  trames, octets, retard 576, remplissage qui rend la longueur **exacte**), remplie
  à la fin (la place est réservée, puis remplacée dans le `Blob`). Mesuré :
  Chromium (`decodeAudioData`) et ffmpeg décodent **exactement** le nombre d'images
  du morceau, sans retard. Un lecteur qui ignore cette trame (rare) la prend pour une
  trame de silence et ajoute 23 ms.
- **Wave (1.0.0) : 44,1, 48 (défaut), 88,2 ou 96 kHz ; 16 bits (défaut), 24 bits ou 32 bits flottant.** Les pistes de Fabtice sont en 16 bits à 48 kHz : 24 bits et 32 bits flottant à 48 kHz sont les mêmes codes élargis (exact, mesuré), un autre rythme est converti par `resample.ts` (mesuré : une sinusoïde reste à sa fréquence, erreur sous -90 dB ; plate à 0,05 dB près jusqu'à 20 kHz en descendant à 44,1 ; ce qui dépasse la nouvelle fréquence de Nyquist ne se replie pas : 23 kHz, 22,5 kHz et 23,9 kHz reviennent à -92 dB ou moins ; en montant, l'image à 28 kHz d'un 20 kHz est sous -80 dB ; 0,7 s de calcul par minute de son mono à 44,1). Le quantificateur arrondit au code le plus proche et plafonne à la pleine échelle, sans bruit ajouté. En-tête de 44 octets (16 et 24 bits, format 1) ou de 58 (32 bits flottant : format 3, bloc `fact`). Au-delà de 4 Go : refus calme (`memory`). La fenêtre dit « Fabtice travaille en 48 kHz : une fréquence plus haute n'ajoute pas de qualité. » au-dessus de 48 kHz.
- **FLAC : 16 bits, 48 kHz, niveau de compression 5** (celui de libFLAC par défaut ;
  l'audio est le même à tous les niveaux, seule la taille change). L'en-tête
  STREAMINFO porte la longueur exacte dès le début, puis ses totaux et le MD5 des
  échantillons sont remplacés à la fin. Titre dans un commentaire Vorbis.

*Preuves* (`npm run test:export-audio`, Chromium, vrais encodeurs, morceau de trois
pistes stéréo de 12 s aux échantillons connus ; 49 vérifications) : le mélange tel qu'on
l'entend (muet, solo, volumes : à un pas de 16 bits près ; le solo l'emporte sur le muet) ;
les pistes à plein niveau, échantillon pour échantillon ; la boucle seule, exacte en
images (120 000 pour 2,5 s) et en contenu ; **FLAC décodé par `decodeAudioData`
identique échantillon pour échantillon** au WAV 16 bits (0 écart ; le navigateur
convertit un code 16 bits en flottant en divisant par 32 768 sous zéro et par 32 767
au-dessus, le test applique l'inverse) **et par ffmpeg** (un autre décodeur), MD5 de
STREAMINFO = MD5 des échantillons calculé par le test, longueur exacte ; **MP3** :
en-tête de trame (MPEG-1 couche III, 48 kHz, 256 kbit/s, stéréo conjointe), étiquette,
trame Info, aucun octet en trop, longueur décodée exacte (Chromium et ffmpeg), rapport
signal/erreur de **36,5 dB** sur ce signal (seuil du test : 30 dB ; erreur maximale
0,0115 de la pleine échelle) une fois aligné (retard trouvé : 0) ; l'archive (noms
UTF-8 avec accents et « – », drapeau UTF-8, CRC-32 relus, ouverte par `unzip -t` et par
Python `zipfile`) en WAV, MP3 et FLAC ; l'annulation au milieu d'un MP3 (rejet immédiat,
worker terminé) et depuis le dialogue (aucun fichier proposé, aucun lien créé) et avant
le départ (aucun worker créé) ; un encodeur qui ne peut pas se charger (le `.wasm`
refusé) : phrase calme, « Réessayer », et FLAC marche ensuite ; l'export à une autre
tonalité et un autre tempo (+3 demi-tons, tempo 75 %) passe par le rendu hors ligne (une
demande par piste écoutée, avec la plage de la boucle s'il y en a une) et dure exactement
`round(images / tempo)`. Captures du dialogue à 1280 × 800 et 390 × 844 (choix des
formats, erreur d'encodeur, fichier prêt, en cours).

*La fenêtre « Audio… » (étape 3 de la 1.0.0, C15.1)* —
`components/ExportAudioDialog.tsx`, styles `styles/export.css`, ouverte par la
commande `exportAudio` (inchangée). Deux colonnes sur ordinateur : à gauche le
format (Wave, Flac, MP3, dans cet ordre) et ses réglages (Wave : fréquence dans
une liste, quantification en trois boutons ; MP3 : débit constant dans une liste,
320 « meilleure qualité » ; Flac : une ligne « sans perte »), puis la durée (le
morceau entier, ou la boucle s'il y en a une, avec son texte « mesures 5–8 ») ;
à droite quoi exporter (« Le mix complet » ou « Des pistes »), la liste des
pistes à cocher (grisée tant que le mix est choisi ; « Tout cocher / Tout
décocher »), la case « Un fichier par piste » (grisée pour le mix et pour une
seule piste, avec sa phrase). Au pied, deux lignes : ce qui sera fabriqué (« Un
fichier : … », « 6 fichiers réunis dans … .zip » ou « Rien à exporter… », lues
dans `planAudioExport` à chaque changement) et la tonalité et le tempo choisis ;
le bouton « Exporter » (à l'encre) est grisé quand il n'y a rien à exporter. Sur
téléphone, une feuille posée en bas (94 % de la hauteur au plus), une colonne,
cibles de 44 px et plus, le bouton collé au pied. Choix retenus avec le morceau
(`ExportPreferences` : `what`, `range`, `format` comme avant, et `waveRate`,
`waveBits`, `mp3Kbps`, `separate` ajoutés **sans changer le numéro de version du
document (6)** : `storage/documentFormat.ts#readExportPrefs` lit chaque champ à
part, un document plus ancien prend les défauts, un choix illisible se remet
seul ; testé sur les trois documents réels de la version publiée,
`storage/documentVersion6.test.ts`). Les pistes cochées ne sont **pas** retenues
(toutes cochées à chaque ouverture). Tests : `plan.test.ts`, `wav.test.ts`,
`resample.test.ts`, `run.test.ts`, `encoders/encoders.test.ts`,
`store/lot3.test.ts`, et `test:export-audio`. Captures : `npm run captures`
(`export-audio-*`).

*Vitesse* (`test:export-audio`, Chromium sans carte graphique, **cette machine de
développement, pas le Mac du propriétaire**, par minute d'audio stéréo) : WAV
≈ 40 ms (1 400 fois le temps réel), FLAC ≈ 0,4 s (150 fois), MP3 ≈ 1,4 à 1,6 s (40 fois).
Un mélange de cinq minutes : WAV 1,7 s, FLAC 3,9 s, MP3 8 s ; sept pistes de cinq
minutes en archive de MP3 : 53 s (le rendu de la tonalité et du tempo s'y ajoute).

*Mémoire* (`npm run test:export-memory`, sept pistes stéréo de 5 min ouvertes avec le
vrai moteur, mémoire résidente de tous les processus Chromium échantillonnée toutes les
50 ms ; les échantillons 16 bits pèsent 385 Mo) :

| Export | Fichier | Crête au-dessus de l'état d'avant | Fichier gardé après (attend l'enregistrement) |
|---|---|---|---|
| Pistes, archive de 7 WAV | 385 Mo | **+546 Mo** (1,4 fois le fichier) | +384 Mo |
| Mélange en WAV | 55 Mo | +251 Mo | +54 Mo |
| Mélange en FLAC | 40 Mo | +226 Mo | +46 Mo |
| Mélange en MP3 | 9 Mo | +188 Mo | +10 Mo |
| Pistes, archive de 7 MP3 | 64 Mo | +106 Mo | +47 Mo |

Le mélange ajoute son accumulateur Float32 (115 Mo pour cinq minutes) ; les pistes à
part n'en ont pas. Avant la correction, l'archive de WAV montait à +602 Mo (1,56 fois le
fichier) parce que les morceaux de 128 Ko des sept pistes restaient dans le tas
JavaScript jusqu'au ramasse-miettes ; le WAV remplit maintenant des `Blob` de 4 Mo qui en
sortent aussitôt. Pas de flux d'écriture : à 1,4 fois le fichier la crête est
raisonnable, et le fichier (385 Mo) doit de toute façon exister en entier pour le lien de
téléchargement. Au-delà de 4 Go l'archive est refusée (pas de ZIP64, voir `zip.ts`) ;
un flux vers le disque serait l'étape suivante si on veut aller plus loin.

*Remise dans l'app Mac* (`desktop/src/downloads.js`, branché dans `main.js`) : le lien
« Enregistrer … » devient un vrai téléchargement Electron, et Electron ouvre le panneau
d'enregistrement du système. L'app y ajoute le nom nettoyé (aucun chemin, aucun caractère
de contrôle ou réservé ; accents et « – » conservés), un titre français (« Enregistrer le
fichier »), le départ dans « Téléchargements » puis dans le dossier du dernier fichier
enregistré. Rien n'est écrit sans le panneau ; le test donne la place du fichier depuis le
processus principal comme celui d'iReal Pro (`setSavePath`, après le gestionnaire de l'app,
dont il relit les options). `desktop/test/e2e/audio-export.test.js` : « Exporter » →
« Le son… » avec les vrais boutons ; un WAV du mélange, une archive de pistes, un FLAC et
un MP3 arrivent sur le disque avec le bon nom (accents), la bonne taille (celle du
téléchargement ; WAV = 44 octets + échantillons), un en-tête valide, des CRC justes, sans
navigation ni nouvelle fenêtre et **sans violation de la politique de sécurité** (pas
d'`unsafe-eval`, pas de réseau : le `.wasm` du MP3 vient de `fabtice://app`). Sous Linux
le test impose une locale UTF-8 (sans elle Chromium rend « download » pour un nom
accentué ; tout Mac en a une).

*Ce qui reste* : l'écoute des fichiers par le propriétaire (le MP3 surtout : ici des
mesures, pas d'oreille) ; les vitesses sur son Mac ; tant que `render/` est le
remplaçant, l'export à une autre tonalité ou un autre tempo respecte les durées mais ne
transpose pas ; le panneau d'enregistrement de macOS lui-même (non vérifiable ici) ;
pas de ZIP64 ; une seule qualité par format, à dessein ; étiquettes : le titre seulement.

#### Écrans

| Où | Quoi |
|---|---|
| Fenêtre « Nouveau morceau » (`NewPieceDialog.tsx`, `ImportStems`) | « Instruments à séparer » comme la maquette : les instruments que **l'outil en service** fournit (BS-RoFormer SW : six ; SCNet : quatre ; « Vents » n'apparaît que si un outil le donne), aucun coché ; coché : estimation honnête (« environ 14 min pour un morceau de quatre minutes, sur cet appareil »), les non cochés vont dans « Autres » ; « Aller plus loin : batterie détaillée, saxophone… » dit qu'aucun outil détaillé n'est proposé tant que la liste n'en a pas |
| Sous les en-têtes de pistes (`SeparationEntry`) ; menu « ⋯ » sur téléphone | « Séparer les instruments » (« Séparer » sur téléphone), puis « Instruments » |
| Barre du haut (`SeparationStatus`) | « Séparation · 34 % », ou « Séparation interrompue » ; ouvre le panneau |
| Panneau « Instruments » (`SeparationPanel.tsx`) | outil, estimation (« estimation, pas encore mesurée » quand c'est le cas), premier téléchargement (taille, hôte, page source, licence connue, et pour une licence floue : Fabtice ne distribue pas ces poids), instruments voulus, « Séparer » ; pendant : étape, jauge, temps restant, carte graphique ou processeur, **avis calme du repli** (filet de laiton), « Annuler » ; après : outil et durée, « Revenir au morceau entier » / « Revoir les instruments », place prise sur l'appareil (instruments, outils), « Libérer la place » (confirmé), « Séparer de nouveau » |
| Réglages (`SettingsPopover.tsx`) | « Réglages avancés », replié : outil de séparation (« Automatique : Le plus fin », et pourquoi), « Conserver le timbre » |
| Transport (`ApplyRender.tsx`) | « Appliquer » quand la tonalité ou le tempo diffèrent de l'original et que le rendu n'est pas en place ; écran d'attente court (« Calcul des pistes… », jauge, « Annuler ») ; une fois appliqué, « rendu appliqué », discret (pointillé, encre douce) ; jamais la braise |
| « Exporter » → « Le son… » (`ExportAudioDialog.tsx`) | quoi, durée (avec les mesures de la boucle), format (WAV, MP3, FLAC ; si un encodeur ne se charge pas, une phrase calme et « Réessayer »), rappel de la tonalité et du tempo, « Exporter », progression, « Enregistrer « nom » » |

Tous les panneaux sont vérifiés dans la fenêtre et au-dessus du transport à
1280 × 800, 960 × 640 et 390 × 844 (`test:separation`, `ui/useFitPanel.ts`).

Adresses de démonstration du lot 3 (le morceau de démonstration en **une**
piste entière d'abord) : `?demo&separation=entier` (pas encore séparé),
`=faite` (déjà séparé), `=lente` (séparation lente avec premier
téléchargement), `=repli` (la carte graphique « lâche », le processeur
continue), `=echec` ; `&rendu=lent` (voir l'attente d'« Appliquer ») ;
`&export=ouvert`. `window.__fabtice.lot3` (avec `?demo` et `?debug`) donne la
séparation, le rendu, l'export, le registre, le format 16 bits et le stockage.

### Lot 4 : métronome avancé et repères (document version 4)

#### Modèle

| Donnée | Où | Contenu |
|---|---|---|
| Métronome | `AppState.metronome`, `model/metronome.ts#MetronomeSettings` | volume du clic (0…1), décompte (`countInBars` : 0, 1 ou 2 mesures), motifs par métrique (`patterns`, clé « 7/8 » : regroupement et force de chaque temps, `accent`, `normal`, `soft`, `silent` ; seules les métriques que l'utilisateur a changées y sont, les autres suivent `grid/metronome.ts#defaultPattern`), accélération progressive (`acceleration` : en marche, départ, pas, boucles par palier, objectif, en % du tempo réglé). La marche/arrêt du clic reste `playback.metronome` (lot 1) |
| Repères | `AppState.markers`, `model/markers.ts#Markers` | les **boucles gardées** (`loops` : identifiant, nom de 1 à 40 caractères, zone en **secondes source** comme `LoopState.region`, calée ou libre comme elle l'était), dans l'ordre choisi par l'utilisateur |
| Sections | `corrections.sections` (lot 2, **inchangé**) | une seule notion de section : les lettres de la grille d'accords. Une section va de sa barre à la barre de la section suivante (ou à la fin du morceau) : `markers/markers.ts#sectionRanges`. Le panneau des repères et la règle les montrent, en ajoutent, les renomment, les suppriment ; la grille d'accords montre les mêmes |
| Métrique | `tempoMap.meters` (inchangé) | 2 à 12 temps sur 4 ou 8 (5/4, 7/8, 6/8, 12/8…) ; **la version 6 élargit à 1 à 64 sur 4, 8, 16 ou 32, mesure par mesure** (voir « Signatures par mesure »). Un temps de la grille reste l'unité du dénominateur : une mesure de 7/8 a sept croches. Le tempo s'affiche et se tape **par temps ressenti** (`grid/metronome.ts#feltUnits` : la noire en x/4 et dans les autres x/8, la noire pointée en 6/8, 9/8, 12/8), dans le transport, la règle, le panneau « Tempo et mesures » et l'en-tête de la grille |

**Document version 4** (`model/document.ts`) : `metronome` et `markers` en plus.
Migration 3 → 4 (`storage/documentFormat.ts#MIGRATIONS`) : métronome par
défaut (volume 0,5, pas de décompte, accents par défaut, pas d'accélération),
aucune boucle gardée ; rien d'autre ne bouge. Les chaînes 1 → 2 → 3 → 4 et 2 → 4
sont vérifiées avec un document gardé de chaque version (`store/lot4.test.ts`).
À la lecture : les boucles gardées sont faites à la main, elles se relisent
**exactement** (sinon `corrupt`, comme les corrections) ; le métronome ne fait que
régler des clics, tout champ illisible redevient sa valeur par défaut, champ par
champ, et un motif qui ne correspond pas à sa métrique est abandonné.
`store/document.ts#documentChanged` suit `metronome` et `markers` :
l'autosauvegarde les garde. Un nouveau morceau garde le volume du clic et le
décompte du morceau d'avant (des habitudes), le reste repart des valeurs par
défaut.

#### Fonctions pures (`grid/metronome.ts`, `markers/markers.ts`)

- `meterKey`, `feltUnits`, `defaultGrouping` (7/8 : 2+2+3 ; 5/x : 3+2 ; 7/4 :
  4+3 ; 6/8, 9/8, 12/8 : des trois), `groupingChoices` (rien sous cinq temps,
  sinon le défaut puis les autres découpes en deux et trois, six au plus),
  `levelsFromGrouping` (premier temps accentué ; un seul groupe : les autres
  normaux ; plusieurs : début de groupe normal, le reste faible),
  `patternFor`, `isValidPattern`, `nextLevel`.
- `metronomeClickTrack(map, de, à, motifs)` : un clic par temps de la grille,
  au niveau que sa place dans la mesure a dans le motif de **sa** métrique ; un
  temps muet n'a pas de clic. Codes `ClickTrack.accents` : 1 accentué, 0
  normal, 2 faible (le lot 1 n'utilisait que 0 et 1 ; `grid/lines.ts#metronomeClicks`
  reste pour les tests).
- `countInClicks(map, départ, mesures, motifs)` : les temps de la grille qui
  précèdent le départ, sur une ou deux mesures, **au tempo de la mesure qui
  suit le départ** (moyenne sur cette mesure : un tempo analysé temps par temps
  ne fait pas trembler le décompte). Un départ entre deux temps garde les temps
  de la grille : la musique entre là où elle est. Un temps muet du motif est
  compté quand même, faiblement.
- `accelerationSteps(plan)` (départ, départ + pas… jusqu'à l'objectif, qui est
  le dernier palier), `accelerationFactor`, `accelerationStatus`,
  `stepOfPass(plan, passage)` (le palier entendu pendant le passage n),
  `clampAcceleration`.
- `grid/corrections.ts#withMeter(map, métrique)` : correction de la grille ;
  le premier temps et les temps eux-mêmes ne bougent pas ; entre x/4 et x/8 les
  temps sont renumérotés pour que le temps ressenti reste sur la musique (4/4 →
  6/8 : une noire analysée devient une noire pointée, trois croches ; 4/4 →
  7/8 : une noire reste deux croches).
- `sectionRanges`, `sectionAt`, `barForNewSection`, `nextSectionLetter`,
  `cleanName`, `defaultLoopName`, `loopWithRegion`, `withLoopAdded/Renamed/Removed/Moved`.

#### Contrat du moteur (ajouts du lot 4)

- `play({ countIn })` : `CountInClicks` = décalages en **secondes source avant
  le départ** et codes de son. Le moteur les joue au tempo en direct
  (accélération comprise) : les clics d'abord, seuls, l'état est `playing` et la
  position **attend au départ**, puis le départ est entendu exactement un temps
  après le dernier clic (la latence de Signalsmith est comptée ; sur le rendu
  appliqué il n'y en a pas). Pause pendant le décompte : arrêt immédiat au
  départ. Déplacement pendant le décompte : plus de décompte, la lecture part de
  là. Ignoré si la lecture est déjà en cours.
- `setMetronomeVolume(0…1)` (0,5 par défaut) : clics et décompte.
- `setAcceleration({ factors, every } | null)` et `restartAcceleration()` : tant
  que la boucle est active, le tempo entendu est le tempo en direct ×
  `factors[palier]` ; chaque passage de la boucle sur le chemin le plus entendu
  compte, et après `every` passages le palier suivant commence **à la reprise de
  la boucle** (côté entrée : il s'entend à la reprise entendue), sans lissage à
  ce moment-là, et les clics du nouveau passage sont placés au nouveau tempo. Le
  dernier palier reste. Les paliers repartent de zéro quand le plan change,
  quand la boucle change (ou est activée, désactivée), et sur
  `restartAcceleration()` ; pas à la pause.
- `getMetronomeStatus()` : `{ countInLeft, accelerationStep }`, lu à chaque image
  (bloc partagé : deux `f64` de plus, `SHARED_BYTES` = 48).
- `audio/connect.ts` envoie au moteur la piste de clics (grille et motifs), le
  volume et le plan (`accelerationSteps` en facteurs) ; `actions.ts#play`
  calcule le décompte à la position de la tête.

**Corrections du moteur au passage.** (1) Une boucle qui commence sur un temps
perdait de temps en temps son clic à la reprise : la fin de la plage parcourue
par le métronome et le début de la suivante étaient deux calculs en virgule
flottante différents ; elles sont désormais la même somme (curseur entier +
fraction), et la reprise du métronome suit exactement celle du curseur
(`worklet/lot4.test.ts`, « loop wraps »). (2) Un tempo changé pendant la pause
s'applique d'un coup à la reprise de la lecture, au lieu d'une rampe depuis
l'ancien tempo (le premier clic tombait quelques millisecondes à côté).

#### « Appliquer » et l'accélération

Un rendu appliqué est fait pour **un** tempo. Pendant l'accélération, chaque
palier est donc joué en **qualité de prévisualisation** (Signalsmith) ; quand un
palier retombe exactement sur le tempo du rendu (l'objectif 100 % avec un rendu
fait au tempo réglé), le moteur repasse de lui-même sur le rendu, comme pour
tout retour aux valeurs appliquées. Le transport le dit (« appliqué au tempo
réglé ») et le panneau aussi. Le bouton « Appliquer » reste disponible : il
calcule le rendu au tempo réglé, c'est-à-dire l'objectif à 100 %.

Avec une **carte de tempo variable** (temps analysés, courbe de tempo), un palier
est un pourcentage du jeu enregistré : la courbe garde sa forme, accélérée ou
ralentie d'autant, et les clics restent sur les temps analysés (ils sont en
temps source). Le tempo réglé dans le transport et les paliers se multiplient :
changer le tempo pendant l'accélération change la base, le palier en cours
reste.

#### Écrans

| Où | Quoi |
|---|---|
| Transport, à droite (`MetronomePanel.tsx`) | « Clic » reste l'interrupteur d'un seul geste ; à côté, un petit bouton (trois curseurs) ouvre le panneau **Métronome** : interrupteur, volume, décompte (« Aucun », « 1 mesure », « 2 mesures »), mesure (liste des métriques courantes ; la changer corrige la grille), regroupement (5/x, 7/x, 8/8…) ; repliés : « Temps forts et faibles » (un bouton par temps : accentué, normal, faible, muet ; « Rétablir ») et « Accélération progressive » (départ, gain, toutes les n boucles, jusqu'à ; état « Palier 2 sur 7 · 75 % » ou « Objectif atteint », « Recommencer » ; sans boucle, une phrase le dit) |
| Transport, position | « décompte · 3 » au-dessus du temps pendant le décompte |
| Transport, tempo | pendant l'accélération, la petite ligne dit le palier entendu (« palier 2/7 · 75 % ») |
| Transport, au centre (`MarkersPanel.tsx`) | après la boucle, « Repères » (signet ; un point de laiton quand il y en a) ouvre le panneau : « Garder cette boucle » (ou « Cette boucle est gardée : « Pont » »), la liste des boucles gardées (un appui rappelle la boucle : zone et boucle active, la tête suit la règle de toute nouvelle boucle), la liste des sections (un appui boucle la section), « Nouvelle section ici » (au début de la boucle, sinon à la tête de lecture ; lettre suivante libre) ; « Modifier » montre renommer (champ), monter, descendre, supprimer. Flèches haut et bas dans les listes, Entrée rappelle, Échap ferme |
| Règle des pistes (`timeline/markerLayer.ts`) | une rangée « Repères » (22 px) entre les accords et les mesures, seulement quand le morceau a une section ou une boucle gardée : sections encadrées sur leur barre, boucles gardées par leur nom au-dessus d'un fil de laiton qui couvre la boucle ; ce sont des boutons (clic, clavier) qui rappellent la boucle ou bouclent la section ; un nom qui toucherait le précédent devient une simple languette (titre au survol). L'en-tête « Repères » ouvre le panneau |

`window.__fabtice.lot4` (avec `?demo` et `?debug`) donne les fonctions de
`grid/metronome.ts`, les actions du métronome et des repères, et de quoi
fabriquer une grille.

#### Vérifications

- `npm test` : `grid/metronome.test.ts` (métriques, regroupements, niveaux,
  piste de clics sur une grille fixe et variable, décompte, paliers, correction
  de métrique), `markers/markers.test.ts`, `store/lot4.test.ts` (migration
  depuis des documents des versions 1, 2 et 3, aller-retour, lecture
  indulgente du métronome, lecture stricte des boucles, autosauvegarde,
  actions, moteur factice), `audio/worklet/lot4.test.ts` (vrai Signalsmith
  dans Node : décompte à 0,8, 1 et 1,3 — clics espacés d'un temps joué à deux
  échantillons près, musique un temps après le dernier, métronome qui
  enchaîne ; boucle qui accélère 80 → 90 → 100 % ; boucle sur un temps à trois
  tempos ; sons et volume).
- `npm run test:engine`, sections 19 à 22, vrai worklet dans Chromium : 4/4 avec
  accent, normal, faible (espacement égal à la grille à deux échantillons près,
  écart à la pulsation constant, volume) ; 7/8 en 3+2+2 avec un temps muet ;
  boucle avec décompte ; boucle qui accélère (durée de chaque passage, un clic
  par temps à chaque palier).
- `npm run test:metronome` et `npm run test:markers` (moteur factice) : panneaux,
  ce qui arrive au moteur, la règle, le clavier, 1280 × 800, 960 × 640 et
  390 × 844, puis réglages et repères retrouvés après rechargement dans un profil
  persistant. Captures dans `FABTICE_METRONOME_OUT` et `FABTICE_MARKERS_OUT`.

### Lot 4 : projets `.fab`, version web hors ligne, réglages

#### Projets `.fab` (`src/project/`) — décisions du propriétaire du 15 novembre

Le format est décrit dans `src/project/FORMAT.md` : une archive ZIP sans
compression, signée par son entrée `mimetype`, avec un manifeste versionné
(`formatVersion` 2), le document du projet (version 6 depuis la 1.0.0 ; la 5 s'ouvre par
la migration 5 → 6, **même lecteur et mêmes
migrations** que la copie gardée sur l'appareil), le fichier importé octet pour
octet, **toutes les séparations** (une par outil) et **le rendu « meilleure
qualité » gardé**, ces pistes en **FLAC 16 bits sans perte**.

- **Enregistrer** (état d'avant la 1.0.0 ; depuis l'étape 1, « Enregistrer » et
  « Enregistrer sous… » : voir « Projet enregistré ou non » plus bas, le
  dialogue ci-dessous sert à « Enregistrer sous… ») : « Exporter » → « Enregistrer le projet… » (première entrée
  du menu ; sur téléphone, dans le menu « ⋯ »). Une petite fenêtre de la
  famille de « Exporter le son » : une phrase, ce qui part dans le fichier (les
  séparations par outil, le rendu), « Préparer le fichier » avec un pourcentage
  qui avance (l'encodage FLAC est la partie longue : libFLAC, l'encodeur de
  l'export, dans des workers, trois pistes à la fois au plus), puis la taille et
  le lien « Enregistrer « titre.fab » » : un téléchargement dans un navigateur,
  la fenêtre d'enregistrement de macOS dans l'app Mac (titre « Enregistrer le
  projet », filtre `.fab` : `desktop/src/downloads.js`). Plus de case « avec
  les instruments » : le projet les contient toujours. Les pistes qui ne sont
  pas en mémoire (les autres séparations, un rendu qu'on n'écoute pas) sont lues
  sur l'appareil à leur tour. Le morceau de démonstration ne s'enregistre pas ;
  un morceau pas encore gardé non plus (phrase calme, « Réessayer »).
- **Ouvrir** : la fenêtre « Nouveau morceau » garde son bouton principal en
  premier ; dessous, une ligne discrète « Déjà un projet enregistré ? ouvrir un
  projet Fabtice », et dans l'app Mac les **projets récents** (quelques lignes).
  Un fichier `.fab` déposé sur la fenêtre s'ouvre aussi (reconnu à son extension
  ou à sa signature). App Mac : double-clic dans le Finder, « Ouvrir avec »,
  Fichier → Ouvrir un projet récent, le Dock.
- **Ouvrir remplace le morceau comme un import** (`open.ts`), dans la même
  file que les imports (`import/controller.ts#exclusive`), avec « Ouverture de
  « titre »… » et ses étapes. **Avant** de toucher au morceau ouvert : manifeste,
  document, **CRC de toutes les entrées** (le fichier est lu une fois par
  tranches), décodage de l'original et des instruments de la séparation
  écoutée. Un fichier abîmé, trop récent ou qui n'est pas un projet s'arrête sur
  une phrase calme ; le morceau ouvert et celui gardé restent tels quels. Puis
  `restoreProject` (mêmes identifiants), sans relancer l'analyse ni la
  séparation. Le morceau joue dès cet instant ; ensuite, en arrière-plan, il
  devient le morceau gardé : instruments écrits à côté, puis chaque autre
  séparation décodée, écrite et lâchée (une à la fois : la mémoire), puis le
  rendu gardé, entendu aussitôt si la tonalité et le tempo sont les siens.
- **Décodeur FLAC à nous** (`audio/flac/decode.ts`, TypeScript) : le binaire
  libFLAC de l'export contient bien un décodeur, mais le piloter demande de
  passer des fonctions JavaScript à WebAssembly (`addFunction`) et de copier
  chaque trame hors de sa mémoire ; celui-ci, court, lit tout ce que libFLAC
  écrit (constant, brut, fixe, LPC, bits perdus, deux codages de Rice et leurs
  échappements, toutes les décorrélations stéréo), par tranches, directement
  dans les blocs 16 bits. Exact à l'échantillon (tests contre libFLAC à
  plusieurs niveaux) ; environ 340 fois le temps réel sur un cœur de cette
  machine (0,16 s par minute stéréo).
- **Un seul morceau gardé sur l'appareil** : pas plusieurs morceaux dans
  IndexedDB (le stockage est bâti autour d'un projet courant et les
  instruments pèsent des centaines de Mo) ; les fichiers `.fab` et la liste des
  projets récents de l'app Mac jouent ce rôle.

#### FLAC sur l'appareil ? Mesuré, non retenu

Le propriétaire souhaite du FLAC « autant que possible ». Mesures (Node, un
cœur, signal musical synthétique ; puis IndexedDB dans Chromium avec profil
persistant), pour six instruments stéréo :

| Morceau | Blocs 16 bits (appareil) | FLAC (`.fab`) | Encodage FLAC | Décodage FLAC (vérification comprise) | Relecture des blocs (IndexedDB, Chromium) |
|---|---|---|---|---|---|
| 4 min | 277 Mo | 162 Mo (58 %) | 8,3 s | 5,6 s | 0,8 à 1,1 s (écriture 1,0 s) |
| 12 min | 830 Mo | 477 Mo (58 %) | 26,9 s | 19,7 s | 3,4 s (écriture 3,9 s ; `FABTICE_PROJECT_LONG=1`) |

Garder les instruments en FLAC sur l'appareil ferait gagner 42 % de place mais
ajouterait près d'une demi-minute de calcul après chaque séparation d'un long
morceau, et surtout 6 à 20 s à **chaque** réouverture au lieu d'une seconde
(contre 1 à 3,4 s pour les blocs ; chiffres de cette machine, plus lents sur le Mac Intel). La réouverture
rapide compte plus : **l'appareil garde les blocs 16 bits** ; le FLAC sert au
fichier `.fab`, qu'on copie et qu'on envoie. Mémoire : l'encodage tient les
fichiers FLAC déjà faits (des `Blob`, que le navigateur peut garder sur
disque) ; le décodage écrit directement dans les blocs finaux, sans copie
Float32. Rien de ce qu'un utilisateur garde n'a changé de forme : pas de
migration du magasin.

#### Plusieurs séparations, une par outil (document version 5)

- `separation.others` : les autres séparations, chacune avec son résumé et ses
  pistes **avec leur mixage** (muet, solo, volume : chaque séparation garde le
  sien). La séparation écoutée reste `separation.result` et ses pistes comme
  avant ; « Revenir au morceau entier » marche toujours.
- Séparer avec un autre outil garde la séparation écoutée parmi les autres ;
  refaire une séparation **avec le même outil remplace la sienne**
  (`store/separationActions.ts#applySeparation` rend ce qui est remplacé et ce
  qui est mis de côté ; `separation/runner.ts` efface et lâche en conséquence).
- Les autres séparations **ne sont pas en mémoire** : leurs échantillons sont
  sur l'appareil (et dans le `.fab`). Les choisir (`chooseSeparation`) les relit
  (une fraction de seconde : 0,3 s mesuré dans Chromium pour quatre pistes
  d'une minute) et échange les jeux sans rien recalculer ; un morceau qui n'est
  pas gardé sur l'appareil les garde en mémoire. Une séparation illisible est
  oubliée avec une phrase.
- Où : le panneau des instruments (sous les pistes) liste « Séparations
  gardées » quand il y en a plus d'une (« Écouter », « Libérer », taille, durée
  du calcul) ; les réglages avancés ont « Séparation écoutée » ; « Place sur cet
  appareil » montre chacune avec sa taille et « Libérer ».
- La réouverture au lancement garde sur l'appareil les autres séparations et
  le rendu (`pruneTrackAudio` les connaît) ; migration 4 → 5 : aucune autre
  séparation, aucun rendu gardé.

#### Le dernier rendu « Appliquer », gardé avec le morceau

- `AppState.keptRender` (document version 5, dans `documentChanged`) : la cible
  (demi-tons, cents, tempo, formants, pistes), la date, et une piste rendue par
  piste écoutée, ses échantillons sur l'appareil (blocs 16 bits) et dans le
  `.fab` (FLAC). **Un seul** : un nouvel « Appliquer » le remplace (le précédent
  est effacé une fois le nouveau écrit), jamais l'original ni les séparations.
- Périmé dès que la tonalité, le tempo, les formants ou les pistes changent
  (la mémoire est rendue comme avant) ; dès qu'ils redeviennent les siens (le
  morceau rouvert, ou les réglages remis), il est relu et **entendu tel quel**
  (`render/controller.ts#reviveKeptRender`, `startKeptRenderWatch`), dans le même
  budget de mémoire qu'un nouveau rendu (`render/budget.ts`) : sinon il attend
  et « Appliquer » est proposé.
- « Libérer » dans « Place sur cet appareil » l'oublie.

#### App Mac : double-clic, « Ouvrir avec », projets récents

`desktop/package.json` déclare l'extension (`fileAssociations` : `fab`,
« Projet Fabtice », `application/x-fabtice`, rôle Éditeur). macOS signale le
fichier par `open-file` (écouté avant `ready`, l'app pouvant être lancée pour
lui). Tout le reste est dans `desktop/src/projects.js` (main.js n'en garde que
trois points d'accroche) : `open-files.js` ne garde qu'un chemin absolu vers
un fichier ordinaire en `.fab` de moins de 4 Go, sous un jeton aléatoire ; la
page demande ceux qui attendent (`pendingProjects`), reçoit les suivants
(`onOpenProject`), lit chaque fichier **par plages** (`readProjectFile`) et le
libère. `recent-projects.js` retient les huit derniers projets ouverts ou
enregistrés (fichier `recent-projects.json` du dossier de données ; les
fichiers disparus sont retirés) et les donne à macOS (`app.addRecentDocument` :
menu Fichier → Ouvrir un projet récent, le Dock ; un choix revient en
`open-file`). La page reçoit le nom et le dossier (« ~ » pour le dossier
personnel) et ouvre par un jeton valable pour cette liste seulement
(`recentProjects`, `openRecentProject`) ; un projet choisi dans le sélecteur de
la page y entre aussi (`rememberProjectFile`, chemin lu par le preload avec
`webUtils`, jamais donné à la page).

**Web** : pas de liste de projets récents. Seul Chromium sait garder un accès à
un fichier (API File System Access, avec une question de permission à chaque
réouverture) ; Safari et Firefox ne le savent pas. Le minimum honnête : le
morceau gardé sur l'appareil (« Rouvrir ») et le sélecteur de fichiers du
système, qui se souvient du dernier dossier.

#### Version web hors ligne (`src/pwa/`)

- **Service worker écrit à la main** (`sw.js`, sans dépendance ni module de
  construction : il tient en une centaine de lignes et doit préserver les en-têtes
  d'isolation, ce qu'aucun outil courant ne fait de lui-même). La construction
  web (`vite.config.ts#writePwaFiles`) y écrit la version (empreinte de la page
  et des noms de fichiers), la liste à garder d'emblée et la liste complète, et
  dépose à côté `manifest.webmanifest` et les icônes. Rien de tout cela dans la
  construction de l'app Mac.
- **Ce qu'il touche** : seulement les fichiers de l'app (la page, `assets/`, le
  manifeste, les icônes). La maquette, les prototypes, les listes distantes
  (outils de séparation, recueils) et les téléchargements de Hugging Face
  passent sans lui (ces derniers sont dans IndexedDB).
- **La page** : réseau d'abord (4 s au plus), sinon la copie gardée : en ligne,
  on voit toujours la dernière version ; jamais une page périmée pour
  toujours. **Les fichiers** (noms à empreinte) : copie gardée d'abord. Environ
  3 Mo sont gardés avec chaque version ; les WebAssembly d'ONNX Runtime (15 et
  29 Mo) et le graphe du modèle d'accords détaillé sont **gardés au premier
  usage** (décision : ne pas imposer 44 Mo à qui n'analyse ou ne sépare pas
  encore). Ils sont lus en entier une fois puis gardés (un gros corps envoyé
  tel quel dans le cache échoue dans Chromium, mesuré ici).
- **Isolation** : toute réponse donnée par le service worker porte COOP et COEP
  (sinon le moteur perd sa mémoire partagée) ; vérifié hors ligne par
  `test:offline` (`crossOriginIsolated`).
- **Mise à jour** : une nouvelle version s'installe en silence et prend la main
  au lancement suivant (quand aucune page de l'ancienne n'est ouverte) ; les
  copies de l'ancienne sont alors effacées, sauf les gros fichiers que la
  nouvelle nomme encore. `web/_headers` demande que `sw.js` soit toujours
  revérifié.
- **Où il s'inscrit** (`register.ts`) : en https, hors app Mac (le protocole
  `fabtice://` refuse de toute façon les service workers), pas sur les adresses
  de test ni sur une page servie par cette machine, sauf `?horsligne` (les
  vérifications du navigateur ne doivent pas dépendre d'une copie laissée par
  un essai précédent).
- **Icônes** : le « F » de Fabtice à l'encre et son « t » italique braise, en
  Fraunces, sur le papier : la marque telle qu'elle est (`src/assets/icons/`,
  refaites par `make-icons.mjs` si la marque change), plus une version
  « maskable » avec la marge de sécurité.

#### Réglages

Le panneau garde son ordre : d'abord l'essentiel (suivre la tête de lecture,
notation des accords mineurs), puis « Réglages avancés », replié. Ajouts du
lot 4, dans les avancés : sous l'outil de séparation, **sa taille, sa source et
la licence connue de ses poids** (avec la mise en garde quand elle est
incertaine), comme le modèle d'accords le faisait déjà ; et, en dernier,
**« Place sur cet appareil »** (`components/DeviceStorage.tsx`,
`settings/deviceUsage.ts`) : la place totale prise par Fabtice (selon le
navigateur), puis une ligne par chose gardée avec sa taille : instruments
séparés du morceau, outils d'analyse, modèle d'accords détaillé, outils de
séparation, grilles des standards (comptées en grilles : leur magasin ne
donne pas sa taille). « Libérer » efface un outil téléchargé (il revient quand
il sert), désactivé pendant le calcul qui s'en sert. Le morceau gardé ne se
libère pas ici (c'est « Oublier ce morceau » ou un nouveau morceau).
Pas de réglage « instrument par défaut » (Ut, Si♭, Mi♭) : le choix fait dans
l'en-tête de la grille suit déjà d'un morceau au suivant ; un second endroit
ferait doublon.

#### Vérifications

- `npm test` : `audio/flac/decode.test.ts` (contre libFLAC à trois niveaux,
  tranches de toutes tailles, mono, silence, 44,1 kHz, coupé, codes de Rice
  quelle que soit leur fin dans le cache de 32 bits, vitesse),
  `project/fileFormat.test.ts` (aller-retour : document, original octet pour
  octet, deux séparations et le rendu à l'échantillon près en FLAC ; dossiers
  de l'archive ; jamais séparé ; document plus ancien migré ; trop récent ;
  abîmé ou coupé n'importe où, trouvé par la vérification avant tout
  remplacement ; et la mesure de quatre minutes à six instruments,
  `FABTICE_FAB_LONG=1` pour douze), `project/projectFile.test.ts` (par le
  magasin : deux outils gardés et échangés sans calcul avec leur mixage, même
  outil qui remplace le sien, une séparation libérée seule, rendu périmé puis
  réentendu puis remplacé, tout revient d'un `.fab` et est gardé, fichier
  abîmé sans effet, démonstration et morceau pas gardé),
  `settings/deviceUsage.test.ts`.
- `npm run test:project-file` (Chromium, vrai libFLAC dans ses workers),
  `npm run test:offline`.
- App Mac : `test/unit/open-files.test.js`, `test/unit/recent-projects.test.js`,
  `test/e2e/project-file.test.js` (enregistrer dans l'app, le projet en tête des
  récents, ouvrir dans une app neuve comme le Finder le fait, relance, rouvrir
  depuis « Projets récents », copie abîmée, pas de service worker).

## Contrats pour la suite

### Étape 4 de la 1.0.0 : tempo à la main

**Menu de la mesure** (`components/TempoFixMenu.tsx`) : quatre entrées. Les
deux dernières ouvrent une petite fenêtre (`ui/barDialogs.ts` : `openTapFix`,
`openMeterDialog`).

**Correction de la courbe en tapant le tempo (C12).**
- Contrat entre l'écran et le calcul : `analysis/tapFix.ts` : `tapNow(at?)`
  (position entendue à l'instant de la tape : position du moteur moins la
  latence de sortie, `AudioEngine.getOutputLatency?()`, et moins le retard du
  gestionnaire si on passe `event.timeStamp`), `previewTappedFix(bar, taps)`
  → `TappedPreview` (`reading` : `offset`, `spread`, `dropped`, `filled`,
  `held`…) ou `{ refused }` (`tooFewTaps`, `notABar`, `noAnalysis`,
  `irregular`, `failed`), `showTappedPreview`, `discardTappedPreview`,
  `commitTappedFix`. Tous les instants sont en temps source.
- Calcul : `analysis/engine/tapGrid.ts` (pur ; dans le worker, sur les sorties
  des réseaux gardées, sinon les réseaux tournent de nouveau, avec le
  pourcentage habituel). Il estime l'avance ou le retard habituel (premières
  tapes contre le tempo d'avant, tapes du décompte sur les temps connus,
  faiblement les temps du réseau ; borné à 0,3 temps), choisit par
  programmation dynamique quelles tapes sont des temps (tapes oubliées
  comblées, en trop écartées, point d'orgue lu comme un seul temps long,
  tolérance élargie là où le tempo bouge), puis place les temps par moindres
  carrés robustes (lissage choisi sur les tapes elles-mêmes, temps posés sur
  les attaques proches). Une série de tapes régulière l'emporte sur les
  premiers temps du réseau. Après la dernière tape, la suite est réanalysée
  comme « Réanalyser le tempo » (`runner.ts#runTappedFix`), dès l'aperçu : ce
  qu'on écoute est ce qui sera gardé. **Les règles de l'analyse automatique
  ne sont pas touchées.**
- Aperçu : la grille candidate est dans `tempoMap` (règle, grille et clic la
  suivent) et `AppState.tempoPreview` dit laquelle est en vigueur ;
  l'historique, la sauvegarde automatique et le `.fab` lisent `gridInForce()`.
  « C'est bon » en fait un `TappedTempoFix` (une étape d'annulation ;
  « Revenir à l'analyse » sur la mesure revient à `previous`).
- Écran : `components/TapFixDialog.tsx`, `ui/tapFixSession.ts` (lecteur piloté
  directement : métronome forcé, clic coupé à la mesure choisie, boucle mise
  de côté, tout rendu à la fermeture sans toucher au store),
  `grid/tapFixPlan.ts` (règles pures : départ, clic, tapes gardées depuis deux
  mesures avant), `ui/tapFixReading.ts` (la ligne « c'est compensé »).
- Mesures qui commencent entre deux temps analysés (après un 7/8) :
  `runner.ts#gridForFix` et `tempoFixActions.ts#tempoMapForFix` ; les trois
  corrections de tempo y marchent.
- Banc : `FABTICE_TAP_FULL=1 npx vitest run src/analysis/engine/tapGrid.bench.test.ts`
  (2 448 essais ; chiffres dans `v1/bilan-etape-4.md`) ; un sous-ensemble
  rapide tourne dans `npm test` avec des seuils. Vérifications :
  `npm run test:tap-fix` (deux formes, analyseur simulé puis réel),
  `npm run test:tempo-fix`. Poignée de test : `window.__fabtice.tapFix`.

**Changer la signature rythmique (C13).** `components/MeterDialog.tsx`,
`ui/meterForm.ts` (validation, phrase sur la noire) ; elle appelle
`setMeterFrom`, `setMeterForBar` ou `removeMeterChange` (une étape
d'annulation). Sur la règle : `timeline/meterMarks.ts` (`layoutMeterMarks`,
`numberFitsAfter`) ; ce qui est dessiné se lit dans `data-signatures` sur
`.frise`. Vérification : `npm run test:meter`.

**Métronome.** `MetronomePanel.tsx#useEditedMeter` : avec plusieurs
signatures, un choix « Réglage des temps pour la signature » ; les accents
restent rangés par clé de signature dans `metronome.patterns` (format
inchangé, version 6).

**Éditeur d'accord.** Au-delà de 8 temps (`LONG_BAR_BEATS`), les boutons de
place dans la mesure passent en grille (`.editeur-temps.longue`).

**Barre d'espace et fenêtres.** `ui/useGlobalKeys.ts#windowOpen` est la seule
définition de « une fenêtre est ouverte » (dialogue modal, alerte ou menu
affiché, ou touche pressée sur un contrôle d'un panneau non modal) : l'espace
fait alors ce que fait le contrôle, jamais lecture ou pause. Pendant les
tapes, la fenêtre prend l'espace pour elle.

**Captures.** `npm run captures` appelle aussi `tests/captures-tap.mjs` et
`tests/captures-meter.mjs`.

### Étape 3 de la 1.0.0 : exports

**Fichiers d'essai pour le propriétaire.** `npm run essais -- /un/dossier/hors/du/depot`
(construit l'interface puis lance `tests/essais.mjs`, Chromium, **vrai** moteur de
rendu Rubber Band et vrais encodeurs ; une dizaine de minutes ; le dossier doit
être hors du dépôt). Le morceau de démonstration (quatre instruments, tempo qui
varie de 107 à 113, accords, sections A B A) reçoit une mesure en 3/4 (mesure 12,
`setMeterForBar`) et une modulation (section B en Mi♭ majeur, retour en La♭).
Deux variantes, « 1 - Tonalité et tempo d'origine » et « 2 - Plus 2 demi-tons,
tempo 90 % », avec chacune :
- `Logic Pro/` : le « Dossier pour Logic Pro » décompressé (comme l'app Mac l'écrit) et son `.zip` ;
- `Audio/` : depuis la fenêtre « Audio… », le mélange en Wave 48 kHz 16 bits,
  Wave 96 kHz 24 bits, Flac, MP3 320 et MP3 128, et l'archive des pistes (décompressée à côté) ;
- `Ableton Live/` : « Projet Ableton Live… » si le menu a cette entrée (première
  fenêtre ouverte, son bouton principal, puis le lien de téléchargement) ; sinon
  sauté, et dit dans la sortie et dans `LISEZ-MOI.txt`.

À la racine, `LISEZ-MOI.txt` dit au propriétaire quoi ouvrir dans Logic 13 et
quoi regarder en premier. Chaque fichier audio est relu par `ffprobe` quand il
est installé (format, fréquence, quantification, débit, durée, affichés).

#### « Dossier pour Logic Pro… » (C15.4)

La recherche sur ce que Logic lit d'un fichier MIDI, le mode d'emploi en trois
gestes et les choix du fichier sont dans `src/export/midi/LOGIC.md`.

**Modèle de session (`export/session/`, commun aux exports vers un
séquenceur ; l'export Ableton s'en sert).** `buildSession(state, { tempoRange? })
→ Session` (pur, testé dans Node) : tout **dans le temps de sortie** (temps
source ÷ `playback.tempoRatio`), deux coordonnées pour chaque position, `time`
(secondes de l'audio exporté) et `quarters` (noires depuis le début de la
ligne du temps du séquenceur). `leadIn` (mesure d'attente : `meter`, `bars`,
`quarterBpm`, `duration`) avant la première barre de la grille après 0
(`start`), `startError` quand elle est posée à 0 faute de mesure d'attente
assez courte ; `beats` (chaque temps dans la signature de sa mesure, avec le
tempo en noires par minute qui mène au suivant), `bars`, `meters`, `keys`
(tonalité par passage, transposée, ASCII et français), `chords` (transposés,
ASCII `text` et `display`), `sections`, `parts` (libellés français, « Solo
(Vents) »), `tracks` (`fileStem` : « 01 Voix »), `frames`, `duration`,
`warnings`. Aussi `asciiChord`, `asciiKey`, `partLabel`, `trackFileStems`,
`leadInFor`, `DEFAULT_TEMPO_RANGE` (20 à 990). Contrat stable : on ajoute des
champs, on n'en change pas le sens.

**Fichier MIDI (`export/midi/`).** `sessionToMidi(session, { chordTrack? }) →
{ bytes, beatTimes, maxBeatError, markers }` : format 1, 960 tics par noire,
piste de tempo (nom, signatures, armures, un tempo par temps sans dérive,
marqueurs « Theme 1 - [A] Bbmaj7 ») puis piste « Accords ». Écrivain bas
niveau `writeSmf(tracks, ppq)`, `asciiText`. Relu dans les tests par
`midi-file` (devDependency, licence MIT).

**Remise d'un dossier (`export/folder/`).** `openFolderTarget(nom) →
FolderTarget | null` (null : panneau annulé), puis `add({ name, data })`
fichier par fichier, `finish() → FolderResult` ou `abort()`. App Mac : un vrai
dossier (`{ kind: 'folder', folderName, where, reveal }`) ; web : une archive
.zip dont les entrées sont dans un dossier de ce nom (`{ kind: 'zip', file }`).
`writesRealFolder()`. Pont : `beginFolderExport`, `writeFolderFile`,
`finishFolderExport`, `abortFolderExport`, `revealFolderExport` (canaux
`fabtice:folder-*`, `desktop/src/folder-writer.js`).

**Contenu Logic (`export/logic/`).** `planLogicFolder(state)` (pur : nom du
dossier, du fichier MIDI, un plan d'export audio par piste, gain 1, Wave),
`runLogicExport(plan, target, deps)` (rend les pistes une à une par
`runAudioExport` avec l'encodeur `fixedLengthWav(session.frames)` : toutes de
la même longueur), `logicTextFiles`, `logicReadme`, `logicGestures`,
`logicBarOfFirstBar`. Fenêtre : `components/ExportLogicDialog.tsx`, état
`export/logic/dialog.ts` (`logicDialog`, `openExportLogic`), compté dans
`ui/windows.ts`. Commande `exportLogic` (`ui/commands.ts`, `desktop/src/menu.js`).
Poignée de test : `window.__fabtice.lot3.sequencer`.

### Étape 3 de la 1.0.0 : « Projet Ableton Live… » (C15.5, à l'essai)

La recherche sur le format `.als`, les sources, ce qui est établi ou non et le
degré de confiance sont dans `src/export/ableton/ALS-FORMAT.md`. Personne n'a
pu ouvrir ces projets dans Live : l'export est annoncé « à l'essai » dans la
fenêtre, le mode d'emploi et le changelog.

**Le dossier** « Titre (changements) Project » (la forme que Live donne au
dossier d'un projet) : `Titre.als` (schéma de Live 11.0, pour Live 11 et 12),
`Titre (Live 10).als` (schéma de Live 10.1 : Live 10 y annonce des fichiers
manquants, que son gestionnaire de fichiers retrouve), `Samples/Imported/01
Morceau.wav`… (les mêmes pistes que pour Logic : gain 1, tonalité et tempo
choisis, Wave 48 kHz 16 bits, toutes de la même longueur), `Titre.mid` (le
fichier MIDI de `export/midi/`, le repli sûr), `Lisez-moi.txt`. Pas de dossier
`Ableton Project Info` : son fichier est un format binaire de Live, non écrit.

**Écrivain (`export/ableton/`).** Pur, sans DOM : `buildLiveSet(input) → { xml,
target, tempo, clipEnds, warnings }`, `writeAbletonSet(input)` (les octets du
`.als`, gzip à l'en-tête de Live). Entrée neutre en noires (`types.ts`,
`AbletonSetInput` : `target` `live11` | `live10`, `title`, `sampleRate`,
`tracks` [`name`, `file` relatif, `frames`, `startQuarters?`, `absolutePath?`,
`fileSize?`, `crc?`, `lastModified?`, `color?`], `tempo` en paliers, `meters`,
`locators`). Courbe de tempo en marches sur les doubles-croches (`tempo.ts`),
somme de contrôle de Live (`crc.ts`, `liveFileCrc`).

**Depuis la session.** `sessionToAbleton(session, { target?, files? }) → {
input, notes }` : le tempo de chaque temps (la mesure d'attente d'abord), les
signatures (une signature sur 32, que Live n'a pas, est écrite sur 16 : n pair
→ (n/2)/16 ; n impair → n/16 au tempo doublé, ou, au-delà de 999, k/16 avec k =
n/2 arrondi en dessous ; `notes` le dit, le mode d'emploi aussi), les marqueurs
du fichier MIDI (même texte ASCII) et les tonalités (« Tonalité Bb ») en
repères ; `quartersMap(session)` donne la place de chaque noire sur la ligne de
temps de Live. `planAbletonFolder(state)` (pur ; session avec
`LIVE_TEMPO_RANGE` 20 à 999), `runAbletonExport(plan, target, deps)` (les
pistes d'abord, puis les deux projets avec la taille, la somme de contrôle et,
dans l'app Mac, le chemin complet de chaque fichier ; puis le MIDI et le mode
d'emploi), `abletonSetFiles`, `abletonTextFiles`, `abletonReadme`,
`abletonMissingSteps`, `abletonFallbackSteps`.

**Ce qui est partagé avec Logic.** Les pistes : `export/sequencer/`
(`planSequencerTracks(state, session, sousDossier?)`,
`renderSequencerTracks(...)`). La fenêtre : `components/SequencerExportDialog.tsx`
(`SequencerExportBox` et sa configuration `SequencerExport` : identifiant des
tests, préfixe des textes, plan, rendu, ce qui est dit avant et à la fin) ;
`ExportLogicDialog.tsx` et `ExportAbletonDialog.tsx` n'en sont que la
configuration ; styles `styles/exportLogic.css` (`.export-sequenceur`). La
remise : `export/folder/` accepte des sous-dossiers (`folderEntryName`,
`MAX_FOLDER_DEPTH`) et donne `FolderTarget.fullPath` (app Mac ; null sur le
web).

**Commande** `exportAbleton` (« Projet Ableton Live… », juste après
`exportLogic`), état `export/ableton/dialog.ts` (`abletonDialog`,
`openExportAbleton`), compté dans `ui/windows.ts`. **Poignée de test** :
`window.__fabtice.lot3.sequencer` (`planAbletonFolder`, `sessionToAbleton`,
`quartersMap`, à côté de `buildSession`, `sessionToMidi`, `planLogicFolder`).

**Vérifications.** Vitest : `export/ableton/*.test.ts` (écrivain relu par
l'analyseur XML de Python quand `python3` est là, conversion, dossier) ;
`ableton.reference.test.ts` relit avec trois lecteurs indépendants
(abletoolz, dawtool, ableton-als ; voir son en-tête). Chromium :
`npm run test:export-ableton`. App Mac : `desktop/test/e2e/export-ableton.test.js`.

### Étape 2 de la 1.0.0 : interface

Ce qui suit remplace, là où ils se contredisent, les passages plus anciens de
ce document : il n'y a plus de menu « Exporter » ni de menu « ⋯ »
(`ExportMenu.tsx`, `SettingsPopover.tsx` sont supprimés), « Nouveau morceau »
s'appelle « Nouveau projet », et l'offre des grilles en carte
(`StandardsOffer.tsx`) est remplacée par un message et une section de
Réglages → Avancé. La version du document ne change pas (6).

**Commandes (C6).** Une seule table, `ui/commands.ts` : `COMMANDS` (par
identifiant : libellé, raccourci, `enabled(ctx)`, `offered(ctx)`, `run`),
`FABTICE_MENU` (l'arbre du menu, sous-menus et séparateurs), `commandContext()`
/ `useCommandContext()` (ce qui est possible maintenant), `commandStates()`,
`runCommand(id)`, `subscribeCommands`. Trois lecteurs : le menu sous le logo
(`components/FabticeMenu.tsx`, `styles/menu.css` ; feuille plein écran au
téléphone), le clavier (`ui/commandKeys.ts#installCommandKeys`,
`shortcutCommandFor`) et la barre de menus du Mac (`ui/menuBar.ts`, voir
`desktop/README.md`). **Ajouter une commande** : une entrée dans `COMMANDS`,
sa place dans `FABTICE_MENU`, sa clé `menu.*` dans `i18n/fr.ts` ; pour la
barre du Mac, son identifiant dans `desktop/src/menu.js`. Une fenêtre ouverte
(`ui/windows.ts#otherWindowOpen`) grise tout sauf Nouveau projet, Ouvrir et
Réglages. Dans les tests : `tests/lib/menu.mjs` (`menuCommand(page,
...libellés)`, `openMenu`, `closeMenu`, `menuEntry`) et
`window.__fabtice.project.commandContext / commandStates / runCommand`.

**État « enregistré » repris au lancement.** `storage/savedState.ts` range
dans `localStorage` (`fabtice.etatEnregistre`) l'identifiant du projet et s'il
est modifié ; `project/restoredState.ts#restoreSavedState` le rend au
lancement (et, dans l'app Mac, le chemin du fichier) : un morceau repris de la
sauvegarde automatique n'est plus donné « modifié » s'il est identique à son
`.fab`.

**Réglages (C7).** `ui.settings: { open, tab, direct }`, `openSettings(tab?)`,
`setSettingsTab`, `closeSettings` (`store/store.ts`, `SETTINGS_TABS`).
`components/SettingsDialog.tsx` et un fichier par onglet dans
`components/settings/` (`GeneralTab`, `InstrumentsTab`, `TempoTab`,
`ChordsTab`, `MetronomeTab`, `DisplayTab`, `AdvancedTab`, et `parts.tsx` :
`Section`, `SubTitle`, `CheckRow`). Les réglages de l'appareil (`model/project.ts` : `AppSettings`,
`defaultAppSettings()`) sont gardés par `store/preferences.ts`
(`resetPreferences`) et se changent par `store/settingsActions.ts`
(`setAtLaunch`, `setAnalyseOnImport`, `setUseKnownCharts`,
`resetDeviceSettings`). **Ajouter un réglage** : son champ et son défaut dans
`AppSettings`, son action, sa ligne dans l'onglet. Les petits panneaux
(métronome, tempo et mesures, accordage) partagent leurs corps avec les
onglets et portent un lien « Tous les réglages… ». Sous-grille :
`Subdivision` = 0,5 (blanches), 1, 2, 4, 8 ; `DEFAULT_SUBDIVISION` = 1 ; les
appareils qui avaient l'ancien défaut passent une fois à « Noires »
(`subdivisionVersion`). Tests : `tests/lib/settings.mjs` (`openSettingsTab`…).

**Impression (C4).** `chart/printLayout.ts` (pur : `paginate`, `fitScale`,
`normalizePrintOptions`, `printBarGeometry`), `chart/printChart.ts`
(`usePrintChart`, `printLines`, `headerInfo`), `chart/PrintSheets.tsx` (les
feuilles : les mêmes pour l'aperçu et pour le papier), `chart/print.ts`,
`components/PrintDialog.tsx`, `styles/print.css`. Préférences :
`fabtice.print`, `fabtice.print.printer`. `tests/pdf-read.mjs` relit le PDF.
L'étape 5 (« ce qu'on imprime » : grille complète ou simplifiée) ajoute un
champ `what` à `PrintOptions` / `normalizePrintOptions`, le lit dans
`printLines`, et pose un groupe dans `PrintDialog` avant « Marges ».

**Nouveau projet (C9).** `ui.newPieceFrom: 'link' | 'file' | null`,
`openNewPiece(from)`, `requestNewProject(from)` (alerte d'abord) ;
`components/NewPieceDialog.tsx` ; `separation/importChoice.ts`
(`setSeparateOnImport`, `reconcileStems`, `isSeparateTicked`). La case
« Alléger » (étape 6) se pose dans `ImportStems`, après la case « Séparer les
instruments » : un commentaire marque l'endroit.

**Grilles des standards.** `standards/offer.ts` : le message
(`messageStep`, `acceptMessage`, `declineMessage`, `setDontShow`,
`acknowledgeLastWord`, `leaveMessageRunning`, `finishMessage`,
`markLaunched`) et les actions de la section (`downloadAllStandards`,
`downloadOneStandard`, `checkStandardsUpdates`, `removeStandard`,
`reportText`) ; `components/StandardsMessage.tsx`, `StandardsProgress.tsx`,
`settings/StandardsSection.tsx` ; `standards/smooth.ts` (pourcentage
régulier). « Tous » veut dire ceux que cette forme de l'app sait lire : 5
recueils sur 15 pour l'app web (les autres pages refusent un navigateur), 15
pour l'app Mac. Le message ne se montre pas sur les adresses de test
(`?debug`, `?demo`, `localhost`) sauf avec `?grilles=message`. La liste des
recueils (`standards/collections.json`) se vérifie sur les Mac de GitHub
(`collectionAddresses.real.test.ts`, `FABTICE_COLLECTIONS_ONLINE=1`).

**Chargement (C1).** Classe `en-cours` sur le texte d'état de l'analyse
(`AnalysisStatus.tsx`) et de la séparation (`SeparationPanel.tsx`) (braise, reflet de 2,5 s, `prefers-reduced-motion`).

**Captures pour le propriétaire.** `npm run build` puis `npm run captures --
/chemin/hors/du/depot` (`tests/captures.mjs`) : menu ouvert et sous-menus,
chaque onglet de Réglages, « Nouveau projet », message des grilles, fenêtre
d'impression, chargement en cours, au bureau (1280 × 800) et au téléphone
(390 × 844).

### Étape 1 de la 1.0.0 : socle (document version 6)

Quatre contrats que les étapes suivantes appellent. Rien n'a encore d'écran
(menus : étape 2 ; fenêtres de signature et de tempo tapé : étape 4 ; détection
et affichage des tonalités et de la structure : étape 5).

#### Historique : annuler, rétablir, « modifié » (`store/history.ts`)

- **Mécanisme générique** autour du magasin (`startHistory`, lancé par
  `main.tsx`) : il compare, tranche par tranche et par référence, la partie
  annulable de l'état avant et après chaque changement. **Aucune action n'a été
  réécrite.** Annulable : `corrections`, `tempoMap`, `loop`, `markers`,
  `playback` (tonalité, réglage fin, tempo, métronome marche/arrêt),
  `metronome`, et le mixage des pistes (muet, solo, volume) rangé par
  identifiant de piste (une piste disparue est sautée, une nouvelle laissée
  telle quelle ; vrai aussi pour une séparation mise de côté). `analysis` ne
  l'est que dans une étape explicite : les corrections de tempo à la main
  (`store/tempoFixActions.ts`) changent la grille, les corrections et les
  accords analysés d'un coup, et un seul « annuler » rend les trois. **Pas
  annulables** : import, séparation, analyse complète, rendu appliqué
  (`keptRender`), réglages de l'app, affichage, préférences d'export, états
  d'interface et de transport.
- **Ce qui vide l'historique** : une analyse complète (`analysis` change hors
  `transact` : aucune étape ancienne ne doit rendre une grille incohérente avec
  le nouveau résultat) et tout changement de projet (nouveau, ouvert, rouvert au
  lancement, fermé). Une séparation, l'échange du jeu affiché et le rendu ne le
  vident pas.
- **Gestes** : un geste continu (pointeur tenu : curseur tiré, bord de boucle
  tiré, sélection de mesures) est **une** étape ; `ui/historyKeys.ts` ouvre et
  ferme le geste sur le pointeur. Les changements rapprochés d'un même champ
  continu (volume, réglage fin, tempo, accélération, boucle) à moins de
  `COALESCE_MS` (500 ms) en font une aussi. `transact(libellé, fn)` nomme une
  étape ou en regroupe plusieurs (c'est ce que fait `store/meterActions.ts`) ;
  `beginGesture(libellé?)` / `endGesture()` pour un geste que le pointeur ne
  borne pas. Au plus `HISTORY_LIMIT` (100) étapes, la plus ancienne tombe.
- **Libellés** : `history.what.*` dans `i18n/fr.ts` (« Annuler : volume de la
  piste »), choisis d'après les champs changés (`labelFor`, le premier motif qui
  convient) ou donnés à `transact`. Une nouvelle sorte de changement qui doit
  avoir son nom ajoute une clé et une ligne de `LABELS`.
- **Lecture, pour le menu de l'étape 2** : `undo()`, `redo()`, `canUndo()`,
  `canRedo()`, `undoLabel()`, `redoLabel()`, `useHistoryStatus()` (état
  `{ canUndo, canRedo, undoLabel, redoLabel, modified }`), `subscribeHistory`
  (la barre de menus du Mac). Clavier : `ui/historyKeys.ts` (cmd + Z, Maj + cmd
  + Z ; Ctrl + Z, Ctrl + Maj + Z, Ctrl + Y ailleurs ; **dans un champ de texte
  le raccourci est laissé au navigateur**), installé par `ui/useGlobalKeys.ts`.
  Dans l'app Mac, `desktop/src/menu.js` n'a pas été touché : Édition → Annuler
  agit sur le texte seulement (rôles du système) ; la page prend le raccourci
  elle-même.
- **« Modifié »** (C5) : `isModified()`, `useIsModified()`, `markSaved()`,
  `markModified()`, `resetHistory({ modified })`. Un projet est modifié quand sa
  partie annulable diffère de celle du dernier point d'enregistrement, ou
  qu'un changement **non annulable** mais qui fait partie du projet (analyse,
  séparation, rendu appliqué) a eu lieu depuis. Revenir par « Annuler » au point
  d'enregistrement redonne « non modifié », sauf si un tel changement a eu lieu
  entre-temps. Un morceau importé commence modifié (jamais enregistré dans un
  `.fab`) ; la démonstration non ; un morceau repris de la sauvegarde
  automatique au lancement est donné modifié (on ne sait pas si son `.fab` lui
  correspond encore). Ouvrir un `.fab` appelle `markSaved()` une fois le morceau
  en place (`project/open.ts`). Rien de cela n'est dans le document.
- Tests : `store/history.test.ts`, `npm run test:undo`,
  `desktop/test/e2e/undo.test.js`.

#### Signatures par mesure (`store/meterActions.ts`, `grid/meters.ts`)

- **Commandes** (`store/meterActions.ts`) : `setMeterFrom(bar, meter)`
  (« Changement permanent à partir de cette mesure » : jusqu'au prochain
  changement déjà là), `setMeterForBar(bar, meter)` (« uniquement pour cette
  mesure » : la mesure suivante retrouve la signature d'avant),
  `removeMeterChange(bar)`, `canChangeMeterAt(bar)`. `bar` est un indice (0 =
  « mesure 1 ») ; `meter` est `{ numerator: 1…64, denominator: 4 | 8 | 16 | 32 }`
  (`isValidMeter`). Chacune rend `false` sans rien changer si elle refuse (mesure
  de levée, signature illégale) ou si elle ne change rien. Chacune est **une
  étape** (« Annuler : signature rythmique », `history.what.meter`) et fait de la
  grille une correction à la main (`corrected` sur des temps analysés, `manual`
  sinon) : une nouvelle analyse la garde.
- **Sélecteurs** : `selectMeterAtBar`, `selectMeterAtTime`, `selectMeterChangeAt`,
  `selectMeterChanges` (liste `MeterChangeView`). Fonctions pures de la grille
  dans `grid/meters.ts` : `withMeterFrom`, `withMeterForBar`,
  `withoutMeterChange`, `meterChangeAt`, `meterChangeList`, `meterAtTime`,
  `withMetersOf`, `mainMeter(map, duration?)`, `feltBeat`. Dans
  `grid/tempoMap.ts` : `barBeats`, `beatUnit`, `beatScale`.
- **Règles** : les **instants des temps ne bougent jamais** (accords, sections et
  boucles, gardés en secondes, restent avec la musique) ; seules les barres de
  mesure se replacent. La signature est dans la carte de tempo seule
  (`tempoMap.meters`, la première comprise) : l'analyse n'en donne qu'une, tout
  changement après le premier est celui de l'utilisateur ; pas de champ de plus.
  **« La noire reste la noire »** : les temps de la carte comptent l'unité du
  dénominateur de la **première** signature ; une mesure de n/d dure n × d₀/d de
  ces temps (dans un morceau en 4/4, une mesure de 6/8 dure trois noires ; un
  `meters[].beat` peut être fractionnaire). Écrite en tête de
  `model/tempoMap.ts` et dans `project/FORMAT.md`.
- **Règle pour un changement ultérieur de la grille** : quand une mesure change
  de longueur, les changements de signature placés plus loin gardent leur
  **instant** (calés sur la barre la plus proche ; à égalité ils gardent leur
  numéro de mesure), pas leur numéro. Toute fonction qui recalcule une grille
  (action de tempo à la main, « Revenir à l'analyse », annulation) doit passer
  par `withMetersOf(cible, source)` pour replacer les changements de
  l'utilisateur. « Revenir à l'analyse » les garde et rend la première signature
  analysée. Le tempo affiché est celui de la signature qui couvre la plus grande
  part du morceau (`mainMeter`), pour qu'une seule mesure en 6/8 ne le fasse pas
  sauter.
- **Consommateurs mis à jour** : barres et numéros de mesure, sous-grille et
  magnétisme, métronome (accents par défaut pour toute signature, décompte ;
  `grid/metronome.ts` a ses propres bornes de métrique, 2 à 12 sur 4 ou 8, pour
  le panneau du métronome : **ne pas les confondre** avec
  `METER_NUMERATOR` / `METER_DENOMINATORS` de `model/tempoMap.ts`), grille
  d'accords (la signature s'écrit à la mesure où elle change, et en première
  mesure s'il y en a plusieurs), boucles, repères, réanalyses et corrections de
  tempo (les signatures posées à la main sont gardées), et l'export iReal Pro :
  `IREAL_METERS` (les quatorze signatures que le format connaît),
  `iRealMeterFor(m)` (la plus proche en durée, avec `exact`), `iRealMeterToken`
  (la vraie signature en commentaire quand elle n'est pas exacte). Deux pannes
  anciennes corrigées au passage : l'export iReal Pro écrivait un morceau en 6/8
  comme du 6/4, et une correction de tempo à la main rendait un 6/8 en 6/4.
- **Limites connues** : après une mesure à nombre impair de croches (7/8, 7/16),
  les barres suivantes tombent entre deux temps analysés ; les corrections de
  tempo à la main refusent alors ces mesures en silence (contrôle dans
  `analysis/runner.ts`, non touché) et l'analyse numérote toujours avec une
  seule signature (règles figées). Le panneau du métronome ne règle les accents
  que de la première signature. Pas de signature dessinée sur la règle de
  l'affichage « Pistes ». L'éditeur d'accord montre un bouton par temps (jusqu'à
  64 pour une longue mesure : mise en page non vérifiée). À regarder à
  l'étape 4.
- Poignée de test : `window.__fabtice.lot2.meter` (le module `meterActions`).
  Tests : `store/meterActions.test.ts`.

#### Tonalités par passage et structure (`store/keySelectors.ts`, `store/structureSelectors.ts`)

- **Tonalités** : `keyPassages`, `keyPassageAt(s, t)`, `keyAt(s, t)`,
  `keyChangesInForce`. Commandes (`store/keyActions.ts`) : `addKeyChange(time,
  key)`, `setKeyChangeKey`, `moveKeyChange(from, to)`, `removeKeyChange`,
  `resetKeyChanges` ; positions en secondes de la source, tonalités **à la
  hauteur réelle, dans la tonalité d'origine**
  (`harmonyActions.ts#untransposeKeyForStorage` pour un choix fait à
  l'affichage). Chacune rend `false` sans rien changer quand elle ne peut pas
  s'appliquer.
- **Règle de fusion des tonalités** : le premier passage (dès 0) est la
  tonalité principale en vigueur (`corrections.key`, sinon `analysis.key`) ; les
  suivants sont `corrections.keyChanges` dès que l'utilisateur y a touché (la
  liste **entière** est alors la sienne : une modulation analysée supprimée en
  est simplement absente, et une nouvelle analyse ne défait rien), sinon
  `analysis.keyChanges`. La première modification copie les modulations en
  vigueur dans `corrections.keyChanges`.
- **Structure** : `structureInForce`, `sectionsInForce`, `partAt(s, t)`,
  `lettersAreByHand`, `lettersIn` ; commandes (`store/structureActions.ts`) :
  `setStructureMode` (`'auto' | 'jazz' | 'pop'`), `addPart`, `editPart`,
  `removePart`, `resetStructure`, `resetSectionLetters`. Les lettres de section
  restent `corrections.sections` et s'éditent comme avant
  (`harmonyActions.ts#setSection`, le panneau des repères), ce qui les marque
  comme celles de l'utilisateur ; les lettres d'une partie se déduisent, elles
  ne sont pas stockées.
- **Règle de fusion de la structure** (détail en tête de `model/structure.ts`) :
  mode = choix à la main sauf `auto`, sinon le détecté, sinon Jazz ; lettres =
  celles de l'utilisateur s'il y en a ou s'il y a touché (`lettersByHand`, pour
  qu'effacer toutes les lettres reste effacé), sinon les détectées ; parties =
  toutes celles de l'utilisateur, plus les détectées qui ne commencent pas dans
  un passage retouché (`spans`), coupées là où commence le passage retouché
  suivant. Éditer une partie détectée la copie dans la couche à la main et
  ajoute son passage : une nouvelle analyse ne change que les parties que
  personne n'a touchées.
- **Pas encore branché** : rien ne détecte ni ne montre ces données (étape 5,
  qui remplit `analysis.keyChanges` et `analysis.structure`). La grille, les
  repères et les exports lisent encore `corrections.sections` et **pas**
  `sectionsInForce` : l'étape 5 les basculera quand des lettres seront
  détectées. Tests : `store/keyStructure.test.ts`.

#### Projet enregistré ou non (`project/`)

- **Commandes** (`project/saveFlow.ts`) : `saveProject()` (« Enregistrer » :
  écrase le `.fab` du projet, sans fenêtre, sauf si un nouveau son est à encoder
  et que cela dure ; un projet sans fichier — jamais enregistré, fichier
  disparu, navigateur sans poignée d'écriture — passe par « Enregistrer
  sous… ») et `saveProjectAs()` (le dialogue « Enregistrer le projet », qui
  choisit ce qui part dedans, puis le volet du système ; le fichier choisi
  devient celui du projet). Toutes deux rendent `'saved' | 'cancelled' |
  'failed'` ; aussi `cancelSave`, `saveActivity`. `project/choose.ts#chooseProjectFile()`
  pour « Ouvrir… ». Le menu de l'étape 2 appelle ces fonctions et
  `requestNewProject()` (`project/leave.ts`) pour « Nouveau projet ». L'ancien
  dialogue est gardé : il sert à « Enregistrer sous… » ; « Enregistrer » garde en
  silence le choix « avec ou sans les instruments » fait au dernier
  « Enregistrer sous… ».
- **Écriture** (pour tout fichier) : **rapide**, car l'ancien fichier du projet
  prête (`readReusableFile`, `WriteOptions.reuse` dans `fileFormat.ts`) ses
  entrées audio encore identiques (même identifiant, même sorte, même longueur,
  CRC contrôlé à la copie), recopiées telles quelles : seul ce qui est neuf est
  encodé (0,4 s au lieu de 2,4 s sur le morceau d'essai) ; si une entrée recopiée
  ne se relit pas comme enregistrée (`ReuseError`), tout est réécrit sans rien
  emprunter. **Sûre** : rien ne remplace l'ancien fichier avant que le nouveau
  soit complet et vidé sur le disque (app Mac : fichier temporaire à côté puis
  renommage, `desktop/src/project-writer.js` ; Chromium : `createWritable()`
  écrit dans un fichier d'échange jusqu'à `close()`) ; un échec ou une annulation
  laisse l'ancien fichier tel quel. **Honnête** : le projet n'est « enregistré »
  que s'il n'a pas changé pendant l'écriture (sinon il reste « modifié »).
- **Fichier du projet** (`project/currentFile.ts`) : `getCurrentFile()`,
  `useCurrentFile()`, `setCurrentFile`, `clearCurrentFile`, `recallDesktopFile`.
  Il n'est pas dans le document ; il appartient à **un projet** (son
  identifiant) : un autre projet n'en a pas, donc ne l'écrase jamais par erreur.
  App Mac : le chemin reste dans le processus principal (la page n'en connaît
  que le nom) et est retrouvé après un relancement (`project-files.json`).
  Web, Chromium : la poignée `FileSystemFileHandle`, **non gardée** après un
  rechargement (le navigateur redemanderait l'autorisation) : « Enregistrer »
  redemande alors où. Safari et Firefox : pas de poignée, « Enregistrer »
  télécharge le fichier, comme avant.
- **Alerte** (`project/leave.ts#confirmLeaveProject()`, résout `true` si l'appelant
  peut remplacer le projet, `false` s'il doit rester) : « Les modifications du
  projet en cours n'ont pas été sauvegardées, voulez-vous enregistrer ? », titre
  « Projet non enregistré », boutons « Ne pas enregistrer », « Annuler »,
  « Enregistrer » (par défaut, à droite, comme sur macOS ; empilés sur mobile,
  « Enregistrer » en premier). Pas modifié : `true` aussitôt, sans alerte.
  « Enregistrer » enregistre (annulé ou en échec : `false`) ; « Ne pas
  enregistrer » : `true`, rien n'est écrit dans le `.fab` (la sauvegarde
  automatique locale reste le filet) ; « Annuler » : `false`. **Trois
  déclencheurs**, appelée avant de rien remplacer : un nouveau projet
  (`requestNewProject()` et tout import qui remplace le morceau ouvert ; après
  « Ne pas enregistrer » sur « Nouveau projet », on ne repose pas la question
  pour l'import fait depuis la fenêtre ainsi ouverte), l'ouverture d'un autre
  projet (sélecteur, projets récents, Finder, glisser-déposer), et, **app Mac
  seulement**, la fermeture de la fenêtre ou « Quitter » (cmd + Q) : le
  processus principal interroge la page (`desktop/src/close-guard.js`). Une page
  web ne peut pas être interrogée à la fermeture d'un onglet : la sauvegarde
  automatique le couvre.
- **Titre de la fenêtre** (`project/windowState.ts`, `windowTitle`,
  `installProjectWindow`, appelée par `main.tsx`) : app Mac, le nom du fichier
  (ou le titre du morceau tant qu'il n'est pas enregistré), avec les marques du
  système (point dans le bouton de fermeture quand il y a des modifications, icône
  du fichier dans la barre de titre : `reportProjectState`) ; web : « Nom —
  Fabtice », précédé d'un discret « • » tant qu'il y a des modifications.
- **Raccourcis** : `ui/saveKeys.ts` (`saveCommandFor`, `installSaveKeys`) : cmd + S
  et Maj + cmd + S (Ctrl ailleurs). Pris **partout, champ de texte compris**
  (c'est ce que l'utilisateur veut dire, et « enregistrer la page » du
  navigateur ne doit jamais s'ouvrir : toujours `preventDefault`) ; la lettre
  telle que tapée (AZERTY, QWERTZ) ; rien tant qu'une fenêtre de l'app gêne
  (dialogue d'enregistrement, alerte) ou qu'une touche est tenue. Installés par
  `ui/useGlobalKeys.ts` comme ceux de l'historique. `desktop/src/menu.js` ne
  les déclare pas : en les ajoutant au menu (étape 2), veiller à ne pas les
  déclencher deux fois.
- **Fragile** : rouvrir un morceau au lancement le donne « modifié » même s'il
  est identique à son `.fab` ; Safari et Firefox réencodent tout à chaque
  enregistrement ; une coupure en pleine écriture est couverte par des tests
  unitaires (l'ancien fichier reste intact), pas de bout en bout ; rien de
  l'app Mac n'a été vu sur un vrai Mac à la main (volet d'enregistrement du
  système, point du bouton de fermeture : vérifiés par les tests seulement).
- Tests : `npm run test:alert`, `npm run test:project-file` (étendu),
  `desktop/test/e2e/project-file.test.js` (étendu). Côté app Mac, voir
  `desktop/README.md`.

### Lot 2 : ce qui existe et ce qui reste, par chantier

Le socle du lot 2 est en place : modèle et document v2, module `harmony/`,
magasin et actions, contrats ci-dessous, `?demo` analysé, `test:chart`. Quatre
chantiers suivent, chacun dans son dossier.

#### Analyseur — `src/analysis/`

- **Contrat** (`analysis/types.ts`) : `Analyzer.analyse(request)` reçoit l'audio
  décodé à 48 kHz (`channels`, `sampleRate`, `audioId`), éventuellement la grille
  et la tonalité de l'utilisateur (`grid`, `key` : il doit alors les garder et ne
  décoder que les accords dessus, le « regrid » du prototype), `onProgress`
  (étapes `download`, `prepare`, `tuning`, `beats`, `chords`, `finish`, fraction
  qui ne recule jamais, octets téléchargés) et `signal` (annulation : rejeter
  vite avec `AnalysisError('cancelled')`). Il rend un `AnalysisResult` complet ou
  rejette avec un `AnalysisError` (`download-failed`, `unsupported`, `memory`,
  `no-music`, `failed`). `models()` donne la liste des modèles (nom, rôle en
  français, adresse, hébergeur, licence, taille, déjà en cache ou non) :
  l'interface l'affiche au premier téléchargement.
- **Le vrai analyseur** (porté du prototype `web/spikes/analyse/`, mêmes
  algorithmes et mêmes constantes ; ce qui n'est pas porté : les deux autres
  post-traitements des temps du prototype, `dbn` et `joint`, que le réglage par
  défaut n'emploie pas) :
  - `analysis/fabtice.ts` (`FabticeAnalyzer`, côté fil principal, léger) : mélange
    le morceau en mono par tranches (le moteur ne voit jamais son audio touché),
    le **transfère** à un Web Worker, traduit ses messages en progression (une
    fraction pour tout, qui ne recule jamais, poids des étapes mesurés ; un
    battement régulier pendant le réseau d'accords, qui ne donne pas de nouvelles),
    termine le worker à la fin ou à l'annulation (la mémoire de WebAssembly ne se
    rend que comme cela). **Un worker par analyse.** Annuler rejette tout de suite
    avec `cancelled`, demande au worker de s'arrêter et le termine après 300 ms ; le
    worker peut mettre quelques secondes à disparaître s'il est au milieu d'un calcul,
    sans que l'écran l'attende. Une nouvelle analyse peut démarrer aussitôt.
    Les sorties des réseaux (quelques Mo) sont gardées pour l'audio qui vient d'être
    analysé : redemandée avec `grid` ou `key` (la grille ou la tonalité de
    l'utilisateur), l'analyse ne refait que le décodage, dans un nouveau worker, sans
    renvoyer l'audio.
  - `analysis/worker/analysis.worker.ts` (module worker, assemblé par Vite) :
    télécharge et vérifie les outils, ouvre les trois sessions ONNX Runtime Web
    (WebAssembly ; **fils** quand la page est isolée, jusqu'à 4, un seul sinon),
    ramène l'audio à 22,05 kHz (Beat This!) et 44,1 kHz (CREMA) par le
    rééchantillonneur du prototype, lance les réseaux, libère les sessions, décode
    la grille, la tonalité et les accords, traduit en `AnalysisResult`.
    L'annulation est lue entre deux morceaux de travail (les boucles rendent la
    main à la boucle d'événements) et pendant le téléchargement (abandon du `fetch`).
  - `analysis/engine/` : les calculs, **purs** (sans navigateur, testés dans Node) :
    `fft`, `resample`, `tuning` (accordage), `beats` (log-mel, réseau en tranches de
    30 s, pics, probabilité de premier temps), `repair` (réparation des temps, voir
    plus bas), `meter` (métrique 3 ou 4 : HMM sur la
    probabilité de premier temps, a priori 3 : 0,2 et 4 : 0,6), `chords` (CREMA, mise
    en commun par temps), `decode` (décodage calé sur les temps avec l'a priori de
    l'harmonie jazz, confiance, extensions suggérées, basse), `key` (profils de
    Krumhansl), `pipeline` (l'enchaînement), `result` (la traduction vers le modèle :
    « sus4 + 7 » devient la qualité `7sus4`, « sus2 + 7 » est abandonné, `doubtful`
    quand la moyenne géométrique de la probabilité du réseau est < 0,35, premier
    temps = premier temps numéroté 1, passages réparés dans `beats.repaired` ; la tonalité et la grille de l'utilisateur sont
    gardées telles quelles, avec une sûreté de 1). `engine/fixtures/` : les entrées
    déterministes et `make-fixtures.mjs`, qui fait tourner **les fonctions du
    prototype** dessus et écrit `prototype-values.json` ; les tests comparent le port
    à ces valeurs.
  - `analysis/models.ts` : la liste des fichiers, avec adresse (révision figée),
    taille, licence et SHA-256, identique à celle du prototype (un test le vérifie).
    `analysis/models/store.ts` : où ils restent ; `analysis/models/download.ts` :
    comment ils arrivent.
- **Quel réseau Beat This! ?** Le **léger** (`small0`, 10,5 Mo), pour tout le monde.
  Le prototype propose aussi le complet (`final0`, 83 Mo) et on aurait pu le
  préférer sur ordinateur « parce que la qualité prime » ; mesuré ici, c'est
  l'inverse sur le morceau d'essai : le complet lit le tempo à moitié (40 temps
  trouvés sur 80) dès qu'on joue à 1 fois la vitesse et au-delà (et à 0,85 fois :
  mélange des deux) ; il n'est bon qu'à 0,7 fois. Le léger trouve environ 96 % des
  temps à toutes les vitesses essayées (0,7 à 1,3 fois). Il pèse 8 fois moins à
  télécharger, tourne presque deux fois plus vite, et c'est la configuration dont
  le prototype a relevé les justesses. `?modele=complet` essaie le grand ; un
  réglage avancé pourra l'offrir (une seule pièce d'essai : à confirmer sur de
  vrais enregistrements).
- **Téléchargement des outils** : au premier usage (première analyse), depuis les
  dépôts publics de Hugging Face, **à la révision figée** du prototype ; 17,8 Mo
  pour les trois fichiers. Chaque fichier est vérifié par son SHA-256 avant usage
  (et à chaque lecture depuis l'appareil : une copie abîmée est jetée et
  retéléchargée) ; un fichier complet qui ne correspond pas est **refusé, jamais
  gardé**, et repris du début ; trois essais au plus (attentes de 0,8 s puis 1,6 s),
  puis `download-failed` (« Les outils d'analyse n'ont pas pu être téléchargés.
  Vérifiez votre connexion… le morceau reste jouable » : l'analyse se relance par
  « Analyser de nouveau »). Progression réelle en octets sur tous les fichiers à
  télécharger. **Reprise** : le fichier est écrit par morceaux de 2 Mo ; après une
  coupure (ou une page fermée) l'essai suivant demande la suite (`Range`) ; si le
  serveur ignore la plage, le fichier recommence. Le hub répond aux requêtes avec
  `Range` depuis une autre origine (vérifié dans Chromium).
- **Où ils restent, et pourquoi** : **IndexedDB**, base `fabtice-analysis-tools`
  (fichiers complets et morceaux de téléchargement), pas le Cache Storage du
  prototype : IndexedDB est le seul stockage qui se comporte de la même façon dans
  toutes les situations de l'app, pages http(s) et origine `fabtice://app` de l'app
  Mac (**vérifié dans l'app**, test de bout en bout), dans une page et dans un
  worker. Si IndexedDB est inutilisable (stockage bloqué, fenêtre privée), l'analyse
  marche quand même : les fichiers restent en mémoire le temps de la page.
- **Assemblage** : `onnxruntime-web` 1.31.1 (version exacte, comme dans le
  prototype), variante `ort.wasm.min.mjs` (alias dans `vite.config.ts`), dont les
  deux fichiers WebAssembly (`ort-wasm-simd-threaded.mjs` et `.wasm`, 14,8 Mo,
  importés avec `?url`) sont servis **par l'app elle-même**, jamais par un CDN ; la
  licence (MIT) part avec. Serveur de développement, `npm run build` et
  `npm run build:desktop` (base relative, protocole `fabtice://`) : même code. Dans
  l'app Mac, la politique de sécurité n'ouvre que `https://huggingface.co` et
  `https://*.cdn.hf.co` (voir `desktop/src/protocol.js`).
- **Mesures** (cette machine, 4 cœurs, sans carte graphique, Chromium ; elles ne
  valent pas pour les appareils du propriétaire) : morceau d'essai de 37,6 s, outils
  déjà là, **6 à 13 s** selon la charge de la machine (le chargement des réseaux en prend 2) ; morceau de 4
  minutes, **19 à 26 s** ; mémoire du navigateur **+1 Go** pendant le réseau de
  temps (indépendant de la durée : il travaille par tranches de 30 s ; rendue 5 s
  après la fin), c'est ce que ONNX Runtime réserve pour ce réseau ; plus longue
  tâche du fil principal **< 100 ms** ; lire le morceau pendant l'analyse ne gêne pas
  le moteur audio (aucun quantum hors budget). Justesse sur le morceau d'essai :
  96,3 % des temps (précision 93,9 %), 19 premiers temps sur 20, 4/4, Si majeur,
  accordage 30,5 cents (connu : 30), fondamentale juste 84,2 % du temps,
  fondamentale et qualité 74,3 % : **les chiffres du prototype, à l'identique**.
  Mémoire sur iPhone : non mesurée ici ; 1 Go de plus pendant le réseau de temps est
  beaucoup pour un téléphone (voir PASSATION : la page y a été fermée par le système
  pendant la séparation). Un manque de mémoire est annoncé (`memory`) quand le
  navigateur le dit, mais une page fermée de force par le système ne peut pas l'être.
- **Réparation des temps** (`engine/repair.ts`, entre les pics du réseau de temps
  et la métrique ; `OPTIONS.repair` dans `pipeline.ts` la coupe).
  - *Le défaut constaté* (enregistrement de 1945, solo de vents au milieu : bosse
    de la courbe de tempo, puis toutes les mesures décalées d'un temps). Les temps
    sont les pics du réseau pris tels quels (pas de modèle de tempo). Là où le réseau
    perd la pulsation un moment (section rythmique effacée, son usé), il oublie un
    temps, en ajoute un, ou suit quelques temps une autre cadence. Or la grille de
    l'app est une liste de temps avec **un seul** premier temps et une seule
    métrique (`grid/beats.ts`) : les mesures sont comptées tous les N temps depuis
    ce premier temps. Un temps de trop ou de moins décale donc **toutes** les mesures
    qui suivent, et la courbe (tempo moyen de chaque mesure, `grid/tempoCurve.ts`)
    fait une bosse là où les temps sont trop serrés et un creux là où ils sont trop
    espacés. Le HMM de métrique voyait bien les premiers temps revenir après le
    passage (il change alors de phase), mais seul son premier « 1 » était gardé
    (`AnalysedBeats.downbeat`) : mesuré sur les cas ci-dessous, **aucun** premier
    temps juste après le passage, même quand le réseau les donne nettement. Et les
    accords étaient décodés sur la numérotation du HMM, pas sur celle affichée.
  - *La règle* (celle du propriétaire). Un écart de tempo bref qui revient au tempo
    d'avant n'est pas cru : ses temps sont remplacés par des temps au tempo
    d'alentour, **autant que ce tempo en fait tenir** dans le passage (le compte
    est juste, les mesures d'après ne bougent pas). Un intervalle est « hors tempo »
    quand il s'écarte de plus de 30 % de la médiane de ses voisins (12 de chaque côté,
    deux passes, la seconde sans les intervalles déjà hors tempo et sur 24) ; les
    intervalles hors tempo à moins de 3 intervalles l'un de l'autre forment un
    passage. On le répare si : 8 intervalles de chaque côté existent (rien à moins de
    8 temps du début ou de la fin : introduction libre, ritardando final), dont 4 au
    moins dans le tempo, réguliers (aucun à plus de 20 % de leur médiane) ; le tempo
    d'après est celui d'avant à 20 % près ; le passage dure **16 temps au plus** au
    tempo d'alentour (au-delà : un nouveau tempo qui tient, gardé) ; et il dure un
    nombre entier de temps de ce tempo à **0,2 temps** près (sinon : un point
    d'orgue, un vrai fléchissement, gardés). Les changements lents (rubato,
    ritardando, accelerando) ne font jamais d'intervalle hors tempo. Puis **les
    premiers temps ont le dernier mot** : si, sur 12 mesures de chaque côté, la
    probabilité de premier temps du réseau préfère les temps tels que trouvés de
    plus de 2 (log-vraisemblance, en nats : 7 fois plus vraisemblable), le passage
    est gardé. Un passage dont le compte est déjà juste mais dont les temps sont
    déplacés est remis au tempo d'alentour (la bosse de la courbe disparaît, les
    mesures ne bougent pas).
  - *Les mesures* (deuxième réparation, menée par les premiers temps). Là où le HMM
    de métrique (saut de phase permis, 0,002) recommence la mesure de 1 ou 2 temps
    alors que le tempo n'a pas assez dévié pour la première règle (le réseau glisse
    lentement d'un temps), on cherche autour du saut le passage dont la durée fait,
    au tempo d'alentour, le compte corrigé (à 0,3 temps près), et on le remplit ;
    seulement si les premiers temps des deux côtés préfèrent le résultat de plus de 2.
    Une vraie mesure à 2 temps dans un 4/4 régulier n'a pas de passage qui convienne
    et reste telle quelle.
  - *Une seule phase* : la numérotation finale est celle qui s'accorde le mieux avec
    les premiers temps de **tout** le morceau (`bestPhase`), plutôt que le premier
    « 1 » d'un chemin qui peut sauter ; les accords sont décodés sur ces mêmes mesures.
  - *Marques* : chaque passage réparé est noté dans `beats.repaired` (début et fin,
    temps trouvés et temps mis, cause `tempo` ou `bar`), champ facultatif ; les
    analyses enregistrées avant restent lisibles telles quelles (`repairedPassages`
    dans `analysis/types.ts`). L'interface ne les montre pas encore.
    `ANALYSER_VERSION` passe à 2.
  - *Les seuils sont mesurés* sur un jeu de cas (`engine/repair.cases.ts`) : 25
    suites de temps (régulier à 72 et 140, dérive 72→86, rubato ±8 % sur 16 s et
    ±12 % sur 10 s, ritardando final avec point d'orgue, accelerando 90→130, points
    d'orgue de 1,7 et 2,5 temps, introduction libre, 100 puis 135 qui tient, 8 mesures
    plus vite puis retour ; en 4/4 et 3/4 ; plus les vrais temps du morceau d'essai),
    vues comme le réseau les donne (décalage aléatoire de 12 ou 25 ms ; le réseau
    fait 11 ms sur le morceau d'essai, 10 à 20 ms sur ses versions abîmées) avec
    trois niveaux de preuve des premiers temps (nette comme mesurée sur le morceau
    d'essai, faible et bruitée, aucune) ; dans chacune, 19 sortes de défaut à 30, 50
    et 70 % du morceau (un temps de trop, un ou deux de moins, un temps déplacé, deux
    fois plus vite sur 1 ou 2 mesures, 3 pour 2, 4 pour 3, 3 pour 4, 2 pour 3, moitié,
    un temps de plus ou de moins réparti sur 1 ou 2 mesures, contretemps, bosse puis
    creux avec un temps de plus, de moins ou autant). Sur les suites propres :
    l'écart d'un intervalle à ses voisins atteint 0,27 (×1,31) au 99,9e centile et
    0,40 (×1,5) au pire (140 bpm, 25 ms) ; la dispersion d'un côté 0,35 ; l'écart de
    tempo d'un côté à l'autre 0,19. Sur les défauts, l'écart entre le compte juste et
    la durée divisée par le tempo d'alentour : 0,06 temps en médiane, 0,30 au 90e
    centile, jusqu'à 1,16 temps dans le rubato à ±12 % (là, le tempo d'alentour ne
    dit pas le compte). D'où les seuils : 30 % hors tempo ≈ le 99,9e centile des
    suites propres ; 20 % de retour ≈ leur pire écart d'un côté à l'autre. Les autres
    ont été choisis par balayage sur les 8 016 cas, un seuil à la fois, en gardant
    les valeurs qui ne changent **rien** aux suites propres en réparant le plus
    (mesures en place après le défaut avec une preuve de premiers temps nette /
    faible / aucune ; « cassés » = cas justes avant, faux après ; chaque ligne avec
    les autres seuils à leur valeur du moment, d'abord 4 mesures pesées et un veto
    de 4, d'où des chiffres plus bas que le résultat final) :

    | seuil | essayé → retenu |
    |---|---|
    | hors tempo | ×1,25 : 3 suites propres changées (jusqu'à 118 ms) ; ×1,4 : 92,8 / 79,6 / 53,6 % ; **×1,3** : 0 changée, 94,7 / 82,8 / 64,1 % |
    | durée entière | 0,15 : 19 cassés ; 0,25 : 43 cassés ; **0,2** : 26 cassés |
    | retour au tempo | ×1,1 : 90,3 / 79,3 / 61,3 % ; ×1,3 : 28 cassés ; **×1,2** |
    | longueur maximale | 8 temps : 92,3 / 80,8 % ; 24 : 92,3 / 82,9 % ; **16** : 94,7 / 82,8 % |
    | régularité d'un côté | ×1,25 : 29 cassés ; **×1,2** : 26 |
    | bouts déplacés | 1 ou 2 temps : 41 à 60 cassés sans preuve, 1 ou 2 suites propres changées ; **0** |
    | veto (nats) | 6 : preuve faible 75,9 % ; 3 : 85,4 ; 1 ou 2 : 87,4–89,4 ; **2** |
    | mesures pesées | 2 : faible 78,7 % ; 4 : 87,4 ; 8 : 95,6 ; **12** : 97,0 ; 16 et 24 : 97,2 |
    | remettre au tempo un compte juste | non : temps du passage retrouvés 78,9 % ; **oui** : 80,9 %, rien de plus changé |

  - *Mesures* (`repair.eval.test.ts`, jeu complet avec `FABTICE_REPAIR_FULL=1`, 51 s
    ici ; sans, un quart du jeu, 14 s, dans `npm test`). 7 866 défauts injectés :
    **mesures en place après le passage 31,6 % → 97,9 %** avec une preuve de
    premiers temps nette, **31,6 % → 96,9 %** faible, **31,6 % → 64,1 %** sans aucune
    (les 31,6 % d'avant sont les défauts qui ajoutent ou ôtent des mesures entières) ;
    cassés : 0, 0 et 20 (sur 2 486 justes avant ; tous sans preuve de premiers
    temps : 11 dans le rubato à ±12 %, 2 à ±8 %, 4 près d'un point d'orgue, 2 au
    changement de tempo 100 → 135, 1 dans l'introduction libre). Par
    défaut, de avant → après : un temps de trop 0 → 94 %, un de moins 0 → 93 %, deux
    de moins 0 → 94 %, 4 pour 3 sur deux mesures 0 → 71 %, 3 pour 4 0 → 80 %, 2 pour
    3 0 → 84 %, un temps de plus ou de moins réparti sur deux mesures 0 → 66 et 65 %,
    sur une mesure 0 → 74 et 87 %, contretemps 0 → 77 %, bosse puis creux avec un
    temps de plus 0 → 86 %, de moins 0 → 74 %. **Suites propres : aucune changée** (0
    temps ajouté, ôté ou déplacé sur 138 suites, aucun premier temps perdu) ; seuls
    4 des 12 cas « point d'orgue d'exactement 2 ou 3 temps » le sont (voir limites).
  - *De bout en bout sur le vrai réseau* (`repair.network.test.ts`) : les sorties du
    réseau de temps sur le morceau d'essai et sur des versions modifiées
    (`fixtures/network-cases/make_audio.py` : passage où la section rythmique est
    presque effacée, ligne de vents à une autre cadence, couleur « vieux disque » ;
    `run_network.mjs` refait le fichier). Le réseau y échoue trois fois comme sur
    l'enregistrement du propriétaire : 2 temps perdus (passage effacé à −30 dB), 3
    temps perdus (−40 dB), un temps ajouté (vents en 2 pour 3) ; avant, 0 % des
    premiers temps justes après le passage (45, 40 et 30 % sur tout le morceau) ;
    après, 100 % (90, 95 et 95 % sur le morceau ; 95 % sans défaut), temps trouvés
    95 → 96,3 %, 95 → 98,8 %, 98,8 → 98,8 %. Les trois autres versions, où le réseau
    n'échoue pas, et le morceau d'essai lui-même ne changent pas d'un temps ; sur le
    morceau d'essai, `test:analysis` donne toujours les chiffres du prototype
    (96,3 % des temps, 19 premiers temps sur 20, fondamentales 84,2 %, fondamentale
    et qualité 74,3 %).
  - *Limites.* Un point d'orgue qui dure exactement 2 ou 3 temps (à 0,2 près)
    ressemble, par sa durée, à des temps perdus : sans premiers temps nets il est
    rempli (4 cas sur 12, tous sans preuve ou avec une preuve faible ; aucun avec
    une preuve nette). Le bout d'un passage réparé reste où le réseau l'a mis (un
    temps à 96 ms du vrai dans un des cas « vrai réseau »). Dans un rubato rapide
    et fort (±12 % en 10 s), le tempo d'alentour ne prédit pas le compte : quelques
    passages y sont mal comptés. Sans
    aucune preuve de premiers temps, une glissade lente d'un temps (moins de 30 % par
    intervalle) n'est pas vue. Une vraie mesure irrégulière (2/4 dans un 4/4) ne peut
    pas être représentée par la grille de l'app : la phase choisie est celle de la
    plus grande partie du morceau. Le cas de test principal (enregistrement de 1945)
    n'a pas pu être écouté ici ; les cas « vrai réseau » sont un morceau synthétique
    abîmé, pas un vieux disque.
  - *Pour un morceau déjà analysé* : la nouvelle grille ne vient qu'avec une
    nouvelle analyse (le résultat enregistré n'est jamais recalculé tout seul).
    Panneau « Tempo et mesures » : « Analyser de nouveau ». Si la grille a été
    corrigée à la main, d'abord « Revenir à l'analyse » (sinon la grille de
    l'utilisateur est gardée et seuls les accords sont refaits dessus).
- **Temps menés par les premiers temps, temps déplacés** (version 4 de l'analyse,
  `engine/bars.ts`, `engine/displaced.ts` ; ordre dans `pipeline.ts#gridFromBeats` :
  pics du réseau → réparation par les mesures → réparation des temps ci-dessus →
  temps déplacés → métrique et phase unique ; `OPTIONS.bars` et `OPTIONS.displaced`
  les coupent).
  - *Le défaut, mesuré* (deuxième rapport du propriétaire, 15 novembre : « tempo lu
    à la moitié pendant un moment, puis tout décalé »). Nouveau banc des temps
    (`web/spikes/accords/banc/temps.ts`, les 98 enregistrements du banc des
    accords, sorties du réseau en cache, vrais temps) : le réseau tombe à la
    **moitié du tempo** pendant des passages de 2 à plus de 100 temps (il ne garde
    que les temps 1 et 3), surtout aux tempos rapides et sur le « vieux disque » :
    *Anatole* (212) 50 temps au début et 35 à la fin, *Blues for Bird* (196) quatre
    passages dont un de 23 temps doubles, le II-V mineur rapide (236) les 102
    derniers temps, *Blue Bossa* vieux disque, *Saints* vieux disque… La réparation
    de la version 3 s'arrête à 16 temps et à un compte entier au tempo d'alentour :
    ces passages lui échappent (quatre mesures à la moitié font déjà 16 temps). Le
    point décisif : **pendant ces mêmes passages, la sortie « premiers temps » du
    réseau continue de marquer les vraies mesures**, une par mesure, à longueur de
    mesure constante (vérifié pic par pic sur ces morceaux) ; ce sont les temps qui
    sautent.
  - *Les autres voies, mesurées et écartées.* Le DBN du prototype (`dbn`, suivi de
    temps à état de tempo) et le mode `joint` (temps et mesures ensemble, façon
    madmom) suppriment bien les sauts de tempo, mais en choisissant le mauvais
    niveau : temps trouvés 95,2 → 85,8 % (`dbn`) et 89,0 % (`joint`) sur les rendus
    propres, 93,9 → 86,2 et 89,0 % sur le vieux disque ; en serrant la continuité
    (λ = 1000 au lieu de 100), 66 et 60 %. À 50 images/s, un pas d'une image vaut
    déjà 7 % de tempo à 200 à la noire : le modèle ne suit plus le rubato. Traiter à
    part les rapports simples sur les seuls intervalles (sans les premiers temps)
    ne dit pas quel niveau est le bon quand la moitié du morceau est fausse (le II-V
    rapide est faux sur 60 % de sa durée). Les premiers temps le disent.
  - *La règle, par les mesures* (`bars.ts`). Les pics de premier temps (probabilité
    ≥ 0,5, posés sur le temps trouvé le plus proche à 0,35 temps près, deux pics
    aussi proches n'en font qu'un) sont enchaînés en **chaînes de mesures de longueur
    régulière** : la mesure suivante est à une longueur de mesure (à 15 % près,
    longueur = moyenne des deux dernières), ou à deux (un premier temps manqué, à 8 %
    près : trois mesures d'un tempo plus vif ne doivent pas passer pour deux) ; une
    chaîne commence par la plus courte mesure qui tient au moins 4 mesures (au plus
    4,6 intervalles de temps du quartile haut, et au plus 8 temps trouvés par
    mesure : jamais un multiple de mesures). Un point d'orgue, un passage libre, un
    vrai changement de tempo **brisent la chaîne** : rien n'y est fait. La métrique
    est celle que tiennent exactement le plus de mesures (m temps réguliers ; une
    mesure à la moitié ou à qui il manque un temps ne vote pas). Puis, mesure par
    mesure : une mesure qui a le bon nombre de temps n'est **jamais touchée**
    (rubato, swing, note tenue) ; une mesure dont les temps sont réguliers à son
    propre niveau mais pas au bon nombre est gardée (ce sont les premiers temps qui
    se trompent, ou un point d'orgue) ; une mesure avec moins de temps, pas à un
    rapport simple et dont des temps tombent hors des positions, est gardée (note
    tenue) ; une mesure qui a moins de 30 % de ses temps est gardée (le réseau
    n'entend rien : fin de disque) ; sinon elle est **re-quadrillée** : ses temps
    qui tombent sur les m positions régulières (à un quart de temps près) sont
    gardés tels quels, les autres ôtés, les positions vides placées entre les temps
    gardés. Les premiers temps de la mesure restent : la **phase est continue avant
    ET après** le passage, quelle que soit sa longueur. Une chaîne doit tenir la
    métrique sur au moins 3 mesures et 10 % des siennes (sinon elle est tout
    entière à un autre niveau : laissée, voir plus bas) ; une chaîne dont les
    premiers temps viennent une mesure sur deux compte des mesures doubles. Entre
    deux chaînes qui tiennent la métrique à la même longueur de mesure (à 10 % près),
    un trou d'au plus 16 mesures qui dure un nombre entier de mesures (à 0,12 près)
    est re-quadrillé de même (premiers temps perdus un moment). Les réparations
    de la version 3 passent ensuite (mesuré : les garder fait mieux que les
    couper dans les chaînes, 90,0 contre 87,1 % de premiers temps sur le vieux
    disque, partie développement).
  - *Ce que « dure » veut dire maintenant.* Ce n'est plus une durée : c'est la
    **longueur des mesures**. Un passage où les temps vont à la moitié, au double,
    à 2/3 ou 3/2 pendant que les premiers temps gardent la même longueur de mesure
    est une erreur de niveau du réseau, réparée quelle que soit sa longueur (1 à 32
    mesures mesurées, et au-delà) : même un vrai « double-time feel » garde ses
    mesures, c'est la longueur de mesure que la grille d'étude doit garder. Pour
    2/3 et 3/2 (et 4/3, 3/4), il faut de plus que la métrique revienne après le
    passage (ou qu'il commence ou finisse le morceau) : un rapport de ce genre qui
    va jusqu'au bout d'une chaîne est cru. Un **vrai changement de tempo**, même à
    un rapport simple et même à la moitié exacte, change la longueur des mesures :
    la chaîne se brise, rien n'est réparé, le nouveau tempo est gardé aussi
    longtemps qu'il dure (mesuré : 120 → 160, 150 → 100, 132 → 66, 96 → 128 pendant
    16 mesures puis retour, 100 → 135, accelerando, ritardando, rien ne bouge). Un
    morceau **entièrement** à la moitié (aucune mesure à la bonne métrique,
    *Bill Bailey* et *Saints* en rendu propre) est laissé tel quel : rien ne dit
    lequel des deux niveaux est voulu (une ballade à 72 lue au double aurait l'air
    pareille) ; l'utilisateur a « tempo doublé ».
  - *Temps déplacés* (`displaced.ts`, d'après la photo de la courbe envoyée par le
    propriétaire : courbe plate, puis une dizaine de mesures qui ondulent). Sur le
    vieux disque, le réseau se cale parfois quelques mesures sur la croche swing
    d'avant le temps : le compte reste juste, mais tous les temps du passage sont en
    avance d'un tiers de temps environ, d'où une mesure trop rapide à l'entrée et
    une trop lente à la sortie. Mesuré (*So What* vieux disque, 13 à 21 s) : à la
    vraie place, la sortie du réseau est basse (logit −2 à −6), elle ne peut pas
    trancher ; c'est le temps qui tranche. Une suite de 1 à 32 temps est remise en
    place, d'un bloc, quand l'intervalle d'entrée est trop court (ou long) de δ et
    celui de sortie trop long (ou court) du même δ (à 35 % près), les temps entre
    les deux réguliers (10 %), le tempo le même des deux côtés, **et** que tous les
    temps de la suite sont décalés d'environ δ par rapport à la droite que tracent
    les 12 temps de chaque côté (deux temps bousculés par hasard loin l'un de
    l'autre ne font pas un passage décalé) ; δ ≥ 15 % d'un temps (25 % pour un
    temps seul : un temps isolé en avance est plus souvent le musicien), et ≥ 5 fois
    le bruit de placement local. Un vrai étirement (rubato, note tenue) n'est pas
    suivi de l'intervalle inverse : les temps d'après restent où ils sont, rien
    n'est fait. La courbe de tempo affichée vient de la grille corrigée (pas de
    lissage de la courbe seule).
  - *Marques* : `beats.repaired` porte deux causes de plus, `level` (mesures
    re-quadrillées) et `shift` (temps remis en place) ; champ facultatif, les
    analyses enregistrées restent lisibles. `ANALYSER_VERSION` passe à 4.
  - *Jeu de cas* (`engine/tempo.cases.ts`, `tempo.eval.test.ts` ; jeu complet avec
    `FABTICE_REPAIR_FULL=1`, un tiers sinon). 4 608 passages de niveau (moitié,
    double, 2/3, 3/2 ; 1, 2, 4, 8, 16, 24, 32 mesures ; au début, au milieu, à la
    fin, deux fois ; 12 et 25 ms de flou ; swing 120, dérive 100 → 116, rapide 200,
    ballade 72, valse 150 à 3/4, rubato ±6 % ; premiers temps nets, faibles,
    perdus pendant le passage, absents), 800 suites décalées (1 à 16 temps, 8 à
    33 % d'un temps, en avance et en retard, depuis un premier temps ou non ;
    swing 140, ballade 72, valse, dérive), 180 négatifs (les suites propres de la
    version 3, plus les changements de tempo qui durent, une ballade avec fin
    rubato et note tenue). Partie réglage : swing 120 et dérive (niveau), swing 140
    (décalés), suites de la version 3 ; le reste est mis de côté. Avant → après,
    jeu complet :

    | | réglage | mis de côté |
    |---|---|---|
    | mesures en place après le passage (premiers temps nets) | 86,8 → 100,0 % | 87,3 → 99,3 % |
    | premiers temps justes après le passage (nets) | 92,9 → 99,8 % | 94,8 → 99,8 % |
    | temps trouvés (F, nets) | 93,7 → 99,1 % | 93,7 → 98,8 % |
    | sauts de tempo ≥ ×1,3 entre mesures (nets) | 635 → 38 | 1 368 → 120 |
    | mesures en place (premiers temps faibles) | 87,3 → 87,5 % | 87,4 → 88,5 % |
    | mesures en place (premiers temps perdus pendant le passage) | 87,5 → 89,6 % | 87,2 → 89,1 % |
    | sans premiers temps | inchangé (85,0 %) | inchangé (84,6 %) |
    | suites décalées : écart moyen au vrai temps | 53 → 46 ms | 70 → 50 ms |
    | suites décalées : zigzags ≥ 5 % de la courbe | 728 → 697 | 2 434 → 2 290 |
    | négatifs changés | 0 sur 180 (1 l'était déjà avant) | |

    Les sauts restants avec des premiers temps nets sont presque tous à la
    **dernière mesure** d'un passage qui finit le morceau (aucun premier temps
    après elle pour la borner). Les seuils réglés dessus : `openEnds` (ne pas
    re-quadriller une suite qui atteint le bout d'une chaîne au milieu du morceau :
    premiers temps faibles, cassés 15 → 5), `minFound` 0,3 (à la moitié en 3/4,
    une mesure sur deux n'a qu'un temps), la métrique par mesures exactes (un
    passage à 3 pour 2 faisait passer un 4/4 en 3/4), la plus courte mesure d'abord
    (une chaîne de mesures doubles gagnait dans le rubato), les seuils des temps
    déplacés (avec 25 ms de flou, la première version déplaçait 34 suites propres),
    un trou entre chaînes dont les temps sont réguliers d'un bout à l'autre n'est
    pas recompté (dans un rubato, la longueur de mesure des deux côtés se trompait
    d'un temps). Le jeu de la version 3 (`repair.eval.test.ts`, complet, mesures en
    place après le défaut) : preuve nette 97,9 → 98,6 %, faible 96,9 → 96,8 %
    (3 cas sur 2 622 que la version 3 réparait et qui ne le sont plus, aucun cassé),
    aucune 64,1 % ; cassés 0, 0, 20 comme avant ; suites propres : aucune changée.
  - *Vrais morceaux* (`tempo.bench.test.ts`, 15 morceaux du banc dont les sorties du
    réseau sont dans `fixtures/network-cases/bench-cases.json`, logits au dixième ;
    à refaire avec `temps.ts --fixture`) : *Anatole* propre 87,3 → 99,9 % des temps,
    67,7 → 100 % des premiers temps, sauts 4 → 0 ; vieux disque 72,3 → 95,1 %
    (premiers temps 46,9 → 95,8 %) ; *Blues for Bird* propre 88,8 → 99,9 % (42,9 →
    100 %) ; *Blues Basie* propre 94,7 → 99,8 % ; II-V mineur rapide 80,3 → 99,7 %
    (56,3 → 100 %) ; *Blue Bossa* vieux disque 96,1 → 100 % (78,8 → 100 %, sauts
    11 → 0) ; *Saints* vieux disque 96,0 → 99,5 % (83,3 → 100 %) ; *So What* vieux
    disque, premiers temps 78,1 → 90,6 %. Inchangés à la note près : valse, *Autumn
    Leaves* propre, *Georgia* et *Satin Doll* vieux disque, la ballade de cuivres
    vieux disque, *Bill Bailey* propre (entièrement à la moitié, voir plus haut).
    Banc des temps entier, temps trouvés / premiers temps / sauts, avant → après :
    rendu propre 95,2 → 97,2 % / 91,3 → 96,0 % / 16 → 0 ; vieux disque 93,9 → 94,9 %
    / 81,6 → 84,5 % / 50 → 23 ; GuitarSet 91,0 → 91,8 % / 78,8 → 80,6 % / 16 → 6 ;
    GuitarSet vieux disque 79,7 → 79,1 % / 56,9 → 57,9 % / 23 → 14. Partie mise de
    côté seule : propre 97,1 → 99,8 % / 93,5 → 100 % / 12 → 0 ; vieux disque
    92,5 → 91,8 % / 78,5 → 78,2 % / 29 → 23 ; GuitarSet 91,5 → 92,0 % / 75,5 →
    77,1 % ; GuitarSet vieux disque 80,4 → 79,3 % / 57,8 → 59,0 %. Banc des accords
    (grille détectée) : fondamentale et couleur 71 → 73 % propre, 61 → 61 % vieux
    disque, 70 → 70 % et 67 → 67 % GuitarSet ; temps trouvés 95/94/92/81 →
    97/95/93/81 % ; premiers temps 89/79/79/58 → 95/83/81/59 %.
  - *Limites.* Sans premiers temps nets, peu de chose change (premiers temps
    faibles : chaînes trop courtes). Deux morceaux mis de côté perdent un peu :
    *Blues for Bird* vieux disque (premiers temps 64 → 48 % : un passage de
    11 mesures où les premiers temps du réseau sont décalés d'un temps reste
    entre deux parties justes, la phase unique choisit la mauvaise) et un
    enregistrement GuitarSet vieux disque (temps trouvés 100 → 81 % à 70 ms : le
    réseau y est en avance de 150 ms, la réparation de la version 3 replaçait les
    temps au tempo d'alentour, les mesures re-quadrillées gardent ceux du réseau).
    Les temps déplacés ne se voient presque pas sur le banc (le réseau y est plus
    souvent perdu que décalé) : leur effet est mesuré sur le jeu de cas. Le cas du
    propriétaire n'a pas pu être écouté ici. (Version 5 : *Blues for Bird* vieux
    disque passe à 100 % de premiers temps avec le dernier filet ci-dessous ;
    l'enregistrement GuitarSet reste à 81 %, voir ses limites.)
- **Le dernier filet : la règle du propriétaire par construction** (version 5 de
  l'analyse, `engine/steady.ts`, après tout le reste dans
  `pipeline.ts#gridFromBeats` ; `OPTIONS.steady` le coupe).
  - *La règle.* Une variation brutale et brève qui revient n'est jamais crue ; un
    nouveau tempo qui dure est un vrai changement ; une petite tolérance pour les
    mouvements légers ou progressifs. Elle est appliquée sur la grille telle que
    l'app la montre (les mesures tous les m temps depuis le premier temps).
  - *Ce qui est un passage à refaire* (`briefPassages`). Un **appui** : 2 mesures
    de suite à la même longueur (à 20 % près), aux temps réguliers (chaque temps à
    35 % près du temps moyen de sa mesure ; la mesure qui touche le passage peut ne
    pas l'être). Après un appui, une mesure à 20 % ou plus de son niveau (la
    médiane des 3 mesures d'avant), puis, **moins de 8 mesures plus tard**, un
    retour brusque (un pas de 20 % ou plus d'une mesure à la suivante ; en deux pas
    quand l'écart était d'au moins 44 %) au niveau d'avant, pour un nouvel appui.
    Seuil des 20 % : à 15 % (le bas de la fourchette demandée), le flou de placement
    de 25 ms et un rubato de ±12 % déclenchaient sur les négatifs ; à 25 %, les
    sections plus vives de 25 % que garde le jeu de cas passaient pour des bosses.
  - *Ce qui reste tel quel.* Un changement qui dure (pas de retour en moins de
    8 mesures, ou un nouveau tempo tenu égal pendant 6 mesures : « 8 mesures plus
    vives » en 3/4 lu en 4/4 ne fait que 6 mesures), un ritardando, un
    accelerando, un rubato (il revient par degrés), une **introduction libre**
    (aucun appui avant), **les bouts du morceau** (aucun appui après : rien n'est
    inventé, le tempo n'est pas prolongé dans le silence ou le bruit de fin de
    disque ; essayé : tenir le tempo jusqu'au dernier temps ajoutait des temps dans
    les accords tenus de fin, temps trouvés 96,8 → 93,2 % sur *Blues en fa*), une
    grille dont les temps ne sont réguliers nulle part autour (un réseau perdu à un
    autre niveau : refaire autour de rien inventait une pulsation, 79 → 61 % de
    temps trouvés sur un enregistrement GuitarSet).
  - *La construction.* Le passage est refait entre les deux appuis (élargi d'au
    plus 2 mesures de chaque côté pour répartir un reste) avec un **nombre entier
    de temps** : réguliers, ou allant doucement du temps d'un appui à celui de
    l'autre, ou en gardant les temps trouvés qui tombent à un nombre entier de
    temps les uns des autres (à un quart de temps près) et en remplissant les trous
    régulièrement ; chaque temps nouveau se pose sur un temps trouvé à 12 % d'un
    temps près. Une façon n'est gardée que si ses mesures ne font aucun pas de
    20 % avec celles d'autour et si au moins 30 % de ses temps sont des temps
    entendus ; celle qui tombe sur le plus de temps entendus gagne. Des mesures
    entières par défaut : la phase des mesures tient des deux côtés. Un nombre de
    temps qui fait une partie de mesure (un temps ajouté ou ôté) seulement si les
    premiers temps entendus sur tout le morceau s'y accordent mieux (d'au moins
    1 nat), la phase étant alors celle à laquelle ils s'accordent (avant ou après
    le passage) ; sans premiers temps, jamais. Le filet repasse sur son propre
    résultat tant qu'il trouve des passages, sans jamais faire plus de pas brusques
    qu'avant, et il renonce là où les premiers temps entendus contredisent
    nettement le résultat (5 nats et plus : un temps perdu ou ajouté là où le tempo
    bouge vraiment).
  - *Un point d'orgue isolé* entre deux passages réguliers est, par la règle, une
    variation brusque et brève : il devient un nombre entier de temps au tempo
    voisin… sauf quand les premiers temps entendus après lui disent que les mesures
    continuent (c'est le cas dès qu'ils sont nets) : il reste alors une mesure
    longue, la note tenue. Les corrections à la main du menu de la mesure restent
    le moyen d'y revenir.
  - *Diagnostic de ce qui restait* (banc des temps, sauts de tempo ≥ ×1,3 entre
    mesures que la vérité n'a pas, par cause ; `temps.ts --jumps`). Version 4 :
    vieux disque 23 (un autre nombre de temps dans une mesure 15, réseau perdu 7,
    première ou dernière mesure 1), GuitarSet 6 (bout 4, nombre 2), GuitarSet vieux
    disque 14 (nombre 5, bout 5, perdu 4). Avec le filet : 12, 6 et 14. Les 32 qui
    restent : 11 à la première ou la dernière mesure de la musique ; 5 dans le
    passage du II-V mineur rapide où la grille quitte pour de bon la moitié du
    tempo (un changement qui dure, en zigzag pendant 5 mesures) ; 7 sur un
    enregistrement GuitarSet dont la grille est à un niveau mêlé partout (aucun
    appui régulier) ; 6 au début ou à la fin sans appui (*Bossa* vieux disque, deux
    GuitarSet) ; 2 sur le II-V mineur rapide (appui irrégulier) ; 1 laissé faute de
    premiers temps qui choisissent. **Aucun passage qui enfreint la règle telle
    que définie ci-dessus ne reste** sur le banc, sauf ce dernier.
  - *Zigzags* (barres plus rapides ou plus lentes que leurs deux voisines d'au
    moins 5 %, `temps.ts`). Sur le vieux disque, 37 → 24 avec le filet. Ce qui les
    fait sur les vraies sorties du réseau : des mesures au mauvais nombre de temps
    (le réseau perd ou ajoute un temps, ou se cale sur la croche swing : *So What*)
    — c'est ce que le filet traite ; le placement des pics du réseau à une image
    près (20 ms, soit 3 à 4 % d'une mesure à 210 à la noire : *Anatole*, 3 zigzags
    de 3 à 7 %) — laissé, rien ne dit où est le vrai temps ; et les passages où le
    réseau est perdu sans appui autour (*Bossa*).
  - *Mesuré.* Banc des temps, temps trouvés / premiers temps / sauts / zigzags,
    version 4 → 5 : rendu propre 97,2 / 96,0 % / 0 / 0, inchangé ; vieux disque
    94,9 → 94,9 % / 84,5 → 87,3 % / 23 → 12 / 37 → 24 ; GuitarSet 91,8 / 80,6 % /
    6 / 3, inchangé ; GuitarSet vieux disque 79,1 / 57,9 % / 14 / 23, inchangé.
    Morceau par morceau, ce qui change : *Blues for Bird* vieux disque 98,0 →
    99,6 % de temps, premiers temps 47,6 → 100 %, sauts 2 → 0 ; *So What* vieux
    disque 88,8 → 88,5 %, premiers temps 78,1 → 90,6 %, 1 → 0 ; *Bossa* vieux
    disque 41,1 → 39,0 % (un morceau où le réseau est perdu), premiers temps 40,6
    → 46,9 %, sauts 12 → 4. Rien d'autre ne bouge. Banc des accords (grille
    détectée, `--variant app`) : temps trouvés 97/95/93/81 %, inchangés ; premiers
    temps 95/83/81/59 → 95/86/81/59 % ; fondamentale et couleur 73/61/70/67 %,
    inchangés. Sur les sorties du réseau que calcule **l'app** (décodage par
    Chromium, pas ffmpeg : d'autres sorties ; `fixtures/network-cases/app-cases.json`,
    `engine/tempoFix.app.test.ts`) : *So What* vieux disque, dans la musique,
    sauts 4 → 0, premiers temps 79,7 → 92,2 % (les 8 sauts que compte l'app sont
    tous dans les 27 s de bruit de fin de disque) ; *Blues for Bird* : 2 sauts aux
    deux premières mesures (levée et temps manqué : aucun appui avant, laissés).
    Jeu de cas (`tempo.eval.test.ts`, complet) : mesures en place après le passage
    90,6 → 91,2 % (partie mise de côté), 90,7 → 90,9 % (réglage) ; sauts
    2 985 → 2 643 et 1 351 → 1 258 ; négatifs : aucun changé (hors points d'orgue,
    voir plus haut) ; passages qui enfreignent la règle : 236 → 73 cas sur 4 788,
    tous des cas où aucun nombre entier de mesures ne va et où les premiers temps
    (absents ou faibles) ne choisissent pas — le test le vérifie en rejouant le
    filet avec le droit de couper une mesure (`free`) : il n'en reste alors aucun.
    Jeu de la version 3 (`repair.eval.test.ts`, complet) : preuve nette 98,7 %,
    faible 98,0 %, cassés 0 et 0 ; sans premiers temps 63,2 % (64,1 % en version
    4), cassés 22 (20).
  - *Limites.* Un enregistrement GuitarSet vieux disque garde 81 % de temps
    trouvés (100 % en version 3) : pendant 5 s le réseau court 5 % trop vite puis
    ajoute un temps ; la réparation par les mesures ôte le temps en trop mais garde
    les temps du réseau, en avance jusqu'à 140 ms ; la version 3 refaisait
    régulièrement 8 s. Ce n'est pas une variation de 20 % : le filet n'y touche
    pas. `beats.repaired` porte une cause de plus, `steady`. `ANALYSER_VERSION`
    passe à 5.
- **Corriger le tempo à la main, à partir d'une mesure** (demande du propriétaire
  du 15 novembre ; `engine/tempoFix.ts`, `analysis/runner.ts#runTempoFix`,
  `store/tempoFixActions.ts`, `components/TempoFixMenu.tsx`, `ui/tempoMenu.ts`).
  - *Le menu de la mesure.* Clic droit sur une mesure de la règle (ligne des mesures
    ou courbe de tempo, vue *Pistes*) ou sur une mesure de la *Grille d'accords* ;
    appui long sur un écran tactile (650 ms dans la règle ; 900 ms dans la grille,
    où l'appui de 420 ms sélectionne déjà la mesure pour la boucle : l'appui plus
    long rend la boucle d'avant et ouvre le menu) ; au clavier, touche menu ou
    Maj+F10 (dans la grille : la mesure de l'accord qui a le focus ; dans
    *Pistes* : la mesure sous la tête de lecture). Deux entrées, avec les mots du
    propriétaire, et une ligne d'explication sous chacune : **« Corriger un
    changement de tempo indésirable »** et **« Réanalyser le tempo à partir de
    cette mesure »** ; sur une mesure où une telle correction commence, une
    troisième : « Revenir à l'analyse ». Échap ferme, les flèches passent d'une
    entrée à l'autre. Dans l'app Mac, le menu natif n'apparaît que dans un champ
    de texte ou sur un texte sélectionné (`desktop/src/context-menu.js`) : la page
    annule l'événement sur les mesures, les deux ne se rencontrent pas ; le menu et
    les mesures ne se sélectionnent pas comme du texte.
  - *« Corriger un changement de tempo indésirable »* : à partir du début de la
    mesure choisie, le tempo et la longueur des mesures d'avant continuent. Le
    tempo tenu est celui des mesures juste avant quand elles sont régulières
    (4 mesures de suite à 10 % près) ; sinon celui de la plus proche suite
    régulière avant, à défaut après ; jamais à plus d'un quart du temps habituel
    du morceau (les mesures d'avant peuvent être à un autre niveau). Les temps
    sont **suivis un à un** depuis le dernier temps avant la mesure (le début de
    la mesure peut être lui-même le temps qui s'est trompé : une croche swing prise
    pour le premier temps) : chacun est attendu un temps après le précédent, prend
    le pic du réseau le plus fort à 20 % d'un temps près, sinon tombe où il est
    attendu ; la longueur du temps bouge d'un dixième de l'avance ou du retard,
    dans ±20 % du tempo tenu. Un pic plus loin est ignoré, pas suivi : une rangée
    de contretemps forts (la croche swing d'un disque usé) ne peut plus attirer
    les temps. Les mesures sont comptées tous les m temps depuis la mesure
    choisie ; quand les mesures d'avant ne sont pas régulières, la phase des
    mesures est celle à laquelle s'accordent les premiers temps entendus. Le suivi
    rend la main à la grille en place dès qu'ils sont d'accord 8 mesures de suite,
    puis **la reprend** à la première mesure de la grille en place qui s'écarte de
    20 % du tempo tenu, et ainsi de suite. Par construction, un vrai changement de
    tempo après la mesure est effacé (l'aide sous l'entrée le dit). Mesuré : le
    suivi d'avant (meilleur chemin sur tout le reste, `tracker: 'dp'`) remet 677
    passages du jeu de cas contre 649 pour le suivi un à un, mais sur *So What*
    vieux disque (sorties de l'app) il glissait sur la croche swing : premiers temps
    0 %, contre 76,6 % maintenant.
  - *« Réanalyser le tempo à partir de cette mesure »* : toute l'analyse des
    temps (`gridFromBeats` : pics, réparation par les mesures, réparation des
    temps, temps déplacés) sur la sortie du réseau à partir de la mesure, comme
    si le morceau commençait là ; seuls la métrique et le premier temps (la
    mesure choisie) viennent d'avant.
  - *Communs aux deux* : tout ce qui est avant la mesure reste tel quel, temps
    pour temps (y compris des corrections faites à la main avant elle). Le
    calcul se fait sur les sorties du réseau gardées par l'analyseur pour ce
    son (une fraction de seconde, étape « finition ») ; si elles ne sont plus là
    (morceau rouvert), le réseau de temps et celui des accords tournent une fois
    de nouveau, avec la progression habituelle (« Tempo depuis la mesure 5 ·
    40 % » dans la barre du haut), le morceau reste jouable, « Arrêter
    l'analyse » annule. Puis les accords à partir de la mesure sont décodés de
    nouveau sur la nouvelle grille (chemin « regrid » habituel, avec le modèle
    d'accords choisi, et la tonalité en vigueur), ceux d'avant restent.
  - *Ce qui est gardé* : la grille devient une grille corrigée à la main
    (`tempoMap.origin` = `corrected`) : « Analyser de nouveau » la garde, comme
    les autres corrections de la grille ; « Revenir à l'analyse » du panneau
    « Tempo et mesures » la retire avec elles. `corrections.tempoFixes` garde,
    pour chaque action, le début de la mesure, l'action et la grille juste avant
    elle (document de version 5, champ ajouté avant sa publication : absent =
    aucune ; le fichier `.fab` le porte de même). Une petite marque laiton au pied
    de la barre dans la règle, un point laiton près du numéro dans la grille,
    montrent où une correction commence ; le menu de cette mesure offre « Revenir à
    l'analyse », qui rend la grille d'avant cette action et retire aussi celles
    faites après elle (calculées sur sa grille). Les actions se composent : chacune
    part de la grille telle qu'elle est. Les temps analysés et la tonalité analysée
    du résultat ne bougent pas : c'est vers eux que « Revenir à l'analyse » ramène.
    Au passage, un défaut ancien corrigé : après « Analyser de nouveau » sur une
    grille corrigée, le résultat remplaçait les temps analysés par la grille de
    l'utilisateur, et « Revenir à l'analyse » ne ramenait plus rien ; les temps
    analysés d'avant sont maintenant gardés (`applyAnalysis`, `keptGrid`).
  - *Ce qui a été fait à la main après la mesure* (accords écrits, plages
    réécrites, lettres de section, boucle, boucles nommées) : tout est rangé en
    temps de l'enregistrement (secondes), rien n'est déplacé ni perdu ; chaque
    chose reste avec la même musique, et la grille et la règle la placent sur le
    temps ou la barre la plus proche de la nouvelle grille.
  - *Mesuré* (`engine/tempoFix.test.ts`, jeu complet `FABTICE_REPAIR_FULL=1` ;
    réseau reconstruit à partir des temps détectés de chaque cas). Des 913
    passages de niveau que l'analyse automatique (version 5) laisse faux (hors
    passages au tout début, où il n'y a pas de tempo d'avant ; 1 005 en version 4,
    le dernier filet en remet 92), l'action appliquée à la mesure où le passage
    commence (puis au passage suivant, sur la grille obtenue) en remet d'aplomb
    (mesures en place, premiers temps ≥ 97 %, temps ≥ 97 %, aucun saut) :

    | | laissés faux | « Corriger » | « Réanalyser » |
    |---|---|---|---|
    | réglage, premiers temps nets | 55 | 44 | 1 |
    | réglage, faibles | 209 | 169 | 1 |
    | réglage, perdus pendant le passage | 28 | 25 | 0 |
    | mis de côté, nets | 102 | 59 | 4 |
    | mis de côté, faibles | 436 | 277 | 2 |
    | mis de côté, perdus | 83 | 75 | 0 |

    Soit 649 sur 913 pour « Corriger » (771 sur 1 005 en version 4, avec l'autre
    suivi), 8 pour « Réanalyser » : sur les mêmes sorties du réseau, l'analyse
    refaite depuis la mesure trouve presque toujours la même chose que l'analyse
    entière ; elle ne peut aider que là où ce qui précède a trompé l'analyse (la
    métrique, la phase des mesures), et c'est rare sur le banc. Aucun temps avant
    la mesure n'a bougé dans aucun cas. Sur les deux cas réels du propriétaire
    (sorties de l'app, `tempoFix.app.test.ts`) : *So What* vieux disque,
    « Corriger » à la mesure 8 de la grille de la version 4 : sauts 4 → 0 dans la
    musique, temps trouvés 92,3 → 94,9 %, 258 temps pour 256 ; *Blues for Bird*,
    à la mesure 2 : sauts 2 → 0, 338 temps pour 336, premiers temps 97,6 →
    100 %. Dans l'app, la grille en place va jusqu'à la fin du fichier (la carte
    de tempo prolonge le dernier tempo) : le suivi y continue dans le bruit de fin
    de disque, d'où des temps en plus après la musique (425 segments au lieu de
    336 sur *Blues for Bird*, dont 338 dans la musique) ; ils sont au tempo tenu.
    Sur les négatifs (rubato, ritardando, dérive, points d'orgue), « Réanalyser »
    ne change rien ; « Corriger » efface par construction un vrai changement de
    tempo après la mesure, et suit mal une dérive de plus de 20 % (accelerando
    90 → 130) : c'est l'entrée à ne pas utiliser là.
  - *Tests* : `engine/tempoFix.test.ts` (jeu de cas, composition, rubato et vrai
    changement), `store/tempoFix.test.ts` (correction gardée par une nouvelle
    analyse, annulations, document), `project/projectFile.test.ts` (aller-retour
    `.fab`), `chart/gesture.test.ts` (appui long), et dans Chromium
    `npm run test:tempo-fix` (vrai analyseur sur le morceau d'essai, profil
    persistant : passage planté à la moitié du tempo, clic droit, les deux
    actions, la courbe, rechargement, annulation, grille d'accords, clavier,
    téléphone).
- **Reste à faire** : décider de l'hébergement des conversions ONNX (copie sous un
  compte du projet, voir PASSATION) ; mesurer la mémoire sur iPhone et, si besoin,
  rogner (tranches plus courtes pour le réseau de temps, au prix d'un autre
  résultat) ; un réglage avancé pour le grand réseau de temps ; les extensions
  d'accord et la basse restent des suggestions (peu fiables, mesuré).

##### Preuves de structure : reprises, grille connue, fiabilité (`engine/{evidence,repeats,knownChart,reliability}.ts`)

Les moyens 2 et 3 du programme « accords » (CLAUDE.md, analyse) et le calcul de
fiabilité qui les réunit. Fonctions **pures**, pas encore branchées dans
`pipeline.ts` ni dans le worker (ce sera fait à l'intégration) ; mesurées sur le banc
(`web/spikes/accords/resultats/structure.md`).

- **Le contrat commun** (`evidence.ts`). Chaque source donne, par temps, une
  distribution (en log) sur les 169 classes d'accords et un **poids** ; on l'ajoute à
  ce que le réseau a entendu : `logp' = log softmax(logp_réseau + Σ poids × L_source)`.
  Un poids nul ne change rien ; une source ne remplace jamais le réseau : là où il
  est sûr, elle le déplace à peine ; là où il hésite, elle décide. `applyEvidence`
  fait la somme et rend des `PooledUnit` que `decodeChords` prend tels quels. Les
  instruments séparés et la basse (l'autre chantier) entreront de la même façon.
- **Reprises** (`repeats.ts`, `findRepeats(units, numbers)`). Chaque mesure est
  décrite par ce que le réseau entend à chaque temps, ramené à fondamentale ×
  famille (un maj7 joué en 6, une 9 ajoutée à la reprise restent « pareils ») ;
  similarité de toutes les paires de mesures, mesurée depuis le fond propre au
  morceau. Pour chaque décalage (en mesures), la similarité moyenne : la forme
  ressort comme un **pic** au-dessus des décalages voisins (12 pour un blues, 32
  pour un AABA, 8 à l'intérieur) ; un vamp ou une simple décroissance n'en font pas.
  Deux mesures à un décalage retenu (ou un multiple de la forme, ± 1 mesure pour un
  temps perdu ou ajouté) sont **partenaires** quand leurs **voisines** se
  ressemblent (la mesure elle-même est laissée de côté : une mesure mal entendue
  reçoit quand même l'aide des autres grilles ; une introduction, une coda, un tag
  n'en reçoivent pas). Chaque temps reçoit le **mélange** de sa propre lecture et de
  celle de ses partenaires au même temps de la mesure : comme sa propre lecture en
  fait partie, une mesure **réharmonisée qui s'entend clairement garde son accord**
  (la pénalité de désaccord est bornée par log(1 + partenaires)) ; une mesure qui
  hésite suit les autres grilles. Pas de forme (une seule grille, morceau sans
  reprise, moins de 6 décalages mesurables : GuitarSet) → aucun effet. Rend aussi la
  longueur de forme, les débuts de grille et, par mesure, les partenaires.
- **Grille connue** (`knownChart.ts`). `findChartCandidates(index, titre)` (titres
  bruités, sur l'index de `standards/match.ts`) ; plusieurs grilles d'un même
  morceau sont toutes candidates, l'ajustement choisit. `fitKnownChart(units,
  numbers, bpb, tonalité, candidates, options, références)` aligne la grille, vue
  comme une boucle de sa forme, sur les temps de l'enregistrement : **transposition**
  (12), **échelle** (1 temps enregistré par temps de grille ; 2 : temps trouvés deux
  fois plus vite, jeu en double ; ½), **décalage** (n'importe quel temps : intro de
  toute longueur, premier temps mal placé). Score : moyenne du log de la probabilité
  (fondamentale × famille) de l'accord de la grille, plus un petit a priori pour la
  tonalité détectée (a priori seulement : elle est fausse sur un tiers des morceaux
  de synthèse). Coût F² par transposition et par échelle (F temps dans la forme),
  quelle que soit la durée du morceau. **Vérification** : la grille doit faire
  nettement mieux que **d'autres morceaux** sur ce même enregistrement
  (`referenceCharts` : 60 grilles réparties dans les recueils, chacune à sa meilleure
  position ; seuil 2,5 écarts-types), se détacher de ses autres positions et être
  d'accord avec le réseau sur au moins un quart des temps ; sinon elle est
  **refusée** (une mauvaise grille est pire que rien). Le décalage global peut ne pas
  tenir partout (un temps perdu ou ajouté par la grille des temps, des sections
  jouées dans un autre ordre, un tag) : **alignement par morceaux**, par mesure l'un
  des 6 meilleurs décalages ou « aucun », par Viterbi avec un coût de 12 nats pour
  changer (seul un changement qui tient quelques mesures est pris) ; les premières
  et dernières mesures en désaccord sont une intro, une coda. Acceptée, elle donne
  par temps une distribution centrée sur son accord (la moitié sur l'accord, 30 % sur
  ses autres couleurs, 5 % sur la substitution tritonique d'une dominante ; la part
  de l'accord exact est multipliée par la part des temps où, fondamentale et famille
  d'accord, la couleur de la grille est aussi celle qu'entend le réseau : une grille
  qui écrit des 7 là où l'orchestre joue des accords parfaits ne prête que ses
  fondamentales) avec un poids
  = 4 × accord local × (1 − meilleure probabilité du réseau) : il grandit où le
  réseau doute et s'efface où il est sûr ; l'accord local (mesures voisines, la
  mesure elle-même exclue) l'éteint dans une intro, une coda ou une grille jouée
  librement. Rend aussi l'**alignement** (mesure de la forme, grille, lettre de
  section de chaque mesure enregistrée), la tonalité qu'elle implique (décoder dans
  cette tonalité quand la grille est acceptée aide : mesuré) et, par temps, son
  accord. Les recueils ne sont jamais dans le dépôt : les tests utilisent de
  minuscules grilles écrites à la main.
- **Fiabilité** (`reliability.ts`). `reliabilityFeatures(segments, unitsDuRéseau,
  reprises, grille)` puis `reliability(f)` : probabilité que l'accord soit juste
  (fondamentale et couleur), modèle logistique réglé sur la moitié « dev » du banc
  et vérifié sur l'autre. Entrées : la confiance du réseau (moyenne géométrique,
  avant toute preuve de structure), le marginal du décodeur, la marge du réseau sur
  le second accord, l'accord des autres grilles, l'accord de la grille connue (pondéré
  par son accord local), la longueur du segment. Une source absente vaut 0. **Douteux
  = plus probablement faux que juste** (`RELIABILITY_DOUBT` = 0,5).
- **Comment le pipeline doit les appeler** (dans `chartFromGrid`, après
  `poolSegments` et la tonalité) : `rep = findRepeats(units, grid.numbers)` ; si le
  projet a un titre et que les recueils sont là, `fit = fitKnownChart(units,
  grid.numbers, grid.beatsPerBar, key, candidats, {}, références)` ; `adj =
  applyEvidence(units, [rep.source, ...(fit?.accepted ? [fit.source] : [])])` ; si la
  grille est acceptée et que la tonalité n'est pas celle de l'utilisateur,
  décoder dans `fit.key` ; `decodeChords(adj, …)` puis `buildSegments(adj, …)` ;
  enfin `confidence = reliability(f)`, `doubtful = confidence < RELIABILITY_DOUBT`
  avec `f = reliabilityFeatures(segments, units, rep, fit?.accepted ? fit : null)`.
  Le worker n'a pas les recueils : le fil principal (qui connaît le titre) lui passe
  le résultat de `chartsForAnalysis` (voir `src/standards/`). Une correction à la main
  reste intouchable (ces preuves ne servent qu'à l'analyse).

##### Modèle d'accords détaillé, au choix (`engine/tsumugi*.ts`, `chordModel.ts`)

Réglages → Réglages avancés → **Modèle d'accords** : « Rapide : CREMA » (par défaut)
ou « Détaillé : Tsumugi-Chords ». C'est une préférence de l'**appareil**
(`localStorage`, clé `fabtice.chordModel.v1`), jamais du projet. Le réglage dit
en clair le coût (plusieurs minutes par morceau, environ 2,5 Go de mémoire,
déconseillé sur téléphone, 68 Mo à télécharger une fois) et la licence des
poids (CC BY-NC 4.0, usage non commercial ; code MIT). Quand un morceau est
ouvert, changer de modèle propose « Analyser de nouveau ce morceau avec ce
modèle » : la grille, la tonalité et tous les accords écrits à la main sont
gardés (règle de toujours, testée dans `chordModel.test.ts`).

- **Fichiers.** Les poids sont ceux de l'auteur, intacts
  (`chord-model.safetensors`, Hugging Face `anime-song/Tsumugi-Chords` à une
  révision figée, 67 647 992 octets, SHA-256 vérifiée), téléchargés par le chemin
  habituel (`models/download.ts` : reprise par morceaux, vérification, gardés sur
  l'appareil), seulement quand ce modèle est choisi. Le graphe ONNX **sans aucun
  poids** (1,36 Mo) est livré avec l'app (`assets/tsumugi-chords.graph.onnx`,
  provenance et empreinte dans `assets/README.md`) et vérifié avant usage ; il lit
  le fichier de l'auteur comme « données externes » d'onnxruntime-web. Il se
  refait à l'identique par `web/spikes/accords/modeles/build_graph.py`.
- **Déroulé (worker).** Tout se passe d'abord comme avec CREMA (temps, mesures,
  CREMA, tonalité). Puis le modèle détaillé écoute le morceau **en stéréo**
  (le fil principal lui donne les deux voies ; un morceau mono est donné sur les
  deux), rééchantillonné à 25,6 kHz (`tsumugiFeatures.ts#resampleTo25600`), en
  fenêtres de 30 s dont il garde les 20 s du milieu, avec les temps, premiers
  temps et la tonalité que l'analyse vient de trouver (ou ceux de l'utilisateur).
  Progression : le worker ne signale qu'une fenêtre terminée ; `windowClock.ts`
  (pur, testé) estime l'avance dans la fenêtre en cours à partir de la durée des
  fenêtres précédentes (la première : la durée mesurée par l'analyse précédente de
  la session, sinon 45 s par défaut, corrigée dès qu'une fenêtre est finie), sans
  jamais reculer ni atteindre la fenêtre suivante avant son signal. `fabtice.ts`
  en tire la fraction continue et `chordWindow.fraction`. Texte : « Accords :
  écoute fine, 37 % » dans la barre du haut, et dans le panneau « … 37 % ·
  fenêtre 3 sur 12 » (le décompte en information secondaire) ;
  l'annulation est lue entre deux fenêtres ; la session est libérée à la fin.
  Ses 745 classes sont ramenées aux 169 accords de l'app (`tsumugiVocab.ts`,
  généré par `gen_tsumugi_vocab.py`, le même repli que sur le banc), avec ses
  propres notes et sa basse, en `ChordFrames` à 25 images/s, `timeScale` 1 ; la
  suite (`resultFromOutputs` : basse dans le grave, reprises, grille connue,
  fiabilité) est inchangée. Le résultat note le modèle (`analyser.models`
  contient `tsumugi-chords`, et `chordModel: { id }`). Les sorties gardées pour
  « garder ma grille » ne servent que si elles viennent du même modèle.
- **Repli.** Poids introuvables, session impossible à créer, mémoire épuisée :
  les accords de CREMA (déjà calculés) sont gardés pour cette analyse,
  `chordModel: { id: 'crema-chords', fallback }`, et la barre du haut le dit
  calmement (« Accords lus par le modèle par défaut », le panneau dit pourquoi).
  `?echec-accords=memoire|session` provoque ces pannes pour les essais.
- **Mesures du banc** (`web/spikes/accords/`, variante `app-fin`, qui passe par les
  mêmes fonctions que le worker), couleur par temps, grille détectée, 22 morceaux
  : synthèse propre 67 → 88 %, vieux disque de synthèse 55 → 79 % (contrôle seul :
  52 → 83 %), GuitarSet 84 → 79 %, GuitarSet façon vieux disque 77 → 86 %. Le
  signal « douteux » garde son sens avec les mêmes coefficients (un accord
  douteux est faux 53 à 63 % du temps sur le contrôle) mais en signale moins
  (moins d'erreurs, et des probabilités plus tranchées) : pas de second jeu de
  coefficients pour l'instant.
- **Coût mesuré ici** (4 cœurs chargés par d'autres travaux, Chromium,
  onnxruntime-web WASM, 4 fils) : le morceau de démonstration (37,6 s, 2 fenêtres)
  en 70 à 75 s, dont environ 30 s par fenêtre ; mémoire de tous les processus du
  navigateur : de 1,36 Go au repos à 2,8–3,3 Go au pic. Pour 4 minutes (12
  fenêtres) : environ 6 min avec 4 fils, 11 min avec un seul (mesuré sous Node,
  `web/spikes/accords/modeles/ts/wasm-song.ts`). Vérification dans Chromium :
  `FABTICE_ANALYSIS_ONLY=fin npm run test:analysis` (hors de la liste par défaut).
  Dans l'app Mac (Electron sous `xvfb-run`, même machine) : 50 s pour le morceau de
  démonstration téléchargement compris, 71 s une autre fois (machine plus
  chargée) ; mémoire de tous les processus de l'app : 1,7 Go au repos, 3,0 à
  3,3 Go au pic. Essai : `FABTICE_E2E_ANALYSIS_FINE=1 xvfb-run -a node --test
  test/e2e/analysis-fine.test.js` dans `desktop/` (non bloquant).

#### Grille d'accords — `src/chart/`

Tout est en place : la feuille fidèle à la maquette, et ce qu'un musicien fait
dessus. Les parties pures sont testées dans Node (Vitest), le reste dans
Chromium (`npm run test:chart`).

**Fichiers.**

| Fichier | Rôle |
|---|---|
| `layout.ts`, `edits.ts` | mise en page et corrections pures (accords en vigueur, mesures, répétition « 𝄎 », sections et doubles barres, lignes de quatre mesures ; réécriture d'une mesure entière, retour à l'analyse, `hasBarEdit`, `mergedEntries`, `movableBeats` et `withChordMoved` : mettre un accord sur un autre temps) |
| `fit.ts`, `useFitChords.ts` | la place et la taille des accords : chaque accord est écrit **à la place de son temps** ; **une seule taille pour toute la grille** : un symbole tardif est repoussé contre la barre de fin, puis deux rangées à la même taille, et seulement en dernier recours toute la grille descend d'un palier (`FIT_RATIOS`) ; fonctions pures testées, et le crochet qui mesure l'écran |
| `ChartSheet.tsx` | la feuille : en-tête (titre, tonalité, métrique, tempo, choix Ut / Si♭ / Mi♭) et états vide, « analyse en cours », échec, aucun accord |
| `ChartGrid.tsx` | les mesures et tout ce qui se fait dessus : gestes, clavier, suivi, éditeur |
| `gesture.ts` | les gestes de la souris et du doigt comme une petite machine à états pure (clic, glisser, appui long) |
| `hit.ts` | quelle mesure est sous un point, même dans l'espace entre deux lignes ou au-delà de la dernière ; sélection d'une mesure à l'autre, dans les deux sens |
| `useChartGestures.ts` | branche les événements du pointeur sur `gesture.ts` et en applique les effets (`seek`, `setLoopRegion(loopFromBars(…))`, `enterLoop()`) ; défilement automatique en bord de feuille pendant un glisser |
| `stops.ts` | les arrêts du clavier (chaque accord, et la zone d'accord d'une mesure sans accord) et les déplacements aux flèches |
| `editor.ts`, `editorPlacement.ts`, `ChordEditor.tsx` | l'état de l'éditeur, ce qu'un clic change à un accord (`patchChord`), la place de la fenêtre (fonction pure), la fenêtre elle-même |
| `KeyEditor.tsx` | la correction de la tonalité depuis « Tonalité de … » |
| `useFollowLine.ts` | « Suivre la tête de lecture » sur la feuille |
| `print.ts`, `../styles/print.css`, `../components/PrintDialog.tsx` | « Imprimer la grille » : la fenêtre (orientation, taille), l'impression du navigateur, le PDF de l'app Mac |

**Gestes** (comme dans la frise des pistes) :

| Geste | Effet |
|---|---|
| clic sur une mesure (hors accord) | `seek()` au début de la mesure |
| clic sur un accord, ou sur la zone d'accord d'une mesure vide ou en répétition | ouvre l'éditeur d'accord ; la tête de lecture ne bouge pas |
| clic sur la lettre d'une section | ouvre l'éditeur sur le champ de la section |
| glisser à la souris sur des mesures (dans les deux sens, d'une ligne à l'autre ; on peut commencer sur un accord) | sélection **de mesures entières** en direct : `setLoopRegion(loopFromBars(…))` ; au relâchement `enterLoop()` ; la feuille défile seule quand on approche son bord haut ou bas |
| doigt : un tapotement | comme le clic (mesure : tête de lecture ; accord : éditeur) |
| doigt : glisser | fait défiler la feuille (le navigateur) ; rien n'est sélectionné |
| doigt : **appui long (0,42 s) puis glisser** | sélectionne : l'appui long prend la mesure sous le doigt (le voile de laiton dit que c'est pris), glisser prolonge, lever termine (`enterLoop()`) |
| clavier : flèches, Début, Fin | passent d'accord en accord (haut et bas : même colonne, ligne voisine) ; un seul arrêt avec Tab pour toute la feuille |
| clavier : Entrée | ouvre l'éditeur, curseur dans le champ de saisie |
| clavier : une lettre A–G ou N | ouvre l'éditeur avec la lettre dans le champ ; on tape le symbole (`Bbm7`, `F7b9`, `C-7`, `Ebmaj7`, `N.C.`), Entrée l'applique, ferme l'éditeur et passe à l'accord suivant |
| clavier : Échap | ferme l'éditeur ; le focus revient sur l'accord |

*Pourquoi l'appui long pour sélectionner au doigt.* Au doigt, glisser doit faire
défiler la feuille (c'est ce qu'on attend d'une page). Sélectionner par un
simple glisser ferait boucler des mesures à chaque défilement. L'appui long
est le geste que le système lui-même utilise pour « prendre » quelque chose ;
un tapotement est trop court (moins de 0,42 s) et un défilement bouge avant
(plus de 10 px) : aucun des deux ne peut le déclencher par erreur. Sur un
écran tactile, une ligne d'aide sous le titre le dit (`.aide-doigt`, affichée
seulement si `(pointer: coarse)`).

**L'éditeur d'accord** (`ChordEditor.tsx`) : une petite fenêtre accrochée à la
mesure. Sa place est choisie par une fonction pure (`editorPlacement.ts`, testée),
toujours avec la fenêtre entière et la mesure dans la partie visible de la feuille,
au-dessus du transport : sous la mesure, sinon au-dessus, sinon à côté (à droite
puis à gauche), sinon sous la mesure après avoir fait défiler la feuille ; en
dernier recours (fenêtre très basse, « Extension et basse » déplié), la fenêtre
reçoit une hauteur maximale et défile à l'intérieur, à côté de la mesure. Elle est
recalculée à l'ouverture, au changement de mesure, quand elle change de taille et
quand la fenêtre de l'app change de taille. Sur téléphone (moins de 760 px) un panneau qui
monte du bas de l'écran, la mesure restant visible au-dessus. Chaque choix
s'applique aussitôt (pas de bouton « Valider »), par les actions de
`store/harmonyActions.ts`. Champs, de haut en bas :

- *Mesure N*, les onglets 1, 2… quand la mesure a plusieurs accords, l'accord
  tel qu'écrit, la croix ;
- **Place dans la mesure** (quand la mesure a plusieurs accords, ou que cet accord ne commence pas au premier temps) : les temps 1, 2, 3, 4… de la mesure, celui de l'accord enfoncé ; un clic sur un autre temps y met l'accord (`moveChord`). Les temps d'un voisin, et ceux qui feraient passer l'accord devant ou derrière lui, sont grisés : les accords gardent leur ordre. C'est le geste pour mettre un deuxième accord sur le temps 3 (le milieu), 2 ou 4 ;
- si l'accord est douteux : « Fabtice hésite sur cet accord. », **« C'est le bon
  accord »** (`confirmBar`) et, s'il y en a, « Ou peut-être : » avec les autres
  lectures de l'analyse (`alternatives`) ;
- « Taper un accord : B♭m7, F7♭9… » : champ lu par `parseChord` (en tonalité et
  instrument **affichés**), `writeChordText` ; un symbole illisible reçoit une
  phrase calme et rien ne change ;
- **Note** : les douze notes, orthographiées pour la tonalité affichée ;
- **Nature de l'accord** : les seize qualités du modèle, écrites comme sur la
  grille (triangle pour le majeur 7, « m » ou « – » selon le réglage), sur la
  note choisie ;
- « Extension et basse » (replié) : les onze extensions (plusieurs possibles,
  dans l'ordre d'une grille) et la note de basse ;
- « Pas d'accord (N.C.) », « Deux accords dans la mesure » (`splitBar` : le deuxième accord est mis **sur le temps du milieu**, le temps 3 d'une mesure à quatre temps, le temps 2 à trois temps ; on le déplace ensuite avec « Place dans la mesure ») ou « Un
  seul accord pour la mesure » (`mergeBar`, garde l'accord choisi), « Retirer
  cet accord » (`removeChord`), « Revenir à l'analyse » (`resetBar`, seulement
  pour une mesure écrite à la main) ;
- **Lettre de section** : A, B, C, D, un nom libre (12 signes au plus : « Intro »,
  « Solo »…), « Retirer la lettre » (`setSection`).

Ce qui est tapé ou choisi est en tonalité et instrument **affichés** et gardé
en Ut dans la tonalité d'origine (`untransposeForStorage`,
`replaceDisplayedChord`, `setDisplayedKey`). Une mesure où l'accord continue
(signe de répétition) s'ouvre sur l'accord qui continue ; le premier choix en
fait un accord écrit. La mesure en cours de correction est cernée d'un filet
d'encre (jamais la braise).

**La tonalité** : le clic sur « Tonalité de … » ouvre une petite fenêtre
(majeur / mineur, douze notes, `setDisplayedKey`) et, quand elle a été corrigée,
« Revenir à la tonalité de l'analyse (…) » ; choisir à nouveau la tonalité
trouvée n'est pas une correction.

**Suivi** : `view.follow` est le réglage « Suivre la tête de lecture ». En
lecture la feuille défile en douceur (380 ms, sans animation si
`prefers-reduced-motion`) pour garder la ligne jouée et la suivante en vue
(`followTarget`). Elle ne lutte jamais : molette, doigt, touches ou barre de
défilement suspendent le suivi (et une grâce de 1,2 s), qui reprend quand la
ligne jouée est de nouveau visible, à la lecture suivante ou après un
déplacement fait sur la grille.

**Où s'écrit chaque accord** (`fit.ts`, `useFitChords.ts`, `styles/chart.css`) : à la
place de son temps, comme sur un Real Book. Dans une mesure à quatre temps, le temps 1 est à
la barre, le temps 3 au milieu, les temps 2 et 4 au quart et aux trois quarts ; à trois temps,
trois places ; les autres métriques en proportion. Un accord qui commence au milieu d'une
mesure dont l'accord précédent continue reste à son temps (comme avant). Chaque accord est un
bouton posé en `position: absolute`, sa place `--debut` = temps dans la mesure sur temps de la
mesure ; le signe de répétition et le style des accords douteux ne changent pas. Quand deux
symboles se rencontreraient ou qu'un symbole long dépasserait la barre de fin (« D♭7♯11 » au
temps 4), `useFitChords` mesure la largeur de chaque symbole (en em, une fois) et `fit.ts`
applique, à **une seule taille pour toute la grille** (écran et papier : jamais une taille par
mesure), ces règles dans l'ordre : 1. un accord qui dépasserait la barre de fin est **repoussé
vers la gauche** contre elle (et le précédent avec lui s'ils se touchent) ; un accord qui
toucherait le précédent glisse un peu à sa droite ; 2. si cela ne suffit pas, les accords de la
mesure passent sur **deux rangées à la même taille** (un en haut, un en bas, tour à tour) ;
3. seulement si une mesure ne tient pas même ainsi, toute la grille descend d'un palier
(30 px, puis 22, 17, 14, 11) jusqu'à ce que toutes tiennent ; `fitChart` dit quelle mesure a
décidé (`limitedBy`). Cause du rétrécissement observé (mesure 31 de l'essai du 15 novembre) :
l'ancien calcul ne savait que réduire la taille de la mesure ; un symbole long au temps 4
(45 px de place avant la barre de fin) la faisait passer à 11 px, alors que des mesures voisines
restaient à 30 px. Le décalage est écrit sur chaque accord (`--pousse`, `--pousse-p` pour le
papier, en 206e de mesure), la taille sur les mesures (`data-taille`, identique partout) et les
rangées sur celles qui en ont besoin (`data-rangs`) ; tout est recalculé à chaque changement de
largeur de la feuille, de polices ou d'accords, avant la peinture. Aucun accord ne se
chevauche ni ne sort de la mesure ; ce que `test:chart` vérifie sur le morceau de démonstration
et sur une grille d'essai (un à quatre accords, symboles longs de l'écoute fine aux temps 2 et 4,
basse en slash) à 1280, 960 et 390 px, et sur papier (portrait et paysage, sans outil externe).
Si rien ne tient au plus petit palier (symbole démesuré), il est pris : un accord n'est jamais
caché. Sur téléphone, une mesure de quatre longs symboles peut ainsi faire descendre toute la
grille d'un palier (c'est la règle 3, la dernière).

**Impression** (`print.ts`, `PrintDialog.tsx`, `styles/print.css`) :

- *Où la trouver.* Un bouton discret « Imprimer » (petite imprimante, encre douce) à droite du
  choix Ut / Si♭ / Mi♭, dans l'en-tête de la grille, et l'entrée « Imprimer la grille… » du menu
  « Exporter » (et du menu « ⋯ » du téléphone). Les deux ouvrent la même petite fenêtre.
- *La fenêtre « Imprimer la grille ».* **Orientation** : portrait ou paysage. **Taille** : « Telle
  quelle » (autant de pages qu'il en faut) ou « Sur une page » (toutes les lignes sur une
  feuille, grisé avec une phrase si le morceau est trop long : plus de 12 lignes de quatre
  mesures en portrait, plus de 10 en paysage, pour que chaque ligne garde au moins 18 mm).
  Deux actions : « Imprimer… » (la fenêtre d'impression du système ou du navigateur) et
  « Enregistrer en PDF… ». Les choix sont gardés d'une fois à l'autre (`localStorage`, facultatif).
- *Dans l'app Mac.* `window.print()` ne marche pas dans Electron (la page cesse de répondre :
  c'est pourquoi l'entrée de menu « ne faisait rien »). « Imprimer… » passe par le pont
  (`printChart`, `webContents.print` : la fenêtre d'impression de macOS, avec l'orientation) et
  « Enregistrer en PDF… » par `saveChartPdf` (volet d'enregistrement du système, `printToPDF`,
  fichier écrit par le processus principal ; papier A4, ou US Letter dans une région qui
  l'emploie). Voir `desktop/README.md`.
- *Dans un navigateur.* « Imprimer… » ouvre la fenêtre d'impression du navigateur, et
  « Enregistrer en PDF… » fait la même chose : la fenêtre dit, en une phrase, de choisir
  « Enregistrer au format PDF » à la place de l'imprimante. L'orientation est écrite dans une
  règle `@page { size: portrait | landscape }` (Chrome, Edge, Firefox la suivent ; Safari
  laisse le choix à sa fenêtre).
- *La feuille.* Titre, tonalité telle qu'affichée, « pour instrument en Ut / Si♭ / Mi♭ »
  (toujours, y compris en Ut, sur papier seulement : `.papier-seul`), métrique, tempo, lettres de
  section, accords dans la même typographie, quatre mesures par ligne, saut de page seulement
  entre deux lignes (`break-inside: avoid`) ; ni voile de boucle, ni filet de la mesure en
  cours, ni style « douteux », ni barre du haut, transport, éditeur ni bouton d'impression.
  Une mesure y est dessinée comme sur un ordinateur (206 unités de large, un accord de 30
  unités) puis mise à l'échelle de la largeur de la page (`container-type: inline-size`, l'unité
  est un 206e de mesure) : les mêmes paliers (`data-taille-p`, `data-rangs-p`) valent donc pour
  toutes les feuilles, en portrait comme en paysage. « Sur une page » donne à chaque ligne
  `min(24 mm, (100vh − 24 mm) / lignes)` (`100vh` est la hauteur de la zone imprimable quand on
  imprime). Les marges sont dans `@page`, le format du papier est celui du système ou du
  navigateur.
- *Tests.* `test:chart` imprime en PDF dans les deux orientations (A4 et Letter : taille de la
  page, une page pour 25 bars, texte, instrument, rien de l'app), un morceau de 48 mesures (deux
  pages « telle quelle », une page « sur une page » en portrait, grisé en paysage), un de 32
  mesures (une page en paysage), la place des accords sur papier à la largeur de chaque page,
  et la fin des pages sur des lignes entières. `desktop/test/e2e/chart-pdf.test.js` fait le
  PDF de l'app (voir `desktop/README.md`). Le PDF liste deux fois ♭ et ♯ (ils sont tracés avec
  un contour, `.alt` dans `chords.css`) : c'est un effet de la couche de texte, pas du dessin.

**Coutures encore utiles** : chaque mesure porte `data-mesure` (indice), chaque
accord `data-accord` et `data-stop` (`mesure:rang`, -1 pour la zone d'accord
d'une mesure sans accord) ; la boucle d'animation ne passe jamais par React
(`usePlayheadBar`, `useFollowLine`).

**Ce qui manque** : pas d'annulation d'une série de corrections (seulement
« Revenir à l'analyse » mesure par mesure et `resetChordCorrections`) ; pas de
copie d'une mesure ni de plusieurs mesures à la fois ; pas de poignées pour
ajuster les bords de la boucle (la frise des pistes les a ; la grille d'accords
garde sa sélection par mesures entières) ; pas
d'en-tête ni de numéro de page à l'impression ; une mesure de trois accords ou
plus se corrige accord par accord (onglets) mais ne se découpe pas davantage.

#### Frise du temps — `src/timeline/`

- **Fait** : le rang « Accords » de la règle et la courbe de tempo mesure par
  mesure (détail dans « Frise du temps » plus bas). Le rang existe quand
  `selectHasChords(state)` est vrai ; `rulerRows({ hasChords })` donne les
  hauteurs à la colonne des en-têtes (`components/RulerHeads.tsx`) comme à la
  frise, si bien que rien ne bouge quand une analyse se termine et que le rang
  apparaît.
- **Boucles** : voir « Boucles qui ne sont pas des mesures entières » (frise du
  temps, plus bas).
- **Temps analysés** : `barLines`, `subGridLines`, `snapTime`, `loopFromBars`,
  `barsOfRange`, `metronomeClicks` donnent les bonnes lignes sur une carte
  variable ; `test:timeline` le vérifie sur `?demo` (lignes de mesure sur les
  temps analysés, clic calé sur un temps analysé, sélection de mesures dans le
  rang des accords). Seule correction faite dans la frise : l'échelle du
  téléphone (86 px par mesure) part du tempo nominal de la carte, non du tempo
  de son premier temps.

#### Export iReal Pro — `src/export/`

- **Fait** : `chartForExport(state)` rend une représentation pure de la grille
  (`ExportChart` : titre, tonalité écrite, métrique, tempo, mesures avec section,
  double barre, changement de métrique, accords au temps près, répétition,
  dernière mesure), en Ut **dans la tonalité jouée** (transposition du transport
  appliquée ; l'instrument non : iReal Pro transpose lui-même).
  `exportToIRealPro(chart)` (pur) en fait le lien `irealb://` (et l'ancien lien
  `irealbook://`), la page HTML qui le porte (une phrase en français) et le nom
  du fichier (celui du morceau). `IREAL_EXPORT_READY` est vrai.
- **Le format** est décrit, avec ses sources (dépôts, licences), dans
  `src/export/IREAL-FORMAT.md` (en anglais) : champs du lien, mélange des 50
  caractères, cellules (une par temps), sections, mesures qui continuent
  (`x`, barres obliques `p`), N.C., vocabulaire d'accords et ce qu'iReal Pro ne
  sait pas écrire (l'approximation choisie, dite). À lire avant de toucher au
  codage.
- **Fichiers** : `ireal.ts` (champs, chaîne de la grille, mélange, lien, page),
  `irealChords.ts` (la table des qualités d'iReal Pro et la correspondance avec
  le vocabulaire de l'app : elle sert au codage et, dans les tests, au
  décodage), `export.css` (les entrées du menu), `chartExport.ts`.
- **Tests** : `ireal.test.ts` écrit des grilles et les relit avec un lecteur
  indépendant (`src/test/irealDecoder.ts` : son propre mélange, son propre
  découpage, une grammaire des qualités plutôt que la table) : le morceau de
  démonstration, 2/4 à 7/4, deux et quatre accords par mesure, levée, N.C.,
  répétitions, changement de métrique, 300 mesures, des grilles de toutes les
  tailles autour des 50 caractères du mélange, chaque qualité avec chaque
  extension, des titres étranges. `ireal.reference.test.ts` relit les mêmes liens
  avec des lecteurs publiés, **sans les ajouter à l'app** : il ne fait rien
  tant qu'on ne lui indique pas où ils sont (voir son en-tête :
  `IREAL_REFERENCE_DIR`, `IREAL_REFERENCE_PYTHON`) ; `npm test` le saute.
- **Remise à l'utilisateur** : « Grille pour iReal Pro » est un **lien normal** vers
  la page enregistrée sous le nom du morceau (le navigateur l'enregistre ; dans
  l'app Mac c'est un vrai téléchargement). Dans l'app Mac, « Ouvrir dans iReal Pro »
  s'y ajoute : `window.fabtice.openInIRealPro(lien)`, typée dans
  `platform/desktopBridge.ts` (facultative : une app Mac plus ancienne ne l'a
  pas). Elle n'accepte que `irealb://` et 200 000 caractères au plus
  (`desktop/src/ireal-link.js`).
- **Reste à faire** : rien pour l'export lui-même. Seul le propriétaire peut
  dire comment son iReal Pro importe le fichier (voir « ce qu'il reste à
  vérifier » dans `IREAL-FORMAT.md`) ; les répétitions et les fins numérotées
  ne sont pas écrites (la grille n'en a pas).

#### Le menu « Exporter » et les panneaux

« Exporter » est un petit menu (`components/ExportMenu.tsx`) : « Grille pour
iReal Pro » (un lien vers le fichier ; « Ouvrir dans iReal Pro » en plus dans l'app
Mac), « Imprimer la grille… » (ouvre la petite fenêtre d'impression, voir plus haut), « Le son : mélange,
pistes ou boucle… » (lot 3 : ouvre « Exporter le son »). Sur téléphone la barre du haut n'a pas la place du menu : ses
entrées sont reprises dans le menu « ⋯ » (`SettingsPopover`, `ExportItems`). Le
panneau « Tempo et mesures » (`components/GridPanel.tsx`) garde la
saisie du lot 1 et gagne : tempo ÷ 2 et × 2, premier temps un temps plus tôt ou
plus tard (de part et d'autre de « Premier temps ici »), l'origine de la grille,
« Revenir à l'analyse », « Analyser de nouveau ». Le panneau de l'accord fin
(Tonalité) dit à quel La l'enregistrement est accordé et propose « Ramener à
440 » (les cents du transport) ou « Laisser tel quel ». Le transport écrit la
tonalité comme la maquette : « A♭ · original », « A♭ → D♭ ».

### Moteur audio — `src/audio/AudioEngine.ts`

Interface `AudioEngine` : `loadTracks`, `addTrack`, `removeTrack`, `clear`,
`setRenderedTracks` et `isRenderedInUse` (lot 3, « Appliquer » : voir « Rendu hors
ligne et « Appliquer » » plus haut),
`play` (à appeler dans le geste de l'utilisateur la première fois), `pause`,
`seek`, `getPosition` (position **entendue**, appelée à chaque image : sans
allocation), `getDuration`, `setLoop`, `setTransposition(demi-tons, cents)`,
`setTempoRatio`, `setTrackMix`, `setMetronome`, `setClickTrack` (temps et sons
des clics, calculés par `grid/metronome.ts#metronomeClickTrack` depuis le lot 4),
`setMetronomeVolume`, `setAcceleration`, `restartAcceleration`,
`getMetronomeStatus` et `play({ countIn })` (lot 4 : voir « Lot 4 : métronome
avancé et repères » plus haut), `on('state' | 'ended' | 'error')`, `dispose`. Pistes à 48 kHz (`ENGINE_SAMPLE_RATE`), données soit par
`pcm` (la forme 16 bits du registre, utilisée telle quelle, sans copie : c'est ce
que l'app passe depuis le lot 3), soit par `channels` (Float32 par canal,
converti une fois : tests).

`MockEngine` l'implémente avec une horloge (aucun son) : avancée au rapport de
tempo, boucle, arrêt en fin de morceau, et `snapshot()` pour vérifier ce qu'il
a reçu. `createAudioEngine()` (`src/audio/index.ts`) renvoie le **vrai moteur**
(`WorkletEngine`) dans un navigateur, le moteur factice avec `?moteur=factice`
et hors navigateur (tests Node). Un navigateur qui ne peut pas faire tourner le
vrai moteur (pas d'AudioWorklet, pas d'isolation COOP/COEP donc pas de
`SharedArrayBuffer`) ne retombe **jamais** en silence sur le factice :
`loadTracks()` rejette, l'état passe à `error` avec le code `unsupported`
(texte prévu : `engine.errorUnsupported`, à brancher dans `Transport.tsx`).

#### Le vrai moteur (`WorkletEngine`)

- **Un seul AudioWorklet pour toutes les pistes** (`worklet/processor.ts`),
  moteur d'étirement **Signalsmith Stretch** seul (version sans SIMD, mesurée
  comme la bonne) : c'est la préécoute en direct. Rubber Band (rendu
  « Appliquer » et export) est **hors de ce moteur**, dans des workers ; ce moteur
  sait en revanche **jouer le rendu tel quel** (lot 3 : voir « Rendu hors ligne et
  « Appliquer » » plus haut, `setRenderedTracks`).
- **Contexte forcé à 48 kHz** (`ENGINE_SAMPLE_RATE`) quel que soit le réglage de
  la machine ; créé par le premier `loadTracks()`, **repris à l'intérieur de
  `play()`**, appelé de façon synchrone avant tout `await` : `play()` doit donc
  partir du geste de l'utilisateur. Voir « Cycle de vie de la sortie audio »
  juste après.
- **Cycle de vie de la sortie audio** (retours du 15 novembre : sur le Mac Intel
  du propriétaire, le son de tout le Mac s'est bloqué après que Fabtice était
  resté ouvert longtemps sans jouer). Le moteur ne garde la sortie que lorsqu'il
  s'en sert :
  - après une pause (ou la fin du morceau), le contexte est mis en **sommeil**
    au bout de 0,4 s ; un contexte qui se met à tourner sans lecture (l'app Mac
    autorise la lecture automatique : il démarre seul à sa création) y est
    renvoyé aussi ;
  - après **45 s sans lecture** (`IDLE_RELEASE_MS`), il est **fermé**
    (`close()`, pas seulement `suspend()` : c'est le seul moyen sûr de rendre le
    flux CoreAudio au système ; avec la suspension seule, Chromium peut garder
    le flux ouvert côté service audio) ;
  - `releaseDevice(raison)` fait la même chose tout de suite, en mettant en
    pause si besoin (fondu de 8 ms entendu avant la fermeture).
    `audio/deviceLifecycle.ts` l'appelle quand le Mac se met en veille ou en
    sort (`powerMonitor` de l'app Mac, par le pont : `onPower`), quand l'écran
    est verrouillé sans lecture, quand les périphériques audio changent
    (`devicechange`, une seule fois par rafale ; la lecture en cours est mise
    en pause, comme le font les lecteurs du Mac quand on débranche un casque ;
    elle ne repart pas seule), quand la page est masquée sans lecture
    (`visibilitychange`) et quand elle est quittée (`pagehide`). La version
    web a donc le même comportement, sans les événements de veille ;
  - le `play()` suivant crée un nouveau contexte **dans le geste**, recharge le
    worklet et le wasm (en cache : rien n'est retéléchargé) et lui redonne
    tout : pistes (les mêmes blocs partagés, sans copie), rendu « Appliquer »,
    mélange, boucle, tonalité, tempo, clics et volume du métronome, étape et
    passages de l'accélération, position. Mesuré ici (`test:engine`, section
    23, deux passages) : premier son 230 à 275 ms après l'appui contre 175 ms quand le
    contexte n'était que suspendu, soit **50 à 100 ms de plus** selon la charge ;
  - **reprise seule, une fois** : si le contexte ne démarre pas (`resume()`
    rejeté, état autre que `running`, rien au bout de 8 s), il est jeté et
    refait une fois ; pendant la lecture, un chien de garde vérifie que le
    worklet publie sa position (au moins toutes les 2,5 s), sinon le moteur est
    refait et la lecture repart où elle était entendue ; un contexte fermé ou
    interrompu par le système ramène le moteur à `ready` et rend la sortie. Un
    deuxième échec (ou une deuxième panne dans la minute) n'est pas réessayé :
    la sortie est rendue, le moteur passe en `error` (`context` ou `runtime`)
    et l'interface affiche `engine.errorDevice` ; « Lecture » reste offert et
    un nouvel appui est un nouvel essai. Jamais de boucle d'essais ;
  - **journal audio** (`audio/journal.ts`) : les 200 derniers événements datés
    (contexte ouvert avec sa fréquence et sa latence de base, fermé et
    pourquoi, états imposés par le système, veilles, changements de
    périphériques — le nombre de sorties seulement, jamais leurs noms, qui
    peuvent contenir celui d'une personne —, échecs, chien de garde,
    reprises) et la dernière lecture réussie à part. Dans l'app Mac, chaque
    événement part au processus principal, qui le garde avec les siens après
    un redémarrage (Aide → Diagnostic…) ; dans la version web il est gardé
    dans ce navigateur et se copie depuis les réglages avancés (« Copier le
    journal audio »). `?debug` : `window.__fabtice.audioJournal`.
  - Aides de test hors contrat : `deviceState()`, `setIdleReleaseDelay(ms)`,
    `debugFailResumes(n)`, `debugStall()`.
- **Mémoire** (conception du prototype) : pistes en blocs de 16 bits de 32 768
  images dans des `SharedArrayBuffer`, pistes mono (canaux identiques à un pas
  de 16 bits près) stockées une seule fois. Un morceau stéréo de 5 minutes
  pèse environ 58 Mo par piste ; depuis le lot 3 ce sont **les blocs du
  registre eux-mêmes** (`audio/pcm.ts`), plus de copie Float32 à côté. S'y
  ajoutent les instances Signalsmith (environ 6 Mo de mémoire wasm par piste).
- **Boucle** : repli côté entrée avec fondu enchaîné de 20 ms ; l'étireur voit
  un signal continu (pas de clic, pas de dérive). Hors de la boucle (après un
  déplacement au-delà de sa fin), la lecture va jusqu'à la fin du morceau.
- **Métronome** : les clics viennent de `setClickTrack()` (temps source) ; ils
  ne sont pas étirés, et sont posés en sortie en tenant compte du retard du
  moteur (environ 150 ms, fixe, donc toutes les pistes transposées ou non
  restent alignées avec les clics).
- **Position** : `getPosition()` lit un bloc partagé que le worklet écrit à
  chaque quantum (128 images) : position **entendue** (retard du moteur et du
  limiteur retirés), prolongée jusqu'à l'image courante d'après l'horloge audio.
  Aucune allocation, aucun message. Après un déplacement ou un démarrage elle
  montre la cible tout de suite, puis avance (jamais en arrière). Hors lecture,
  c'est la position mémorisée côté page.
- **Limiteur de sécurité** sur le mélange : retard de 2 ms, signal intact (gain
  exactement 1) sous environ −1 dBFS (0,891), baisse de gain progressive,
  anticipée, au-dessus ; jamais d'écrêtage dur.
- **Pause** avec un fondu de 8 ms ; **fin de morceau** : événement `ended` une
  fois tout entendu, moteur `ready` à la fin ; `play()` repart de 0.
- Les pistes en sourdine ne sont pas calculées (la charge baisse).
- Hors contrat, utiles aux tests : `diagnostics()` (charge, pistes actives,
  modèle de retard), `memoryBytes()`, `debugNode`, `debugContext`.

**Fichiers servis par la construction.** `assets.ts` importe le worklet avec
`?worker&url` (Vite le construit en un fichier autonome `assets/processor-*.js`,
sans `import`) et le wasm avec `?url` (`assets/signalsmith-nosimd-*.wasm`),
tous deux relatifs au module (donc valables avec la base `./` de l'app Mac).
Le wasm est lu avec `fetch` puis ses **octets** sont postés au worklet : un
`WebAssembly.Module` ne peut pas être posté à un AudioWorklet dans Chromium.
Les textes des licences MIT de Signalsmith sont copiés dans `assets/`. Le
binaire a été compilé à partir de `web/spikes/lecteur/engines/src/signalsmith.cpp`
(voir `src/audio/wasm/SOURCES.md`) ; ne pas le recompiler sans nouvelles mesures.

**Tests.** `npm test` couvre le cœur dans Node avec le vrai wasm
(`worklet/*.test.ts`, `storage.test.ts`) ; `npm run test:engine` mesure le
moteur complet dans Chromium (enregistreur branché sur la sortie du worklet).

### App Mac — `src/platform/desktopBridge.ts`

Types exacts de `window.fabtice` tel que l'expose `desktop/src/preload.js`
(`systemInfo`, `ytdlpStatus`, `ytdlpCheck`, `ytdlpInstall`, `extract`,
`copyText`, `onYtdlpProgress`, `onExtractProgress`, et trois méthodes facultatives : `openInIRealPro`, qui
ouvre un lien `irealb://` avec le système, rien d'autre ; `printChart({ orientation })`, la fenêtre
d'impression du système ; `saveChartPdf({ orientation, title })`, le PDF de la grille, volet
d'enregistrement compris. Les deux dernières rendent `{ ok: true }` ou
`{ ok: false, reason: 'cancelled' | 'failed' }` ; une app Mac plus ancienne ne les a pas). `getDesktopBridge()`
renvoie l'objet dans l'app Mac, `null` sur le web. Pendant `extract`, le pont envoie
`{ phase: 'info' }` (recherche), `{ phase: 'prepare', meta }` (le téléchargement va
démarrer, rien à mesurer) puis `{ phase: 'download', percent, receivedBytes, totalBytes,
speedBps }` **seulement** quand yt-dlp a écrit une vraie ligne de progression (`percent`
est `null` si la taille totale est inconnue). `lastImportReport()` (facultatif) rend le
rapport du dernier import fait depuis l'interface, pour la fenêtre de diagnostic ; la fenêtre « Nouveau
morceau » n'affiche le champ de lien que s'il est présent. Si l'API de l'app
Mac change, changer ces types avec elle.

Étape 1 de la 1.0.0 (C5), le pont gagne, toujours facultatif (une app Mac plus
ancienne ne l'a pas : le web et elle retombent sur le téléchargement) : le
fichier du projet ouvert (`projectFileInfo`, `readCurrentProjectFile`,
`adoptProjectFile`, `adoptChosenProjectFile`, `recallProjectFile`,
`forgetProjectFile` : la page nomme le projet par son identifiant, jamais un
chemin), l'écriture sûre par morceaux (`beginProjectSave`, `writeProjectSave`,
`restartProjectSave`, `finishProjectSave`, `abortProjectSave`), l'état envoyé à
la fenêtre (`reportProjectState`) et la garde de fermeture (`onConfirmClose`,
`ackClose`, `answerClose`). Côté app Mac : `desktop/README.md`.

L'interface construite (`desktop/ui/`) charge des modules JavaScript et a
besoin de l'isolation (COOP/COEP) : l'app Mac doit la servir par un protocole
qui envoie ces en-têtes, pas par `file://`.

### Stockage du projet — `src/storage/`

Un seul projet à la fois (lot 1 ; confirmé au lot 4, les fichiers `.fab` servent à en garder d'autres) : le document du projet courant
(`ProjectDocument`, `model/document.ts`, produit par
`store/document.ts#toProjectDocument`), les **octets audio d'origine** (le mp3,
le m4a… tel qu'importé) et, depuis le lot 3, les **instruments séparés** en 16
bits (voir « Où restent les instruments séparés »). Le PCM décodé de l'original
n'est jamais gardé : il est recalculé à chaque ouverture, de façon déterministe. Les préférences de l'utilisateur
(notation, suivi, sous-grille, magnétisme) restent dans `localStorage`
(`store/preferences.ts`).

| Fichier | Rôle |
|---|---|
| `ProjectStorage.ts` | le contrat (`replaceCurrent`, `saveCurrent`, `loadCurrent`, `loadAudio`, `clearCurrent`, `requestPersistence`…, et pour les instruments séparés `saveTrackAudio`, `loadTrackAudio`, `deleteTrackAudio`, `pruneTrackAudio`, `trackAudioUsage`) et `StorageError` (`unavailable`, `quota`, `corrupt`, `io`) |
| `indexedDb.ts` | l'implémentation : base `fabtice` v2, quatre magasins, `project` (clé `current` : `{ schema, document }`), `audio` (une entrée par `AudioRef.id` : `{ bytes, mimeType, fileName }`), `pcm` et `pcmInfo` (les instruments séparés, lot 3). `replaceCurrent` réécrit les deux dans **une seule transaction** : en cas d'échec, l'ancien projet reste entier. Les transactions sont validées tout de suite (`commit()`), sinon une page qui se ferme perdrait l'écriture |
| `documentFormat.ts` | lecture sûre : version du document (`MIGRATIONS` : de 1, lot 1, à 2, lot 2, puis à 3, lot 3 ; une version **plus récente** est ignorée, jamais écrasée à la lecture), contrôle de la forme (sinon `corrupt`) ; `STORAGE_SCHEMA` pour l'enveloppe |
| `keeper.ts` | le gardien : `keepNewProject()` (à appeler quand un nouveau morceau est ouvert et jouable : demande le stockage persistant la première fois, écrit audio et document ensemble, remplace l'ancien projet) puis autosauvegarde de tout changement du document, **différée** (700 ms de calme, 5 s au plus pendant un geste continu), une écriture à la fois, jamais attendue par l'écran ; `flush()` à la fermeture (`pagehide`, onglet masqué). Rien n'est écrit pour un morceau dont l'audio n'est pas encore gardé, ni pour le morceau de démonstration. La file d'écritures **ne rejette jamais** (un travail qui échoue n'empoisonne pas les suivants) et une écriture qui ne répond pas au bout de 2 minutes est abandonnée avec l'avis habituel |
| `restore.ts` | lancement : « Ouverture de « titre »… » (la fenêtre n'apparaît que si cela dure plus de 250 ms) avec **l'étape en cours** (lecture du morceau gardé, préparation du son, mise en place des pistes), puis `restoreProject()` (mêmes identifiants de projet, de piste et d'audio). **Chaque étape a sa limite de temps généreuse** (`RESTORE_LIMITS` : document 20 s, lecture 60 s, décodage 3 min par piste, moteur 60 s) : une réouverture n'attend jamais indéfiniment. **Au moindre échec ou dépassement, le morceau gardé est CONSERVÉ** : la fenêtre « Nouveau morceau » s'ouvre avec une phrase calme et propose « Rouvrir « titre » » et, plus discret, « Oublier ce morceau » (confirmé par une seconde question). Un marqueur dans `localStorage` pendant la réouverture couvre une page tuée par le système (manque de mémoire sur téléphone) : au lancement suivant il n'y a **pas de nouvel essai automatique**, la même proposition s'affiche, jusqu'à ce que l'utilisateur choisisse. « Rouvrir » (`reopenKept`) ignore ce marqueur ; « Oublier » (`forgetKept`) supprime le document, l'audio et le marqueur. Un nouvel import réussi remplace le morceau gardé et retire la proposition (`ui.reopenOffer`) |
| `timeout.ts` | `withTimeout()` et `StepTimeout` : une limite de temps pour une étape qui pourrait ne jamais répondre |
| `memoryStorage.ts` | même contrat en mémoire, avec pannes simulées (tests) |

**Lire une grosse valeur.** Le navigateur garde à part les valeurs de plusieurs dizaines de ko
(un morceau entier) et peut les livrer **après** la fin de la transaction qui les a demandées. Une
lecture prend donc son résultat quand **sa propre requête** réussit (`onsuccess`), jamais à
`oncomplete` (lire `request.result` à ce moment-là lève une exception dans un gestionnaire
d'événement et la promesse ne se règle jamais : c'est ce qui empêchait un morceau gardé de
revenir). Les tests des quatre étages : `indexedDb.test.ts` (fausse base qui livre après la
transaction), les tests du bureau `desktop/test/e2e/real-size.test.js` (morceaux de plusieurs Mo,
fichier et lien) et `tests/import.mjs` (0,5, 6 et 32 Mo avec un **profil persistant** : un contexte
jetable garde sa base en mémoire, où les grosses valeurs ne sont jamais mises à part). Toute
nouvelle lecture ou écriture du stockage doit être essayée avec des données de taille réelle.

**Quand l'appareil refuse** (navigation privée, stockage bloqué ou plein),
l'app continue de fonctionner : `ui.storageNotice` (`'unavailable'` ou `'full'`)
affiche une phrase calme, une seule fois (`components/StorageNotice.tsx`), et
l'ancien projet gardé est lui aussi oublié pour ne pas être rouvert à tort.

**Ce que la version finale doit respecter.** Après un import, la mémoire ne
garde que le PCM décodé, une seule fois (environ 11 Mo par minute en stéréo 16
bits, dans `audio/registry.ts`, lu par la frise et partagé avec le moteur) : les octets d'origine
sont libérés dès qu'ils sont écrits dans IndexedDB. Un nouveau morceau remplace l'ancien seulement une fois ouvert et jouable
(`openImportedPiece` résolu). Toute nouvelle donnée du projet doit entrer dans
`ProjectDocument` (et `MIGRATIONS` si le format change), sinon elle n'est pas
gardée.

### Import — `src/import/`

`importFromFile(file, { onProgress, signal })` et `importFromLink(lien, pont,
{ onProgress, signal })` rendent un `ImportedPiece` (titre, source, octets
d'origine, audio décodé à 48 kHz, une ou deux voies) ou rejettent avec une
`ImportError` (code → message dans `i18n/fr.ts`, `import.error.<code>`).

- **Fichier** : mp3, wav, aiff, m4a, flac. Lecture par morceaux avec progression
  (`reading`), puis `decode.ts` (`decoding`) : l'audio est décodé par Web Audio sur
  un `OfflineAudioContext` à 48 kHz (aucun geste de l'utilisateur requis) ;
  l'AIFF (non lu par Chromium) passe par `aiff.ts` (AIFF et AIFF-C, 8, 16, 24 et
  32 bits, « sowt », flottants) et `resample.ts` (polyphase, fenêtre de Kaiser).
  Plus de deux voies : mixage 5.1 vers stéréo, sinon les deux premières. Le
  format se reconnaît aussi au contenu (`detect.ts`), qui lit la durée dans
  l'en-tête quand c'est possible pour refuser un morceau trop long **avant** de
  décoder.
- **Limites** (`limits.ts`) : 20 minutes (comme le lien) et 256 Mo par fichier ;
  au-delà, `too-long` et `too-large`. Un fichier vide ou sans son : `empty-audio` ;
  abîmé ou pas vraiment audio : `decode-failed`. Raison d'être de ces limites :
  stéréo 20 minutes = 460 Mo décodés, plus la copie du fichier.
- **Lien** (app Mac seulement, par `getDesktopBridge()`), dans cet ordre : état de
  l'outil (`ytdlpStatus`) ; s'il manque, installation avec progression et une
  phrase d'explication (`installing`) ; extraction (`fetching-info` : recherche du morceau ; `starting-download` :
  préparation du téléchargement, sans aucun chiffre ; puis `downloading` avec un vrai pourcentage, ou
  la quantité reçue quand la taille totale est inconnue) ; si la réponse est `needsYtdlp`, installation et
  **une** nouvelle tentative ; octets décodés comme un fichier. Les refus du pont
  (direct, plus de 20 minutes) montrent sa phrase française sous le message
  général ; les autres échecs n'affichent rien de technique. Rien ne change à la
  façon d'appeler yt-dlp : on n'appelle que le pont.
- **Une fenêtre qui dit vrai** (`components/NewPieceDialog.tsx`) : jamais de « 0 % »
  figé. Tant que rien ne se mesure (recherche du morceau, démarrage de l'outil, qui
  peut prendre une minute sur un vieux Mac), la jauge est indéterminée et aucun chiffre
  n'est affiché ; au premier vrai message de téléchargement, soit « NN % », soit
  « 12,4 Mo reçus » si la taille totale est inconnue (`import/amount.ts`). Après environ
  dix secondes sans aucune nouvelle (`QUIET_NOTE_DELAY_MS`), une phrase rassurante : « Sur
  certains Mac, cette étape peut durer une à deux minutes. Fabtice n'est pas bloqué. »
- **Annulation** : l'extraction et le téléchargement de l'outil ne peuvent pas
  être interrompus (le pont n'a pas de moyen de le faire). La fenêtre ne propose
  « Annuler » que pour la lecture et le décodage (`isCancellablePhase`), sinon elle
  dit « Cette étape ne peut pas être interrompue ». Un seul import à la fois : une
  seconde demande (y compris un fichier déposé) est ignorée.
- **Mise à jour de l'outil** : au lancement (`checkToolUpdate`), si `ytdlpCheck`
  signale une version plus récente d'un outil installé, la fenêtre « Nouveau
  morceau » propose discrètement « Mettre à jour » (`ui.toolUpdate`) ; jamais de
  fenêtre bloquante.
- **Après le décodage**, `controller.ts` ouvre le morceau (`openImportedPiece`, une
  piste « morceau ») puis le fait garder (`keepNewProject`).

### Frise du temps — `src/timeline/`

Tout ce qui se dessine le long du temps, dans l'affichage Pistes : règle
(courbe de tempo, numéros de mesure, bande de boucle), formes d'onde, grille
et sous-grille, voile de boucle, tête de lecture, défilement, zoom, Auto,
suivi de la tête de lecture et interactions. Le rang « Accords » s'affiche dès que le morceau a des accords (analysés ou écrits à la main).

**Mise en page.** La frise remplit la colonne de droite de `.plan`, dans le
défileur vertical `.travail`, qui ne défile **jamais** horizontalement : le
défilement horizontal est virtuel. Le commentaire en tête de `Timeline.tsx`
donne le contrat (hauteurs des rangs par `rulerRows()`, voies de
`view.trackHeight`, règle collée en haut).

**Fichiers.**

| Fichier | Rôle |
|---|---|
| `Timeline.tsx`, `timeline.css` | squelette React (règle, voies, bande, voile, tête, barre de défilement) ; React ne rend rien d'autre |
| `controller.ts` | cœur impératif : vue (`t0` = temps au bord gauche, `pps` = pixels par seconde), dessin, souris, toucher, molette, suivi, Auto |
| `drawing.ts` | dessin des canvas : grille, forme d'onde, règle (fonctions sans état) |
| `geometry.ts` | calculs purs et testés : zoom, Auto, suivi, éclaircissement des mesures, sélection de mesures |
| `peaks.ts`, `peakCache.ts` | pyramide de crêtes multi-résolution, calculée par tranches de 3 ms, mise en cache |
| `layout.ts` | hauteurs des rangs, partagées avec la colonne des en-têtes |
| `chordRow.ts` | rang des accords, fonctions pures et testées : quels accords s'écrivent (un accord répété n'est pas réécrit), où (au temps, 9 px après la barre) et lequel garder quand on dézoome |
| `chordMarkup.ts`, `chordLayer.ts` | le balisage d'un accord (identique à `<ChordSymbol>`, vérifié par `chordMarkup.test.ts`) et le DOM du rang : une étiquette par accord visible, déplacée par `transform`, gardée par clé |

**Couches de dessin.** Règle : fonds des rangs (DOM), bande de boucle (DOM,
laiton plein), un canvas (courbe de tempo, traits et numéros de mesure), tête
de lecture (DOM). Voies : un canvas de grille sous toutes les voies (mesures à
26 % d'encre, sous-grille `--trait-fin`), un canvas par voie pour la forme
d'onde (l'opacité à 22 % d'une piste coupée est une transition CSS), le voile
de boucle (DOM) et la tête de lecture (DOM). Les canvas ont la taille de la vue
(nets à tout rapport de pixels) et ne sont redessinés que si ce qu'ils
montrent change : défilement, zoom, grille, pistes, boucle, taille. La tête de
lecture se déplace par `transform` dans la boucle d'animation commune, sans
aucun redessin ni rendu React.

**Rang des accords.** Les accords viennent de `selectChartBars` (ceux de la
grille d'accords : mêmes accords, mêmes corrections) et s'écrivent par
`selectDisplayContext` (transposition, instrument, « m » ou « – »), avec le
balisage et les styles de `<ChordSymbol>` (`styles/chords.css`) : triangle,
extensions en exposant, altérations serrées ; un accord douteux est à l'encre
douce, pointillé dessous. Ce sont des éléments DOM positionnés (`translate3d`)
pour la seule partie visible, dans `.frise-accords` : pendant la lecture sans
défilement, aucun élément n'est créé, retiré ni touché (vérifié). Un accord est
posé 9 px après la barre qui le commence (6 px pour un accord au milieu de la
mesure, qui se range à son temps ou juste après le précédent, et s'efface
s'il gênerait l'accord de la mesure suivante : celui du temps 1 est prioritaire) ;
une mesure à deux accords les écrit à 14,5 px, comme la maquette. Un accord qui
répète le précédent n'est pas réécrit. **Taille d'abord, éclaircissement ensuite** :
quand les mesures se resserrent, *toute* la rangée s'écrit plus petit d'un coup
(18, puis 16, puis 14,5 px, la taille d'une mesure à deux accords, plancher
toujours lisible ; classes `taille-1` et `taille-2`, mêmes balisage et styles que
la grille) avant d'abandonner le moindre accord. Seulement si la plus petite
taille ne tient pas non plus, comme les numéros de mesure, une étiquette toutes les
2, 4, 8… mesures (la plus petite foulée qui laisse sa place à l'étiquette la plus
large), chaque étiquette étant alors l'accord en vigueur sur la barre gardée. La
taille et la foulée (`chooseRowSize` dans `chordRow.ts`) ne dépendent que du zoom,
de la mesure la plus étroite *du morceau* et de l'étiquette la plus large *du
morceau* (jamais de ce qui défile : pas de scintillement) ; à un zoom confortable
rien ne change (18 px). Les traits de mesure du rang suivent la même foulée, pour
ne jamais couper une étiquette. `data-chord-size`, `data-chord-labels` et
`data-chord-stride` sur `.frise` servent aux vérifications.

**Courbe de tempo.** Un point par mesure (tempo moyen de la mesure, posé au
milieu de la mesure) tiré de `grid/tempoCurve.ts`, relié par une courbe lisse
d'encre fine, au-dessus d'un pointillé au tempo nominal ; un petit point sur les
mesures qui ont 24 px de place. L'échelle est celle du morceau entier, calculée
une fois par carte (elle ne bouge pas en défilant). Un tempo constant est une
droite au milieu du rang, sans points. L'en-tête lit « Tempo · ≈ N » quand le
tempo varie.

**Formes d'onde.** `getAudio()` est lu une seule fois par piste pour bâtir la
pyramide (une case de 64 échantillons, puis des niveaux ×4 ; crête et énergie
par case). Le calcul se fait par tranches de 3 ms entre deux images, sans copie
de l'audio ; la forme d'onde se remplit de la gauche vers la droite. Deux tons
comme dans la maquette : crêtes à 38 %, corps (RMS) à 95 %. Chaque piste est
affichée à son propre niveau (sa crête la plus forte atteint la hauteur de la
voie, gain limité à 8) ; la courbe d'affichage est une puissance 0,8.

**Interactions.**

| Geste | Effet |
|---|---|
| clic (sans glisser) sur une voie ou dans la rangée Mesures | `seek()`, calé par `snapTime()` si le magnétisme est actif |
| glisser à la souris sur une voie ou dans Mesures | sélection d'un passage, `setLoopRegion(loopFromDrag(...))` en direct, **calée sur la sous-grille active** (pas choisi + Triolets) quand le magnétisme est actif, **libre** sinon ; au relâchement, `enterLoop()` amène la tête de lecture au début de la boucle si elle était en dehors |
| glisser un bord de la boucle (règle ou voie) | le bord suit le pointeur depuis l'endroit où on l'a pris (il ne saute pas), calé sur la sous-grille ou libre comme ci-dessus ; la boucle garde au moins 0,1 s ; même `enterLoop()` au relâchement |
| glisser dans la rangée Tempo | fait défiler (comme le doigt) |
| molette horizontale, balayage au pavé tactile | défilement horizontal |
| Maj + molette | défilement horizontal |
| Ctrl/⌘ + molette, pincement au pavé tactile (Safari : événements `gesture*`) | zoom horizontal autour du pointeur |
| barre de défilement fine sous les voies | glisser la poignée, cliquer la règle (une page), flèches, Début, Fin au clavier |
| tactile : un doigt sur les voies | défile (avec inertie) ; un tapotement place la tête |
| tactile : un doigt dans Mesures | sélectionne des mesures ; un tapotement place la tête |
| tactile : deux doigts | zoom horizontal autour des doigts |

La molette verticale reste au défileur vertical des pistes. Le zoom par les
curseurs, la molette ou le pincement garde en place la tête de lecture si elle
est visible, sinon le milieu de la vue.

#### Boucles qui ne sont pas des mesures entières (`grid/loops.ts`, `grid/loopText.ts`)

Le magnétisme qui cale la tête de lecture cale aussi la boucle. **Magnétisme actif
(par défaut)** : les deux bouts d'une sélection, et le bord qu'on déplace,
vont à la ligne la plus proche de la **sous-grille active** (pas choisi combiné
au bouton « Triolets », barres de mesure comprises : ce sont des lignes de la
sous-grille). **Magnétisme éteint** : les bouts sont exactement où est le
pointeur. Souris et doigt, dans les voies comme dans la rangée Mesures. Un
simple clic reste un déplacement de la tête, sans toucher à la boucle. Pour
boucler des mesures entières il suffit de glisser d'une barre à l'autre.

**Forme gardée.** Rien n'a changé : la boucle était déjà un intervalle de
**secondes source** (`LoopState.region`), jamais des numéros de mesure. Le
document est resté en version 3 pour cela, sans migration (la version 4 du lot 4
ajoute le métronome et les repères ; les boucles gardées ont la même forme) ; une boucle gardée par une version
précédente (toujours en mesures entières) se relit à l'identique, une boucle
coupée entre deux temps se relit à l'échantillon près
(`documentFormat.test.ts`, `restore.test.ts`, `test:timeline` section `loops`
après un vrai rechargement).

**Quand on corrige la grille** (premier temps, tempo × 2 ou ÷ 2, temps par
mesure, retour à l'analyse), la boucle **reste sur la musique** : mêmes
secondes, comme les accords et les sections. Seule sa lecture en mesures
change : « 5–8 » devient « 4.4 à 8.4 » si le premier temps avance
d’un temps, et redevient « 5–8 » si on le remet (`store/lot2.test.ts`). C'est
ce qui surprend le moins : le passage qu'on travaille est toujours le même
morceau de son.

**Longueur minimale.** `MIN_LOOP_SECONDS` = 0,1 s (le moteur ignore ce qui est
sous 2048 échantillons, 43 ms). Un glisser qui revient à son point de départ
laisse une boucle d'un pas de sous-grille (ou plus : de quoi atteindre 0,1 s),
du côté où allait le pointeur ; magnétisme éteint, 0,1 s. Une boucle qui touche
la fin du morceau grandit de l'autre côté.

**Lecture** (`formatLoop`, utilisée par le transport, la fenêtre d'export et les
noms de fichiers) :

| Boucle | Lecture |
|---|---|
| mesures entières | « 5–8 » (« 5 » pour une seule), comme avant |
| du temps 2 de la mesure 2 au temps 3 de la mesure 4 | « 2.2 à 4.3 » |
| … jusqu'à la 4e double-croche du temps 3 | « 2.2 à 4.3 (4e double) » |
| … jusqu'au 3e triolet du temps 3 | « 2.2 à 4.3 (3e triolet) » |
| du « et » (croche en contretemps) du temps 2 | « 2.2 (2e croche) » |
| à la main, entre deux lignes | « ≈2.2 (2e double) à ≈4.3 » (« ≈ » et la double-croche la plus proche) |

Un point est une **ligne**, pas une case : « 2.2 à 4.3 » joue jusqu'au début du
temps 3 de la mesure 4. « 4e double » est la quatrième double-croche **du
temps** (de 1 à 4), « 2e croche » la croche du contretemps, « 2e triolet » le
deuxième des trois ; « triple », « sextolet » et « douzième de temps » de même
pour 8, 6 et 12 divisions. Le nom est celui de la division la plus large qui
tombe juste (0,5 % de temps de tolérance), si bien qu'il ne change pas quand on
change la sous-grille. Dans le transport, une lecture qui n'est pas en mesures
entières passe sous la position (hors de la mise en page, elle ne déplace
rien) ; l'infobulle donne la phrase entière (« de la mesure 2, temps 2, à la
mesure 4, temps 3, 4e double »). Le transport entier (donc cette lecture) est
masqué sous 1040 px de large, comme avant.

**Partout ailleurs.** Moteur : les bornes sont arrondies à l'échantillon, fondu
de 20 ms au repli au plus au quart de la boucle (`tests/engine.mjs` section 3b :
chaque repère revient exactement un tour plus tard). Règle : la bande et le
voile suivent les bornes ; le numéro d'une mesure est à l'encre quand une partie
de la mesure est bouclée, son trait quand la boucle l'atteint. Grille d'accords :
une mesure bouclée en partie est voilée pour cette partie seulement (classes
`dans-boucle partielle`, `--boucle-de` et `--boucle-a`, fractions de la largeur
de la mesure en temps) ; la sélection à la souris de la grille reste en mesures
entières. Export : plage exacte à l'échantillon, et le nom du fichier porte la
lecture de la boucle (« … – boucle 2.2 à 4.3 (4e double) »).

**Auto** (`view.auto`) : tant qu'il est actif, la frise ajuste le morceau à la
largeur et les pistes à la hauteur sans débordement (`fitToView()`, bornes de
`view/zoom.ts`) et l'écrit par `applyAutoFit()` ; recalcul au
redimensionnement et quand les pistes changent. Sur téléphone (moins de
760 px), Auto est éteint et une mesure fait 86 px (`PHONE_BAR_WIDTH`) tant que
l'utilisateur n'a pas zoomé.

**Suivi** (`view.follow`) : en lecture, la page se tourne quand la tête atteint
le bord droit (28 px) ou revient en arrière (boucle), la tête se plaçant à 12 %
de la largeur. Le suivi attend pendant un geste, une inertie, et tant que
l'utilisateur a fait défiler la tête hors de la vue ; il reprend quand elle
redevient visible, à la lecture suivante ou après un déplacement. Suivi
éteint : la vue ne bouge jamais d'elle-même.

**Éclaircissement.** Quand les traits de mesure seraient à moins de 6 px, on
n'en garde qu'une sur 2, 4, 8… ; les numéros demandent 30 px et s'éclaircissent
de même (mesures 1, 5, 9… à une sur quatre). La sous-grille disparaît sous 5 px
(`isSubGridVisible`).

**Pour les tests et le débogage.** La racine `.frise` publie `data-t0`,
`data-pps`, `data-peaks` (`ready` quand toutes les crêtes sont calculées) et
`data-flush` (nombre de redessins, coût total et pire coût en ms).
`npm run test:timeline` (après `build`) lance les vérifications dans Chromium
(`TIMELINE_ONLY=desktop|chords|stress|loops|phone` pour une seule partie ;
`FABTICE_TIMELINE_OUT` pour le dossier des captures).

## Saisie et correction de la grille

Le clic sur « Tempo » en tête de règle ouvre un panneau : tempo du morceau
(30–300), « Battre le tempo », temps par mesure (2–7, à la noire), tempo ÷ 2 et
× 2, « Premier temps ici » (le premier temps de la mesure 1 à la position de
lecture) entre « un temps plus tôt » et « un temps plus tard », puis l'origine
de la grille, « Revenir à l'analyse » et « Analyser de nouveau ». Saisir ou
battre un tempo fait une grille fixe (`setManualGrid`, lot 1), qui remplace les
temps analysés ; les autres corrections gardent les temps analysés et n'en
changent que la numérotation (`store/gridActions.ts`, `grid/corrections.ts`).

## Grilles de standards — `src/standards/`

Filet de sécurité pour les accords (CLAUDE.md, analyse, moyen 3) : la grille connue d'un standard, retrouvée par le titre. **Le dépôt ne contient aucune grille** ; recherche et adresses : `web/spikes/accords/recueils/RECHERCHE.md`. Le lecteur, l'appariement des titres et la transposition sont purs (ni DOM ni réseau), donc utilisables dans le processus principal, un worker ou la page ; le téléchargement et la bibliothèque sont décrits plus bas.

- `collections.json` / `collections.ts` : liste distante des recueils (comme `models.json`) : nom, résumé en français, nombre de morceaux, `pages` (adresse, `kind` `html-with-ireal-links` ou `ireal-url-file`, `role`, `verified`). `validateCollectionList` refuse tout ce qui n'est pas https sur un hôte permis (copies GitHub figées à une révision). `loadCollectionList()` prend la liste distante si elle est valide, sinon celle de l'app, sans erreur. `selectPlaylists(collection, listes)` garde la bonne liste d'une page et refuse un téléchargement trop court (`minTunes`).
- `irealRead.ts` : `readIRealText(texte)` lit un lien `irealb://` ou `irealbook://`, une page HTML ou un fichier texte ; `readIRealPlaylists` donne une liste par lien. Chaque `StandardChart` a titre, compositeur, style, tonalité, mètres et `bars` **dépliées** (reprises, 1res et 2es fins, D.C., D.S., coda, `x`, `r`), chaque mesure portant ses accords placés par temps (`ReadChord`, en `ChordSymbol`, `text` d'origine, `approximate` si l'accord n'a pas d'équivalent exact) et ses accords alternatifs. Une chanson illisible va dans `skipped` avec sa raison ; rien ne lève d'exception. `asAnalysisChord` ramène `m7♭5` et `7♯5` aux noms de l'analyse. Les mesures vides sont ignorées (indiscernables du remplissage d'iReal).
- `match.ts` : `buildTitleIndex(entrées)` une fois, puis `findTitle(index, titre bruité, {threshold, max})` → candidats triés, score dans [0, 1], rien sous 0,88 (une mauvaise grille est pire que pas de grille). Gère années, « remastered », « live at », « feat. », « take 2 », accents, articles, alias entre parenthèses et quelques traductions.
- `forAnalysis.ts` : `chartsForAnalysis(titre, {store?, references?, maxCandidates?})` → `{title, candidates, references}` ou `null` (pas de titre, pas de recueil, aucune grille de ce titre : rien à envoyer). Données simples à poster au worker d'analyse, qui les passe telles quelles à `fitKnownChart(units, numbers, bpb, tonalité, candidates, {}, references)` : `candidates` = grilles du titre (`chart`, `titleScore`, `collectionId`, `collectionName`), `references` = 60 autres morceaux réduits à leurs accords temps par temps (`ReferenceBeats` : titre, tonalité, indices d'accords), gardés tant que la bibliothèque ne change pas. Mesuré sur Jazz 1460 + Latin 50 + Blues 50 : environ 40 Ko par analyse, 40 ms la première fois (après l'index des titres de `library.ts`, 0,5 s une fois), 7 ms ensuite.
- `transposeTo.ts` : `transposeChartToKey(grille, tonalité)`, `transposeChart`, `semitonesBetween`, et `chordAt(grille, mesure, temps, refrains)` : l'accord qui sonne à un temps d'une grille jouée sur plusieurs refrains.

### Téléchargement, bibliothèque et offre (`library.ts`, `libraryStore.ts`, `offer.ts`)

Ce qui est fait pour l'utilisateur : l'app propose, à l'ouverture, de télécharger en un clic les grilles des standards, avec une phrase d'explication, et les garde sur l'appareil. **Le dépôt n'en contient aucune**. L'analyse des accords n'y touche pas encore : `findStandard` est prête pour elle.

- **`library.ts`** (sans React) : `downloadCollections(ids, { onProgress, signal })` charge la liste (distante, sinon celle de l'app), puis essaie les `pages` de chaque recueil dans l'ordre : dans l'app Mac par le pont (`window.fabtice.standardsFetchText`, `desktop/src/standards-fetch.js`), sur le web seulement les pages dont l'hôte autorise la lecture depuis une page (les copies `raw.githubusercontent.com`, CORS `*`), les autres sont passées sans bruit. Une page est un échec, en silence, quand elle ne se charge pas, que c'est une page de connexion ou sans lien `irealb://`, ou que `selectPlaylists` ne garde rien (nom, `minTunes`) ; on passe alors à la suivante. Un fil du forum qui ne renvoie qu'à des pièces jointes `.html` est suivi d'un niveau (huit pièces au plus). Une page partagée par plusieurs recueils (la page officielle en porte quatre) n'est lue qu'une fois par téléchargement. Rien ne lève : les résultats disent, par recueil, `kept`, `failed` (`file-needed` : le web ne peut lire aucune de ses pages ; `not-found`) ou `cancelled`. Un abandon (`signal`) garde ce qui l'est déjà.
- **Ce qui est gardé** : sa propre base IndexedDB `fabtice-standards` (`libraryStore.ts`), un enregistrement par recueil : le texte brut des liens des listes gardées, le nom, le nombre de morceaux, la source et la date. Les grilles sont lues à la demande (≈ 150 ms pour 1 460 morceaux) ; sans IndexedDB, tout reste en mémoire. Ce sont des données de l'appareil : le document `ProjectDocument` n'en sait rien.
- **API pour la suite** : `standardsStatus()` (recueils présents, nombres), `findStandard(titre, { threshold, max })` (fonction asynchrone pure : index des titres construit à la première demande avec `match.ts` puis gardé jusqu'à un changement ; renvoie des candidats classés `{ chart, score, kind, viaAlias, collectionId, collectionName }`, rien sous le seuil ; un même morceau présent dans deux recueils n'y figure qu'une fois), `removeStandards(ids?)`, `importStandardsFile(fichier)` (un `.html` ou `.txt` exporté d'iReal Pro ou téléchargé du forum : une liste qui est l'un des recueils connus le remplace, le reste est gardé sous le nom du fichier ; c'est l'issue de secours du web et une commodité dans l'app Mac), `readablePages` / `isDownloadable` (ce que cet appareil sait télécharger).
- **L'offre** (`offer.ts`, `components/StandardsOffer.tsx`, `styles/standards.css`) : une carte discrète dans la fenêtre d'ouverture tant que rien n'est sur l'appareil et que l'utilisateur n'a dit ni « Plus tard » (pour cette visite) ni « Ne plus proposer » (gardé dans le `localStorage`). Les recueils recommandés sont cochés s'ils se téléchargent ici, avec leur nom, leur nombre de morceaux et l'hôte source ; sur le web, ceux qui ne se téléchargent pas directement sont dits (« à importer depuis un fichier »). Pendant le téléchargement : l'état de chaque recueil et l'avancement par recueil terminé (le pont ne donne pas d'octets) ; à la fin, un bilan honnête (« 1 780 grilles gardées sur cet appareil »), les recueils manquants nommés, et « Importer un fichier… » avec une ligne sur l'origine d'un tel fichier. Le même contenu est une fenêtre à part, atteinte depuis « Réglages avancés » (« Grilles des standards » → « Gérer… »), où l'on voit aussi ce qui est gardé et où l'on peut tout retirer. Les adresses viennent de `collections.json`, rechargé au lancement comme la liste des outils de séparation (pas sur les adresses de test, sauf `?outils=distant`).
- **Vérifier** : `npm test` (`library.test.ts`, pages fictives écrites dans `testFixtures.ts`), `npm run build && npm run test:standards` (Chromium, faux Internet local, profil persistant, captures dans `$FABTICE_STANDARDS_OUT`), et côté Mac `desktop/test/e2e/standards.test.js`. Sur de vraies listes, gardées hors du dépôt : `FABTICE_IREAL_REAL_DIR=/dossier npx vitest run src/standards/irealRead.real --silent=false`.
