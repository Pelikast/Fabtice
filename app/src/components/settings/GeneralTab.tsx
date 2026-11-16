// « Général »: what happens when the app opens, and the keyboard shortcuts (read only). The version of the
// app, « Rechercher une mise à jour » and « Alléger le travail pour l'appareil » come with the stages that
// build them (see v1/CAHIER.md).

import { t } from '../../i18n';
import type { LaunchBehaviour } from '../../model/project';
import { setAtLaunch } from '../../store/settingsActions';
import { useApp } from '../../store/store';
import { COMMAND_IDS, COMMANDS, commandContext, shortcutText, type CommandContext } from '../../ui/commands';
import { isMacPlatform } from '../../ui/historyKeys';
import { usePhoneLayout } from '../../util/media';
import { Section } from './parts';

const LAUNCH: LaunchBehaviour[] = ['lastProject', 'newProject'];

/**
 * The shortcuts the app answers to, read from the table of commands (`ui/commands.ts`: what the menu, the keyboard
 * and the Mac menu bar share), after « Espace » (lecture), which is not a command.
 */
export function shortcutList(mac: boolean): { id: string; label: string; keys: string }[] {
  // `textField`: the plain label of « Annuler » and « Rétablir », not the one that names the last change.
  const ctx: CommandContext = { ...commandContext(), textField: true };
  const rows = COMMAND_IDS.filter((id) => COMMANDS[id].shortcut && (COMMANDS[id].offered?.(ctx) ?? true)).map((id) => ({
    id,
    label: COMMANDS[id].label(ctx),
    keys: shortcutText(COMMANDS[id].shortcut!, mac),
  }));
  return [{ id: 'play', label: t('settingsWin.shortcuts.play'), keys: t('settingsWin.key.space') }, ...rows];
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
