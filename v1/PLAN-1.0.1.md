# Plan de la version 1.0.1 — accords et réanalyse

Décisions du propriétaire du 18 novembre 2026, après ses essais de la 1.0.0.

1. **D'abord la séparation, puis l'analyse.** Quand une séparation est demandée
   (à l'import ou plus tard), l'analyse attend sa fin ; une analyse en cours
   s'arrête. À la fin de la séparation, accords et structure sont réanalysés
   d'eux-mêmes, corrections gardées (« Accords mis à jour avec les instruments
   séparés »). Échec ou annulation : l'analyse part sur le morceau entier. Le
   tempo écoute toujours le morceau entier (règles figées).
2. **Fenêtre « Analyser de nouveau »** : « Garder mes corrections » (cochée par
   défaut). Décochée : tout repart de zéro (accords, tonalité, modulations,
   sections, structure, grille, actions du clic droit, signatures), après
   confirmation, annulable. Les réseaux ne retournent que si le son ou le
   modèle a changé ; la structure est toujours recalculée.
3. **Corrections comme fort indice** : un accord corrigé pèse sur la même
   mesure des autres reprises et sur ses voisins (l'accord entendu l'emporte
   s'il est net) ; sections corrigées = points fixes de la forme.
4. **Extensions et basse de Tsumugi** gardées jusqu'à la grille.
5. **Accords sur les instruments séparés** (Tsumugi sur le mélange des parties
   harmoniques) : activé par défaut si le banc montre un gain net, sinon case
   « Écouter aussi les instruments séparés » décochée dans Détection des
   accords.
6. Tests, essai dans l'app Mac, `CHANGELOG.md` (1.0.1), numéros de version.

## Pour plus tard (quand le propriétaire aura le temps)

- Il enverra 2 ou 3 projets `.fab` variés (1945 mono, trad récent, cuivres ou
  voix harmonisées), tous les accords corrigés dans l'affichage complet. Jamais
  dans le dépôt (public).
- Avec eux : mesurer l'**analyse poussée** (plusieurs écoutes du même passage,
  jusqu'à trois fois plus longue ; mise de côté), et revérifier 3 à 5 sur ses
  vrais disques.

## État au 18 novembre 2026 : 1.0.1 terminée et publiée

Les six étapes sont faites. Chiffres du banc dans `web/spikes/accords/modeles/RECHERCHE.md`
(section « Version 1.0.1 »), Tsumugi passant par le code de l'app (`modeles/bench/tsumugiApp.ts`).

- 3 : poids `HAND` mesurés en simulant des corrections (`modele-mains`) : own 0,5, partner 3 ;
  +2,0 points (synthèse propre), +2,9 (vieux disque), GuitarSet inchangé.
- 4 : les extensions de Tsumugi seules faisaient perdre « complet » (67 → 61 %) ; retenu : les
  notes, plus les altérations nommées par Tsumugi (♭9, ♯9, ♯11, ♭13), sans perte.
- 5 : instruments séparés (vraie séparation HTDemucs, 14 morceaux × 2 sons) : pas de gain
  (−0,4 / −1,8 point, un morceau à −16) ; case « Écouter aussi les instruments séparés »
  décochée par défaut, morceau entier pesant 0,7 quand elle est cochée. Lettres de section à la
  main = points fixes de la forme (`structure/form.ts#CUE_HAND`). Ligne « Écoute : … ».
- 6 : tests unitaires, essais Electron (dont `analysis-fine.test.js` avec les instruments séparés),
  `CHANGELOG.md`, numéros 1.0.1.
- Préparer le banc réécrit trois vérités (`bill-bailey`, `blue-bossa`, `blues-valse-sol`) : la
  borne `MAX_DETUNE` (±35 cents) de `corpus/render.py` est postérieure à ces fichiers. Ne pas les
  valider ; les mesures se comparent entre elles sur les données préparées le même jour.
