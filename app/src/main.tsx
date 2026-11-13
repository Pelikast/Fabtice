import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getEngine } from './audio';
import { connectEngine } from './audio/connect';
import { App } from './components/App';
import { setLanguage } from './i18n';
import { appStore } from './store/store';
import { persistPreferences } from './store/preferences';
import './styles/index.css';

setLanguage('fr');
persistPreferences(appStore);
connectEngine(appStore, getEngine());

const params = new URLSearchParams(window.location.search);
if (params.has('demo')) {
  // Synthetic piece for development, tests and screenshots (see demo/demoProject.ts).
  // The dialog stays closed from the first paint instead of flashing.
  appStore.setState((s) => ({ ui: { ...s.ui, newPieceOpen: false } }));
  void import('./demo/start').then((m) => m.startDemo(params));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
