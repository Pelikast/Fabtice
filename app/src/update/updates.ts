// The update of Fabtice (C16), on the screen side, for both forms of the app:
//
//   - Mac app: the main process does everything (`desktop/src/updater.js`); its state comes through the bridge
//     (`onUpdateState`). At opening, if « Vérifier à chaque ouverture » is ticked, the page asks for a search a
//     few seconds after it is up (`launch`): up to date or any failure, nothing is shown; a newer version, the
//     message « Une mise à jour est disponible ». « Rechercher une mise à jour… » in the menu bar always shows its
//     answer in the message window; in Réglages → Général, in the section.
//   - Web app: a new version of the site installs in the background (`pwa/sw.js`) and waits until the pages of
//     the old one are closed. When the version waiting is not the one this page runs (the build id each version
//     carries, `pwa/build.ts`), the message « Une nouvelle version de Fabtice est prête » offers to reload on it
//     at once (`fabtice-skip-waiting`). « Rechercher une mise à jour… » asks the browser to look now
//     (`registration.update()`).
//
// One window at a time: the message waits for the other windows of the app, the start-up message of the chord
// charts included (`ui/windows.ts` counts it in turn). « Plus tard » leaves it until the next opening.

import { createStore } from 'zustand/vanilla';
import { getDesktopBridge, type UpdateState } from '../platform/desktopBridge';
import { saveActivity } from '../project/saveFlow';
import { abletonDialog } from '../export/ableton/dialog';
import { logicDialog } from '../export/logic/dialog';
import { appStore } from '../store/store';
import { BUILD_ID } from '../pwa/build';

/** Where the web app's search is. */
export type WebUpdatePhase = 'idle' | 'checking' | 'up-to-date' | 'ready' | 'failed' | 'unsupported' | 'reloading';

/** Something long that an update (or a reload) would stop, said before it is started. */
export type BusyWork = 'separation' | 'analysis' | 'render' | 'import' | 'save' | 'export';

export interface UpdateUi {
  /** `desktop`: the Mac app's own update; `web`: a new version of the site; `none`: neither (a test page, an old Mac app). */
  mode: 'desktop' | 'web' | 'none';
  desktop: UpdateState | null;
  web: { phase: WebUpdatePhase; error: 'network' | null };
  /** The message window: closed, or who opened it (the search at opening, or the menu bar). */
  message: { origin: 'launch' | 'menu' } | null;
  /** Waiting for its turn (another window is in the way). */
  pending: { origin: 'launch' | 'menu' } | null;
  /** « Plus tard » on this version: the message does not come back for it until the next opening. */
  later: string | null;
  /** « Un calcul est en cours… »: the question before an update that would stop it (where it was asked). */
  confirm: { work: BusyWork; where: 'message' | 'section' } | null;
}

export const updateStore = createStore<UpdateUi>()(() => ({
  mode: 'none',
  desktop: null,
  web: { phase: 'idle', error: null },
  message: null,
  pending: null,
  later: null,
  confirm: null,
}));

const set = (patch: Partial<UpdateUi>) => updateStore.setState(patch);
const get = () => updateStore.getState();

/** True while the message window is on screen (the commands of the menu are then greyed out, other windows wait). */
export function updateMessageOpen(): boolean {
  return get().message !== null;
}

// ---------------------------------------------------------------- what is running

/** The long work an update would stop now, or null. */
export function busyWork(): BusyWork | null {
  const s = appStore.getState();
  if (s.separationRun.status === 'running') return 'separation';
  if (s.render.status === 'rendering') return 'render';
  if (s.ui.import.kind === 'busy') return 'import';
  if (saveActivity.getState().phase === 'working') return 'save';
  if (s.ui.exportAudioOpen || logicDialog.getState().open || abletonDialog.getState().open) return 'export';
  if (s.analysisRun.status === 'running') return 'analysis';
  return null;
}

// ---------------------------------------------------------------- the message: when it comes

let windowInTheWay: () => boolean = () => false;

/** Asks for the message; it comes when no other window is in the way. */
function want(origin: 'launch' | 'menu'): void {
  if (get().message) {
    // Already on screen: a search from the menu bar takes it over (its answer is shown in it).
    if (origin === 'menu') set({ message: { origin } });
    return;
  }
  set({ pending: { origin } });
  showPending();
}

/** Shows the message waiting for its turn, if its turn has come. */
export function showPending(): void {
  const { pending, message } = get();
  if (!pending || message) return;
  if (windowInTheWay()) return;
  set({ message: pending, pending: null });
}

/** « Plus tard », Échap, « Fermer ». */
export function closeUpdateMessage(): void {
  const { message, desktop, web, mode } = get();
  if (!message) return;
  const later = mode === 'desktop' ? (desktop?.available?.version ?? null) : web.phase === 'ready' ? 'web' : null;
  set({ message: null, confirm: null, later: later ?? get().later });
}

/** The Mac app's state, as it comes: the message follows it. */
function onDesktopState(state: UpdateState): void {
  const before = get().desktop;
  set({ desktop: state });
  // The menu bar's search shows its window at once (« Recherche d'une mise à jour… »), then its answer in it.
  if (state.origin === 'menu' && state.phase === 'checking' && !(before?.origin === 'menu' && before.phase === 'checking') && !appStore.getState().ui.settings.open) {
    want('menu');
    return;
  }
  // A new answer of a search (`seq` grows with each); the progress of an update is not one.
  if (before !== null && state.seq === before.seq) return;
  if (state.origin === 'menu') {
    // The menu bar: the answer is shown, whatever it is. Réglages open: it is in its section, on « Général ».
    const s = appStore.getState();
    if (s.ui.settings.open) {
      appStore.setState((st) => ({ ui: { ...st.ui, settings: { ...st.ui.settings, tab: 'general' } } }));
      return;
    }
    want('menu');
    return;
  }
  if (state.origin === 'launch' && state.phase === 'available' && state.available) {
    // Too old a macOS for it: nothing to offer at opening (the section says it).
    if (state.blocked?.code === 'system') return;
    if (get().later === state.available.version) return;
    want('launch');
  }
}

// ---------------------------------------------------------------- the Mac app

/** « Rechercher une mise à jour… » in Réglages (Mac app or web). */
export async function checkNow(): Promise<void> {
  const mode = get().mode;
  if (mode === 'desktop') {
    const bridge = getDesktopBridge();
    const state = await bridge?.checkForUpdate?.('page').catch(() => null);
    if (state) set({ desktop: state });
    return;
  }
  if (mode === 'web') await checkWeb();
  else set({ web: { phase: 'unsupported', error: null } });
}

/** « Mettre à jour Fabtice » / « Recharger »: asks first when something long is running (`force` once answered). */
export async function startUpdate(where: 'message' | 'section', force = false): Promise<void> {
  const work = busyWork();
  if (work && !force) {
    set({ confirm: { work, where } });
    return;
  }
  set({ confirm: null });
  if (get().mode === 'web') {
    reloadOnNewVersion();
    return;
  }
  const bridge = getDesktopBridge();
  await bridge?.startUpdate?.().catch(() => null);
}

/** « Attendre » on the question about the work running. */
export function cancelConfirm(): void {
  set({ confirm: null });
}

export async function cancelUpdate(): Promise<void> {
  await getDesktopBridge()?.cancelUpdate?.().catch(() => false);
}

/** « Télécharger à la main »: the page of the version on GitHub, in the browser. */
export async function openUpdatePage(): Promise<void> {
  await getDesktopBridge()?.openUpdatePage?.().catch(() => false);
}

// ---------------------------------------------------------------- the web app

let registration: ServiceWorkerRegistration | null = null;

/** Asks a waiting worker which version it is (its build id); null when it does not say within a few seconds. */
function buildOf(worker: ServiceWorker, timeoutMs = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    channel.port1.onmessage = (e: MessageEvent) => {
      clearTimeout(timer);
      const build = e.data && typeof e.data.build === 'string' ? e.data.build : null;
      resolve(build);
    };
    try {
      worker.postMessage({ type: 'fabtice-build' }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** A worker waiting: a new version of the site, if it is not the one this page runs. */
async function considerWaiting(origin: 'launch' | 'search'): Promise<boolean> {
  const waiting = registration?.waiting;
  if (!waiting) return false;
  const build = await buildOf(waiting);
  if (!build || build === BUILD_ID) return false;
  set({ web: { phase: 'ready', error: null } });
  if (origin === 'launch' && get().later !== 'web') want('launch');
  return true;
}

/** Follows the service worker: a new version installed while the page is open is offered too. */
function watchRegistration(reg: ServiceWorkerRegistration, launch: boolean): void {
  registration = reg;
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      // `installed` with a page already controlled: it waits (the first install takes over at once).
      if (worker.state === 'installed' && navigator.serviceWorker.controller) void considerWaiting(launch ? 'launch' : 'search');
    });
  });
  if (launch) void considerWaiting('launch');
}

async function checkWeb(): Promise<void> {
  const reg = registration;
  if (!reg) {
    set({ web: { phase: 'unsupported', error: null } });
    return;
  }
  set({ web: { phase: 'checking', error: null } });
  try {
    await reg.update();
  } catch {
    set({ web: { phase: 'failed', error: 'network' } });
    return;
  }
  // A new worker found installs first: wait for it to be waiting (or gone).
  const end = Date.now() + 60_000;
  while (reg.installing && Date.now() < end) await new Promise((r) => setTimeout(r, 200));
  if (await considerWaiting('search')) return;
  set({ web: { phase: 'up-to-date', error: null } });
}

/** « Recharger »: the waiting version takes over, then the page reloads on it. */
export function reloadOnNewVersion(): void {
  const waiting = registration?.waiting;
  set({ web: { phase: 'reloading', error: null } });
  let done = false;
  const reload = () => {
    if (done) return;
    done = true;
    window.location.reload();
  };
  navigator.serviceWorker?.addEventListener('controllerchange', reload, { once: true });
  // Should the worker not take over (an old one, a browser that refuses), the page reloads all the same.
  setTimeout(reload, 5000);
  if (waiting) waiting.postMessage({ type: 'fabtice-skip-waiting' });
  else reload();
}

// ---------------------------------------------------------------- start-up

export interface UpdateInit {
  /** Search at opening (« Vérifier à chaque ouverture », and not a test address unless `?maj=message`). */
  launch: boolean;
  /** One window at a time: true while another window is on screen. */
  windowInTheWay: () => boolean;
  /** Subscribes to what `windowInTheWay` reads, so that a message waiting shows once the way is clear. */
  subscribeWindows: (listener: () => void) => () => void;
  /** Mac app: how long after opening the search is asked. */
  delayMs?: number;
}

/** Called once the start-up of the page is over. */
export function initUpdates(options: UpdateInit): void {
  windowInTheWay = options.windowInTheWay;
  options.subscribeWindows(showPending);
  const bridge = getDesktopBridge();
  if (bridge && typeof bridge.onUpdateState === 'function' && typeof bridge.updateStatus === 'function') {
    set({ mode: 'desktop' });
    bridge.onUpdateState(onDesktopState);
    void bridge
      .updateStatus()
      .then((s) => {
        if (s && get().desktop === null) set({ desktop: s });
      })
      .catch(() => {});
    if (options.launch) setTimeout(() => void bridge.checkForUpdate?.('launch').catch(() => null), options.delayMs ?? 4000);
    return;
  }
  if (bridge || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker
    .getRegistration()
    .then((reg) => {
      if (!reg) return;
      set({ mode: 'web' });
      watchRegistration(reg, options.launch);
    })
    .catch(() => {});
}

/** The web app's worker was registered after the start-up (`pwa/register.ts`): follow it. */
export function adoptRegistration(reg: ServiceWorkerRegistration, launch: boolean): void {
  if (get().mode === 'desktop' || registration === reg) return;
  set({ mode: 'web' });
  watchRegistration(reg, launch);
}

/** For the tests and the captures (`?debug`, `?demo`): the store and the way in. */
export const updateHandle = { store: updateStore, want, showPending, closeUpdateMessage, onDesktopState, busyWork };

declare global {
  interface Window {
    /** `?debug`, `?demo`: the update's store and functions (`update/updates.ts`). */
    __fabticeUpdate?: typeof updateHandle;
  }
}
