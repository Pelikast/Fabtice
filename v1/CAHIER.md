# Fabtice 1.0.0 — cahier des charges

Ce document fixe **ce que doit contenir la version 1.0.0**. Il reprend, point
par point, la demande du propriétaire du 16 novembre 2026, ses réponses du même
jour aux questions posées, et la conception retenue pour chaque point. Il
complète `CLAUDE.md` (qui reste la référence générale) et sert de référence aux
sept étapes de `v1/PLAN.md`.

Convention : les textes entre « guillemets » sont ceux de l'interface, à
reprendre tels quels (seules les fautes de frappe sont corrigées, et le nom du
produit s'écrit « iReal Pro »). Chaque point porte un code (C1 à C17) que le
plan et les bilans d'étape réutilisent.

## Décisions générales du propriétaire (16 novembre 2026)

- **Une seule publication, à la fin** : pas de version d'essai intermédiaire.
  Tout le travail s'accumule sur la branche `v1` ; `main` ne bouge pas avant la
  1.0.0.
- **Pas de projet « Vide »** : un projet se crée à partir d'un lien YouTube
  (app Mac) ou d'un fichier audio, rien d'autre.
- **Logic Pro** : un « Dossier pour Logic Pro » (pistes audio + fichier MIDI)
  remplace le « projet Logic » demandé, dont le format est fermé. Il doit
  fonctionner de Logic Pro 10 à la version actuelle (13 chez le propriétaire).
- **Ableton Live** : à faire, bien que personne ne puisse l'essayer (ni le
  propriétaire ni l'environnement de travail n'ont Live).
- **Mise à jour automatique** : système maison, sans signature Apple.
- **Structure du morceau** : pas de gros modèle d'IA généraliste ; « Solo
  (Vents) » quand l'instrument n'est pas sûr.
- **Séparation** : comportement actuel conservé. Pas d'option « Rapide », pas
  d'exploration du calcul natif. Une séparation à distance pourra venir dans
  une **version future**, par une clé secrète saisie par l'utilisateur (qui
  paie lui-même le service) : hors périmètre de la 1.0.0.
- **Règles du tempo figées** : l'analyse automatique du tempo est jugée
  suffisante, on ne change plus ses règles. Les cas difficiles se règlent à la
  main (C12, C13).

## Deux formes d'interface (C8)

À partir de la 1.0.0, l'interface a **deux formes** qui embarquent les mêmes
fonctions :

- **Ordinateur** (app Mac, et app web sur un écran large avec souris) : menu
  déroulant sous le logo avec sous-menus à droite, fenêtres larges à onglets,
  raccourcis clavier.
- **Mobile** (app web sur téléphone ou tablette, tactile) : les mêmes entrées,
  présentées autrement (feuilles plein écran, listes qui s'emboîtent, gros
  boutons). Les sous-menus s'ouvrent au toucher.

Seules différences de fond : les outils de calcul plus légers sur mobile, et
l'import d'un lien YouTube réservé à l'app Mac. **Règle pour chaque écran
livré** : il est conçu et vérifié dans les deux formes (1280 × 800 à la
souris, 390 × 844 au toucher), et dans l'app Mac.

## C1 — Chargement plus visible

Le texte qui annonce une analyse ou une séparation en cours :

- prend la couleur du « t » de Fabtice (`--braise`, voir `DESIGN.md`) ;
- est un tout petit peu plus grand qu'aujourd'hui ;
- est parcouru, de gauche à droite, par un reflet de lumière **toutes les
  2,5 secondes**, pour qu'on comprenne qu'un travail est en cours.

Conception : dégradé animé découpé sur le texte ; avec le réglage système
« réduire les animations », pas de reflet (la couleur et la taille restent).
`DESIGN.md` dit « une seule chose rouge » : y inscrire cette exception voulue
par le propriétaire.

## C2 — « Alléger le travail pour l'appareil »

- Une case à cocher « Alléger le travail pour l'appareil » dans la fenêtre
  « Nouveau projet », avant de lancer analyse et séparation. Elle fait
  travailler l'appareil à **75 %** de ses capacités au lieu de 100 %, pour
  qu'il chauffe et souffle moins, au prix d'un travail plus long.
- La valeur se règle dans Réglages → « Avancé », par un curseur de **20 à
  99 %**.

Conception (avis donné au propriétaire, accepté) : on ne peut pas plafonner un
processeur ou une carte graphique à un pourcentage exact. On obtient la valeur
**en moyenne** : une pause après chaque tranche de calcul (pause = durée de la
tranche × (100 − p) / p) et, sur le processeur, un nombre de fils de calcul
réduit dans la même proportion. Cela vaut pour la séparation, l'analyse et
« Appliquer meilleure qualité ». Sur les longues tranches (27 s sur le Mac
Intel avec BS-RoFormer SW), le ventilateur montera quand même par moments :
le dire en une phrase sous le curseur. Les durées annoncées tiennent compte du
réglage. La case est décochée par défaut et l'app retient le dernier choix ;
elle est aussi proposée quand on lance une séparation plus tard.

## C3 — Sous-grille

- Valeur par défaut : « Noires ».
- Ajouter « Blanches » à la liste (blanches, noires, croches, doubles-croches,
  triples-croches), combinable avec « Triolets » comme les autres.

Conception : les préférences déjà enregistrées sur l'appareil repassent une
fois à « Noires », pour que le propriétaire voie bien le nouveau défaut.

## C4 — Imprimer, avec aperçu

- « cmd + P » ouvre la fenêtre d'impression.
- Elle doit ressembler aux fenêtres d'impression habituelles : **aperçu avant
  impression** et options modifiables avant d'imprimer.

Conception : une fenêtre de l'app à deux zones. À gauche, l'aperçu des pages
telles qu'elles sortiront (page par page, nombre de pages). À droite, les
options : orientation (portrait, paysage), format (A4, Lettre), marges,
échelle et « tenir sur une page », instrument (Ut, Si♭, Mi♭), ce qu'on
imprime (grille complète, grille simplifiée, une section : voir C14), en-tête
(titre, tonalité, tempo). Puis « Imprimer » et « Enregistrer en PDF ». Dans
l'app Mac, l'imprimante et le nombre de copies se choisissent dans cette même
fenêtre si le système le permet sans seconde fenêtre ; sinon la fenêtre du
système s'ouvre ensuite. Le raccourci fonctionne depuis les deux affichages
(depuis « Pistes », il imprime aussi la grille).

## C5 — Projet enregistré ou non, alerte

- Quand on crée un nouveau projet, qu'on en ouvre un autre ou qu'on quitte
  l'app alors que le projet en cours a des modifications non enregistrées :
  « Les modifications du projet en cours n'ont pas été sauvegardées,
  voulez-vous enregistrer ? », avec « Enregistrer », « Ne pas enregistrer » et
  « Annuler ».
- « Enregistrer » : écrase le fichier `.fab` du projet en cours ; si le projet
  n'a jamais été enregistré, ouvre la fenêtre qui demande le nom et
  l'emplacement.
- « Enregistrer sous… » : la même fenêtre, pour un nouveau fichier `.fab` à un
  autre endroit ; ce fichier devient celui du projet en cours.

Conception :
- L'app sait, pour le projet ouvert, **où est son fichier** (app Mac : le
  chemin ; web : la poignée de fichier quand le navigateur en donne une, sinon
  aucun et « Enregistrer » télécharge) et **s'il a changé depuis le dernier
  enregistrement**. Le titre de la fenêtre le montre (point de macOS dans le
  bouton de fermeture, nom du fichier).
- Comptent comme modifications : tout ce qu'« Annuler » sait défaire (C11),
  plus une analyse, une séparation, un rendu appliqué. Ne comptent pas : zoom,
  défilement, position de lecture, affichage choisi.
- **Enregistrer doit être rapide** : la plupart du temps seul le document
  change. Réutiliser tels quels les sons déjà encodés du fichier existant ;
  n'encoder que ce qui est nouveau. Écriture sûre : fichier temporaire puis
  remplacement, jamais de fichier abîmé si l'app est coupée.
- La **sauvegarde automatique locale reste** le filet de sécurité (elle garde
  le dernier travail sur l'appareil, comme aujourd'hui) ; le fichier `.fab`
  devient le vrai projet. Après « Ne pas enregistrer », rien n'est écrit dans
  le `.fab` ; le dernier travail reste proposé à la réouverture tant qu'un
  nouveau projet ne l'a pas remplacé.
- Web : le navigateur ne laisse pas afficher une alerte personnalisée à la
  fermeture de l'onglet ; l'alerte y vaut pour « Nouveau projet » et
  « Ouvrir », la sauvegarde automatique couvre la fermeture.

## C6 — Le menu Fabtice

Un clic sur le logo « Fabtice », en haut à gauche, ouvre un menu déroulant qui
rassemble les menus aujourd'hui éparpillés. Les sous-menus s'ouvrent à droite
au survol (ou au toucher).

```
Annuler                    cmd + Z
Rétablir                   Maj + cmd + Z
──────────────
Nouveau projet        ▸    À partir d'un lien YouTube      (app Mac)
                           À partir d'un fichier audio
Ouvrir…                    cmd + O                          (ajout)
Projets récents       ▸                                     (ajout, app Mac)
──────────────
Enregistrer                cmd + S
Enregistrer sous…          Maj + cmd + S
Exporter              ▸    Audio…
                           iReal Pro  ▸  Fichier iReal Pro…
                                         Ouvrir dans iReal Pro
                           PDF…
                           Dossier pour Logic Pro…
                           Projet Ableton Live…
Imprimer…                  cmd + P                          (ajout)
──────────────
Réglages…                  cmd + ,
Quitter                    cmd + Q                          (app Mac)
```

- Les trois lignes marquées « ajout » ont été annoncées au propriétaire, qui
  n'a pas objecté. Sur le web : pas de « Quitter », pas de « Projets
  récents » ; l'entrée du lien YouTube renvoie vers l'app Mac comme
  aujourd'hui.
- La **barre de menus du Mac** reprend les mêmes commandes aux places
  habituelles (Fabtice : À propos, Réglages…, Quitter ; Fichier ; Édition :
  Annuler, Rétablir, couper, copier, coller ; Présentation ; Fenêtre ; Aide :
  Diagnostic…). Une commande grisée dans l'app l'est aussi dans la barre.
- Les anciens menus (export, réglages, outils) disparaissent là où ils font
  doublon : une commande n'a qu'une place.
- Sur le web hors Mac, « cmd » se lit « Ctrl ».

## C7 — Réglages à onglets

« Réglages » ouvre une fenêtre assez large, organisée en onglets à la manière
des réglages de Logic Pro. Sept onglets, qui rassemblent tout ce qui est
aujourd'hui éparpillé. Le propriétaire a demandé des propositions ; voici le
contenu retenu, à lui montrer et à ajuster selon ses retours :

| Onglet | Contenu |
|---|---|
| « Général » | À l'ouverture (reprendre le dernier projet, ou la fenêtre « Nouveau projet ») ; « Alléger le travail pour l'appareil » ; version de l'app, « Rechercher une mise à jour », vérifier à chaque ouverture ; liste des raccourcis clavier |
| « Instruments » | Outil de séparation (automatique ou au choix, avec taille, source, licence et vitesse mesurée) ; instruments cochés par défaut ; séparations gardées avec le projet et passage de l'une à l'autre ; calcul sur la carte graphique ou le processeur |
| « Tempo et analyse » | Analyser dès l'import ; pour le morceau ouvert : premier temps, métrique, tempo doublé ou divisé, revenir à l'analyse ; accordage (détection, compensation) ; sous-grille, « Triolets », magnétisme |
| « Détection des accords » | Modèle (« Rapide » ou « Détaillé », avec son poids) ; s'appuyer sur les grilles connues des standards ; détecter les modulations ; structure automatique et mode (automatique, Jazz, Pop) ; relancer la détection pour le morceau ouvert |
| « Métronome » | Volume, décompte avant la boucle, temps forts et faibles par métrique, accélération progressive |
| « Affichage » | Mineur noté « m » ou « – » ; instrument (Ut, Si♭, Mi♭) ; suivre la tête de lecture ; zoom « Auto » |
| « Avancé » | Curseur du pourcentage d'« Alléger » (20 à 99 %) ; grilles des standards gardées sur l'appareil, « Vérifier les mises à jour de grilles », import d'un fichier de grilles ; conservation du timbre ; place prise sur l'appareil et « Libérer » ; diagnostic et journal audio ; « Rétablir les réglages d'origine » |

Chaque réglage dit s'il vaut pour l'app ou pour le morceau ouvert. Les
raccourcis des panneaux existants (métronome dans le transport, par exemple)
peuvent rester s'ils ouvrent le bon onglet.

## C9 — Fenêtre « Nouveau projet » et grilles iReal Pro

La fenêtre (aujourd'hui « Nouveau morceau ») s'appelle « Nouveau projet ».
Qu'on parte d'un lien ou d'un fichier :

- une case « Séparer les instruments », **décochée par défaut** ;
- cochée, elle montre les « Instruments à séparer », **tous sélectionnés** ;
  un clic sur un instrument le désélectionne ;
- la ligne « Aller plus loin : batterie détaillée, saxophone… » disparaît
  (rien ne le fait aujourd'hui) ;
- la partie « Grilles gardées sur cet appareil » quitte cette fenêtre pour
  Réglages → « Avancé », où un bouton « Vérifier les mises à jour de grilles »
  cherche les nouveaux recueils ou leurs mises à jour et les installe
  simplement ;
- la case « Alléger le travail pour l'appareil » (C2) y prend place.

L'écran d'ouverture de l'app continue d'offrir : ouvrir un projet `.fab`, un
projet récent, ou en créer un.

**Message au démarrage**, à chaque ouverture tant que les recueils n'ont
jamais été téléchargés :

- « Voulez-vous importer automatiquement les grilles des standards de iReal
  Pro ? Cela permet d'améliorer la détection des accords. »
- deux boutons, « Oui (recommandé) » et « Non merci », et une case « Ne plus
  afficher ce message ».
- « Oui (recommandé) » : télécharger **tous** les recueils disponibles, sans
  choix de détail (jazz, brésilien, pop…), avec une progression.
- « Non merci » avec la case cochée : un dernier message, « Ce choix reste
  disponible dans le menu de réglages avancé de l'application », et un seul
  bouton « OK ».
- « Non merci » sans la case : le message reviendra à la prochaine ouverture.

Conception : « tous » veut dire tous ceux qui ont une adresse publique que
l'app sait télécharger (dit au propriétaire). La liste des recueils reste un
fichier distant ; le dépôt ne contient aucun recueil. Chercher d'autres
recueils publics (pop, brésilien) et vérifier leurs adresses depuis les Mac de
GitHub, l'environnement de travail n'y ayant pas accès.

## C10 — Modulations

Détecter un changement de tonalité en cours de morceau et le montrer dans
l'app et sur la grille.

Conception :
- Une modulation est un **changement d'armure qui dure** (au moins une phrase,
  de l'ordre de huit mesures), pas un II-V de passage ni le va-et-vient entre
  un ton majeur et son relatif mineur.
- Le document garde une **tonalité par passage** (liste de changements,
  position et tonalité), côté analyse et côté corrections à la main : ajouter,
  déplacer, supprimer, changer une modulation.
- Détection : tonalité estimée par fenêtres à partir des accords et du
  contenu harmonique, puis lissage qui pénalise les changements ; la grille
  connue du standard et les frontières de sections (C14) aident.
- Affichage : sur la grille, une marque au-dessus de la mesure (nouvelle
  tonalité), reprise à l'impression ; dans « Pistes », une marque sur la
  règle ; la tonalité affichée dans le transport est celle de l'endroit joué ;
  l'orthographe des accords (dièses ou bémols) suit la tonalité du passage.
  La transposition décale tout ensemble.
- Exports : iReal Pro n'a qu'une tonalité par grille (garder la principale,
  la modulation en texte) ; le fichier MIDI porte les changements d'armure.

## C11 — Annuler et Rétablir

« Annuler » et « Rétablir » en tête du menu Fabtice, séparés du reste par une
fine ligne, avec « cmd + Z » et « Maj + cmd + Z ».

Conception (dit au propriétaire) :
- Se défont : accords, sections, tonalités, corrections de la grille (premier
  temps, tempo doublé ou divisé, métrique, corrections de tempo, signatures),
  boucle, repères, mixage (volume, muet, solo), tempo et tonalité de lecture,
  réglages du métronome, structure.
- Ne se défont pas : un import, une séparation, une analyse complète, un rendu
  appliqué, une suppression de fichiers, les réglages de l'app.
- Un geste continu (un curseur qu'on tire) compte pour une seule étape.
  Historique d'une centaine d'étapes, vidé quand on change de projet.
- Dans un champ de texte, le raccourci défait la saisie, comme partout.

## C12 — Corriger le tempo en tapant

Dans le menu du clic droit sur une mesure (« Tempo à partir de la mesure x »),
en plus des deux choix existants : « Correction de la courbe en tapant le
tempo ». Déroulé :

1. Une petite fenêtre montre le numéro de la mesure de départ, un champ pour
   le nombre de mesures de décompte (par défaut : 1 ; 0 possible), le texte
   « Tapez sur la touche espace à peu près sur chaque temps pendant le passage
   que l'algorithme a eu du mal à détecter, la suite du morceau sera
   ré-analysée automatiquement », et le bouton « C'est parti ».
2. Le décompte se joue, **métronome obligatoirement actif**, puis
   l'utilisateur tape la barre d'espace (ou touche l'écran) sur chaque temps,
   à l'oreille, jusqu'à la fin du passage difficile.
3. « Ok, j'ai fini » arrête la lecture et l'écoute des tapes. L'app refait la
   détection **de cette mesure jusqu'à la dernière tape**, en prenant les
   tapes comme indices très forts, avec une marge d'erreur humaine : cela doit
   marcher même avec un sens du rythme moyen.
4. « Vérifier en écoutant » joue le passage avec la nouvelle grille, clic
   actif. Puis deux choix : « Ce n'est pas bon, réessayer » (on recommence) ou
   « C'est bon, c'est corrigé ».
5. Après « C'est bon, c'est corrigé », **la suite du morceau**, après le
   dernier temps tapé, est réanalysée.

Conception (avis donné, accepté) :
- Le clic du décompte suit la grille existante, bonne avant la mesure
  choisie, et **s'arrête à cette mesure** pour ne pas tromper pendant qu'on
  tape.
- L'app compense seule l'avance ou le retard habituel de l'utilisateur (écart
  médian entre ses tapes et les attaques) et la latence de la sortie audio,
  puis cale chaque tape sur l'attaque la plus proche. Tapes manquantes ou en
  trop tolérées. On peut taper en lecture ralentie.
- Les règles de l'analyse automatique ne changent pas : ceci est une
  correction à la main de plus, annulable, gardée avec le projet comme les
  deux autres.

## C13 — Changer la signature rythmique

Dans le même menu : « Changer la signature rythmique ». Une petite fenêtre
avec deux cases de saisie l'une sur l'autre, séparées par un trait, comme une
signature écrite :

- en haut, un nombre de **1 à 64** ;
- en bas, une valeur parmi **4, 8, 16, 32** ;
- dessous, un sélecteur : « Changement permanent à partir de cette mesure » ou
  « Changement uniquement pour cette mesure ».

Conception : le document sait déjà porter une liste de changements de
métrique (`tempoMap.meters`), mais tout le reste de l'app suppose aujourd'hui
une seule métrique, de 2 à 12 temps sur 4 ou 8. Il faut que **tout** suive :
barres et numéros de mesures, métronome et ses accents, grille d'accords
(signature écrite à la mesure du changement), boucles, repères, exports,
réanalyses. « Uniquement pour cette mesure » = un changement, puis le retour à
la signature d'avant à la mesure suivante. Règle à fixer et à documenter quand
le chiffre du bas change : **la noire reste la noire** (une croche dure la
moitié d'une noire).

## C14 — Structure du morceau et grille simplifiée

Après l'analyse, l'app établit automatiquement la **structure** du morceau et
réorganise la grille, comme dans un Real Book.

**Vocabulaire.** Les sections portent une lettre (A à Z) ; la forme est leur
suite (AABA…). Les parties ont des noms fixes : Intro, Thème, Solo, Pont,
Spécial, Outro. Plusieurs thèmes ou solos sont numérotés (Thème 1, Thème 2 ;
Solo 1, Solo 2). Un « Solo 2 » collé à un « Solo 1 » est forcément joué par un
autre instrument ; sinon c'est un seul long solo. Si l'instrument est reconnu :
« Solo (Guitare) », « Solo (Piano) », « Solo (Batterie) »… En mode « Pop » :
Couplet, Refrain, Pont (« Intro, Couplet 1, Refrain 1, Couplet 2, Refrain 2,
Solo de guitare, Outro »).

**Mise en page de l'affichage « Grille d'accords ».** La grille (quatre mesures
par ligne) occupe 80 % à droite ; une **colonne de gauche de 20 %** porte la
liste interactive, par exemple :

```
Forme globale : AABC
Mode : Jazz
Affichage complet
Grille complète simplifiée

Sections :
Intro
Thème 1
Solo (Guitare)
Solo (Trompette)
Thème 2
Outro
```

- « Forme globale » est un titre, non modifiable.
- « Mode » est un sélecteur Jazz / Pop ; l'app choisit seule le plus probable,
  l'utilisateur peut changer.
- Un clic sur « Affichage complet », « Grille complète simplifiée » ou une
  section affiche la grille correspondante à droite. Un clic sur une section
  place aussi la tête de lecture à son début : on l'entend aussitôt si la
  lecture est en cours.
- À droite de chaque section, un petit bouton « Boucle » sélectionne une
  boucle sur toute la section (et l'affiche, et la joue si la lecture est en
  cours).
- « Affichage complet » : la grille entière, du début à la fin ; c'est
  l'affichage par défaut.
- « Grille complète simplifiée » : toute la grille, en forme concise : reprises
  de sections et de mesures, et accords simplifiés pour les parties répétées.
  Quand les reprises varient (G7, G13, G7♯5, substitution tritonique…), on
  suit les codes de l'harmonie du jazz et on écrit simplement G7. Exemple
  donné par le propriétaire pour « Autumn Leaves » :

```
Forme : Intro, Thème Chant (AABC), Solo Piano (AABC), Solo Trompette (AA), Thème Chant 2 (BC)

Intro :
  | Bm     |
A :
[ | Em7    | A7  | Dmaj7  | Gmaj7    |
  | C#m7b5 | F#7 | Bm     | %        | ]x2
B :
  | C#m7b5 | F#7 | Bm     | %        |
  | Em7    | A7  | Dmaj7  | Gmaj7    |
C :
  | C#m7b5 | F#7 | Bm Bb7 | Am7 G#7  |
  | C#m7b5 | F#7 | Bm     | %        ||
```

- La grille tient ainsi sur une page, à l'écran et à l'impression. La lecture
  reste basée sur l'audio et **suit intelligemment** ce qui est écrit, reprises
  comprises, dans chacun des affichages.

Conception (dit au propriétaire, accepté) :
- **Pas de gros modèle généraliste.** La forme vient des reprises de la grille
  détectée et de la grille connue du standard (les recueils iReal Pro portent
  les sections) ; la longueur d'un chorus se trouve par ressemblance de la
  grille avec elle-même.
- **Thème ou solo** : avec les pistes séparées, on regarde qui tient la
  mélodie sur chaque chorus ; le thème du début et celui de la fin se
  ressemblent, les solos non. Sans séparation, on compare les chorus entre
  eux et on repère les changements de timbre : « Solo 1, Solo 2 » sans nom
  d'instrument.
- **Instrument du solo** : la piste séparée qui domine donne guitare, piano,
  basse, batterie, voix. Pour les vents, qui tombent ensemble dans « Autres »,
  un **petit modèle de reconnaissance d'instruments** (quelques mégaoctets,
  licence libre, téléchargé au premier usage comme les autres outils), à
  choisir sur mesure. Fiabilité moyenne attendue : en cas de doute, « Solo
  (Vents) ».
- **Simplification** : accord de consensus par mesure entre les reprises d'une
  même section ; extensions et altérations retirées (famille de l'accord :
  maj7, m7, 7, m7♭5, dim7, mineur de tonique) ; substitution tritonique
  ramenée à la dominante quand les autres reprises ou la grille connue la
  donnent ; « % » pour une mesure répétée ; `[ … ]x2` quand deux passages
  simplifiés sont identiques.
- **Tout est corrigeable à la main** : nom, type, instrument et limites d'une
  section, mode, lettres. Une nouvelle analyse ne touche pas à ce qui a été
  corrigé.
- **Suivi de la lecture** en grille simplifiée : la mesure écrite qui
  correspond à l'audio est mise en évidence, avec le numéro de la reprise ; un
  clic sur une mesure écrite va à sa prochaine occurrence.
- Sur mobile, la colonne devient un panneau qu'on ouvre au-dessus de la grille.

## C15 — Exports

Sous « Exporter » (voir C6) :

1. « Audio… » : une fenêtre pour choisir
   - le format : « Wave » (fréquence d'échantillonnage et quantification au
     choix), « Flac », ou « MP3 » à débit constant, de 96 à 320 kbit/s, **320
     par défaut** ;
   - quoi exporter : le mix complet, ou une ou plusieurs pistes, par un
     sélecteur simple ;
   - une case : des fichiers séparés, ou un seul fichier.
   Conception : l'app travaille en 48 kHz ; le dire en une ligne quand on
   choisit plus haut (cela n'ajoute pas de qualité). L'export tient compte du
   tempo et de la tonalité choisis, comme aujourd'hui, et garde le choix
   « la boucle seulement » s'il existe.
2. « iReal Pro » : « Fichier iReal Pro… » (nommer et enregistrer le fichier)
   et « Ouvrir dans iReal Pro » (ouvre l'app iReal Pro avec la grille).
3. « PDF… » : nommer et enregistrer la grille en PDF.
4. « Dossier pour Logic Pro… » : les pistes en l'état (tempo et tonalité
   choisis compris), toutes en audio et alignées au début ; un fichier MIDI
   avec la courbe de tempo exacte, les signatures rythmiques, les armures et
   **les accords en marqueurs** (sections comprises) ; un mode d'emploi en
   trois gestes. Doit marcher de Logic Pro 10 à 13. Le propriétaire peut
   l'essayer sur Logic 13 : lui fournir un dossier d'essai dès que l'export
   existe.
5. « Projet Ableton Live… » : un fichier `.als` dans un dossier avec les
   pistes audio, calées en temps absolu (sans étirement), la courbe de tempo
   en automation, les signatures, les accords et sections en repères. Viser
   un format que Live 10, 11 et 12 ouvrent. **Personne ne peut l'essayer** :
   vérifier la structure du fichier contre des projets de référence libres,
   joindre dans le même dossier le fichier MIDI et les pistes (repli sûr), et
   l'annoncer « à l'essai » dans l'app et dans le changelog.

## C16 — Mise à jour automatique

À l'ouverture, l'app cherche en arrière-plan une mise à jour sur GitHub. À
jour : rien ne se voit. Sinon : « Une mise à jour est disponible », avec le
numéro de la version actuelle et celui de la nouvelle, et **un bouton** qui met
Fabtice à jour.

Conception (système maison, sans signature Apple) :
- La version publiée expose un petit fichier qui donne son numéro, ses notes
  et l'empreinte SHA-256 de chaque téléchargement (puce Apple, Intel).
- L'app télécharge l'archive de sa puce, **vérifie l'empreinte**, la déballe,
  remplace l'app et se relance. Téléchargement par le processus principal,
  liste d'hôtes fermée (GitHub).
- Cela ne marche que si l'app est dans un dossier où elle peut s'écrire
  (Applications). Si macOS la fait tourner depuis un emplacement protégé (app
  lancée depuis Téléchargements), l'app l'explique et propose le
  téléchargement à la main.
- La 1.0.0 est la première version à savoir se mettre à jour : le vrai
  parcours ne se vérifiera chez le propriétaire qu'avec la version suivante.
  D'ici là : essai complet sur les Mac de GitHub (une version factice plus
  récente servie localement, remplacement, relance).
- App web : la mise à jour passe par le mode hors ligne existant ; reprendre
  le même message.

## C17 — Version 1.0.0

- L'app porte le numéro **1.0.0** (visible dans « À propos » et dans
  Réglages → « Général »).
- La page de la version sur GitHub n'est plus une « version de test » : une
  vraie version numérotée, avec son changelog en français simple (règle de
  `CLAUDE.md`).
- Les listes distantes (outils de séparation, recueils de grilles) sont lues
  sur `main` par les versions déjà installées : garder leur format compatible,
  ou publier le nouveau sous un autre nom de fichier.
