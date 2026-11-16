import { formatDuration } from '../grid/format';
import { t } from '../i18n';
import type { ViewMode } from '../model/project';
import { setViewMode } from '../store/actions';
import { useApp } from '../store/store';
import { AnalysisStatus } from './AnalysisStatus';
import { FabticeMenu } from './FabticeMenu';
import { SeparationStatus } from './SeparationPanel';

const VIEWS: ViewMode[] = ['pistes', 'grille'];

/**
 * The top bar (C6): the logo, which opens the menu Fabtice (every command of the app), the title of the piece
 * and its states, then the two views. A command has one place: the menu.
 */
export function TopBar() {
  const project = useApp((s) => s.project);
  const mode = useApp((s) => s.view.mode);

  const source = project ? `${formatDuration(project.duration)} · ${t(`source.${project.source.kind}`)}` : '';

  return (
    <header className="haut">
      <FabticeMenu />
      <div className="projet">
        <span className={`projet-titre${project ? '' : ' vide'}`}>{project ? project.title : t('top.noPiece')}</span>
        {project && <span className="projet-source">{source}</span>}
        {project && <AnalysisStatus />}
        {project && <SeparationStatus />}
      </div>
      <nav className="menus" aria-label={t('top.views')}>
        <span className="modes" role="tablist" aria-label={t('top.views')}>
          {VIEWS.map((v) => (
            <button
              key={v}
              className="menu mode"
              role="tab"
              data-vue={v}
              aria-selected={mode === v}
              onClick={() => setViewMode(v)}
            >
              {v === 'pistes' ? (
                t('top.viewTracks')
              ) : (
                <>
                  {t('top.viewChart')}
                  <span className="long">{t('top.viewChartMore')}</span>
                </>
              )}
            </button>
          ))}
        </span>
      </nav>
    </header>
  );
}
