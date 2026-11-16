import { formatDuration } from '../grid/format';
import { t } from '../i18n';
import type { ViewMode } from '../model/project';
import { requestNewProject } from '../project/leave';
import { openSettings, setViewMode } from '../store/actions';
import { useApp } from '../store/store';
import { AnalysisStatus } from './AnalysisStatus';
import { ExportMenu } from './ExportMenu';
import { SeparationStatus } from './SeparationPanel';

const VIEWS: ViewMode[] = ['pistes', 'grille'];

export function TopBar() {
  const project = useApp((s) => s.project);
  const mode = useApp((s) => s.view.mode);
  const settingsOpen = useApp((s) => s.ui.settings.open);

  const source = project ? `${formatDuration(project.duration)} · ${t(`source.${project.source.kind}`)}` : '';

  return (
    <header className="haut">
      <div className="marque">
        Fab<i>t</i>ice
      </div>
      <div className="projet">
        <span className={`projet-titre${project ? '' : ' vide'}`}>{project ? project.title : t('top.noPiece')}</span>
        {project && <span className="projet-source">{source}</span>}
        {project && <AnalysisStatus />}
        {project && <SeparationStatus />}
      </div>
      <nav className="menus" aria-label={t('top.menus')}>
        <button className="menu cache-tel" onClick={() => void requestNewProject()}>
          {t('top.newProject')}
        </button>
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
        <ExportMenu />
        <button
          className="menu cache-tel"
          aria-expanded={settingsOpen}
          aria-haspopup="dialog"
          onClick={() => openSettings()}
        >
          {t('top.settings')}
        </button>
        <button
          className="menu menu-plus"
          aria-label={t('top.menu')}
          aria-expanded={settingsOpen}
          aria-haspopup="dialog"
          onClick={() => openSettings()}
        >
          ⋯
        </button>
      </nav>
    </header>
  );
}
