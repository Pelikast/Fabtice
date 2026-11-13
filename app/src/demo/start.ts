// `?demo` start-up: opens the synthetic piece and exposes a debugging handle
// for the smoke test (`window.__fabtice`). Never loaded without `?demo`.

import { getEngine } from '../audio';
import { appStore } from '../store/store';
import * as actions from '../store/actions';
import { demoProject } from './demoProject';

declare global {
  interface Window {
    __fabtice?: { store: typeof appStore; engine: ReturnType<typeof getEngine>; actions: typeof actions; ready: Promise<void> };
  }
}

export function startDemo(params: URLSearchParams): Promise<void> {
  const ready = (async () => {
    const input = demoProject();
    await actions.openProject(input);
    if (input.loop) actions.seek(input.loop.start);
    // `?demo&vue=grille` opens on the chord chart view.
    if (params.get('vue') === 'grille') actions.setViewMode('grille');
  })();
  window.__fabtice = { store: appStore, engine: getEngine(), actions, ready };
  return ready;
}
