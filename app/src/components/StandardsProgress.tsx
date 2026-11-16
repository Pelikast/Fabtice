// The progress of the chart download, shared by the start-up message and « Réglages → Avancé »: a percentage that
// advances steadily, the collection being read, « n sur N ». Ink and paper only (DESIGN.md).

import { useEffect, useState, type CSSProperties } from 'react';
import { t } from '../i18n';
import { finishedOf, smoothFraction } from '../standards/smooth';
import type { StandardsRun } from '../standards/offer';

const TICK_MS = 200;

type Running = Extract<StandardsRun, { kind: 'running' }>;

/** The percentage shown: the real one, and a steady creep towards the next step in between. */
function useCreepingFraction(progress: Running['progress']): number {
  const { finished, total } = finishedOf(progress);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (total === 0) return;
    const timer = setInterval(() => setShown((s) => smoothFraction(s, finished, total, TICK_MS)), TICK_MS);
    return () => clearInterval(timer);
  }, [finished, total]);
  return total === 0 ? 0 : Math.max(shown, finished / total);
}

export function StandardsProgress({ run }: { run: Running }) {
  const { progress, reading } = run;
  const { finished, total } = finishedOf(progress);
  const fraction = useCreepingFraction(progress);
  const indeterminate = total === 0;
  const current = progress.rows.find((r) => r.state === 'fetching') ?? progress.rows[Math.min(finished, total - 1)];
  const percent = Math.round(Math.min(1, fraction) * 100);
  return (
    <div className="import-etat standards-progres" data-testid="standards-encours">
      <div className="phase">
        <span>{reading ? t('standards.reading') : t('standards.running')}</span>
        <span data-testid="standards-pourcent">{indeterminate ? '' : t('import.percent', { n: percent })}</span>
      </div>
      <div
        className={`jauge${indeterminate ? ' indeterminee' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : percent}
        aria-label={t('standards.running')}
        style={{ '--avance': fraction } as CSSProperties}
      >
        <span />
      </div>
      {!indeterminate && current && (
        <p className="import-note standards-courant" role="status" aria-live="polite" data-testid="standards-courant">
          {t('standards.progressLine', { name: current.name, n: Math.min(total, finished + 1), total })}
        </p>
      )}
    </div>
  );
}
