import { useEffect } from 'react';
import { startAutoAnalysis } from '../analysis/runner';
import { startRenderWatch } from '../render/controller';
import { startAutoSeparation } from '../separation/runner';
import { t } from '../i18n';
import { useStandards } from '../standards/offer';
import { useApp } from '../store/store';
import { useFileDrop } from '../ui/useFileDrop';
import { useGlobalKeys } from '../ui/useGlobalKeys';
import { ApplyWaiting } from './ApplyRender';
import { ChartView } from './ChartView';
import { ExportAudioDialog } from './ExportAudioDialog';
import { NewPieceDialog } from './NewPieceDialog';
import { PrintDialog } from './PrintDialog';
import { SaveProjectDialog } from './SaveProjectDialog';
import { SeparationPanelHost } from './SeparationPanel';
import { StandardsDialog } from './StandardsOffer';
import { StorageNotice } from './StorageNotice';
import { TopBar } from './TopBar';
import { TracksView } from './TracksView';
import { Transport } from './Transport';

export function App() {
  const mode = useApp((s) => s.view.mode);
  const dialogOpen = useApp((s) => s.ui.newPieceOpen || s.ui.exportAudioOpen || s.ui.printOpen || s.ui.saveProjectOpen || s.render.status === 'rendering' || s.render.status === 'error');
  const standardsOpen = useStandards((s) => s.panelOpen);
  const inert = dialogOpen || standardsOpen;
  const dragging = useFileDrop();
  useGlobalKeys();
  // Each newly opened piece is analysed in the background once it can play (analysis/runner.ts).
  useEffect(() => startAutoAnalysis(), []);
  // Lot 3: the separation asked in the new-piece dialog starts once the piece can play; a stale « Appliquer » render is dropped.
  useEffect(() => startAutoSeparation(), []);
  useEffect(() => startRenderWatch(), []);
  return (
    <>
      <div className="app" data-vue={mode} inert={inert}>
        <TopBar />
        <main className="milieu">{mode === 'pistes' ? <TracksView /> : <ChartView />}</main>
        <Transport />
      </div>
      <SeparationPanelHost />
      <StorageNotice />
      <NewPieceDialog />
      <StandardsDialog />
      <ExportAudioDialog />
      <PrintDialog />
      <SaveProjectDialog />
      <ApplyWaiting />
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
