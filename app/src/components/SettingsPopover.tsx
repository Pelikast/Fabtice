import { useState, type Ref } from 'react';
import { t } from '../i18n';
import type { MinorNotation } from '../model/project';
import { getRenderer } from '../render';
import { useMainTools, useSeparationChoice } from '../separation/useChoice';
import { openNewPiece, setFollow, setMinorNotation, togglePanel } from '../store/actions';
import { setFormants, setSeparationModel } from '../store/separationActions';
import { useApp } from '../store/store';
import { useFitPanel } from '../ui/useFitPanel';
import { ExportItems } from './ExportMenu';

const MINOR: { value: MinorNotation; sample: string }[] = [
  { value: 'm', sample: 'Cm7' },
  { value: '–', sample: 'C–7' },
];

export function SettingsPopover({ ref }: { ref: Ref<HTMLDivElement> }) {
  const follow = useApp((s) => s.view.follow);
  const minor = useApp((s) => s.settings.minorNotation);
  const fitRef = useFitPanel(ref);
  return (
    <div ref={fitRef} className="fenetre reglages-app" role="dialog" aria-label={t('top.settings')}>
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
      {/* On a phone the track column has little room: the way into the separation is also here. */}
      <SeparationPhoneEntry />
      <AdvancedSettings />
      {/* On a phone « Exporter » is not in the top bar: its entries are here. */}
      <div className="export-tel" role="menu" aria-label={t('top.export')}>
        <span className="libelle">{t('top.export')}</span>
        <ExportItems />
      </div>
    </div>
  );
}

function SeparationPhoneEntry() {
  const hasProject = useApp((s) => s.project !== null);
  const separated = useApp((s) => s.separation.result !== null);
  if (!hasProject) return null;
  return (
    <button className="option lien-option" data-separation-entry onClick={() => togglePanel('separation')}>
      {separated ? t('separation.instrumentsEntry') : t('separation.entry')}
    </button>
  );
}

/**
 * « Réglages avancés », folded by default: the separation tool (automatic, or
 * one of the list) and « Conserver le timbre » for the applied render and the
 * export. Out of the way of someone who opens the app for the first time.
 */
function AdvancedSettings() {
  const [open, setOpen] = useState(false);
  const setting = useApp((s) => s.settings.advanced.separationModel);
  const formants = useApp((s) => s.settings.advanced.formants);
  const tools = useMainTools();
  const auto = useSeparationChoice();
  const autoChoice = setting === 'auto' ? auto : null;
  return (
    <div className="avance">
      <button className="option avance-titre" aria-expanded={open} data-testid="reglages-avances" onClick={() => setOpen((o) => !o)}>
        <span>{t('settings.advanced')}</span>
        <span className="chevron" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="avance-corps">
          <label className="option option-colonne">
            <span>{t('settings.separationTool')}</span>
            <select value={tools.some((m) => m.id === setting) ? setting : 'auto'} data-testid="outil-separation" onChange={(e) => setSeparationModel(e.target.value)}>
              <option value="auto">{auto ? t('settings.toolAuto', { label: auto.model.label }) : t('settings.toolNone')}</option>
              {tools.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.name})
                </option>
              ))}
            </select>
            {autoChoice && <small>{t('settings.toolAutoWhy', { name: autoChoice.model.name, reason: autoChoice.reason })}</small>}
          </label>
          {getRenderer().supportsFormants && (
            <label className="option option-colonne">
              <span className="option-ligne">
                <input type="checkbox" checked={formants} data-testid="formants" onChange={(e) => setFormants(e.target.checked)} />
                <span>{t('settings.formants')}</span>
              </span>
              <small>{t('settings.formantsNote')}</small>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
