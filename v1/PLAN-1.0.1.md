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
