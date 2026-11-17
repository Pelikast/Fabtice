import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { PART_INSTRUMENTS, PART_TYPES } from './structure';
import { INSTRUMENT_KEYS, PART_TYPE_KEYS, instrumentName, partName } from './structureLabels';

const p = (type: Parameters<typeof partName>[0]['type'], number: number | null = null, instrument: string | null = null) => ({ type, number, instrument });

describe('partName: type, then the number, then the instrument in parentheses', () => {
  it('writes the names the exports have always written', () => {
    expect(partName(p('intro'), t)).toBe('Intro');
    expect(partName(p('theme', 1), t)).toBe('Thème 1');
    expect(partName(p('solo', null, 'guitar'), t)).toBe('Solo (Guitare)');
    expect(partName(p('solo', 2, 'piano'), t)).toBe('Solo 2 (Piano)');
    expect(partName(p('solo', 2, 'winds'), t)).toBe('Solo 2 (Vents)');
    expect(partName(p('solo', null, 'winds'), t)).toBe('Solo (Vents)');
    expect(partName(p('bridge'), t)).toBe('Pont');
    expect(partName(p('special'), t)).toBe('Spécial');
    expect(partName(p('outro'), t)).toBe('Outro');
  });

  it('names the Pop kinds', () => {
    expect(partName(p('verse', 1), t)).toBe('Couplet 1');
    expect(partName(p('chorus', 2), t)).toBe('Refrain 2');
  });

  it('leaves out an instrument it does not know', () => {
    expect(partName(p('solo', 1, 'theremin'), t)).toBe('Solo 1');
    expect(instrumentName('theremin', t)).toBeNull();
  });

  it('has a name for every kind and every known instrument', () => {
    for (const type of PART_TYPES) expect(t(PART_TYPE_KEYS[type]).length).toBeGreaterThan(0);
    for (const id of PART_INSTRUMENTS) expect(instrumentName(id, t)).not.toBeNull();
    expect(Object.keys(INSTRUMENT_KEYS).sort()).toEqual([...PART_INSTRUMENTS].sort());
  });

  it('takes the translation it is given', () => {
    expect(partName(p('theme', 3, 'violin'), (key) => `<${key}>`)).toBe('<structure.part.theme> 3 (<structure.instrument.violin>)');
  });
});
