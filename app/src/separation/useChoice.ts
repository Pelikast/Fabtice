// The tool the screens talk about (advanced setting or automatic choice), kept
// up to date when the remote list arrives or the device has been probed.

import { useEffect, useState } from 'react';
import { formatAmount } from '../import/amount';
import { formatNumber, t } from '../i18n';
import { useApp } from '../store/store';
import { estimateSeconds, getDevice, knownDevice } from './device';
import { getModelList, onModelListChange } from './models';
import { currentChoice } from './runner';
import type { ModelChoice } from './types';

/**
 * Re-renders when the list of tools changes or, when `probe` is true, once
 * the device has been probed (the graphics chip is asked only then: see
 * `separation/device.ts#probeDevice`).
 */
function useListVersion(probe = false): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    const off = onModelListChange(() => alive && setVersion((v) => v + 1));
    return () => {
      alive = false;
      off();
    };
  }, []);
  useEffect(() => {
    if (!probe) return;
    let alive = true;
    void getDevice().then(() => alive && setVersion((v) => v + 1));
    return () => {
      alive = false;
    };
  }, [probe]);
  return version;
}

/** The tool in use. `probe`: the separation is really being considered (panel open, an instrument ticked): ask the graphics chip. */
export function useSeparationChoice(probe = false): ModelChoice | null {
  const setting = useApp((s) => s.settings.advanced.separationModel);
  const version = useListVersion(probe);
  const [choice, setChoice] = useState<ModelChoice | null>(() => currentChoice());
  useEffect(() => setChoice(currentChoice()), [setting, version]);
  return choice;
}

/** Every main tool of the list in use (for the advanced setting). */
export function useMainTools() {
  const version = useListVersion();
  const [tools, setTools] = useState(() => getModelList().list.models.filter((m) => m.kind === 'main'));
  useEffect(() => setTools(getModelList().list.models.filter((m) => m.kind === 'main')), [version]);
  return tools;
}

/** « moins d'une minute », « 14 min », « 1 h 05 ». */
export function formatWait(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 60) return t('wait.underMinute');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('wait.minutes', { n: minutes });
  return t('wait.hours', { h: Math.floor(minutes / 60), m: String(minutes % 60).padStart(2, '0') });
}

/** « 353 Mo », « 1,2 Go ». */
export function formatSize(bytes: number): string {
  if (bytes >= 1e9) return t('size.gb', { n: formatNumber(bytes / 1e9, 1) });
  if (bytes >= 1e6) return t('size.mb', { n: formatNumber(bytes / 1e6, 0) });
  return formatAmount(bytes);
}

/** The estimate sentence for a piece of `seconds`, honest about what is measured. */
export function estimateSentence(choice: ModelChoice, seconds: number): string {
  const time = formatWait(estimateSeconds(choice.model, choice.backend, knownDevice(), seconds));
  return choice.model.speed.measured ? t('separation.estimate', { time }) : t('separation.estimateGuess', { time });
}

/** The estimated wait alone (the new-piece dialog does not know the piece's length yet: a typical 4-minute piece). */
export function estimateWait(choice: ModelChoice, seconds: number): string {
  return formatWait(estimateSeconds(choice.model, choice.backend, knownDevice(), seconds));
}
