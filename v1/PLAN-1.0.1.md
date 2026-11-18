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

## État au 18 novembre 2026 (passation)

Branche `claude/fervent-keller-eqh575`. **Faits et testés** (tests unitaires, pas
encore essayés dans l'app Mac) :

- 1 : `analysis/runner.ts#startAutoAnalysis` (`separationPending`) ; message
  `analysis.afterSeparation` par `setSeparationNotice`.
- 2 : `components/ChordModelSetting.tsx#ChordAnalysisAgain` (panneau d'analyse et
  onglet Détection des accords), `runAnalysis({ fresh })`,
  `applyAnalysis(…, { fresh })` dans un `transact` (annulable). Les sorties des
  réseaux sont réutilisées dès que le son et le modèle sont les mêmes
  (`analysis/fabtice.ts`).
- 3 : `analysis/engine/hand.ts` (accords à la main = source d'indices, poids
  `HAND` fixés par raisonnement, **pas encore mesurés**), passés par
  `KnownCharts.hand` depuis le lanceur.
- 4 : `analysis/engine/tsumugiExtensions.ts` (extensions de la meilleure classe
  Tsumugi), `ChordFrames.detail` → `PooledUnit.detail` → `buildSegments`.
  **Pas encore mesuré sur le banc** (référence : « complet » 65 % son propre,
  48 % vieux disque, `modeles/RECHERCHE.md`).

**Reste à faire** :

- Mesurer 3 et 4 sur le banc (sous-ensemble Tsumugi, `modeles/bench_runs.sh`).
  Attention : la préparation du banc (`preparer.sh`) a réécrit ici trois vérités
  (`bill-bailey`, `blue-bossa`, `blues-valse-sol` : autre vitesse « vieux
  disque », par exemple `speed_cents` −35,7 → +35,0). Comprendre pourquoi avant
  de comparer aux anciens chiffres, et ne pas valider ces fichiers.
- Étape 5 : choisir les pistes harmoniques avec CREMA (rapide) sur chaque
  piste, puis **un seul** passage de Tsumugi sur leur mélange, combiné au
  morceau entier (`engine/chart.ts`, `HarmonyListening`, `engine/listen.ts`
  existent déjà, jamais branchés) ; mesurer avec la vraie séparation
  (`banc/separer.ts`) ; règle de décision ci-dessus. Puis les sections
  corrigées comme points fixes de la forme (`structure/`). Ligne « Écoute : … »
  (`analysis.listensWhole` / `listensStems`, textes déjà prêts).
- Essai de bout en bout dans l'app Mac, puis 6 : changelog, numéros, envoi sur
  `main` (le propriétaire a donné son accord pour publier la 1.0.1 une fois
  l'étape 5 entièrement terminée).
