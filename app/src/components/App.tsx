import { useEffect } from 'react';
import { startAutoAnalysis } from '../analysis/runner';
import { t } from '../i18n';
import { useApp } from '../store/store';
import { useFileDrop } from '../ui/useFileDrop';
import { useGlobalKeys } from '../ui/useGlobalKeys';
import { ChartView } from './ChartView';
import { NewPieceDialog } from './NewPieceDialog';
import { StorageNotice } from './StorageNotice';
import { TopBar } from './TopBar';
import { TracksView } from './TracksView';
import { Transport } from './Transport';

export function App() {
  const mode = useApp((s) => s.view.mode);
  const dialogOpen = useApp((s) => s.ui.newPieceOpen);
  const dragging = useFileDrop();
  useGlobalKeys();
  // Each newly opened piece is analysed in the background once it can play (analysis/runner.ts).
  useEffect(() => startAutoAnalysis(), []);
  return (
    <>
      <div className="app" data-vue={mode} inert={dialogOpen}>
        <TopBar />
        <main className="milieu">{mode === 'pistes' ? <TracksView /> : <ChartView />}</main>
        <Transport />
      </div>
      <StorageNotice />
      <NewPieceDialog />
      {dragging && (
        <div className="depot" aria-hidden="true">
          <div>
            <strong>{t('drop.overlay')}</strong>
            <span>{t('drop.formats')}</span>
          </div>
        </div>
      )}
    </>
  );
}
