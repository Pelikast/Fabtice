# Plan « Accords et structure » — viser la grille juste

Proposé le 20 novembre 2026, après la demande du propriétaire (accords justes
à 99 % jusqu'à la septième, extensions à plus de 95 %, structure fiable, huit
accords par mesure, le temps de calcul ne compte pas).

**Accepté par le propriétaire le 21 novembre 2026** (« je le trouve bien »),
avec son accord pour préparer 10 à 15 projets corrigés à la main. Il a demandé
les huit accords par mesure d'abord, parce qu'il en a besoin pour corriger ses
projets : l'étape 1 est donc passée avant l'étape 0.

## Où en est le plan (21 novembre 2026)

| Étape | État |
|---|---|
| 1 — Huit accords par mesure | **Faite, publiée dans la version 1.0.3.** À la main : complet. Par l'analyse : une case « à l'essai », décochée d'office, à mesurer à l'étape 0. Deux décisions prises seul, à confirmer (partie 8, point 5). |
| 0 — Mesurer sur de vrais disques | **En attente des projets corrigés du propriétaire** (voir « Comment transmettre les projets » dans l'étape 0). |
| 2 à 6 | Pas commencées. Elles attendent les mesures de l'étape 0. |
| 7 — Modèle entraîné sur du jazz | À décider plus tard. |

Décisions encore attendues, sans urgence : partie 8, points 3, 4, 5 et 6.

## 1. En bref

- Aucun modèle au monde ne lit le jazz ancien à ce niveau. Au concours
  international de 2026 (MIREX), le meilleur système a **67 % de fondamentales
  justes et 47 % d'accords justes jusqu'à la septième** sur 113 vrais disques
  de jazz. Changer de modèle ne suffira donc pas, et le plus récent du lot est
  déjà dans Fabtice (SheetSage2).
- Une oreille y arrive parce qu'elle ne fait pas la même chose qu'un modèle :
  elle écoute la basse, puis les notes du piano, compare les chorus entre eux,
  connaît le morceau, et revient sur ce qui la gêne. Le plan fait faire à
  l'app ces mêmes gestes, un par un, au lieu d'attendre un meilleur modèle.
- Nos chiffres actuels (91 % et 87 %) viennent de **morceaux de synthèse**. Il
  n'y a aucun vrai disque de jazz dans nos mesures. La première étape est de
  mesurer sur de vrais disques, sinon on règle à l'aveugle.
- La structure est fausse parce qu'elle est calculée **à partir des accords
  déjà lus**, eux-mêmes en partie faux. Il faut la trouver dans le son et dans
  la grille du standard, puis s'en servir pour lire les accords — l'inverse
  d'aujourd'hui.
- Objectif honnête : je ne peux pas promettre 99 % **sans aucune retouche**
  sur tous les disques. Je vise une lecture automatique nettement meilleure
  (à chiffrer sur vos disques à chaque étape), puis 99 à 100 % après une
  **vérification guidée de quelques minutes**, où l'app vous mène d'un accord
  douteux à l'autre.

## 2. Où on en est vraiment

Relevés dans le code et dans nos bancs de mesure (pas des estimations).

| Sujet | Constat |
|---|---|
| Mesures | 25 morceaux de synthèse et 24 prises de guitare seule. **Aucun vrai disque de jazz.** Meilleure variante (combinaison SheetSage2 + Tsumugi) : bonne couleur d'accord 91 % (son propre), 87 % (façon vieux disque) ; accord complet avec extensions et basse : 67 % et 54 %. |
| Vrais disques | Seule mesure publique : MIREX 2026, jeu JAAH (113 disques, 1917–1989). SheetSage2 : fondamentale 66,8 %, majeur/mineur 63,8 %, septièmes 46,7 %. Les autres systèmes font moins. C'est cohérent avec ce que vous entendez. |
| Ajouter des modèles | Mesuré sur ces mêmes résultats publics : même en choisissant, morceau par morceau, le meilleur de deux modèles, on ne gagne que 2 à 7 points. La combinaison ne peut pas combler l'écart. |
| Erreurs restantes (banc) | Accord décalé d'un temps (20 % des erreurs), fondamentale à la quinte ou à la quarte (18 %), bonne fondamentale mais septième fausse (15 %, surtout m7 lu 7), famille fausse (14 %), fondamentale à la tierce (13 %). |
| Extensions | Lues par un simple seuil sur douze notes, plus les altérations nommées par Tsumugi. SheetSage2 n'en donne aucune. C'est grossier : aucune note n'est réellement transcrite. |
| Instruments séparés | L'app repasse **le même modèle d'accords** sur les pistes séparées : aucun gain mesuré. Même avec une séparation parfaite, +6 points seulement. Le modèle est la limite, pas le mélange. |
| Grille du standard | Cherchée **par le titre seulement**, et utilisée comme filet de sécurité « en cas de doute important ». |
| Accords par mesure | Au 20 novembre : l'analyse décidait **un accord par temps** au plus (4 en 4/4), la correction à la main en acceptait **2**. Depuis la 1.0.3 : **8 par mesure** à la main ; l'analyse peut chercher entre deux temps (case à l'essai). |
| Structure | Longueur du chorus, lettres, parties : tout part des accords décodés. Mesuré : chorus juste 97 % quand les accords sont justes, 81 % avec un accord sur quatre faux, **33 % avec un sur deux**. Sur un vrai disque, on est dans ce dernier cas. |
| Signal « douteux » | Montre environ la moitié des erreurs ; un accord marqué douteux n'est faux qu'une fois sur quatre (banc de synthèse). |

## 3. Pourquoi l'oreille y arrive et pas un modèle

1. **L'oreille écoute des notes, le modèle une impression d'ensemble.** Un
   musicien cherche la basse, puis la tierce et la septième, puis les notes du
   haut. Les modèles d'accords classent une « couleur de son » parmi des
   étiquettes apprises. En jazz, le pianiste joue souvent sans la fondamentale
   et la contrebasse marche : mesuré sur de vraies lignes de basse de jazz, la
   fondamentale n'est que **33 % des notes de basse**, et elle n'est jouée que
   **68 fois sur 100** au moment où l'accord change. Un modèle qui n'a pas
   appris cela confond Dm7 et G7, ce que nos mesures montrent.
2. **L'oreille revient en arrière.** Elle met en boucle, ralentit, isole. Le
   modèle passe une fois.
3. **L'oreille se sert des reprises.** La même mesure revient à chaque chorus,
   six ou huit fois. Un musicien recoupe ; il n'écrit pas huit grilles
   différentes.
4. **L'oreille connaît le morceau et la grammaire.** Elle sait que c'est
   « All the Things You Are », que la grille fait 36 mesures, qu'un II-V mène
   quelque part.
5. **Les modèles n'ont presque jamais entendu de jazz ancien.** Ils sont
   entraînés sur de la pop ou de la J-pop. Il existe très peu de jazz annoté
   (113 disques d'un côté, 267 de l'autre, publiés en octobre 2026).
6. **Leurs « professeurs » ne sont pas d'accord entre eux.** Quatre musiciens
   experts notant séparément les mêmes chansons pop ne s'accordent que sur
   76 % des fondamentales et 60 % des accords à la septième (étude de 2019 ;
   chiffres repris de résumés, l'article n'a pas pu être relu ici). Un modèle
   entraîné sur de telles étiquettes ne peut pas dépasser ce flou.

Le temps de calcul n'est donc pas ce qui manque. Deux heures de calcul
n'aident que si on les emploie à écouter autrement : séparer, transcrire les
notes, recouper les chorus, comparer à la grille.

## 4. Ce que « 99 % » peut vouloir dire

Un accord n'est pas un fait acoustique, c'est le résumé qu'un musicien écrit.
Deux très bons musiciens n'écrivent pas la même grille. « 99 % juste » n'a de
sens que par rapport à **une référence choisie** : je propose **votre grille
corrigée** (ou celle de votre père), morceau par morceau.

Pour les extensions, c'est encore plus net : le pianiste ne joue pas la même
à chaque chorus (9 ici, 13 là, rien ailleurs). Je propose cette règle, à
valider : *l'extension écrite est celle qu'on entend réellement dans les
notes transcrites, de façon répétée d'un chorus à l'autre, ou tenue par la
mélodie ; sinon l'app n'en écrit pas.* Mieux vaut un « G7 » juste qu'un
« G7(♭9,13) » inventé.

## 5. La stratégie : faire travailler l'app comme une oreille

Quatre idées, dans cet ordre d'importance :

1. **La forme d'abord.** Trouver le chorus dans le son (ce qui se répète) et,
   pour un standard, reconnaître le morceau **à ses accords**, pas seulement à
   son titre. La structure devient le squelette de l'analyse au lieu d'en être
   un sous-produit.
2. **Une grille par chorus, par recoupement.** Additionner ce que l'app entend
   à la même mesure de tous les chorus, écrire UNE grille, puis ne noter une
   différence dans un chorus que si elle s'entend nettement. C'est ainsi qu'on
   relève un standard. La recherche publiée va dans ce sens (recoupement des
   chorus : plus de 10 points gagnés sur du jazz), et notre propre banc aussi :
   à structure juste, le recoupement fait passer la bonne famille d'accord de
   86 à 93 % (son propre) et de 81 à 89 % (vieux disque) ; avec la grille du
   standard, 99,6 à 100 % — sur de la synthèse, à confirmer sur vos disques.
3. **Écouter des notes.** Sur les pistes séparées, transcrire la ligne de
   basse et les notes du piano ou de la guitare avec des modèles faits pour
   cela, puis nommer l'accord à partir des notes : la basse propose la
   fondamentale, tierce et septième donnent la couleur, les notes du haut les
   extensions.
4. **Le doute bien placé, et vite levé.** Là où les indices se contredisent,
   l'app le dit, propose deux ou trois accords, vous les fait entendre sur le
   passage en boucle, et reporte votre choix sur les autres chorus.

## 6. Les étapes

Règle commune : chaque étape est **mesurée sur de vrais disques** (étape 0)
avant d'être gardée. Elle n'est activée d'office que si elle gagne nettement
et qu'aucun morceau ne s'effondre (la règle déjà en usage : au moins 3 points,
aucune chute). Tout reste réglable dans Réglages → Détection des accords.

### Étape 0 — Mesurer sur de vrais disques (condition de tout le reste)

**État : en attente des projets corrigés du propriétaire.**

- **Vos morceaux corrigés.** 10 à 15 projets `.fab` variés (1945 mono, trad
  récent, bossa, cuivres, voix harmonisées), accords corrigés dans l'affichage
  complet. Ils ne vont jamais dans le dépôt public.
- **Ce qu'il faut dans un projet corrigé** pour qu'il serve de référence :
  1. les **mesures justes d'abord** (premier temps, tempo, signature) : un
     accord juste sur une grille décalée compte comme faux ;
  2. **tout le morceau vérifié**, de la première à la dernière mesure. Une
     mesure que vous n'avez pas touchée compte comme « l'analyse avait
     raison » : si vous n'avez vérifié qu'une partie, dites-moi jusqu'où ;
  3. les accords tels que **vous** les écririez : fondamentale, couleur,
     septième ; les extensions seulement quand vous les entendez vraiment
     (règle de la partie 4) ; la basse quand elle n'est pas la fondamentale ;
  4. jusqu'à huit accords par mesure là où c'est ce qui est joué ;
  5. si vous le pouvez : la tonalité, les modulations, les lettres de section
     et les parties (thème, solos). C'est ce qui permettra de mesurer la
     structure (étape 2) ;
  6. le titre exact du standard, quand c'en est un.
  Peu importe le modèle d'accords et les réglages utilisés : la référence est
  ce que vous avez écrit.
- **Comment transmettre les projets.** Le dépôt de Fabtice est public : les
  projets n'y vont pas. Ils passent par un **dépôt GitHub privé** à vous (par
  exemple `fabtice-projets`), que la session de travail peut lire comme vos
  autres dépôts privés :
  1. sur github.com : « New repository », nom `fabtice-projets`, **Private** ;
  2. dans ce dépôt : « Add file » → « Upload files », glisser les `.fab`,
     « Commit changes » ;
  3. me donner le nom du dépôt dans la conversation.
  Limites de GitHub : 25 Mo par fichier par le navigateur, 100 Mo par fichier
  avec l'app GitHub Desktop, rien au-delà. Un projet **sans pistes séparées**
  pèse à peu près le poids du fichier importé (quelques Mo pour un lien
  YouTube ou un mp3) ; ce sont les pistes séparées qui le rendent lourd. Pour
  la mesure, l'enregistrement d'origine et vos corrections suffisent : les
  pistes séparées ne servent qu'à partir de l'étape 5. Si vos projets
  dépassent ces limites, on ajoutera à l'app un « projet allégé, sans les
  pistes séparées » (à décider).
- **Un bulletin de mesure dans l'app Mac** (menu Aide, discret) : sur un
  projet corrigé, l'app relance l'analyse sans regarder vos corrections,
  compare, et écrit un petit fichier : pourcentages (fondamentale, couleur,
  complet, basse), types d'erreurs, et pour chaque temps les candidats de
  chaque source (pas de son, pas de titre si vous préférez). Après chaque
  version, un clic refait la mesure sur les mêmes projets. Il reste utile
  même si vous m'envoyez les projets : il vous montre les chiffres chez vous.
- **Deux jeux publics de vrai jazz** : JAAH (113 disques) et JSIR (267
  enregistrements de 44 standards, avec temps, accords et sections annotés,
  publié en octobre 2026). Les annotations sont publiques ; le son ne l'est
  pas (JSIR donne des liens YouTube). L'app Mac peut les importer chez vous
  comme n'importe quel lien ; une vingtaine suffit pour commencer.
- Sortie : nos vrais chiffres de départ, enfin connus — y compris pour la
  recherche des accords entre deux temps (étape 1), jamais mesurée sur de
  vrais disques.

### Étape 1 — Huit accords par mesure

**État : faite, version 1.0.3 (21 novembre 2026).** Détail dans le code :
`app/README.md`, « Huit accords par mesure (1.0.3) ».

- **À la main : complet.** Un accord se pose sur un temps ou entre deux temps
  (le « et »), jusqu'à huit par mesure à quatre temps (en 6/8 ou 7/8, les
  temps sont déjà des croches : un accord par croche). Dans la fenêtre de
  l'accord : « Ajouter un accord », et « Place dans la mesure » avec un bouton
  « et » entre deux temps. La grille, l'impression, la ligne d'accords de
  « Pistes » et les dossiers pour Logic Pro et Ableton Live suivent.
- **Par l'analyse : à l'essai.** Case « À l'essai : chercher aussi les accords
  entre deux temps » (Réglages → Détection des accords), décochée d'office.
  L'analyse garde sa lecture temps par temps, puis écoute chaque temps en deux
  moitiés ; elle n'écrit un accord sur le « et » que quand il est net, et
  jamais pour un accord joué un peu en avance ou en retard. Réglée sur des
  données de synthèse seulement : **à mesurer sur vos projets (étape 0) avant
  de l'activer d'office**. La préférence pour un, deux ou quatre accords par
  mesure vient du fait que la lecture temps par temps n'est pas touchée.
- **Deux décisions prises seul, à confirmer (partie 8, point 5) :**
  - le dessin : la règle « une seule taille pour tous les accords » est
    gardée. Les accords se rangent sur deux lignes dans la mesure ; si une
    mesure très chargée ne tient toujours pas, toute la grille est écrite un
    palier plus petit (nettement plus petit sur téléphone) ;
  - iReal Pro, qui n'a qu'une case par temps : les accords posés sur les
    temps sont gardés, un accord entre deux temps va sur le temps suivant
    quand il est libre, sinon il est laissé de côté.
- **Ce qui reste limité** : la grille complète simplifiée écrit toujours un ou
  deux accords par mesure, et la détection de la structure lit toujours un
  accord par temps. C'est sans gravité aujourd'hui, et l'étape 3 refait de
  toute façon cette grille.

### Étape 2 — La forme d'abord (corrige la structure)

- **Chorus trouvé dans le son** : ressemblance des mesures entre elles à
  partir de ce que les modèles entendent (toutes leurs hypothèses, pas
  l'accord retenu) et de la ligne de basse, avec tolérance d'un temps perdu ou
  ajouté. Longueurs usuelles favorisées (12, 16, 32 mesures…).
- **Reconnaître le standard à ses accords** : comparer la première lecture à
  **toutes** les grilles des recueils téléchargés, dans les douze tons, et
  proposer « Ce morceau ressemble à … » en un clic. Le titre d'une vidéo est
  souvent faux ou incomplet ; la suite d'accords, elle, se reconnaît même avec
  beaucoup d'erreurs. La grille reconnue donne aussi la forme exacte et les
  lettres de section.
- **La forme répare la grille de mesures** : si un chorus fait 31 mesures et
  trois temps, c'est qu'un temps a été perdu ; l'app le signale ou le corrige.
- **Thème, solos, instruments** : mêmes règles qu'aujourd'hui (niveaux des
  pistes séparées), mais posées sur des chorus justes. JSIR annote ces parties
  sur de vrais disques : on pourra enfin les mesurer.
- **Mode Pop** : SheetSage2 donne déjà des sections (couplet, refrain…) que
  l'app ne lit pas aujourd'hui ; à brancher et à mesurer. Pour le jazz, les
  modèles de structure appris sur la pop ne marchent pas (mesure publiée :
  moins de 20 % de limites justes) : je ne propose pas d'en ajouter.

### Étape 3 — Une grille par chorus, par recoupement

- L'analyse additionne les indices de tous les chorus pour chaque place de la
  forme, en donnant moins de poids aux chorus pauvres en harmonie (solo de
  batterie, solo de basse).
- Elle écrit la grille du chorus, puis, chorus par chorus, ne garde une
  différence (substitution tritonique, II ajouté, accord de passage) que si
  les indices de ce chorus la soutiennent nettement.
- L'affichage complet montre toujours ce qui est entendu à chaque chorus ; la
  grille simplifiée est cette grille du chorus.

### Étape 4 — La grille du standard comme point de départ

- Quand le standard est reconnu et colle au disque, sa grille devient
  **l'hypothèse de départ**, vérifiée mesure par mesure contre le son, avec
  les écarts habituels testés un par un (substitution tritonique, II-V
  ajouté, maj7 ou 6, diminué de passage, relatif). L'accord entendu l'emporte
  dès qu'il est net.
- C'est un changement par rapport à votre règle actuelle (la grille connue
  comme simple filet) : **à décider** (partie 8). C'est la méthode avec
  laquelle les auteurs de JSIR ont eux-mêmes annoté leurs disques : partir de
  la grille, corriger ce qui est joué autrement.
- Un accord qui vient du livre sans être confirmé par le son peut porter une
  marque discrète, pour que vous sachiez d'où il vient.

### Étape 5 — Écouter des notes (fondamentale, couleur, extensions)

Demande une séparation (BS-RoFormer SW sur le M1 de préférence). Devient une
option « Analyse approfondie », longue, pour ordinateur.

- **Basse** : un modèle de transcription de contrebasse entraîné sur du jazz
  (voir partie 7) sur la piste de basse. Puis un petit calcul qui connaît la
  basse qui marche : fondamentale probable sur le temps où l'accord change,
  tierce ou quinte ailleurs, notes d'approche avant le changement.
- **Piano, guitare** : un modèle de transcription de piano sur la piste
  correspondante. Les notes de chaque temps donnent tierce, septième et
  tensions réelles.
- **Mélodie** (voix, vents) : la hauteur tenue sur les temps forts du thème
  confirme une extension écrite (une mélodie sur la ♯11, par exemple).
- **Nommer l'accord à partir des notes**, et faire voter ce résultat avec
  les deux modèles d'accords, les reprises et la grille. Les poids du vote
  sont appris sur les vrais disques de l'étape 0, plus à la main.
- **Extensions** : écrites seulement quand les notes sont là (règle de la
  partie 4).
- Limite connue : sur un disque de 1945, la contrebasse est parfois presque
  inaudible, même séparée. L'app doit alors le dire et s'appuyer sur le piano
  et les reprises.

### Étape 6 — Le doute bien placé et la « tournée des doutes »

- Fiabilité recalculée avec toutes les sources (accord entre chorus, entre
  modèles, avec les notes, avec le livre), réglée sur les vrais disques.
- **Tournée des doutes** : un bouton mène d'un accord douteux au suivant. Pour
  chacun : le passage en boucle, ralenti si on veut, basse et piano mis en
  avant, deux ou trois accords proposés ; un bouton fait **entendre l'accord
  proposé** joué par-dessus le disque, pour juger à l'oreille en deux
  secondes. Le choix se reporte sur la même mesure des autres chorus (cela
  existe déjà pour les corrections).
- But : passer de « presque juste » à 99–100 % en quelques minutes par
  morceau, au lieu de tout relire.

### Étape 7 — Un modèle entraîné sur du jazz (recherche, à décider plus tard)

- Les auteurs de JSIR rapportent 16 à 25 points gagnés sur le jazz en
  entraînant leur modèle sur leurs 267 enregistrements (chiffre repris d'un
  résumé). SheetSage2 a été entraîné surtout sur du son de synthèse : notre
  générateur de grilles, d'arrangements et de « vieux disque » peut produire
  des milliers d'heures de jazz étiqueté sans erreur.
- Il faut louer une carte graphique quelques jours et régler deux questions
  de droit (les annotations JSIR sont en CC BY-SA ; leur son vient de
  YouTube). À ne décider qu'après les étapes 0 à 5, quand on saura ce qu'il
  reste à gagner.

## 7. Modèles : ce que la recherche a donné

Recherche du 20 novembre 2026 (Hugging Face, GitHub, résultats officiels
MIREX 2026). « Vu » : page ou fichiers ouverts ; « résumé » : repris d'un
résumé, à revérifier avant usage.

| Modèle | À quoi il servirait | Licence, taille | Avis |
|---|---|---|---|
| SheetSage2 (déjà là) | Meilleur modèle publié sur le jazz (MIREX 2026, vu) ; donne aussi des sections | CC BY-NC 4.0 | Garder. Lire aussi ses sections (mode Pop). |
| Tsumugi-Chords (déjà là) | Extensions et basse | CC BY-NC 4.0 | Garder. |
| Transcription de contrebasse (X. Riley, `xavriley/midi-transcription-models`) | Ligne de basse sur la piste séparée ; entraîné sur du jazz | MIT, environ 95 Mo (vu) ; précision non publiée sur la page | **À essayer en premier** (étape 5). Il existe aussi guitare, saxophone, piano. |
| Transcription de piano (Kong, version ONNX `leejsool/dsmuse-models`) | Notes du piano sur la piste séparée | CC BY 4.0 annoncée, 154 Mo (vu) | **À essayer** (étape 5). Transkun (MIT) est plus précis sur piano propre, sans fichier ONNX. |
| ChordSync (2024) | Aligner une suite d'accords connue sur le son | MIT, poids dans le dépôt (vu) | À comparer à notre propre alignement (étape 4). |
| consonance-ACE (2025) | Un avis de plus, qui décompose l'accord en notes | MIT, poids dans le dépôt (vu) ; entraîné sur la pop | Essai peu coûteux ; gain attendu faible. |
| ChordFormer | A des sorties séparées pour 9, 11, 13 ; 46 % de septièmes sur JAAH | Poids retirés par l'auteur en septembre 2026, aucune licence | **Écarté** : usage non autorisé clairement. |
| YourMT3+ | Transcrire tous les instruments sans séparation | Code GPL-3 ; poids 2,8 Go, licence non précisée | En réserve. La transcription d'un mélange entier reste faible. |
| MuScriptor | Transcription | Demande un compte pour télécharger | Écarté (règle « sans compte »). |
| SongFormer | Sections pour la pop (meilleur modèle ouvert) | 0,7 milliard de paramètres | Pas pour le jazz ; SheetSage2 donne presque autant en pop. |
| Gros modèles généralistes (MOSS-Music 8B, Gemini…) | Disent lire les accords | — | Écartés : aucune mesure sérieuse, ou 6 à 65 % seulement à partir du son. |

Conclusion : il n'y a pas de meilleur modèle d'accords à ajouter. Les modèles
utiles sont ceux qui **transcrivent des notes** et ceux qui **alignent une
grille**.

## 8. Ce que j'attends de vous

État au 21 novembre 2026.

1. **Feu vert** sur ce plan et sur l'ordre des étapes : **donné** (21
   novembre), avec l'étape 1 passée en premier.
2. **Vos projets corrigés** (10 à 15, variés) : **accordés, à venir**. Comment
   les préparer et les transmettre : étape 0. Reste à me dire si vous êtes
   d'accord pour importer chez vous une vingtaine de morceaux des jeux publics.
3. **La référence** : « juste » = conforme à votre grille corrigée ; et la
   règle des extensions de la partie 4. *Attendu.*
4. **La grille du standard comme point de départ** (étape 4), au lieu du
   simple filet de sécurité. Avec ou sans marque sur les accords « du livre ».
   *Attendu, à décider avant l'étape 4.*
5. **Huit accords par mesure** : fait. *À confirmer ou à changer* : le dessin
   d'une mesure très chargée (aujourd'hui : taille unique gardée, toute la
   grille plus petite si besoin ; l'autre choix serait d'écrire plus petit la
   seule mesure chargée, ou de la faire plus large) ; et l'export iReal Pro
   (aujourd'hui : accords des temps gardés ; l'autre choix serait de couper la
   mesure en deux).
6. **Séparation obligatoire** pour l'analyse approfondie (étape 5) : d'accord
   pour que l'app la lance d'elle-même quand cette analyse est demandée ?
   *Attendu, à décider avant l'étape 5.*
7. Plus tard : l'entraînement d'un modèle sur du jazz (étape 7).

## 9. Ce que je ne sais pas encore

- Nos vrais chiffres sur vos disques (étape 0).
- Ce que vaut la recherche des accords entre deux temps (1.0.3) sur un vrai
  disque : elle n'a vu que des données de synthèse.
- Ce que valent les modèles de transcription sur des pistes séparées de
  disques des années 1930–1950 : personne ne l'a publié. C'est le principal
  risque de l'étape 5.
- Le gain réel de chaque étape sur de vrais disques : tout ce qui est chiffré
  plus haut vient soit de nos morceaux de synthèse, soit d'articles sur
  d'autres morceaux.
- Plusieurs chiffres d'articles n'ont pu être lus que dans des résumés
  (accord entre annotateurs, gains de JSIR, recoupement des chorus) ; ils
  sont signalés comme tels.
