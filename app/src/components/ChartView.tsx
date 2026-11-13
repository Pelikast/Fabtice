import { formatNumber, t } from '../i18n';
import { setViewMode } from '../store/actions';
import { originalBpm } from '../store/derived';
import { useApp } from '../store/store';

const EMPTY_BARS = 8;

/** « Grille d'accords »: an empty chart until the analysis exists (lot 2). */
export function ChartView() {
  const project = useApp((s) => s.project);
  const meter = useApp((s) => s.tempoMap.meters[0]!.meter);
  const bpm = useApp((s) => originalBpm(s));
  return (
    <div className="vue vue-grille">
      <div className="feuille">
        {project && (
          <div className="feuille-tete">
            <h1>{project.title}</h1>
            <p>
              {meter.numerator}/{meter.denominator}
              {bpm !== null && ` · ${formatNumber(bpm, 1)}`}
            </p>
          </div>
        )}
        <div className="grille-vide" aria-hidden="true">
          {Array.from({ length: EMPTY_BARS }, (_, i) => (
            <span key={i} />
          ))}
        </div>
        <div className="vide-message">
          {project ? (
            <>
              <h2>{t('chart.emptyTitle')}</h2>
              <p>{t('chart.emptyText')}</p>
              <button className="bouton-cadre" onClick={() => setViewMode('pistes')}>
                {t('chart.emptyAction')}
              </button>
            </>
          ) : (
            <p>{t('chart.noPiece')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
