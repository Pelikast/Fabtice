// « Affichage »: how minor chords are written, whether the view follows the playhead, the « Auto » zoom, and for
// the open piece the instrument the chart is written for (Ut, Si♭, Mi♭).

import { InstrumentChoice } from '../../chart/ChartSheet';
import { t } from '../../i18n';
import type { MinorNotation } from '../../model/project';
import { setAuto, setFollow, setMinorNotation } from '../../store/actions';
import { useApp } from '../../store/store';
import { CheckRow, Section } from './parts';

const MINOR: { value: MinorNotation; sample: string }[] = [
  { value: 'm', sample: 'Cm7' },
  { value: '–', sample: 'C–7' },
];

export function DisplayTab() {
  const follow = useApp((s) => s.view.follow);
  const auto = useApp((s) => s.view.auto);
  const minor = useApp((s) => s.settings.minorNotation);
  const instrument = useApp((s) => s.view.instrument);
  return (
    <>
      <Section scope="app">
        <div className="option">
          <span>{t('settings.minorChords')}</span>
          <span className="duo" role="group" aria-label={t('settings.minorNotation')}>
            {MINOR.map((m) => (
              <button key={m.value} aria-pressed={minor === m.value} onClick={() => setMinorNotation(m.value)}>
                {m.sample}
              </button>
            ))}
          </span>
        </div>
        <CheckRow checked={follow} onChange={setFollow} label={t('settings.follow')} testId="reglage-suivre" />
        <CheckRow checked={auto} onChange={setAuto} label={t('settingsWin.display.auto')} note={t('settingsWin.display.autoNote')} testId="reglage-auto" />
      </Section>
      <Section scope="piece">
        <div className="option">
          <span>{t('settingsWin.display.instrument')}</span>
          <InstrumentChoice value={instrument} />
        </div>
        <p className="panneau-note reglages-note">{t('settingsWin.display.instrumentNote')}</p>
      </Section>
    </>
  );
}
