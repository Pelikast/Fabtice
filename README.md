# Fabtice

Un outil de travail pour musiciens : séparation des instruments, boucles,
changement de tonalité et de tempo, grille d'accords. Tout le traitement se
fait sur l'appareil de l'utilisateur.

Licence : GPL-3.0-or-later.

## Télécharger

- **App Mac** (macOS 12 Monterey ou plus récent) : la dernière version est sur
  https://github.com/pelikast/fabtice/releases/latest. Prenez
  `Fabtice-mac-apple-silicon.dmg` pour un Mac à puce Apple (M1, M2, M3, M4…)
  ou `Fabtice-mac-intel.dmg` pour un Mac Intel (menu Pomme → **À propos de
  ce Mac** : ligne « Puce » ou « Processeur »). L'app n'est pas signée par un
  développeur identifié : la première ouverture est expliquée dans
  [`desktop/README.md`](desktop/README.md#ouvrir-lapp-la-première-fois).
  Ensuite, elle se met à jour d'elle-même.
- **App web** : https://fabtice.netlify.app, sans rien installer.

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
- `CHANGELOG.md` — les nouveautés de chaque version publiée, en français
  simple (recopiées sur la page de la version).
- `PASSATION.md` — l'état des lieux pour reprendre le projet ; `v1/` — le
  cahier des charges, le plan et les bilans d'étape de la version 1.0.0.
