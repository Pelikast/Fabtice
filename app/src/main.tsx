import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getEngine } from './audio';
import { connectEngine } from './audio/connect';
import { App } from './components/App';
import * as actions from './store/actions';
import { checkToolUpdate } from './import/controller';
import { setLanguage } from './i18n';
import { startStorage } from './storage';
import { appStore } from './store/store';
import { persistPreferences } from './store/preferences';
import './styles/index.css';

setLanguage('fr');
persistPreferences(appStore);
connectEngine(appStore, getEngine());

const params = new URLSearchParams(window.location.search);
// The dialog stays closed from the first paint instead of flashing: it opens
// once we know whether a piece is kept on the device (see storage/restore.ts).
appStore.setState((s) => ({ ui: { ...s.ui, newPieceOpen: false } }));
if (params.has('demo')) {
  // Synthetic piece for development, tests and screenshots (see demo/demoProject.ts).
  // It is never kept on the device and never replaces the kept piece.
  void import('./demo/start').then((m) => m.startDemo(params));
} else {
  // `?debug`: the same handle as `?demo` (store, engine, actions) for the browser checks, without the demo piece.
  if (params.has('debug')) window.__fabtice = { store: appStore, engine: getEngine(), actions, ready: Promise.resolve() };
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
