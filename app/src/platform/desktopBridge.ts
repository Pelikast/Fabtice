// Typed view of `window.fabtice`, the API the Mac app exposes to the page.
//
// It mirrors `desktop/src/preload.js` and the IPC handlers of
// `desktop/src/main.js` exactly as they are (implemented and tested there):
// do not redesign it here. If the Mac app's API changes, change these types
// with it. On the web, `window.fabtice` is absent and `getDesktopBridge()`
// returns null.

/** Releases a progress subscription. */
export type Unsubscribe = () => void;

// ---------------------------------------------------------------- system info

export interface DesktopSystemInfo {
  appVersion: string;
  /** Contents of build-info.json written by the GitHub build, or null. */
  build: Record<string, unknown> | null;
  packaged: boolean;
  versions: { electron: string; chrome: string; node: string; v8: string };
  platform: string;
  osVersion: string;
  osRelease: string;
  /** 'arm64' (Apple chip) or 'x64' (Intel, or Rosetta). */
  arch: string;
  cpuModel: string | null;
  cpuCount: number;
  memoryGb: number;
  /** True when an Intel build runs on an Apple chip through Rosetta 2. */
  rosetta: boolean | null;
  execPath: string;
  userData: string;
  jsRuntime: {
    name: string;
    path: string;
    env: Record<string, string>;
    probe: { ok: boolean; version: string | null; stderr: string | null; error: string | null; durationMs: number };
  };
}

// ---------------------------------------------------------------- yt-dlp management

/** One network attempt of the yt-dlp manager (kept for diagnostics). */
export type YtdlpAttempt = Record<string, unknown>;

export interface YtdlpStatus {
  source: 'managed' | 'override';
  sourceLabel?: string;
  path: string | null;
  installed: boolean;
  version?: string | null;
  tag?: string | null;
  sha256?: string | null;
  /** Managed binary only: its hash still matches the one recorded at install. */
  intact?: boolean;
  error?: string | null;
  attempts: YtdlpAttempt[];
}

export interface YtdlpLatest {
  tag: string | null;
  sha256: string;
  url: string;
  sumsUrl: string;
}

export type YtdlpCheck = (
  | { skipped: true; reason: string }
  | { skipped: false; latest: YtdlpLatest; installed: boolean; updateAvailable: boolean }
  | { skipped: false; installed: boolean; intact?: boolean; error: string }
  /** The check itself threw. */
  | { error: string }
) & { attempts: YtdlpAttempt[] };

export interface YtdlpMeta {
  version: string;
  tag: string | null;
  sha256: string;
  size: number;
  url: string;
  installedAt: string;
}

export type YtdlpInstallResult =
  | { ok: true; meta: YtdlpMeta; attempts: YtdlpAttempt[] }
  | { ok: false; error: string; attempts: YtdlpAttempt[] };

export interface YtdlpProgress {
  phase: 'download' | 'verify' | 'done';
  received: number;
  /** Null while the size is unknown. */
  total: number | null;
}

// ---------------------------------------------------------------- extraction

/** What yt-dlp said about the video (step 1 of the extraction). */
export interface ExtractMeta {
  id: string;
  title: string | null;
  channel: string | null;
  /** Seconds, or null if unknown (the import is then refused). */
  duration: number | null;
  liveStatus: string | null;
  isLive: boolean;
  formatId: string | null;
  ext: string | null;
  acodec: string | null;
  container: string | null;
  abr: number | null;
  asr: number | null;
  audioChannels: number | null;
  filesize: number | null;
  protocol: string | null;
}

/** Diagnostic report of an extraction (steps, stderr tails, file info). */
export interface ExtractReport {
  url: string;
  videoId: string;
  format: string;
  steps: Record<string, unknown>[];
  debugLines: string[];
  meta?: ExtractMeta;
  file?: { name: string; size: number; container: unknown };
  totalMs?: number;
  tempDeleted?: boolean;
  /** Where the time of the download step went (start-up, first progress line, speed). */
  download?: Record<string, unknown>;
}

export type ExtractResult =
  /** The audio file as downloaded (m4a in practice), to be decoded by the page. */
  | { ok: true; audio: Uint8Array; meta: ExtractMeta; report: ExtractReport }
  | {
      ok: false;
      /** French message, ready to show. */
      error: string;
      /** Refused on purpose (live stream, unknown duration, longer than 20 minutes). */
      refused?: boolean;
      /** yt-dlp must be installed first (`ytdlpInstall()`). */
      needsYtdlp?: boolean;
      meta?: ExtractMeta;
      report?: ExtractReport;
      audio?: null;
    };

/**
 * What the Mac app reports while it extracts (see `desktop/src/extract.js`):
 *   - `info`: the piece is being looked up;
 *   - `prepare`: the download is about to start and nothing can be measured yet
 *     (the tool itself may take a minute to start on an older Mac); `meta` has the title;
 *   - `download`: sent only when yt-dlp printed a real progress line. `percent` is
 *     null when the total size is unknown, then `receivedBytes` is the amount so far.
 * An older Mac app sent `download` with a percentage of 0 before anything was measured
 * and no `prepare`: the interface then simply shows what it is told.
 */
export type ExtractProgress =
  | { phase: 'info' }
  | { phase: 'prepare'; meta?: ExtractMeta }
  | {
      phase: 'download';
      percent: number | null;
      receivedBytes?: number | null;
      totalBytes?: number | null;
      speedBps?: number | null;
      meta?: ExtractMeta;
    };

/** The report of the last import made from the interface, as text (diagnostic window). */
export interface LastImportReport {
  available: boolean;
  text: string;
  at?: string;
}

// ---------------------------------------------------------------- printing the chart

/** Orientation of the printed page, as the Mac app's printing takes it. */
export type PagePrintOrientation = 'portrait' | 'landscape';

/** What a printing of the chart answers: done, or why not (the user closed the panel; the system refused). */
export type ChartPrintResult = { ok: true } | { ok: false; reason: 'cancelled' | 'failed' };

/** Paper of the printed sheets, as the Mac app's printing names it. */
export type PagePrintPaper = 'A4' | 'Letter';

/** A printer the system lists: its system name (what printing is addressed to), the name shown, and whether it is the default. */
export interface PrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
}

// ---------------------------------------------------------------- chart collections

/** Why the Mac app could not give a page's text (`desktop/src/standards-fetch.js`). */
export type StandardsFetchError = 'invalid-url' | 'host-not-allowed' | 'redirect' | 'http' | 'too-large' | 'timeout' | 'network';

export type StandardsFetchResult =
  | { ok: true; text: string; /** The address finally read (after allowed redirects). */ url: string; bytes: number }
  | { ok: false; error: StandardsFetchError; status?: number; detail?: string };

// ---------------------------------------------------------------- the bridge

export interface DesktopBridge {
  /** Machine and app details for diagnostics (home folder replaced by « ~ »). */
  systemInfo(): Promise<DesktopSystemInfo | null>;
  /** Is yt-dlp installed, which version, is it intact. */
  ytdlpStatus(): Promise<YtdlpStatus>;
  /** Compares with the latest release; `force` re-asks instead of reusing the launch check. */
  ytdlpCheck(force?: boolean): Promise<YtdlpCheck>;
  /** Downloads, verifies (SHA-256) and installs yt-dlp; progress via `onYtdlpProgress`. */
  ytdlpInstall(): Promise<YtdlpInstallResult>;
  /** Extracts the audio of a YouTube link on the user's machine; progress via `onExtractProgress`. One at a time. */
  extract(link: string): Promise<ExtractResult>;
  /** Copies text to the clipboard. */
  copyText(text: string): Promise<true>;
  /**
   * Asks the system to open an `irealb://` chart link (iReal Pro). The Mac app accepts that scheme
   * only, with a bounded length (`desktop/src/ireal-link.js`): `invalid` when it refuses the link,
   * `failed` when the system could not open it (iReal Pro not installed). A Mac app that predates it lacks this method.
   */
  openInIRealPro?(link: string): Promise<{ ok: true } | { ok: false; reason: 'invalid' | 'failed' }>;
  /**
   * Prints the page as it is now (the interface keeps only the sheets of the print dialog on it): to the printer
   * named (silently, `copies` times) when it is one the system lists, otherwise through the system's print dialog,
   * which also opens when the silent printing fails. The sheets are the size of `paper` in `orientation`.
   * `window.print()` does not work in the Mac app, this does. A Mac app that predates it lacks this method.
   */
  printChart?(options: { orientation: PagePrintOrientation; paper?: PagePrintPaper; printer?: string | null; copies?: number }): Promise<ChartPrintResult>;
  /**
   * Writes the page as it is now (the sheets alone) to a PDF file: the system's save panel (French, in the
   * Downloads folder, named after `title`), then the file, one PDF page per sheet. `cancelled` when the user
   * closes the panel. A Mac app that predates it lacks this method.
   */
  saveChartPdf?(options: { orientation: PagePrintOrientation; paper?: PagePrintPaper; title: string }): Promise<ChartPrintResult>;
  /**
   * The printers the system lists (`webContents.getPrintersAsync`); `ok: false` when it cannot say, in which case the
   * dialog offers no choice of printer and « Imprimer » opens the system's own dialog. A Mac app that predates it lacks this method.
   */
  listPrinters?(): Promise<{ ok: true; printers: PrinterInfo[] } | { ok: false }>;
  /**
   * Fetches the text of a page of a chart collection (`app/src/standards/`): HTTPS GET only, the host must
   * be one of a fixed list (iReal Pro's sites and GitHub's raw files), redirects only to such hosts, at most
   * 25 MB, 60 s, no cookies. Answers with data, never rejects. A Mac app that predates it lacks this method.
   */
  standardsFetchText?(url: string): Promise<StandardsFetchResult>;
  /** Timings of the last import made from the interface (a Mac app that predates it lacks this method). */
  lastImportReport?(): Promise<LastImportReport>;
  /**
   * Hands the Mac app the measurement report of the last real separation (plain text, no personal data,
   * `separation/report.ts`): it keeps it and adds it to its diagnostic report (Aide → Diagnostic…).
   * A Mac app that predates it lacks this method.
   */
  reportSeparation?(text: string): Promise<true>;
  /** The report kept by `reportSeparation` (diagnostic window). A Mac app that predates it lacks this method. */
  lastSeparationReport?(): Promise<LastImportReport>;
  onYtdlpProgress(callback: (progress: YtdlpProgress) => void): Unsubscribe;
  onExtractProgress(callback: (progress: ExtractProgress) => void): Unsubscribe;
  /**
   * Lot 4: `.fab` files macOS handed to the app (double-click in the Finder, « Ouvrir avec »)
   * before the page asked; from that call on, the next ones come through `onOpenProject`.
   * A Mac app that predates it lacks these four methods.
   */
  pendingProjects?(): Promise<OpenedProjectFile[]>;
  onOpenProject?(callback: (file: OpenedProjectFile) => void): Unsubscribe;
  /** Bytes `offset` to `offset + length` (at most 16 MB) of the file behind `token`. */
  readProjectFile?(token: string, offset: number, length: number): Promise<Uint8Array>;
  releaseProjectFile?(token: string): Promise<true>;
  /** Owner's decisions of 15 November: the recent projects (opened or saved), most recent first, files gone dropped. */
  recentProjects?(): Promise<RecentProject[]>;
  /** Opens a recent project: it then comes through `onOpenProject`, as from the Finder. */
  openRecentProject?(token: string): Promise<{ ok: boolean }>;
  clearRecentProjects?(): Promise<true>;
  /** A project chosen in the page's own file picker goes in the recent list (its path stays in the Mac app). */
  rememberProjectFile?(file: File): Promise<boolean>;
  /**
   * C5, the file of the open project (`desktop/src/project-writer.js`). The page names the project by its id
   * (`ProjectInfo.id`), never a path: the Mac app keeps the path and only ever writes that file, or one the
   * user chose in the system's save panel. A Mac app that predates it lacks these methods (the page then
   * saves as a download, as before).
   *
   * Name and size of the project's file as it is on the disk now, or null (no file, or gone).
   */
  projectFileInfo?(projectId: string): Promise<{ name: string; size: number } | null>;
  /** Bytes `offset` to `offset + length` (at most 16 MB) of the project's file: the sounds already encoded are copied from it. */
  readCurrentProjectFile?(projectId: string, offset: number, length: number): Promise<Uint8Array>;
  /** The project was opened from the file behind `token` (not yet released): that is now its file. Resolves its name, or null. */
  adoptProjectFile?(projectId: string, token: string): Promise<{ name: string } | null>;
  /** The project was opened from a file chosen or dropped in the page: that is now its file. */
  adoptChosenProjectFile?(projectId: string, file: File): Promise<{ name: string } | null>;
  /** The piece was restored from the page's own autosave: its file of a former launch, if it is still there. */
  recallProjectFile?(projectId: string): Promise<{ name: string } | null>;
  /** The open project has no file (a new project replaced it). */
  forgetProjectFile?(): Promise<true>;
  /**
   * Starts a save: `current` overwrites the project's file (`reason: 'no-file'` when it has none or it is gone),
   * `choose` shows the system's save panel first (`reason: 'cancelled'`). The bytes go to a temporary file beside
   * the target, renamed over it by `finishProjectSave`. Answers with data, never rejects.
   */
  beginProjectSave?(request: { projectId: string; target: 'current' | 'choose'; suggestedName?: string }): Promise<ProjectSaveBegun>;
  writeProjectSave?(session: string, bytes: Uint8Array): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Empties the temporary file: the page writes the whole file again (an entry it copied did not read back). */
  restartProjectSave?(session: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Flushes and renames: the new file is now the project's file (and first in the recent projects). */
  finishProjectSave?(session: string): Promise<{ ok: true; name: string; size: number } | { ok: false; reason: string }>;
  /** Gives up: the temporary file is removed, the target is not touched. */
  abortProjectSave?(session: string): Promise<true>;
  /**
   * Folder exports (C15.4, `desktop/src/folder-writer.js`, used by `export/folder/`): the system's save panel,
   * then a NEW folder there (« name 2 » when something already has the name: nothing is ever replaced).
   * `where`: its parent, home as « ~ ». Answers with data, never rejects. A Mac app that predates it lacks these.
   */
  beginFolderExport?(request: { suggestedName: string }): Promise<{ ok: true; session: string; name: string; where: string } | { ok: false; reason: string }>;
  /** Bytes at `offset` of the plain file `name` inside the folder: offset 0 creates it, later chunks follow in order. */
  writeFolderFile?(session: string, name: string, offset: number, bytes: Uint8Array): Promise<{ ok: true; size: number } | { ok: false; reason: string }>;
  finishFolderExport?(session: string): Promise<{ ok: true; name: string; where: string; files: number } | { ok: false; reason: string }>;
  /** Gives up: the files written are removed, then the folder if it is empty. */
  abortFolderExport?(session: string): Promise<true>;
  /** Shows a finished export's folder in the Finder. */
  revealFolderExport?(session: string): Promise<boolean>;
  /** The title bar: the dot in the close button (`modified`) and the proxy icon of the project's file. */
  reportProjectState?(state: { projectId: string | null; modified: boolean }): Promise<boolean>;
  /**
   * Closing the window or quitting (`desktop/src/close-guard.js`): the Mac app asks, the page acknowledges at once
   * (`ackClose`: it is deciding, however long that takes) then answers (`answerClose`: true lets the window go).
   * A page that does not acknowledge within about two seconds is let go.
   */
  onConfirmClose?(callback: (question: { id: string }) => void): Unsubscribe;
  ackClose?(id: string): Promise<boolean>;
  answerClose?(id: string, ok: boolean): Promise<boolean>;
  /**
   * The audio journal (`app/src/audio/journal.ts`): the page hands each event to the main process, which
   * keeps the last 200 with its own (sleeps, wakes, the audio service) across restarts, for Aide →
   * Diagnostic…. `sticky` events (the last playback that started) replace the previous one instead of
   * being added to the list. `text` is one line, without personal data. A Mac app that predates it lacks these.
   */
  audioJournalAdd?(entry: { event: string; text: string; sticky?: boolean }): Promise<true>;
  /** The journal as the diagnostic window shows it (text ready to paste). */
  audioJournal?(): Promise<{ text: string; count: number }>;
  /**
   * What macOS says about power (`desktop/src/power-events.js`, from Electron's `powerMonitor`): the Mac
   * goes to sleep, wakes up, the screen is locked or unlocked. The page gives the audio output back on
   * `suspend` and `resume` (see `audio/deviceLifecycle.ts`).
   */
  onPower?(callback: (event: PowerEvent) => void): Unsubscribe;
  /**
   * C6, the Mac menu bar (`desktop/src/menu.js`): the page reports the state of its commands (`ui/commands.ts`)
   * at each change; the main process greys the bar's entries and shows Annuler / Rétablir with their labels.
   * A click on an entry comes back to the page as a DOM event (`MENU_COMMAND_EVENT`, `ui/menuBar.ts`), sent with
   * a user gesture (a file picker may open). A Mac app that predates it lacks these methods.
   */
  reportMenuState?(state: MenuBarState): Promise<boolean>;
  /** « Quitter » in the menu Fabtice: the same as cmd + Q (the alert about changes not saved first). */
  quitApp?(): Promise<boolean>;
}

/** What the page tells the Mac menu bar: each command, its label and whether it can run now. */
export interface MenuBarState {
  commands: Record<string, { label: string; enabled: boolean }>;
}

/** The DOM event the Mac app sends to the page for a click (or an accelerator) in its menu bar. */
export const MENU_COMMAND_EVENT = 'fabtice-menu-command';
export interface MenuCommandDetail {
  id: string;
  /** The entry was reached by its keyboard shortcut, not by a click. */
  accelerator: boolean;
}

export type ProjectSaveBegun = { ok: true; session: string; name: string } | { ok: false; reason: 'no-file' | 'cancelled' | 'invalid' | 'failed' };

/** A power event forwarded by the Mac app. */
export interface PowerEvent {
  kind: 'suspend' | 'resume' | 'lock-screen' | 'unlock-screen';
}

/** A recent project as the page sees it: a name and a folder (« ~ » for the home folder), opened by its token. */
export interface RecentProject {
  token: string;
  name: string;
  folder: string;
  /** ISO date it was last opened or saved. */
  at: string;
}

/** A project file macOS handed over (`desktop/src/open-files.js`): read by ranges with its token. */
export interface OpenedProjectFile {
  token: string;
  name: string;
  size: number;
}

declare global {
  interface Window {
    /** Present only inside the Mac app. */
    fabtice?: DesktopBridge;
  }
}

const METHODS: (keyof DesktopBridge)[] = [
  'systemInfo',
  'ytdlpStatus',
  'ytdlpCheck',
  'ytdlpInstall',
  'extract',
  'copyText',
  'onYtdlpProgress',
  'onExtractProgress',
];

/** The Mac app's bridge, or null on the web (or if it lacks a method we rely on). */
export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = window.fabtice;
  if (!bridge || typeof bridge !== 'object') return null;
  return METHODS.every((m) => typeof bridge[m] === 'function') ? bridge : null;
}

/** True inside the Mac app: link import is available. */
export function isDesktop(): boolean {
  return getDesktopBridge() !== null;
}
