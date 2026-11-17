import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getEngine } from './audio';
import { connectEngine } from './audio/connect';
import { watchAudioDevice } from './audio/deviceLifecycle';
import * as audioJournal from './audio/journal';
import { getDesktopBridge } from './platform/desktopBridge';
import { App } from './components/App';
import * as actions from './store/actions';
import { checkToolUpdate } from './import/controller';
import { refreshModelList } from './separation/models';
import { setLanguage } from './i18n';
import * as standardsLibrary from './standards/library';
import { initStandards, markLaunched } from './standards/offer';
import { startStorage } from './storage';
import { appStore } from './store/store';
import { registerServiceWorker } from './pwa/register';
import { persistPreferences } from './store/preferences';
import * as historyModule from './store/history';
import { installProjectWindow } from './project/windowState';
import { installMenuBar } from './ui/menuBar';
import * as projectModules from './project/debug';
import * as tapFixModule from './analysis/tapFix';
import { setChordModelAutoAllowed } from './analysis/chordModel';
import { standardsStore } from './standards/offer';
import { harmonyHandle, startHarmonyRefresh, suspendHarmonyRefresh } from './structure/refresh';
import { installStructureEvidence } from './structure/gather';
import './styles/index.css';

setLanguage('fr');
persistPreferences(appStore);
connectEngine(appStore, getEngine());
// « Annuler » / « Rétablir » and the « modified » state follow the store; a loop put back while playing is heard
// at once, like any new loop.
historyModule.startHistory(appStore, { afterRestore: (s, before) => s.loop !== before.loop && actions.enterLoop() });
// Stage 5: the harmony pass (modulations, structure) runs again, a moment after any change of what it reads; a
// download of the library of standards may bring the known chart of the piece. The audio in memory says who plays
// (`structure/gather.ts`), and the recogniser of the page names the wind soloists once a separation is there.
startHarmonyRefresh({ ...installStructureEvidence(), onLibraryChange: (listener) => standardsStore.subscribe((st, prev) => st.status !== prev.status && listener()) });
// The window's title and the Mac app's « modified » dot, the file of the project, closing with changes not saved.
installProjectWindow();
// Mac app: the menu bar shows the page's commands, greyed out as in the menu Fabtice, and sends its clicks back.
installMenuBar();
// The audio output goes back to the system on sleep, wake, a device change, a hidden or closed page
// (the engine also lets it go by itself after a while without playback): see audio/deviceLifecycle.ts.
{
  const bridge = getDesktopBridge();
  watchAudioDevice({
    engine: getEngine(),
    doc: document,
    win: window,
    devices: typeof navigator !== 'undefined' && navigator.mediaDevices ? navigator.mediaDevices : null,
    onPower: bridge?.onPower ? (cb) => bridge.onPower!(cb) : null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  });
}

const params = new URLSearchParams(window.location.search);
// `?harmonie=non`: the browser checks that stand in for the detection keep what they set.
if (params.get('harmonie') === 'non') suspendHarmonyRefresh();
// Lot 3: the list of separation tools is fetched from the repository (the bundled copy stays in use if that
// fails, silently: a 404, a refused or invalid list). Not fetched, unless `?outils=distant` asks for it: on
// the test and demo addresses (`?debug`, `?demo`, `?moteur=factice`) and on a page served from this machine
// (development, the browser checks), which must never depend on the network. The Mac app fetches it like the
// web app (its security policy allows that one address, `desktop/src/protocol.js`).
const localPage = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
const testAddress = params.has('debug') || params.has('demo') || params.get('moteur') === 'factice' || localPage;
if (!testAddress || params.get('outils') === 'distant') void refreshModelList();
// The chord charts of standards: what is on the device, and the remote list of collections (same rule as above).
// The message that offers them (C9) is for the real pages; a test address shows it only when `?grilles=message` asks.
// The chord model « Automatique » takes the detailed model when the device allows it (68 MB downloaded the first time,
// minutes per piece): on a test address it stays on the standard model, so that no check starts that download by
// itself; `?modele-accords=auto` applies the real rule there. A choice made in the settings is always used.
if (testAddress && params.get('modele-accords') !== 'auto') setChordModelAutoAllowed(false);
void initStandards({ remoteList: !testAddress || params.get('outils') === 'distant', message: !testAddress || params.get('grilles') === 'message' });
// The dialog stays closed from the first paint instead of flashing: it opens
// once we know whether a piece is kept on the device (see storage/restore.ts).
appStore.setState((s) => ({ ui: { ...s.ui, newPieceOpen: false } }));
if (params.has('demo')) {
  // Synthetic piece for development, tests and screenshots (see demo/demoProject.ts).
  // It is never kept on the device and never replaces the kept piece.
  void import('./demo/start').then((m) => m.startDemo(params));
} else {
  // `?debug`: the same handle as `?demo` (store, engine, actions) for the browser checks, without the demo piece.
  if (params.has('debug')) {
    window.__fabtice = { store: appStore, engine: getEngine(), actions, standards: standardsLibrary, audioJournal, history: historyModule, project: projectModules, tapFix: tapFixModule, harmony: harmonyHandle, ready: Promise.resolve() };
    void import('./demo/start').then((m) => {
      if (window.__fabtice) {
        window.__fabtice.lot3 = m.lot3Handle;
        window.__fabtice.lot4 = m.lot4Handle;
        window.__fabtice.structure = m.structureHandle;
      }
    });
  }
  // Autosave on, then the kept piece reopened, else the new-piece dialog. Then (Mac app) the `.fab`
  // files opened from the Finder, which replace it as an import would.
  // The message of the chord charts waits for the start-up to be over (`markLaunched`).
  void startStorage()
    .then(() => import('./project/fromDesktop').then((m) => m.followOpenedProjects()))
    .finally(markLaunched);
  // Mac app: is a newer version of the import tool available? (a discreet offer, never a prompt)
  void checkToolUpdate();
}

// Lot 4: the web app works offline once loaded (never in the Mac app, never on the test addresses unless asked).
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
