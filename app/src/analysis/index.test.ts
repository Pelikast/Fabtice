// Which analyser the factory gives where.

import { afterEach, describe, expect, it } from 'vitest';
import { autoAnalysisDisabled, createAnalyzer, FabticeAnalyzer, MockAnalyzer } from './index';
import { MemoryModelStore, resetModelStore } from './models/store';

const g = globalThis as Record<string, unknown>;
const saved = { window: g.window, Worker: g.Worker };

function browser(search: string, { worker = true } = {}) {
  g.window = { location: { search } };
  g.Worker = worker ? class {} : undefined;
}

afterEach(() => {
  g.window = saved.window;
  g.Worker = saved.Worker;
  resetModelStore();
});

describe('createAnalyzer', () => {
  it('gives the mock where there is no page (Node, unit tests)', () => {
    delete g.window;
    expect(createAnalyzer()).toBeInstanceOf(MockAnalyzer);
  });

  it('gives the real analyser in a browser, by default', () => {
    browser('');
    const a = createAnalyzer();
    expect(a).toBeInstanceOf(FabticeAnalyzer);
    expect(a.id).toBe('fabtice');
    browser('?demo');
    expect(createAnalyzer()).toBeInstanceOf(FabticeAnalyzer);
  });

  it('keeps the mock for the variants the test suites and the demo use', () => {
    for (const mode of ['factice', 'lente', 'instant', 'echec']) {
      browser(`?analyse=${mode}`);
      expect(createAnalyzer()).toBeInstanceOf(MockAnalyzer);
    }
  });

  it('keeps the mock on test pages (silent engine, store opened), unless the real one is asked for', () => {
    browser('?debug&moteur=factice');
    expect(createAnalyzer()).toBeInstanceOf(MockAnalyzer);
    browser('?moteur=factice');
    expect(createAnalyzer()).toBeInstanceOf(MockAnalyzer);
    browser('?debug');
    expect(createAnalyzer()).toBeInstanceOf(MockAnalyzer);
    browser('?debug&moteur=factice&analyse=reel');
    expect(createAnalyzer()).toBeInstanceOf(FabticeAnalyzer);
  });

  it('falls back to the mock in a browser that cannot run workers', () => {
    browser('', { worker: false });
    expect(createAnalyzer()).toBeInstanceOf(MockAnalyzer);
    browser('?analyse=reel', { worker: false });
    expect(createAnalyzer()).toBeInstanceOf(MockAnalyzer);
  });

  it('uses the light Beat This! network unless the full one is asked for', async () => {
    resetModelStore(new MemoryModelStore());
    browser('');
    expect((await createAnalyzer().models()).map((m) => m.id)).toContain('beat-this-small0');
    browser('?modele=complet');
    expect((await createAnalyzer().models()).map((m) => m.id)).toContain('beat-this-final0');
  });

  it('can be told by the address not to analyse by itself', () => {
    browser('?analyse=aucune');
    expect(autoAnalysisDisabled()).toBe(true);
    browser('');
    expect(autoAnalysisDisabled()).toBe(false);
  });
});
