import { describe, expect, it } from 'vitest';
import type { DecodedAudio } from '../audio/registry';
import { fakeBridge, META, okResult } from '../test/fakeBridge';
import { importFromLink } from './fromLink';
import { isToolUpdateAvailable } from './tool';
import { ImportError, type ImportProgress } from './types';

const mono = (seconds: number): DecodedAudio => ({ channels: [new Float32Array(Math.round(48000 * seconds))], sampleRate: 48000 });
const deps = { decodeWebAudio: async () => mono(3) };
const LINK = 'https://www.youtube.com/watch?v=abc';

async function failure(p: Promise<unknown>): Promise<ImportError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ImportError);
    return e as ImportError;
  }
  throw new Error('expected a rejection');
}

describe('importFromLink', () => {
  it('only works inside the Mac app, with a link', async () => {
    expect((await failure(importFromLink(LINK, null))).code).toBe('not-available');
    expect((await failure(importFromLink('   ', fakeBridge()))).code).toBe('link-invalid');
  });

  it('tool present: checks the status, extracts, decodes, titles the piece from the metadata', async () => {
    const bridge = fakeBridge({
      extractEvents: [{ phase: 'info' }, { phase: 'download', percent: 0, meta: META }, { phase: 'download', percent: 50 }, { phase: 'download', percent: 100 }],
    });
    const progress: ImportProgress[] = [];
    const piece = await importFromLink(`  ${LINK}  `, bridge, { onProgress: (p) => progress.push(p) }, deps);
    expect(bridge.calls).toEqual(['status', 'extract']);
    expect(bridge.extractedLinks).toEqual([LINK]);
    expect(piece.title).toBe('Autumn Leaves');
    expect(piece.source).toEqual({ kind: 'link', url: LINK, channel: 'Un guitariste' });
    expect(piece.duration).toBeCloseTo(3, 6);
    expect(piece.original.mimeType).toBe('audio/mp4');
    expect(piece.original.fileName).toBe('Autumn Leaves.m4a');
    expect(Array.from(new Uint8Array(piece.original.bytes))).toEqual([1, 2, 3, 4]);
    expect(progress.map((p) => p.phase)).toEqual(['fetching-info', 'fetching-info', 'fetching-info', 'downloading', 'downloading', 'downloading', 'decoding']);
    expect(progress.filter((p) => p.phase === 'downloading').map((p) => p.fraction)).toEqual([0, 0.5, 1]);
    // The title is known from the first download event on.
    expect(progress.filter((p) => p.phase === 'downloading').every((p) => p.title === 'Autumn Leaves')).toBe(true);
    expect(bridge.listeners()).toBe(0);
  });

  it('hands the decoder a copy and keeps the extracted bytes for storage', async () => {
    const bytes = new Uint8Array([9, 8, 7, 6]);
    const bridge = fakeBridge({ extractions: [okResult(bytes)] });
    let handed: ArrayBuffer | null = null;
    const piece = await importFromLink(LINK, bridge, {}, {
      decodeWebAudio: async (b) => {
        handed = b;
        return mono(1);
      },
    });
    expect(handed).not.toBe(bytes.buffer);
    expect(handed).not.toBe(piece.original.bytes);
    expect(Array.from(new Uint8Array(piece.original.bytes))).toEqual([9, 8, 7, 6]);
    expect(piece.original.bytes).not.toBe(bytes.buffer);
  });

  it('tool missing: installs it first, with progress, then extracts', async () => {
    const bridge = fakeBridge({
      installed: false,
      installEvents: [
        { phase: 'download', received: 0, total: 1000 },
        { phase: 'download', received: 250, total: 1000 },
        { phase: 'download', received: 500, total: null },
        { phase: 'verify', received: 1000, total: 1000 },
        { phase: 'done', received: 1000, total: 1000 },
      ],
    });
    const progress: ImportProgress[] = [];
    const piece = await importFromLink(LINK, bridge, { onProgress: (p) => progress.push(p) }, deps);
    expect(bridge.calls).toEqual(['status', 'install', 'extract']);
    expect(bridge.installedNow()).toBe(true);
    expect(piece.title).toBe('Autumn Leaves');
    expect(progress.filter((p) => p.phase === 'installing').map((p) => p.fraction)).toEqual([null, 0, 0.25, null, 1, 1]);
    // Installing comes before any extraction progress.
    const first = progress.findIndex((p) => p.phase === 'installing');
    expect(progress.slice(0, first).every((p) => p.phase === 'fetching-info')).toBe(true);
    expect(bridge.listeners()).toBe(0);
  });

  it('needsYtdlp from the extraction: installs, retries once, succeeds', async () => {
    const bridge = fakeBridge({
      extractions: [{ ok: false, needsYtdlp: true, error: 'yt-dlp n’est pas encore installé.' }, okResult()],
    });
    const piece = await importFromLink(LINK, bridge, {}, deps);
    expect(bridge.calls).toEqual(['status', 'extract', 'install', 'extract']);
    expect(piece.title).toBe('Autumn Leaves');
  });

  it('needsYtdlp again after the retry: stops with needs-ytdlp, no loop', async () => {
    const bridge = fakeBridge({ extractions: [{ ok: false, needsYtdlp: true, error: 'non' }] });
    const e = await failure(importFromLink(LINK, bridge, {}, deps));
    expect(e.code).toBe('needs-ytdlp');
    expect(bridge.calls).toEqual(['status', 'extract', 'install', 'extract']);
  });

  it('needsYtdlp right after installing it first: no second install', async () => {
    const bridge = fakeBridge({ installed: false, extractions: [{ ok: false, needsYtdlp: true, error: 'non' }] });
    expect((await failure(importFromLink(LINK, bridge, {}, deps))).code).toBe('needs-ytdlp');
    expect(bridge.calls).toEqual(['status', 'install', 'extract']);
  });

  it('install failure: install-failed, nothing extracted', async () => {
    const bridge = fakeBridge({ installed: false, install: { ok: false, error: 'hors ligne', attempts: [] } });
    const e = await failure(importFromLink(LINK, bridge, {}, deps));
    expect(e.code).toBe('install-failed');
    expect(bridge.calls).toEqual(['status', 'install']);
    expect(bridge.listeners()).toBe(0);
  });

  it('install that throws: install-failed', async () => {
    const bridge = fakeBridge({ installed: false, install: () => Promise.reject(new Error('ipc')) });
    expect((await failure(importFromLink(LINK, bridge, {}, deps))).code).toBe('install-failed');
    expect(bridge.listeners()).toBe(0);
  });

  it('a status call that fails does not stop the import: the extraction decides', async () => {
    const bridge = fakeBridge({ statusFails: true });
    await expect(importFromLink(LINK, bridge, {}, deps)).resolves.toBeDefined();
    expect(bridge.calls).toEqual(['status', 'extract']);
  });

  it.each([
    ['Les directs ne peuvent pas être importés pour l’instant.'],
    ['Cette vidéo dure plus de 20 minutes : import refusé pour l’instant.'],
    ['Durée inconnue : import refusé par prudence.'],
  ])('refusal « %s »: link-refused, with the app’s sentence', async (message) => {
    const bridge = fakeBridge({ extractions: [{ ok: false, refused: true, error: message, meta: META }] });
    const e = await failure(importFromLink(LINK, bridge, {}, deps));
    expect(e.code).toBe('link-refused');
    expect(e.detail).toBe(message);
    expect(bridge.calls).toEqual(['status', 'extract']);
  });

  it('unknown link and extraction already running are told apart', async () => {
    const unknown = fakeBridge({ extractions: [{ ok: false, error: 'Lien non reconnu. Collez un lien YouTube (watch?v=, youtu.be/…).' }] });
    expect((await failure(importFromLink('bonjour', unknown, {}, deps))).code).toBe('link-invalid');
    const busy = fakeBridge({ extractions: [{ ok: false, error: 'Une importation est déjà en cours.' }] });
    expect((await failure(importFromLink(LINK, busy, {}, deps))).code).toBe('busy');
  });

  it('any other failure of the app: link-failed, its text kept as detail', async () => {
    const bridge = fakeBridge({ extractions: [{ ok: false, error: 'yt-dlp a échoué pendant le téléchargement' }] });
    const e = await failure(importFromLink(LINK, bridge, {}, deps));
    expect(e.code).toBe('link-failed');
    expect(e.detail).toBe('yt-dlp a échoué pendant le téléchargement');
    const throwing = fakeBridge({ extractions: [() => Promise.reject(new Error('ipc closed'))] });
    expect((await failure(importFromLink(LINK, throwing, {}, deps))).code).toBe('link-failed');
    expect(throwing.listeners()).toBe(0);
  });

  it('an extraction that returns no bytes is a failure', async () => {
    const bridge = fakeBridge({ extractions: [okResult(new Uint8Array(0))] });
    expect((await failure(importFromLink(LINK, bridge, {}, deps))).code).toBe('link-failed');
  });

  it('a decoding failure keeps its own error', async () => {
    const bridge = fakeBridge();
    const bad = { decodeWebAudio: () => Promise.reject(Object.assign(new Error('x'), { name: 'EncodingError' })) };
    expect((await failure(importFromLink(LINK, bridge, {}, bad))).code).toBe('decode-failed');
  });

  it('cannot stop an extraction, but honours the signal around it', async () => {
    const early = new AbortController();
    early.abort();
    const bridge = fakeBridge();
    expect((await failure(importFromLink(LINK, bridge, { signal: early.signal }, deps))).code).toBe('cancelled');
    expect(bridge.calls).toEqual([]);

    const late = new AbortController();
    const running = fakeBridge({
      extractions: [
        () => {
          late.abort();
          return okResult();
        },
      ],
    });
    expect((await failure(importFromLink(LINK, running, { signal: late.signal }, deps))).code).toBe('cancelled');
    expect(running.calls).toEqual(['status', 'extract']);
  });

  it('untitled video: a plain fallback title', async () => {
    const bridge = fakeBridge({ extractions: [okResult(undefined, { title: null, ext: null })] });
    const piece = await importFromLink(LINK, bridge, {}, deps);
    expect(piece.title).toBe('Morceau sans titre');
    expect(piece.original.fileName).toBe('Morceau sans titre.m4a');
  });
});

describe('tool update check', () => {
  it('is true only for an installed tool with a newer release', async () => {
    const latest = { tag: '2', sha256: 'x', url: 'u', sumsUrl: 's' };
    expect(await isToolUpdateAvailable(fakeBridge({ check: { skipped: false, latest, installed: true, updateAvailable: true, attempts: [] } }))).toBe(true);
    expect(await isToolUpdateAvailable(fakeBridge({ check: { skipped: false, latest, installed: true, updateAvailable: false, attempts: [] } }))).toBe(false);
    expect(await isToolUpdateAvailable(fakeBridge({ check: { skipped: false, latest, installed: false, updateAvailable: true, attempts: [] } }))).toBe(false);
  });
  it('is false for a skipped check, an error, or a bridge that throws', async () => {
    expect(await isToolUpdateAvailable(fakeBridge())).toBe(false);
    expect(await isToolUpdateAvailable(fakeBridge({ check: { error: 'hors ligne', attempts: [] } }))).toBe(false);
    const throwing = { ...fakeBridge(), ytdlpCheck: () => Promise.reject(new Error('ipc')) };
    expect(await isToolUpdateAvailable(throwing)).toBe(false);
  });
});
