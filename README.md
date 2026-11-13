# Fabtice

Un outil de travail pour musiciens : séparation des instruments, boucles,
changement de tonalité et de tempo, grille d'accords. Tout le traitement se
fait sur l'appareil de l'utilisateur.

Le projet est en phase de prototypes. Licence : GPL-3.0-or-later.

## Organisation

- `app/` — les sources de l'interface (TypeScript, React, Vite), communes à
  l'app web et à l'app Mac ; voir `app/README.md`.
- `web/` — le site statique déployé sur Netlify : l'interface construite depuis
  `app/` (`index.html` et `assets/`, non versionnés), la maquette validée
  (`maquette/`) et les pages de test des prototypes (`spikes/`).
- `desktop/` — l'app Mac, qui ajoute l'import par lien ; elle reçoit la même
  interface construite dans `desktop/ui/`.
- `CLAUDE.md` — le cahier des charges et les conventions du projet.
- `DESIGN.md` — le design validé, qui fait référence pour l'interface.
