import type { Ref } from 'react';
import { t } from '../i18n';
import type { MinorNotation } from '../model/project';
import { openNewPiece, setFollow, setMinorNotation } from '../store/actions';
import { useApp } from '../store/store';

const MINOR: { value: MinorNotation; sample: string }[] = [
  { value: 'm', sample: 'Cm7' },
  { value: '–', sample: 'C–7' },
];

export function SettingsPopover({ ref }: { ref: Ref<HTMLDivElement> }) {
  const follow = useApp((s) => s.view.follow);
  const minor = useApp((s) => s.settings.minorNotation);
  return (
    <div ref={ref} className="fenetre reglages-app" role="dialog" aria-label={t('top.settings')}>
      <label className="option">
        <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
        <span>{t('settings.follow')}</span>
      </label>
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
      <button className="option lien-option" onClick={openNewPiece}>
        {t('settings.newProject')}
      </button>
    </div>
  );
}
