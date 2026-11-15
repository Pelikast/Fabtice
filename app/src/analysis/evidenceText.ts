// What the chord analysis listened to, in a few words for the analysis panel
// (« Grille connue : Blue Bossa (Jazz 1460) · Reprises : forme de 16 mesures »).

import { t } from '../i18n';
import type { MessageKey } from '../i18n';
import type { AnalysisEvidence } from './types';

export function evidenceText(e: AnalysisEvidence | null): string {
  if (!e) return '';
  const parts: string[] = [];
  if (e.knownChart) {
    parts.push(
      e.knownChart.collection
        ? t('analysis.used.chart', { title: e.knownChart.title, collection: e.knownChart.collection })
        : t('analysis.used.chartAlone', { title: e.knownChart.title }),
    );
  }
  if (e.formBars) parts.push(t('analysis.used.form', { n: e.formBars }));
  if (e.harmonyStems.length) {
    const names = e.harmonyStems.map((s) => {
      const text = t(`stem.${s}` as MessageKey) as string | undefined;
      return text ? text.toLowerCase() : s;
    });
    parts.push(t('analysis.used.stems', { list: names.join(', ') }));
  }
  if (e.bass === 'stem') parts.push(t('analysis.used.bassStem'));
  else if (e.bass === 'band') parts.push(t('analysis.used.bassBand'));
  return parts.join(' · ');
}
