import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getEngine } from './audio';
import { connectEngine } from './audio/connect';
import { App } from './components/App';
import * as actions from './store/actions';
import { checkToolUpdate } from './import/controller';
import { getDevice } from './separation/device';
import { refreshModelList } from './separation/models';
import { setLanguage } from './i18n';
import { startStorage } from './storage';
import { appStore } from './store/store';
import { persistPreferences } from './store/preferences';
import './styles/index.css';

setLanguage('fr');
persistPreferences(appStore);
connectEngine(appStore, getEngine());

const params = new URLSearchParams(window.location.search);
// Lot 3: the device is probed once (automatic choice of the separation tool), and the list of tools is
// fetched from the repository (the bundled copy stays in use if that fails). Not on the test and demo
// addresses (`?debug`, `?demo`, `?moteur=factice`), which must never depend on the network, unless
// `?outils=distant` asks for it.
void getDevice();
const testAddress = params.has('debug') || params.has('demo') || params.get('moteur') === 'factice';
if (!testAddress || params.get('outils') === 'distant') void refreshModelList();
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
    window.__fabtice = { store: appStore, engine: getEngine(), actions, ready: Promise.resolve() };
    void import('./demo/start').then((m) => {
      if (window.__fabtice) window.__fabtice.lot3 = m.lot3Handle;
    });
  }
  // Autosave on, then the kept piece reopened, else the new-piece dialog.
  void startStorage();
  // Mac app: is a newer version of the import tool available? (a discreet offer, never a prompt)
  void checkToolUpdate();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
