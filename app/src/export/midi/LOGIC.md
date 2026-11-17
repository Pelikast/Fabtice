# Ce que Logic Pro lit d'un fichier MIDI (recherche pour C15.4)

Recherche du 17 novembre 2026, pour « Dossier pour Logic Pro… ». Personne n'a
pu l'essayer dans Logic ici : ce document sépare ce qu'**une source établit**
et ce qui **n'est pas établi** (déduit, rapporté par des utilisateurs, ou pas
trouvé). Le propriétaire tranchera en essayant avec Logic 13.

Accès d'ici : les pages d'aide d'Apple (`support.apple.com`,
`help.apple.com`) n'étaient **pas joignables** depuis l'environnement de
travail ; seuls les extraits des moteurs de recherche l'étaient. Les citations
ci-dessous viennent de ces extraits (guide Logic Pro pour Mac d'Apple, anciens
manuels, forums), pas d'une lecture complète des pages.

## Établi par une source

1. **Ouvrir le fichier MIDI (Fichier > Ouvrir) crée un nouveau projet avec
   les données globales.** Guide Logic Pro pour Mac, « Standard MIDI files » :
   le fichier est chargé comme un nouveau projet qui contient tous les
   événements MIDI, « names of individual tracks, names and positions of
   markers, tempo changes, and copyright marks ». Logic lit les formats 0 et 1.
   — https://support.apple.com/guide/logicpro/standard-midi-files-lgcpdf6a3851/mac
2. **Importer (Fichier > Importer > Fichier MIDI, ou glisser dans la zone des
   pistes) ne prend que les régions**, pas les données globales (tempo,
   signatures…), selon le manuel de Logic 9 et un cours qui cite le manuel :
   « To import the global data, you must open the MIDI file. » Dans les
   versions récentes, glisser un fichier MIDI fait apparaître une question
   « importer le tempo ? » (forums, voir « non établi »).
   — https://help.apple.com/logicpro/mac/9.1.6/en/logicpro/usermanual/chapter_32_section_4.html
   — https://acad.carleton.edu/courses/musc108-00-f14/pages/15/15Lab1_FinalProjectLogicStart.html
3. **Plage de tempo de Logic : 5 à 990 BPM** (aide de Logic Pro 10.1).
   — https://help.apple.com/logicpro/mac/10.1/en.lproj/lgcpc0ba44af.html
4. **Smart Tempo (Logic 10.4 et suivants), mode de tempo du projet.**
   « Conserver » (KEEP) garde le tempo du projet ; un fichier audio importé ne
   s'y conforme que si son réglage Smart Tempo est « Activé » (On…), sinon il
   est lu tel qu'il a été enregistré. « Adapter » (ADAPT) change le tempo du
   projet d'après l'audio ou le MIDI ajouté. « Automatique » (AUTO) choisit
   l'un ou l'autre selon qu'une **référence de tempo musicale** existe dans la
   partie du projet où l'on ajoute l'audio.
   — https://support.apple.com/guide/logicpro/choose-the-project-tempo-mode-lgcpca199cf6/mac
   — https://support.apple.com/en-us/102165
   — https://www.soundonsound.com/techniques/logic-pro-using-smart-tempo
5. **Fréquence d'échantillonnage** : Réglages du projet > Ressources propose
   « Convertir la fréquence d'échantillonnage des fichiers audio à
   l'importation » ; certains guides décrivent une question « Changer le
   projet / Convertir le fichier » quand la fréquence diffère.
   — https://support.apple.com/guide/logicpro/set-the-project-sample-rate-lgcpce0958b8/mac
   — https://online.berklee.edu/help/en_US/logic/1982940-how-to-import-an-audio-file-in-logic-pro
6. **Glisser plusieurs fichiers audio** dans la zone des pistes ouvre la
   fenêtre « Ajouter les fichiers sélectionnés » avec « Créer de nouvelles
   pistes » (Create new tracks) — manuels de Logic 7 et 8, et un script de 2025
   qui vise encore cette fenêtre (« Add Selected Files to Tracks »). Un fichier
   glissé se place à l'endroit du lâcher, calé sur la mesure la plus proche
   (manuel de Logic Pro X).
   — https://www.manualsdir.com/manuals/548098/apple-logic-pro-8.html?page=272
   — https://www.manualsdir.com/manuals/547422/apple-logic-pro-x.html?page=275
7. **Une région MIDI d'accords peut remplir la piste d'accords de Logic**
   (« Analyser » dans l'en-tête de la piste d'accords, Logic 9 ; « Accords >
   Analyser les accords » dans Logic pour iPad).
   — https://help.apple.com/logicpro/mac/9.1.6/en/logicpro/usermanual/chapter_35_section_4.html
   — https://support.apple.com/guide/logicpro-ipad/lpipc614f032/ipados
8. **MIDI** : le méta-événement Marker (FF 06) donne le nom d'un point de la
   séquence, normalement dans la première piste d'un fichier de format 1
   (spécification MIDI 1.0, rappelée par le forum d'Ardour). Le texte MIDI n'a
   pas d'encodage défini.
   — https://discourse.ardour.org/t/importing-markers/104413

## Non établi

- **Signatures et armures à l'ouverture** : la page d'Apple citée en 1 nomme
  le tempo et les marqueurs, pas explicitement les signatures ni les armures ;
  le manuel de Logic 9 range « signatures » parmi les données globales qu'on
  n'obtient qu'en ouvrant le fichier, ce qui laisse penser qu'elles viennent
  à l'ouverture. Pas de source sur les armures mineures.
- **Différences entre Logic 10 et 13** : aucune source trouvée qui décrive un
  changement dans l'ouverture d'un fichier MIDI entre ces versions. Smart
  Tempo n'existe qu'à partir de 10.4.
- **Le mode « Automatique » avec notre projet** : un guide tiers dit qu'une
  région MIDI existante sert de référence de tempo (et que, dans un projet
  vide, c'est l'état du métronome qui décide). Notre fichier contient une
  région « Accords » sur toute la durée : Logic devrait donc « conserver » le
  tempo quand on ajoute les pistes, mais ce n'est pas démontré. D'où le geste 2
  (régler « Conserver » à la main), sans risque.
- **Fréquence du projet créé à l'ouverture d'un fichier MIDI** (44,1 ou
  48 kHz) : pas trouvé. Si le projet est à 44,1 kHz et que Logic convertit les
  pistes, l'alignement ne change pas ; s'il les lisait sans conversion, elles
  seraient trop lentes, d'où la consigne d'accepter le passage à 48 kHz.
- **Encodage du texte des marqueurs** : pas de source. On écrit de l'ASCII
  imprimable (accents retirés : « Theme 1 », « Special ») pour ne jamais voir
  de caractères cassés.
- **Précision du tempo dans Logic** : Logic stocke le tempo avec quelques
  décimales ; si chaque valeur est arrondie, l'erreur reste de l'ordre de la
  microseconde par temps (voir « Choix »), mais rien ne le confirme.
- **Libellés français exacts** des menus de Logic (« Fichier > Ouvrir… »,
  « Conserver », « Créer de nouvelles pistes ») : pas vérifiés sur un Logic en
  français ; le mode d'emploi donne aussi les libellés anglais.
- **Flex** : une région audio ordinaire (pas un Apple Loop) n'a pas Flex
  activé par défaut et ne suit pas le tempo (déduit de 4 et de l'usage ; pas de
  source sur le réglage par défaut « Régler les fichiers audio importés sur »).

## Choix faits pour le fichier

- **Format 1**, 960 tics par noire (Logic compte 3 840 tics par noire en
  interne : 960 le divise ; une triple-croche fait 120 tics, entier). Piste 1 :
  tempo, signatures, armures, marqueurs ; piste 2 : « Accords ».
- **Courbe de tempo exacte** : un changement de tempo sur chaque temps de la
  grille, dans la signature de la mesure (les croches d'une mesure en 6/8).
  Chaque valeur, en microsecondes par noire, est calculée depuis l'instant que
  le fichier a **réellement** atteint (arrondis précédents compris) : l'erreur
  ne s'additionne jamais, elle reste sous la demi-microseconde par noire même
  sur vingt minutes (vérifié par un lecteur indépendant, `midi-file`).
- **Mesure d'attente** : les pistes commencent à 0, la première barre de
  mesure de la grille rarement. La première barre représentée est la première
  barre de la grille après 0 (une mesure de levée quand il y en a une). Avant
  elle, une mesure d'attente dont le tempo est calculé pour durer exactement ce
  temps, entre 20 et 990 BPM (20 : le minimum d'Ableton Live, l'autre
  exportateur ; 990 : le maximum de Logic). Sa signature compte les temps de
  la levée (3/4 pour trois temps d'attente) ; pour un silence plus court qu'un
  demi-temps, une croche, une double ou une triple. Sous une triple-croche à
  990 BPM (environ 7,6 ms), pas de mesure d'attente : la première barre est
  posée à 0 avec cet écart, tous les temps suivants exacts.
- **Signatures** : numérateur et dénominateur de la mesure ; métronome à la
  noire pointée en 6/8, 9/8, 12/8. La règle « la noire reste la noire » de
  Fabtice est celle du MIDI (le tempo est toujours en noires).
- **Armures** : une par passage (modulations comprises), transposée, mode
  mineur gardé, posée sur la barre la plus proche de la modulation.
- **Marqueurs : un par changement d'accord**, plus un à chaque début de partie
  ou de section : « Theme 1 - [A] Bbmaj7 », « [B] Cm7 », « F7 ». Un accord
  répété n'est pas réécrit : dans la piste des marqueurs, chaque case s'étend
  jusqu'au prochain changement et se lit comme une grille. Un marqueur par
  mesure aurait doublé les cases sans rien dire de plus ; un par ligne aurait
  perdu les accords.
- **Piste « Accords »** : chaque accord en notes tenues (basse et accord
  serré autour du do central), jusqu'au suivant. Elle sert à vérifier
  l'alignement à l'oreille, donne une référence de tempo à Smart Tempo, et
  peut remplir la piste d'accords de Logic (7).
- **Pas de piste de clics** : le métronome de Logic suit la courbe de tempo du
  fichier et bat déjà chaque temps.

## Mode d'emploi en trois gestes (dans « Lisez-moi.txt » et à la fin de l'export)

1. Dans Logic Pro, Fichier > Ouvrir… (File > Open…) : ouvrir le fichier
   `.mid`. Logic crée un projet avec le tempo, les signatures, les armures,
   les accords en marqueurs et la piste « Accords ».
2. Régler le mode de tempo du projet sur « Conserver » (KEEP), à côté du
   tempo. (Logic 10.0 à 10.3 n'ont pas ce réglage.)
3. Glisser tous les `.wav` du dossier dans la zone des pistes, sous la piste
   « Accords », au début (mesure 1) ; « Créer de nouvelles pistes » ; accepter
   le passage du projet à 48 kHz si Logic le propose.

À essayer en premier par le propriétaire : que les signatures et les armures
arrivent bien à l'ouverture, que le geste 3 place les pistes à la mesure 1, et
que le métronome tombe sur les temps tout au long du morceau.
