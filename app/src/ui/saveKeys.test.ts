import { describe, expect, it } from 'vitest';
import { saveCommandFor } from './saveKeys';

const key = (o: Partial<KeyboardEvent>) => ({ key: 's', code: 'KeyS', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...o });

describe('« Enregistrer » shortcuts', () => {
  it('Mac: cmd + S saves, Maj + cmd + S saves as; Ctrl alone does nothing', () => {
    expect(saveCommandFor(key({ metaKey: true }), true)).toBe('save');
    expect(saveCommandFor(key({ metaKey: true, shiftKey: true, key: 'S' }), true)).toBe('saveAs');
    expect(saveCommandFor(key({ ctrlKey: true }), true)).toBeNull();
    expect(saveCommandFor(key({ metaKey: true, ctrlKey: true }), true)).toBeNull();
    expect(saveCommandFor(key({}), true)).toBeNull();
  });

  it('elsewhere: Ctrl + S saves, Maj + Ctrl + S saves as; cmd alone does nothing', () => {
    expect(saveCommandFor(key({ ctrlKey: true }), false)).toBe('save');
    expect(saveCommandFor(key({ ctrlKey: true, shiftKey: true, key: 'S' }), false)).toBe('saveAs');
    expect(saveCommandFor(key({ metaKey: true }), false)).toBeNull();
  });

  it('the letter as typed: another layout puts S elsewhere; a layout without Latin letters uses the key position', () => {
    expect(saveCommandFor(key({ ctrlKey: true, key: 's', code: 'KeyD' }), false)).toBe('save');
    expect(saveCommandFor(key({ ctrlKey: true, key: 'd', code: 'KeyS' }), false)).toBeNull();
    expect(saveCommandFor(key({ ctrlKey: true, key: 'ы', code: 'KeyS' }), false)).toBe('save');
  });

  it('Alt, or another letter: nothing', () => {
    expect(saveCommandFor(key({ ctrlKey: true, altKey: true }), false)).toBeNull();
    expect(saveCommandFor(key({ ctrlKey: true, key: 'z', code: 'KeyZ' }), false)).toBeNull();
  });
});
