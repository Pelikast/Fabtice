import { describe, expect, it } from 'vitest';
import { setLanguage, t, type MessageKey } from '../i18n';
import type { StorageNotice } from './store';

// `StorageNotice` shows `storage.<notice>`: every notice needs its sentence (`renderFull`: a render not kept, disk full).
describe('storage notices', () => {
  it('every notice has a calm sentence', () => {
    setLanguage('fr');
    const all: StorageNotice[] = ['unavailable', 'full', 'renderFull'];
    for (const n of all) expect(t(`storage.${n}` as MessageKey)).toMatch(/place|enregistrer/);
    expect(t('storage.renderFull')).toContain('Le morceau, lui, est gardé');
  });
});
