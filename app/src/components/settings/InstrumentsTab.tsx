// « Instruments »: the separation tool (automatic or chosen, with its size, source and licence), and for the
// open piece the way into the separation, the kept separations and the one that is heard. The instruments
// ticked by default and « calcul sur la carte graphique ou le processeur » are not here: the first is the
// « Séparer les instruments » box of « Nouveau projet », and the second is automatic (the app goes back to the
// processor by itself and keeps the tool chosen).

import { t } from '../../i18n';
import { useMainTools, useSeparationChoice, formatSize } from '../../separation/useChoice';
import { chooseSeparation } from '../../separation/runner';
import { closeSettings, openPanel } from '../../store/actions';
import { setSeparationModel } from '../../store/separationActions';
import { useApp } from '../../store/store';
import { KeptSeparations } from '../KeptSeparations';
import { Section } from './parts';

export function InstrumentsTab() {
  return (
    <>
      <Section scope="app">
        <SeparationToolSetting />
      </Section>
      <Section scope="piece">
        <SeparationEntry />
        <ListenedSeparation />
        <KeptSeparations />
      </Section>
    </>
  );
}

/** « Outil de séparation »: automatic, or one of the list, with what it costs before it is chosen. */
export function SeparationToolSetting() {
  const setting = useApp((s) => s.settings.advanced.separationModel);
  const tools = useMainTools();
  const auto = useSeparationChoice(true);
  const autoChoice = setting === 'auto' ? auto : null;
  const shown = setting === 'auto' ? (auto?.model ?? null) : (tools.find((m) => m.id === setting) ?? null);
  return (
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
      {/* What the tool costs before it is chosen: its size, where it comes from, its licence. */}
      {shown && (
        <small data-testid="outil-cout">
          {t('settings.toolCost', { size: formatSize(shown.file.bytes), host: shown.file.host, licence: shown.licence })}
          {shown.licenceUnclear && ` ${t('settings.toolCostUnclear')}`}
        </small>
      )}
    </label>
  );
}

/**
 * The way into the separation panel (on a phone the track column has little room, so it is here too). The panel
 * lives under the window, so the window gives way to it.
 */
function SeparationEntry() {
  const separated = useApp((s) => s.separation.result !== null);
  return (
    <div className="option option-colonne">
      <button
        className="bouton-cadre"
        data-separation-entry
        onClick={() => {
          closeSettings();
          openPanel('separation');
        }}
      >
        {separated ? t('separation.instrumentsEntry') : t('separation.entry')}
      </button>
      <small>{t('settingsWin.instruments.entryNote')}</small>
    </div>
  );
}

/** Version 5: with several separations kept, which one is heard (the same choice as in the separation panel). */
function ListenedSeparation() {
  const current = useApp((s) => s.separation.result);
  const others = useApp((s) => s.separation.others);
  const running = useApp((s) => s.separationRun.status === 'running');
  if (!current || others.length === 0) return null;
  return (
    <label className="option option-colonne">
      <span>{t('settings.listenedSeparation')}</span>
      <select value={current.id} disabled={running} data-testid="separation-ecoutee" onChange={(e) => void chooseSeparation(e.target.value)}>
        {[current, ...others.map((o) => o.result)].map((r) => (
          <option key={r.id} value={r.id}>
            {r.modelName}
          </option>
        ))}
      </select>
      <small>{t('settings.listenedNote')}</small>
    </label>
  );
}
