# Fabtice — cahier des charges et conventions

Fabtice (« Fabrice » + « Practice ») est un outil de travail pour musiciens :
un mini-DAW très simple, pensé pour être utilisé sans friction par quelqu'un de
66 ans, et capable d'aller loin via des réglages avancés masqués par défaut.
Gratuit, sans publicité, sans compte. Licence GPL-3.0-or-later.

## Deux formes, un seul code

- **App Mac** (`desktop/`, Electron, universelle Intel + Apple Silicon, macOS 12
  Monterey minimum). C'est la forme principale : elle seule importe un lien
  YouTube, en extrayant l'audio sur la machine de l'utilisateur avec yt-dlp.
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
3. **Lecteur / boucleur** : forme d'onde par piste à 60 images/s, grille de
   mesures et de temps, tempo fixe ou variable (courbe de tempo), sélection de
   mesures à la souris pour boucler, solo / mute / volume par piste,
   transposition et changement de tempo en direct, réglage fin en cents,
   détection de l'accordage (enregistrements pas à 440 Hz).
4. **Analyse** : tempo et temps, tonalité, accords (fondamentale et couleur
   fiables ; extensions proposées comme suggestions), en tenant compte de
   l'harmonie jazz. Tout est corrigeable à la main : premier temps, métrique,
   tempo doublé ou divisé, tonalité, chaque accord.
5. **Grille d'accords façon Real Book** : édition, transposition, affichage
   pour instruments en Si♭ et Mi♭, impression, export iReal Pro.
6. **Métronome** : activable, volume, métriques composées (5/4, 7/8…), réglage
   avancé des temps forts et faibles par métrique ; décompte avant la boucle ;
   accélération progressive de la boucle.
7. **Repères** : boucles et sections nommées (A, B, solo) sauvegardées.
8. **Export audio** : pistes, boucles ou mélanges, dans la tonalité et le tempo
   choisis (wav, mp3, flac).
9. **Sauvegarde automatique** locale à chaque action ; installation hors ligne
   (PWA) pour l'app web.

Reporté en v2 : partitions (mélodies, solos), export MusicXML et MIDI.
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
