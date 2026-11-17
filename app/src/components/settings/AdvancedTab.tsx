// « Avancé »: keeping the timbre, the chord charts of standards kept on the device (in place: the list,
// « Vérifier les mises à jour de grilles », the import of a file), the room Fabtice takes on this device (with
// « Libérer »), the audio journal of the web app, and « Rétablir les réglages d'origine ».
// The slider of « Alléger le travail pour l'appareil » is `EaseLoadSlider` (`EaseLoad.tsx`).

import { useState } from 'react';
import { t } from '../../i18n';
import { getRenderer } from '../../render';
import { isDesktop } from '../../platform/desktopBridge';
import { setFormants } from '../../store/separationActions';
import { resetDeviceSettings } from '../../store/settingsActions';
import { useApp } from '../../store/store';
import { AudioJournalCopy } from '../AudioJournalCopy';
import { DeviceStorage } from '../DeviceStorage';
import { EaseLoadSlider } from './EaseLoad';
import { CheckRow, Section } from './parts';
import { StandardsSection } from './StandardsSection';

export function AdvancedTab() {
  const formants = useApp((s) => s.settings.advanced.formants);
  return (
    <Section scope="app">
      {getRenderer().supportsFormants && <CheckRow checked={formants} onChange={setFormants} label={t('settings.formants')} note={t('settings.formantsNote')} testId="formants" />}
      <EaseLoadSlider />
      <StandardsSection />
      <DeviceStorage />
      {/* The Mac app has it in Aide → Diagnostic… */}
      {!isDesktop() && <AudioJournalCopy />}
      <ResetSettings />
    </Section>
  );
}

/** « Rétablir les réglages d'origine », after a simple confirmation. */
function ResetSettings() {
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <div className="option option-colonne reglages-reinit" data-testid="reinitialiser">
      {asking ? (
        <div role="group" aria-label={t('settingsWin.advanced.resetAsk')} className="reglages-confirme">
          <p>{t('settingsWin.advanced.resetAsk')}</p>
          <div className="reprise-actions">
            <button
              className="bouton-cadre"
              data-testid="reinitialiser-oui"
              onClick={() => {
                resetDeviceSettings();
                setAsking(false);
                setDone(true);
              }}
            >
              {t('settingsWin.advanced.resetYes')}
            </button>
            <button className="bouton-cadre" autoFocus data-testid="reinitialiser-non" onClick={() => setAsking(false)}>
              {t('settingsWin.advanced.resetNo')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            className="bouton-cadre"
            data-testid="reinitialiser-demande"
            onClick={() => {
              setDone(false);
              setAsking(true);
            }}
          >
            {t('settingsWin.advanced.reset')}
          </button>
          <small>{t('settingsWin.advanced.resetNote')}</small>
          {done && (
            <small role="status" data-testid="reinitialise">
              {t('settingsWin.advanced.resetDone')}
            </small>
          )}
        </>
      )}
    </div>
  );
}
