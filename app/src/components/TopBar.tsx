import { useCallback, useRef } from 'react';
import { formatDuration } from '../grid/format';
import { t } from '../i18n';
import type { ViewMode } from '../model/project';
import { closePanel, openNewPiece, setViewMode, togglePanel } from '../store/actions';
import { useApp } from '../store/store';
import { useOutsideClose } from '../ui/useOutsideClose';
import { AnalysisStatus } from './AnalysisStatus';
import { ExportMenu } from './ExportMenu';
import { SeparationStatus } from './SeparationPanel';
import { SettingsPopover } from './SettingsPopover';

const VIEWS: ViewMode[] = ['pistes', 'grille'];

export function TopBar() {
  const project = useApp((s) => s.project);
  const mode = useApp((s) => s.view.mode);
  const settingsOpen = useApp((s) => s.ui.panel === 'settings');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const phoneButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const refs = useRef([buttonRef, phoneButtonRef, panelRef]).current;
  useOutsideClose(settingsOpen, refs, useCallback(() => closePanel(), []));

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
        <button className="menu cache-tel" onClick={openNewPiece}>
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
          ref={buttonRef}
          className="menu cache-tel"
          aria-expanded={settingsOpen}
          aria-haspopup="dialog"
          onClick={() => togglePanel('settings')}
        >
          {t('top.settings')}
        </button>
        <button
          ref={phoneButtonRef}
          className="menu menu-plus"
          aria-label={t('top.menu')}
          aria-expanded={settingsOpen}
          aria-haspopup="dialog"
          onClick={() => togglePanel('settings')}
        >
          ⋯
        </button>
      </nav>
      {settingsOpen && <SettingsPopover ref={panelRef} />}
    </header>
  );
}
