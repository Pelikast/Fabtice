# Nouveautés de Fabtice

Chaque version publiée sur GitHub (page « Releases ») a sa section ici, la plus
récente en haut. La première section est recopiée sur la page de la version.

## Version 1.0.0

En préparation. Chaque étape du plan (`v1/PLAN.md`) ajoute ici ses nouveautés,
en français simple.

### Annuler, enregistrer
- **Annuler et Rétablir** : cmd + Z défait la dernière modification du morceau
  (un accord, une section, la boucle, un repère, un volume, le tempo, la
  tonalité, le métronome, une correction de la grille…), Maj + cmd + Z la
  refait. Jusqu'à cent étapes. Dans un champ de texte, le raccourci défait la
  saisie, comme partout.
- **Enregistrer** : cmd + S enregistre le projet par-dessus son fichier
  `.fab`, sans rien demander, et c'est rapide. Maj + cmd + S (« Enregistrer
  sous… ») en fait un nouveau fichier.
- **Alerte avant de perdre son travail** : si le projet a des modifications
  non enregistrées, l'app le demande avant de créer un nouveau projet, d'en
  ouvrir un autre, de fermer la fenêtre ou de quitter : « Enregistrer », « Ne
  pas enregistrer » ou « Annuler ».
- **Titre de la fenêtre** : il montre le nom du fichier du projet, et un point
  quand il y a des modifications non enregistrées.
- Les projets enregistrés avec les versions précédentes s'ouvrent comme avant.

### Grille et export
- La grille d'accords écrit la signature rythmique à la mesure où elle
  change, et l'app sait maintenant suivre des signatures différentes d'une
  mesure à l'autre (la fenêtre pour les changer arrive plus bas dans cette
  version).
- Export iReal Pro : un morceau en 6/8 ou en 12/8 sort avec la bonne
  signature.

## Version du 16 novembre 2026

Depuis la version du 15 novembre (8 h 54).

### Projets
- **Enregistrer un projet** : « Exporter → Enregistrer le projet… » range tout
  le morceau dans un seul fichier `.fab` : le son d'origine, les instruments
  séparés, les réglages, les accords, les boucles et les repères.
- **Fichier plus léger** : le son y est en FLAC, sans perte de qualité (un peu
  plus de la moitié de la taille d'un WAV).
- **Rouvrir un projet** : par « ouvrir un projet Fabtice » dans la fenêtre
  « Nouveau morceau », en déposant le fichier sur la fenêtre, par un
  double-clic dans le Finder, ou par Fichier → Ouvrir un projet récent.
- **Projets récents** : les trois derniers sont proposés dans « Nouveau
  morceau » (« voir tous » pour les autres).
- **Toutes les séparations gardées** : un morceau séparé avec deux outils
  garde les deux ; on passe de l'une à l'autre dans le panneau
  « Instruments », sans rien recalculer. La place prise se libère séparation
  par séparation.
- **« Appliquer meilleure qualité » gardé** : le dernier rendu reste avec le
  morceau, même après avoir quitté l'app (un seul à la fois, l'original n'est
  jamais touché).

### Tempo
- **Plus de bosses brutales** : un passage lu à la moitié, au double ou aux
  deux tiers du tempo est ramené au tempo du morceau, et un écart brusque qui
  ne dure pas (moins de 8 mesures) n'est plus cru. Les mouvements légers ou
  progressifs restent.
- **Mesures qui ne se décalent plus** après un passage difficile.
- **Correction à la main** : clic droit sur une mesure →
  - « Corriger un changement de tempo indésirable » : garde le tempo d'avant
    à partir de cette mesure ;
  - « Réanalyser le tempo à partir de cette mesure » : pour un morceau qui
    change vraiment de tempo.
- Pour en profiter sur un morceau déjà analysé : panneau « Tempo » →
  « Analyser de nouveau ».

### Grille d'accords
- **Tous les accords à la même taille** : une mesure à deux accords ne
  s'écrit plus en petit. Un accord placé en fin de mesure recule contre la
  barre ; deux accords qui se gênent passent sur deux rangées.

### Analyse
- **Modèle d'accords détaillé** : l'attente s'affiche en pourcentage qui
  avance régulièrement (au lieu de « fenêtre 1 sur 15 »).

### Son
- **Sortie audio rendue au Mac** quand rien ne joue depuis 45 secondes, à la
  mise en veille et au changement de casque ou d'enceinte : précaution contre
  le blocage du son observé sur le Mac Intel.
- **Journal audio** dans Aide → Diagnostic… (« Copier le journal audio »),
  à envoyer si le son se bloque encore.

### Réglages et fenêtres
- **Fenêtre « Nouveau morceau » remise en ordre** : le lien en haut, puis le
  fichier, le projet, les récents, les instruments à séparer et la
  proposition des grilles ; elle tient sans défilement, même sur un petit
  écran.
- **Réglages avancés** : taille, source et licence de chaque outil de
  séparation ; « Place sur cet appareil » avec « Libérer ».
- Un message calme si le rendu « meilleure qualité » ne peut pas être gardé
  faute de place.

### Version web (pour le prochain déploiement)
- Ouverture et lecture du morceau gardé sans connexion (application
  installable).

## Version du 15 novembre 2026 (8 h 54)

- Clic droit (Couper, Copier, Coller, Tout sélectionner) dans l'app Mac.
- Boucles calées sur la sous-grille, ou libres sans magnétisme.
- Bouton renommé « Appliquer meilleure qualité ».
- Tempo : une variation brève qui revient au tempo d'avant n'est plus crue.
- Grille : le second accord d'une mesure au milieu ; « Place dans la
  mesure » dans l'éditeur d'accord.
- Impression de la grille (portrait ou paysage, sur une page) et PDF.
- Grilles des standards d'iReal Pro téléchargeables en un clic, utilisées
  pour mieux reconnaître les accords ; basse et reprises prises en compte.
- Second modèle d'accords, plus juste, au choix dans les réglages avancés.
- Métronome avancé (décompte, mesures composées, temps forts et faibles,
  accélération de la boucle) et repères (boucles gardées sous un nom).
