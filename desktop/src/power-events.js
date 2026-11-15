'use strict';

// What macOS says about power and about Chromium's own processes, for the
// sound (see the owner's report of 15 November: the Mac's audio stopped
// working after Fabtice had been open a long time, until a restart).
//
//  - The Mac goes to sleep, wakes up, the screen is locked or unlocked
//    (Electron's powerMonitor): written to the audio journal and forwarded to
//    the windows (`fabtice:power`), whose engine then gives the audio output
//    back to the system (app/src/audio/deviceLifecycle.ts). Nothing here keeps
//    the Mac awake: the app never uses powerSaveBlocker (a test checks it).
//  - The Mac gets hot (thermal state), shuts down: journal only.
//  - A Chromium process stops (the audio service, the graphics process, a
//    page): journal only, with its kind and the reason Chromium gives.
//
// Kept apart from main.js (which only calls `installPowerEvents`) so that it
// can be tested with stand-ins for powerMonitor and app.

const FORWARDED = {
  suspend: 'Le Mac se met en veille',
  resume: 'Le Mac sort de veille',
  'lock-screen': 'Écran verrouillé',
  'unlock-screen': 'Écran déverrouillé',
};

const THERMAL = { nominal: 'normale', fair: 'tiède', serious: 'élevée', critical: 'critique', unknown: 'inconnue' };

/** « le service audio », « le processus graphique »… from a `child-process-gone` detail (no paths in it). */
function processLabel(details) {
  const name = `${details && details.serviceName ? details.serviceName : ''} ${details && details.name ? details.name : ''}`;
  if (/audio/i.test(name)) return 'le service audio de Chromium';
  if (details && details.type === 'GPU') return 'le processus graphique';
  if (/network/i.test(name)) return 'le service réseau';
  return `un processus ${details && details.type ? String(details.type) : 'inconnu'}${details && details.name ? ` (${String(details.name).slice(0, 60)})` : ''}`;
}

/**
 * powerMonitor and app: Electron's (or stand-ins with `on`/`removeListener`); journal: audio-journal.js;
 * send(payload): to every window. Returns the function that removes the listeners.
 */
function installPowerEvents({ powerMonitor, app, journal, send }) {
  const offs = [];
  const on = (emitter, name, fn) => {
    emitter.on(name, fn);
    offs.push(() => emitter.removeListener(name, fn));
  };

  for (const [kind, text] of Object.entries(FORWARDED)) {
    on(powerMonitor, kind, () => {
      journal.add('system', kind === 'suspend' ? 'sleep' : kind === 'resume' ? 'wake' : kind, text);
      try {
        send({ kind });
      } catch {
        // a window going away: it has no audio left to release
      }
      // the journal must survive a Mac that does not wake up properly
      if (kind === 'suspend') void journal.flush();
    });
  }
  on(powerMonitor, 'thermal-state-change', (details) => {
    const state = details && typeof details === 'object' ? details.state : details;
    journal.add('system', 'thermal', `Température du Mac : ${THERMAL[state] || 'inconnue'}`);
  });
  on(powerMonitor, 'shutdown', () => {
    journal.add('system', 'shutdown', 'Arrêt ou redémarrage du Mac');
    void journal.flush();
  });

  on(app, 'child-process-gone', (_event, details) => {
    const reason = details && details.reason ? String(details.reason) : 'inconnue';
    const code = details && Number.isFinite(details.exitCode) ? `, code ${details.exitCode}` : '';
    journal.add('system', 'process-gone', `${processLabel(details)} s’est arrêté (raison : ${reason}${code})`);
  });
  on(app, 'render-process-gone', (_event, _contents, details) => {
    const reason = details && details.reason ? String(details.reason) : 'inconnue';
    journal.add('system', 'page-gone', `Une fenêtre de Fabtice s’est arrêtée (raison : ${reason})`);
  });
  on(app, 'before-quit', () => {
    journal.add('system', 'quit', 'Fabtice se ferme');
    void journal.flush();
  });

  journal.add('system', 'app-start', 'Fabtice démarre');
  return () => offs.splice(0).forEach((f) => f());
}

module.exports = { installPowerEvents, processLabel };
