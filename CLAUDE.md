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
   Au lancement : ouvrir un projet existant (format `.fabtice`) ou en créer un.
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
     processeur **avec un modèle plus léger**, jamais avec le plus lourd.
3. **Lecteur / boucleur** : forme d'onde par piste à 60 images/s, grille de
   mesures et de temps, tempo fixe ou variable (courbe de tempo), sélection de
   mesures à la souris pour boucler, solo / mute / volume par piste,
   transposition et changement de tempo en direct, réglage fin en cents,
   détection de l'accordage (enregistrements pas à 440 Hz).
   - **Sous-grille** : en plus des barres de mesure, une grille plus pâle dont
     le pas se choisit dans une liste (noires, croches, doubles-croches,
     triples-croches) et se combine avec un bouton « Triolets » (croches +
     triolets = triolets de croches, doubles + triolets = sextolets…).
   - **Magnétisme** : la tête de lecture se cale sur la sous-grille active, ou
     se place librement quand il est désactivé.
   - **Zoom** horizontal et vertical par deux curseurs, et bouton « Auto » qui
     ajuste les pistes à la fenêtre sans débordement.
   - **Réglage** : suivre ou non la tête de lecture pendant la lecture.
   - **Deux qualités de rendu.** En direct, tout changement de tonalité ou de
     tempo s'entend aussitôt avec le moteur léger (Signalsmith Stretch) : c'est
     la prévisualisation. Un bouton « Appliquer » recalcule ensuite les pistes
     avec le meilleur moteur (Rubber Band R3 « finer », trop lourd pour le
     direct) dans des fichiers temporaires, derrière un court écran d'attente ;
     le lecteur ne fait alors plus que lire ces fichiers. Tout nouveau
     changement repasse en prévisualisation jusqu'au prochain « Appliquer ».
     La conservation du timbre (formants) n'est proposée que dans ce rendu
     appliqué : elle ne donne pas un bon résultat avec le moteur léger.
   - Le contexte audio est fixé à 48 kHz, quel que soit le réglage de la
     machine (à 96 kHz le calcul double sans bénéfice).
4. **Analyse** : tempo et temps, tonalité, accords (fondamentale et couleur
   fiables ; extensions proposées comme suggestions), en tenant compte de
   l'harmonie jazz. Tout est corrigeable à la main : premier temps, métrique,
   tempo doublé ou divisé, tonalité, chaque accord.
5. **Grille d'accords façon Real Book** : édition, transposition, affichage
   pour instruments en Si♭ et Mi♭, impression, export iReal Pro. Notation des
   chartes de jazz : triangle pour l'accord majeur 7, altérations serrées
   contre la fondamentale, extensions en exposant ; mineur noté « m » ou « – »
   au choix dans les réglages.
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

## Conventions

- Code et commentaires en anglais ; textes d'interface et documents en français.
- Les prototypes de la phase 0 vivent dans `web/spikes/<nom>/` (pages de test
  ouvrables depuis le site) et ne préjugent pas de l'architecture de la v1.
- Ne jamais mettre de secret dans le dépôt : il est public.
- **Netlify ne déploie plus automatiquement** : le propriétaire a arrêté les
  builds et déclenche lui-même un déploiement à chaque étape réellement
  terminée, car le quota est limité. Pousser sur `main` ne publie donc rien.
  Ne jamais demander un déploiement pour du travail intermédiaire, et vérifier
  son travail avec un serveur local ou dans l'app Mac, pas sur le site.
