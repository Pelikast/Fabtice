import { describe, expect, it } from 'vitest';
import { assessDevice, chooseModel, estimateSeconds, resolveModel } from './device';
import { bundledModelList } from './models';
import type { DeviceProfile } from './types';

const models = bundledModelList().models;
const UA = {
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1',
  electron: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_7) AppleWebKit/537.36 (KHTML, like Gecko) Fabtice/0.1.0 Chrome/150.0.0.0 Electron/43.8.9 Safari/537.36',
};

const computer = (p: Partial<DeviceProfile>): DeviceProfile => ({ phone: false, gpu: 'none', browser: 'chromium', memoryGB: 8, cores: 8, desktopApp: false, ...p });

describe('the device, as the automatic choice sees it', () => {
  it('reads the phone, the browser, the graphics chip and the memory', () => {
    expect(assessDevice({ userAgent: UA.chromeMac, maxTouchPoints: 0, deviceMemory: 8, hardwareConcurrency: 10, gpu: { vendor: 'apple', isFallback: false }, desktopApp: false })).toEqual({
      phone: false,
      gpu: 'apple',
      browser: 'chromium',
      memoryGB: 8,
      cores: 10,
      desktopApp: false,
    });
    expect(assessDevice({ userAgent: UA.safariMac, maxTouchPoints: 0, gpu: null, desktopApp: false })).toMatchObject({ browser: 'safari', gpu: 'none', memoryGB: null });
    expect(assessDevice({ userAgent: UA.iphone, maxTouchPoints: 5, gpu: { vendor: 'apple', isFallback: false }, desktopApp: false })).toMatchObject({ phone: true, browser: 'safari' });
    // An iPad says it is a Mac, but has a touch screen.
    expect(assessDevice({ userAgent: UA.safariMac, maxTouchPoints: 5, gpu: null, desktopApp: false }).phone).toBe(true);
    expect(assessDevice({ userAgent: UA.electron, maxTouchPoints: 0, gpu: { vendor: 'intel', isFallback: false }, desktopApp: true })).toMatchObject({ browser: 'chromium', gpu: 'other', desktopApp: true });
    expect(assessDevice({ userAgent: UA.chromeMac, maxTouchPoints: 0, gpu: { vendor: 'google', isFallback: true }, desktopApp: false }).gpu).toBe('fallback');
  });
});

describe('the automatic choice of the separation tool (phase 0 measurements)', () => {
  it('M1 in Chrome or the Mac app: the best tool on the graphics chip', () => {
    expect(chooseModel(models, computer({ gpu: 'apple' }))).toMatchObject({ model: { id: 'bs-roformer-sw' }, backend: 'gpu' });
    expect(chooseModel(models, computer({ gpu: 'apple', desktopApp: true }))).toMatchObject({ model: { id: 'bs-roformer-sw' }, backend: 'gpu' });
  });

  it('M1 in Safari: the best tool on the processor (the graphics path fails there)', () => {
    expect(chooseModel(models, computer({ gpu: 'apple', browser: 'safari', memoryGB: null }))).toMatchObject({ model: { id: 'bs-roformer-sw' }, backend: 'cpu' });
  });

  it('a phone: the lightest tool', () => {
    expect(chooseModel(models, computer({ phone: true, gpu: 'apple', browser: 'safari', memoryGB: null }))).toMatchObject({ model: { id: 'scnet' }, backend: 'cpu' });
  });

  it('an Intel Mac, another graphics chip or none: the balanced tool', () => {
    expect(chooseModel(models, computer({ gpu: 'other', desktopApp: true }))).toMatchObject({ model: { id: 'htdemucs-6s' }, backend: 'gpu' });
    expect(chooseModel(models, computer({ gpu: 'none' }))).toMatchObject({ model: { id: 'htdemucs-6s' }, backend: 'cpu' });
    expect(chooseModel(models, computer({ gpu: 'fallback' }))).toMatchObject({ model: { id: 'htdemucs-6s' }, backend: 'cpu' });
  });

  it('skips a tool the memory cannot hold', () => {
    expect(chooseModel(models, computer({ gpu: 'apple', memoryGB: 2 }))).toMatchObject({ model: { id: 'htdemucs-6s' } });
    expect(chooseModel(models, computer({ gpu: 'apple', memoryGB: 1 }))).toMatchObject({ model: { id: 'scnet' } });
  });

  it('follows the list: a withdrawn tool is never chosen, an empty list chooses nothing', () => {
    expect(chooseModel(models.filter((m) => m.id !== 'bs-roformer-sw'), computer({ gpu: 'apple' }))).toMatchObject({ model: { id: 'htdemucs-6s' } });
    expect(chooseModel([], computer({ gpu: 'apple' }))).toBeNull();
  });

  it('the advanced setting wins while its tool is listed; else the automatic choice', () => {
    expect(resolveModel(models, computer({ gpu: 'apple' }), 'scnet')).toMatchObject({ model: { id: 'scnet' }, backend: 'gpu', reason: 'choisi dans les réglages avancés' });
    expect(resolveModel(models, computer({ gpu: 'apple', browser: 'safari' }), 'htdemucs-6s')).toMatchObject({ backend: 'cpu' });
    expect(resolveModel(models, computer({ gpu: 'apple' }), 'withdrawn-one')).toMatchObject({ model: { id: 'bs-roformer-sw' } });
  });

  it('estimates honestly from the measured speeds', () => {
    const best = models.find((m) => m.id === 'bs-roformer-sw')!;
    // 223 s at 3.6 times on the M1's graphics chip = 803 s (measured 809 s).
    expect(estimateSeconds(best, 'gpu', computer({ gpu: 'apple' }), 223)).toBeCloseTo(802.8, 1);
    expect(estimateSeconds(best, 'cpu', computer({ gpu: 'apple', browser: 'safari' }), 100)).toBeCloseTo(400, 5);
    // Fewer cores, longer on the processor (capped at three times).
    expect(estimateSeconds(best, 'cpu', computer({ cores: 2 }), 100)).toBeCloseTo(1200, 5);
  });
});
