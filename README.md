# Fabtice

Un outil de travail pour musiciens, dans le navigateur : séparation des
instruments, boucles, changement de tonalité et de tempo, grille d'accords.

Le projet est en phase de prototypes. Licence : GPL-3.0-or-later.

## Organisation

- `web/` — l'application (site statique, déployé sur Netlify).
- `server/` — le petit service qui relaie l'audio d'un lien vers le navigateur.
  Rien n'est conservé : l'audio transite en mémoire le temps de la requête.
  - `server/deploy/cloud-init.yaml` — à coller à la création du serveur.
  - `server/deploy/update.sh` — déploiement automatique à chaque mise à jour
    de la branche `main`.
