# Nouveautés de Fabtice

Chaque version publiée sur GitHub (page « Releases ») a sa section ici, la plus
récente en haut. La première section est recopiée sur la page de la version.

## Version 1.0.0

En préparation. Chaque étape du plan (`v1/PLAN.md`) ajoute ici ses nouveautés,
en français simple.

### Nouvelle organisation de l'app
- **Menu Fabtice** : un clic sur le logo, en haut à gauche, ouvre le menu de
  l'app : Annuler, Rétablir, Nouveau projet (à partir d'un lien YouTube ou
  d'un fichier audio), Ouvrir, Enregistrer, Enregistrer sous…, Exporter,
  Imprimer, Réglages, Quitter. Les anciens menus « Exporter » et « ⋯ » ont
  disparu : tout est là. Sur téléphone, le même menu s'ouvre en pleine page.
- **Barre de menus du Mac** : les mêmes commandes, avec leurs raccourcis
  (cmd + O, cmd + S, cmd + P, cmd + virgule pour les Réglages…). Une
  commande impossible sur le moment est grisée.
- **Réglages** : une seule fenêtre large, à sept onglets : Général,
  Instruments, Tempo et analyse, Détection des accords, Métronome, Affichage,
  Avancé. Les petits panneaux (métronome, tempo, accordage) restent pour les
  réglages rapides, avec un lien « Tous les réglages… ».
- Nouveaux réglages : ce que fait l'app à l'ouverture (reprendre le dernier
  projet ou proposer « Nouveau projet »), analyser ou non dès l'import,
  s'appuyer ou non sur les grilles connues, et « Rétablir les réglages
  d'origine ».
- **« Nouveau morceau » devient « Nouveau projet »**, avec une case « Séparer
  les instruments », décochée par défaut. Cochée, tous les instruments sont
  sélectionnés ; un clic en retire un.
- **Grilles des standards** : au démarrage, un message propose de télécharger
  en un clic les grilles des standards de iReal Pro, pour mieux reconnaître
  les accords (« Oui (recommandé) », « Non merci », « Ne plus afficher ce
  message »). Réglages → Avancé montre la liste des recueils, permet d'en
  télécharger ou d'en retirer un, et de « Vérifier les mises à jour de
  grilles ». Sept recueils de plus sont proposés dans l'app Mac (samba,
  choro, Real Book I à III, Beatles…).
- **Imprimer** : cmd + P ouvre une fenêtre avec l'aperçu de la grille, page
  par page, tel qu'il sortira, et les options : format du papier, portrait ou
  paysage, marges, échelle ou « Tenir sur une page », instrument (Ut, Si♭,
  Mi♭), en-tête ; dans l'app Mac, l'imprimante et le nombre de copies.
  « Enregistrer en PDF » est dans la même fenêtre.
- **Chargement plus visible** : pendant une analyse ou une séparation, le
  texte qui l'annonce en haut de l'écran est plus grand, en rouge braise, et
  un reflet le parcourt.
- **Sous-grille** : « Blanches » s'ajoute à la liste, et « Noires » est le
  choix de départ.
- Un projet rouvert au lancement n'est plus annoncé « modifié » quand il est
  identique à son fichier enregistré.

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

### Projet Ableton Live (à l'essai)
- **Exporter → Projet Ableton Live…** crée un dossier à ouvrir dans Ableton
  Live : les pistes en audio, posées au début et jouées telles quelles, la
  courbe de tempo du morceau, ses signatures, ses accords, ses sections et ses
  changements de tonalité en repères. Un projet pour Live 11 et 12, un autre
  pour Live 10 (qui demandera une fois où sont les pistes).
- **À l'essai** : personne n'a encore pu ouvrir ces projets dans un vrai
  Ableton Live ; ils ont été vérifiés avec des outils qui lisent le format de
  Live. Le dossier contient aussi un fichier MIDI et les pistes, qui marchent
  dans tous les cas, et un mode d'emploi.

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
