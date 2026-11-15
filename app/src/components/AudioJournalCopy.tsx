// « Copier le journal audio », at the end of the advanced settings of the web
// app (the Mac app has it in Aide → Diagnostic…): what the app did with the
// audio output, as text to paste into a conversation (`audio/journal.ts`).

import { useState } from 'react';
import { journalText } from '../audio/journal';
import { t } from '../i18n';

export function AudioJournalCopy() {
  const [status, setStatus] = useState<'idle' | 'ok' | 'failed'>('idle');
  const copy = () => {
    const text = journalText();
    const done = navigator.clipboard?.writeText ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    void done.then(
      () => setStatus('ok'),
      () => setStatus('failed'),
    );
  };
  return (
    <div className="option option-colonne" data-testid="journal-audio">
      <button type="button" className="lien discret" onClick={copy}>
        {t('audioJournal.copy')}
      </button>
      <small role="status">{status === 'ok' ? t('audioJournal.copiedOk') : status === 'failed' ? t('audioJournal.copyFailed') : t('audioJournal.copyNote')}</small>
    </div>
  );
}
