// « Général »: what happens when the app opens, and the keyboard shortcuts (read only). The version of the
// app, « Rechercher une mise à jour » and « Alléger le travail pour l'appareil » come with the stages that
// build them (see v1/CAHIER.md).

import { t } from '../../i18n';
import type { LaunchBehaviour } from '../../model/project';
import { setAtLaunch } from '../../store/settingsActions';
import { useApp } from '../../store/store';
import { isMacPlatform } from '../../ui/historyKeys';
import { usePhoneLayout } from '../../util/media';
import { Section } from './parts';

const LAUNCH: LaunchBehaviour[] = ['lastProject', 'newProject'];

/** The shortcuts the app answers to, in the order of the list: `keys` are written for a Mac, `mac` false gives Ctrl. */
export function shortcutList(mac: boolean): { id: string; label: string; keys: string }[] {
  const mod = mac ? 'cmd' : 'Ctrl';
  const shift = t('settingsWin.key.shift');
  return [
    { id: 'play', label: t('settingsWin.shortcuts.play'), keys: t('settingsWin.key.space') },
    { id: 'undo', label: t('settingsWin.shortcuts.undo'), keys: `${mod} + Z` },
    { id: 'redo', label: t('settingsWin.shortcuts.redo'), keys: `${shift} + ${mod} + Z` },
    { id: 'open', label: t('settingsWin.shortcuts.open'), keys: `${mod} + O` },
    { id: 'save', label: t('settingsWin.shortcuts.save'), keys: `${mod} + S` },
    { id: 'saveAs', label: t('settingsWin.shortcuts.saveAs'), keys: `${shift} + ${mod} + S` },
    { id: 'print', label: t('settingsWin.shortcuts.print'), keys: `${mod} + P` },
    { id: 'settings', label: t('settingsWin.shortcuts.settings'), keys: `${mod} + ${t('settingsWin.key.comma')}` },
  ];
}

export function GeneralTab() {
  const atLaunch = useApp((s) => s.settings.atLaunch);
  const phone = usePhoneLayout();
  return (
    <>
      <Section scope="app">
        <div className="option option-colonne" role="radiogroup" aria-labelledby="reglages-ouverture">
          <span id="reglages-ouverture">{t('settingsWin.launch.title')}</span>
          <div className="choix-reglage">
            {LAUNCH.map((v) => (
              <button key={v} role="radio" aria-checked={atLaunch === v} data-testid={`ouverture-${v}`} onClick={() => setAtLaunch(v)}>
                {t(v === 'lastProject' ? 'settingsWin.launch.last' : 'settingsWin.launch.new')}
              </button>
            ))}
          </div>
          <small>{t('settingsWin.launch.note')}</small>
        </div>
      </Section>
      {/* A phone has no keyboard to speak of. */}
      {!phone && (
        <Section scope={null} title={t('settingsWin.shortcuts.title')}>
          <ul className="raccourcis" data-testid="raccourcis">
            {shortcutList(isMacPlatform()).map((s) => (
              <li key={s.id} data-raccourci={s.id}>
                <span>{s.label}</span>
                <kbd>{s.keys}</kbd>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
