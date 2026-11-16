# Fabtice — cahier des charges et conventions

Fabtice (« Fabrice » + « Practice ») est un outil de travail pour musiciens :
un mini-DAW très simple, pensé pour être utilisé sans friction par quelqu'un de
66 ans, et capable d'aller loin via des réglages avancés masqués par défaut.
Gratuit, sans publicité, sans compte. Licence GPL-3.0-or-later.

## Deux formes, un seul code

- **App Mac** (`desktop/`, Electron, macOS 12 Monterey minimum), livrée en deux
  téléchargements séparés, un pour les Mac à puce Apple et un pour les Mac
  Intel, pour diviser le poids par deux. C'est la forme principale : elle
  seule importe un lien YouTube, en extrayant l'audio sur la machine de
  l'utilisateur avec yt-dlp.
- **App web** (`web/`, site statique sur Netlify, https://fabtice.netlify.app).
  Même interface, ordinateur et mobile, import de fichiers audio uniquement.

Aucun serveur : tout le traitement (séparation, analyse, transposition) tourne
sur l'appareil. Les modèles se téléchargent au premier usage et l'app propose
leurs mises à jour à l'ouverture. Pas d'extraction YouTube côté serveur, et
aucune technique de contournement des protections de YouTube.

## Périmètre v1

1. **Import** : lien YouTube (app Mac), fichiers mp3, wav, aiff, m4a, flac.
   Au lancement : ouvrir un projet existant (format `.fab`), ouvrir un projet
   récent, ou en créer un.
   - **Projets `.fab`** (décisions du propriétaire) : un projet s'enregistre
     et se recharge en un fichier `.fab`. L'audio y est en FLAC (sans perte)
     plutôt qu'en WAV, pour prendre moins de place. Sur l'appareil, les
     pistes restent sans compression (blocs 16 bits), pour une réouverture en
     une à trois secondes : le FLAC est réservé au fichier `.fab` (décision du
     propriétaire après mesure, 15 novembre 2026). Le
     projet contient les pistes séparées ; s'il y a eu plusieurs séparations
     avec plusieurs outils, **toutes** y sont, pour passer de l'une à l'autre
     dans les réglages sans rien recalculer.
2. **Séparation des instruments**, au choix à l'import ou plus tard : voix,
   batterie, basse, guitare, piano, vents, autres ; puis détail optionnel
   (kick, caisse claire, charleston, toms, cymbales ; saxophone…). Le modèle
   est choisi automatiquement selon la puissance de l'appareil, avec réglage
   manuel en mode avancé.
   - **Modèles** : décision du propriétaire, tous les modèles utiles sont
     proposés, y compris ceux dont la licence des poids est floue ou réservée
     à un usage non commercial (BS-RoFormer SW, HTDemucs 6 sources, batterie
     détaillée). L'app ne redistribue aucun poids : elle les télécharge depuis
     leur emplacement public, à la demande de l'utilisateur, en affichant la
     source et la licence connue. La liste des modèles est un fichier distant,
     pour pouvoir en retirer un sans publier de nouvelle version.
   - Si le calcul sur la carte graphique échoue, l'app repasse sur le
     processeur **en gardant le modèle choisi** : la qualité prime sur
     l'attente. Elle affiche simplement un avertissement pendant le calcul
     (séparation par le processeur, plus longue).
3. **Lecteur / boucleur** : forme d'onde par piste à 60 images/s, grille de
   mesures et de temps, tempo fixe ou variable (courbe de tempo), sélection de
   mesures à la souris pour boucler, solo / mute / volume par piste,
   transposition et changement de tempo en direct, réglage fin en cents,
   détection de l'accordage (enregistrements pas à 440 Hz).
   - **Sous-grille** : en plus des barres de mesure, une grille plus pâle dont
     le pas se choisit dans une liste (noires, croches, doubles-croches,
     triples-croches) et se combine avec un bouton « Triolets » (croches +
     triolets = triolets de croches, doubles + triolets = sextolets…).
   - **Magnétisme** : la tête de lecture et les bords d'une boucle se calent
     sur la sous-grille active, ou se placent librement quand il est désactivé.
     Une boucle n'est donc pas limitée à des mesures entières.
   - **Zoom** horizontal et vertical par deux curseurs, et bouton « Auto » qui
     ajuste les pistes à la fenêtre sans débordement.
   - **Réglage** : suivre ou non la tête de lecture pendant la lecture.
   - **Deux qualités de rendu.** En direct, tout changement de tonalité ou de
     tempo s'entend aussitôt avec le moteur léger (Signalsmith Stretch) : c'est
     la prévisualisation. Un bouton « Appliquer meilleure qualité » recalcule
     ensuite les pistes avec le meilleur moteur (Rubber Band R3 « finer », trop
     lourd pour le direct), derrière un écran d'attente ; le lecteur ne fait
     alors plus que lire ce rendu. Le dernier rendu est gardé avec le projet,
     un seul à la fois : une nouvelle application écrase la précédente, jamais
     l'original. Tout nouveau changement repasse en prévisualisation jusqu'à
     la prochaine application.
     La conservation du timbre (formants) n'est proposée que dans ce rendu
     appliqué : elle ne donne pas un bon résultat avec le moteur léger.
   - Le contexte audio est fixé à 48 kHz, quel que soit le réglage de la
     machine (à 96 kHz le calcul double sans bénéfice).
4. **Analyse** : tempo et temps, tonalité, accords (fondamentale et couleur
   fiables ; extensions proposées comme suggestions), en tenant compte de
   l'harmonie jazz. Tout est corrigeable à la main : premier temps, métrique,
   tempo doublé ou divisé, tonalité, chaque accord.
   - **Tempo** : une variation brutale et brève qui revient au tempo d'avant
     n'est pas crue ; un nouveau tempo qui dure est un vrai changement. Un
     passage brutal et bref (par exemple de 120 à 60 sur quatre mesures, puis
     retour à 120) n'est jamais cru ; une petite tolérance reste pour les
     mouvements légers ou progressifs.
   - **Correction du tempo à la main** (décision du propriétaire) : en cas de
     bosse de tempo non désirée, un clic droit sur la mesure à partir de
     laquelle cela pose problème propose deux choix. « Corriger un changement
     de tempo indésirable » : réanalyser à partir de cette mesure en disant à
     l'analyse que le gros écart détecté n'est pas pertinent (la plupart du
     temps, le tempo ne doit pas changer). « Réanalyser le tempo à partir de
     cette mesure » : relancer une analyse vierge à partir de cette mesure,
     sans rien signaler. Cela permet de résoudre à la main les rares erreurs
     de détection.
   - **Attente** : toute étape longue montre un pourcentage qui avance
     régulièrement, pas quelques paliers.
   - **Accords, à améliorer en priorité** (décisions du propriétaire après ses
     essais du lot 3 : environ un accord sur deux était faux). Quatre moyens,
     tous retenus, qui se combinent dans un même calcul de fiabilité :
     1. **Écouter les instruments séparés** : relancer l'analyse des accords
        après une séparation, sans la batterie et sans la voix — sauf quand
        ce sont des voix harmonisées qui font les accords (style Four
        Freshmen). S'appuyer sur les instruments qui font l'harmonie, à
        trouver morceau par morceau (souvent piano ou guitare, parfois
        cuivres ou chœurs). La basse donne surtout la fondamentale, mais pas
        toujours : elle joue parfois autre chose, il faut en tenir compte.
     2. **Profiter des reprises** de la grille, sans recopier bêtement : il y
        a des variations d'une reprise à l'autre (extensions, superstructures,
        substitutions tritoniques, parfois un accord qui change). Trouver
        l'équilibre.
     3. **Grilles de standards connues** (les recueils les plus complets et
        les plus téléchargés des forums d'iReal Pro : jazz, bossa nova et
        brésilien…) : retrouvées par le titre, elles servent de filet de
        sécurité en cas de doute important et entrent dans le calcul de
        fiabilité. L'accord réellement joué dans l'enregistrement reste le
        but : la grille connue ne le remplace pas. **Le dépôt ne contient pas
        ces recueils** (même règle que pour les modèles) : l'app propose, dès
        son ouverture, de les télécharger en un clic depuis leur emplacement
        public, en expliquant en une phrase que cela améliore la détection
        des accords des standards, et les garde sur l'appareil.
     4. **Autres modèles d'accords** : chercher s'il en existe de meilleurs ;
        les proposer comme choix dans les réglages pour qu'il les essaie.
5. **Grille d'accords façon Real Book** : édition, transposition, affichage
   pour instruments en Si♭ et Mi♭, impression, export iReal Pro. Notation des
   chartes de jazz : triangle pour l'accord majeur 7, altérations serrées
   contre la fondamentale, extensions en exposant ; mineur noté « m » ou « – »
   au choix dans les réglages.
   - **Deux accords dans une mesure** : chaque accord est écrit à la place de
     son temps, comme dans le Real Book. Le second est donc au milieu de la
     mesure (troisième temps), sauf s'il est détecté sur le deuxième ou le
     quatrième temps.
   - **Une seule taille pour tous les accords** de la grille : une mesure à
     deux accords ne s'écrit pas plus petit que les autres.
   - **Impression** depuis l'affichage Grille d'accords, avec les choix
     habituels (portrait ou paysage, pleine page) et l'export en PDF.
   - **Deux affichages** se partagent la zone centrale, la barre du haut et
     le transport restant identiques : *Pistes* (formes d'onde) et *Grille
     d'accords* (façon iReal Pro). Boucle, tempo et tonalité se règlent de la
     même façon dans les deux.
6. **Métronome** : activable, volume, métriques composées (5/4, 7/8…), réglage
   avancé des temps forts et faibles par métrique ; décompte avant la boucle ;
   accélération progressive de la boucle.
7. **Repères** : boucles et sections nommées (A, B, solo) sauvegardées.
8. **Export audio** : pistes, boucles ou mélanges, dans la tonalité et le tempo
   choisis (wav, mp3, flac).
9. **Sauvegarde automatique** locale à chaque action ; installation hors ligne
   (PWA) pour l'app web.

Reporté en v2 : un troisième affichage, *Partition* (un instrument, ou un
conducteur si plusieurs sont cochés ; imprimable, export PDF), avec la
transcription qui l'alimente (mélodies, solos) et l'export MusicXML et MIDI.
Il n'apparaît pas dans l'interface de la v1. Son dessin est validé et
conservé : voir `DESIGN.md` et https://fabtice.netlify.app/maquette/#vue=partition.
Pas prévu pour l'instant : apps Windows, Android, iOS.

## Exigences de qualité

- Le cas de test principal est le jazz ancien (mono, instruments mélangés,
  tempo libre). L'électro à tempo fixe est le cas facile.
- Le moins d'artefacts possible : meilleurs algorithmes libres disponibles,
  mesurés objectivement, jugés à l'oreille par le propriétaire du projet.
- Design chaud et sobre, « jazz au coin du feu », palette restreinte, un seul
  thème (pas de mode sombre). Le fichier `DESIGN.md` fait référence dès qu'il
  existe. Ne pas produire une interface générique.
- Interface en français, structure prête pour l'anglais.

## Mesures de la phase 0 sur les appareils du propriétaire

À connaître avant de retravailler ces parties ; ce sont des relevés réels, pas
des estimations.

- **Séparation, MacBook M1 Pro 16 Go, Chrome 157, carte graphique (WebGPU)**,
  modèle BS-RoFormer SW : 809 s pour un morceau de 223 s, soit 3,6 fois sa
  durée (7 s par tranche de 4 s, 114 tranches, 1,1 Go de mémoire JavaScript).
  Qualité jugée très satisfaisante, mais attente longue et machine qui chauffe.
- **Même Mac, Safari 27.2** : le calcul graphique échoue (périphérique perdu au
  premier essai), repli sur le processeur à 4,0 fois la durée.
- **iPhone 14 Pro Max, Safari** : la page est fermée par le système pendant la
  séparation d'un morceau de 4 min 21 avec le modèle le plus léger (SCNet),
  très probablement par manque de mémoire.
- **Lecteur, Safari sur le M1** : six pistes en direct avec Signalsmith à 16 %
  de charge moyenne, sans coupure, alors que la machine tournait en 96 kHz.
  Rubber Band R3 en direct sur sept pistes dépasse largement le budget.
- **Import par lien, app Mac sur le M1** : quatre liens extraits sans erreur ;
  Chromium décode le fichier reçu sans conversion.

## Essais du propriétaire sur l'app Mac (lots 1 à 3)

Relevés réels, sur ses deux Mac, avec la version publiée le 14 novembre 2026.

- **Séparation, Mac Intel (quatre cœurs, 8 Go, carte graphique intégrée)** :
  le choix automatique prend HTDemucs 6 sources et tourne sur la carte
  graphique : 226 s pour un morceau de 269 s, soit 0,84 fois sa durée (4,8 s
  par tranche, 46 tranches ; modèle téléchargé en 14 s). Qualité jugée
  suffisante pour cet appareil.
- **Séparation, MacBook M1 Pro** : BS-RoFormer SW sur la carte graphique :
  715 s pour un morceau de 190 s, soit 3,8 fois sa durée (7,3 s par tranche de
  2 s). Qualité jugée très bonne. Le propriétaire confirme que cette attente
  ne le gêne pas : la qualité prime.
- **Tempo et mesures** : parfaits sur un enregistrement récent de jazz
  traditionnel. Sur un enregistrement de 1945, bons sur la première moitié,
  puis une fausse variation de tempo pendant un solo de vents, et la grille
  décalée d'un temps ensuite. Règle demandée par le propriétaire : ne pas
  croire une variation brutale et brève ; l'accepter si le nouveau tempo dure.
- **Accords** : la tonalité est bonne, mais environ un accord sur deux est
  faux sur ses morceaux, certains manquent, extensions et renversements peu
  fiables. C'est le point à améliorer en priorité dans l'analyse.
- **Lecteur, boucle, tonalité, tempo, import par lien** : fonctionnent sur les
  deux Mac.

Essais du 15 novembre 2026, sur le Mac Intel, avec la version publiée ce
jour-là :

- **Modèle d'accords détaillé** (Tsumugi-Chords) : jugé « vraiment meilleur,
  résultat très satisfaisant ».
- **Séparation d'un long morceau** (745 s) avec HTDemucs 6 sources sur la
  carte graphique : 948 s, soit 1,27 fois sa durée (7,4 s par tranche).
- **Tempo** : sur un autre morceau que la veille, encore quelques bosses
  brutales sur la courbe (tempo lu à la moitié de sa valeur pendant un
  moment), et tout décalé à partir de là, la première partie étant bonne.
- **Grille** : certaines mesures à deux accords écrites beaucoup plus petit
  que les autres, sans raison apparente.
- **Blocage du son du Mac** : l'app étant ouverte depuis un moment sans rien
  faire, la lecture ne partait plus, et le lecteur du Finder non plus ; il a
  fallu redémarrer le Mac. Jamais arrivé avant l'installation de Fabtice.

## Conventions

- Code et commentaires en anglais ; textes d'interface et documents en français.
- Les prototypes de la phase 0 vivent dans `web/spikes/<nom>/` (pages de test
  ouvrables depuis le site) et ne préjugent pas de l'architecture de la v1.
- Ne jamais mettre de secret dans le dépôt : il est public.
- **Changelog à chaque version** (demande du propriétaire) : toute nouvelle
  version publiée sur GitHub a son changelog sur la page de la version, en
  français simple, pour qu'il puisse montrer les nouveautés. On l'écrit en
  tête de `CHANGELOG.md` (section « ## Version du … ») dans le même envoi sur
  `main` que le changement ; la fabrication recopie cette première section
  sur la page de la version.
- **Netlify ne déploie plus automatiquement** : le propriétaire a arrêté les
  builds et déclenche lui-même un déploiement à chaque étape réellement
  terminée, car le quota est limité. Pousser sur `main` ne publie donc rien.
  Ne jamais demander un déploiement pour du travail intermédiaire, et vérifier
  son travail avec un serveur local ou dans l'app Mac, pas sur le site.
