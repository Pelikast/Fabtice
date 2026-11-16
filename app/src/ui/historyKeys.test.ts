// The undo / redo shortcuts: cmd on a Mac, Ctrl elsewhere (Ctrl + Y too), the letter as typed.

import { describe, expect, it } from 'vitest';
import { historyCommandFor, isMacPlatform, isTextField } from './historyKeys';

const key = (key: string, mods: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean; code?: string } = {}) => ({
  key,
  code: mods.code ?? `Key${key.toUpperCase()}`,
  metaKey: !!mods.meta,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});

describe('undo and redo shortcuts', () => {
  it('Mac: cmd + Z, Maj + cmd + Z; Ctrl does nothing there', () => {
    expect(historyCommandFor(key('z', { meta: true }), true)).toBe('undo');
    expect(historyCommandFor(key('Z', { meta: true, shift: true }), true)).toBe('redo');
    expect(historyCommandFor(key('z', { ctrl: true }), true)).toBeNull();
    expect(historyCommandFor(key('y', { meta: true }), true)).toBeNull();
    expect(historyCommandFor(key('z', { meta: true, alt: true }), true)).toBeNull();
  });

  it('elsewhere: Ctrl + Z, Ctrl + Maj + Z, Ctrl + Y', () => {
    expect(historyCommandFor(key('z', { ctrl: true }), false)).toBe('undo');
    expect(historyCommandFor(key('Z', { ctrl: true, shift: true }), false)).toBe('redo');
    expect(historyCommandFor(key('y', { ctrl: true }), false)).toBe('redo');
    expect(historyCommandFor(key('z', { meta: true }), false)).toBeNull();
    expect(historyCommandFor(key('z'), false)).toBeNull();
  });

  it('reads the letter as typed (AZERTY), the key position only without Latin letters', () => {
    // AZERTY: the key typing « z » is where QWERTY has W.
    expect(historyCommandFor(key('z', { ctrl: true, code: 'KeyW' }), false)).toBe('undo');
    expect(historyCommandFor(key('w', { ctrl: true, code: 'KeyZ' }), false)).toBeNull();
    // A Cyrillic layout: « я » on the Z key.
    expect(historyCommandFor(key('я', { ctrl: true, code: 'KeyZ' }), false)).toBe('undo');
  });

  it('knows a Mac from its platform', () => {
    expect(isMacPlatform({ platform: 'MacIntel' })).toBe(true);
    expect(isMacPlatform({ platform: 'Win32' })).toBe(false);
    expect(isMacPlatform({ platform: '', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' })).toBe(true);
    expect(isMacPlatform(null)).toBe(false);
  });

  it('nothing is a text field outside a page', () => {
    expect(isTextField(null)).toBe(false);
  });
});
