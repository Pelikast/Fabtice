import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryModelStore, resetModelStore } from '../analysis/models/store';
import { shouldRegister } from '../pwa/register';
import { replaceSeparator } from '../separation';
import { MockSeparator } from '../separation/mock';
import { replaceProjectStorage } from '../storage';
import { MemoryStorage } from '../storage/memoryStorage';
import { deviceUsage, freeDownloaded } from './deviceUsage';

const file = (id: string, bytes: number) => ({ id, bytes, sha256: 'x', data: new ArrayBuffer(8) });

describe('« Place sur cet appareil »', () => {
  let tools: MemoryModelStore;
  beforeEach(() => {
    tools = new MemoryModelStore();
    resetModelStore(tools);
    replaceProjectStorage(new MemoryStorage());
    replaceSeparator(new MockSeparator({ durationMs: 0, downloadMs: 0 }));
  });

  it('tells the analysis tools from the detailed chord model, and frees each alone', async () => {
    await tools.putFile(file('beat-this-small0', 10_555_642));
    await tools.putFile(file('crema-chords', 2_728_454));
    await tools.putFile(file('tsumugi-chords', 67_647_992));
    const before = await deviceUsage();
    expect(before.analysis).toBe(10_555_642 + 2_728_454);
    expect(before.fineChords).toBe(67_647_992);

    await freeDownloaded('fineChords');
    const after = await deviceUsage();
    expect(after.fineChords).toBe(0);
    expect(after.analysis).toBe(before.analysis);

    await freeDownloaded('analysis');
    expect((await deviceUsage()).analysis).toBe(0);
  });
});

describe('the offline worker is registered only where it belongs', () => {
  const at = (href: string) => {
    const u = new URL(href);
    return { protocol: u.protocol, hostname: u.hostname, search: u.search };
  };
  const web = { production: true, desktop: false };
  it.each([
    ['https://fabtice.netlify.app/', web, true],
    ['https://fabtice.netlify.app/?demo', web, false],
    ['https://fabtice.netlify.app/?debug', web, false],
    ['http://127.0.0.1:4173/', web, false],
    ['http://127.0.0.1:4173/?horsligne&debug', web, true],
    ['fabtice://app/', { production: true, desktop: true }, false],
    ['https://fabtice.netlify.app/', { production: false, desktop: false }, false],
  ])('%s', (href, options, expected) => {
    expect(shouldRegister(at(href), options)).toBe(expected);
  });
});
