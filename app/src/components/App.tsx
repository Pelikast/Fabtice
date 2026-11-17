import { useEffect } from 'react';
import { useStore } from 'zustand';
import { startAutoAnalysis } from '../analysis/runner';
import { leaveDialog } from '../project/leave';
import { saveActivity } from '../project/saveFlow';
import { startKeptRenderWatch, startRenderWatch } from '../render/controller';
import { startAutoSeparation } from '../separation/runner';
import { t } from '../i18n';
import { useApp } from '../store/store';
import { useFileDrop } from '../ui/useFileDrop';
import { useGlobalKeys } from '../ui/useGlobalKeys';
import { ApplyWaiting } from './ApplyRender';
import { ChartView } from './ChartView';
import { ExportAudioDialog } from './ExportAudioDialog';
import { ExportLogicDialog } from './ExportLogicDialog';
import { logicDialog } from '../export/logic/dialog';
import { tapFixDialog } from '../ui/barDialogs';
import { abletonDialog } from '../export/ableton/dialog';
import { ExportAbletonDialog } from './ExportAbletonDialog';
import { LeaveProjectDialog } from './LeaveProjectDialog';
import { SaveActivity } from './SaveActivity';
import { NewPieceDialog } from './NewPieceDialog';
import { PrintDialog } from './PrintDialog';
import { SaveProjectDialog } from './SaveProjectDialog';
import { SettingsDialog } from './SettingsDialog';
import { SeparationPanelHost } from './SeparationPanel';
import { StandardsMessage, useMessageStep } from './StandardsMessage';
import { StorageNotice } from './StorageNotice';
import { IRealNotice } from './IRealNotice';
import { TopBar } from './TopBar';
import { MeterDialog } from './MeterDialog';
import { ModulationDialog } from './ModulationDialog';
import { PartDialog } from './PartDialog';
import { TapFixDialog } from './TapFixDialog';
import { TempoFixMenu } from './TempoFixMenu';
import { TracksView } from './TracksView';
import { Transport } from './Transport';

export function App() {
  const mode = useApp((s) => s.view.mode);
  const dialogOpen = useApp((s) => s.ui.newPieceOpen || s.ui.exportAudioOpen || s.ui.printOpen || s.ui.saveProjectOpen || s.ui.settings.open || s.render.status === 'rendering' || s.render.status === 'error');
  // The message of the chord charts (C9) is a window too, over the opening screen or the open piece.
  const messageOpen = useMessageStep() !== null;
  // The alert about changes not saved, and the progress or the error of « Enregistrer », are windows too.
  const leaving = useStore(leaveDialog, (s) => s.open);
  const saving = useStore(saveActivity, (s) => (s.phase === 'working' && s.visible) || s.phase === 'error');
  const exportingLogic = useStore(logicDialog, (s) => s.open);
  const exportingAbleton = useStore(abletonDialog, (s) => s.open);
  // « Correction de la courbe en tapant le tempo »: its window leaves the ruler and the playhead in view, and the rest of the app waits.
  const tapping = useStore(tapFixDialog, (s) => s.at !== null);
  const inert = dialogOpen || messageOpen || leaving || saving || exportingLogic || exportingAbleton || tapping;
  const dragging = useFileDrop();
  useGlobalKeys();
  // Each newly opened piece is analysed in the background once it can play (analysis/runner.ts).
  useEffect(() => startAutoAnalysis(), []);
  // Lot 3: the separation asked in the new-piece dialog starts once the piece can play; a stale « Appliquer » render is dropped.
  useEffect(() => startAutoSeparation(), []);
  useEffect(() => startRenderWatch(), []);
  // Version 5: the render kept with the piece is heard again when the key and tempo are its own again.
  useEffect(() => startKeptRenderWatch(), []);
  return (
    <>
      <div className="app" data-vue={mode} inert={inert}>
        <TopBar />
        <main className="milieu">{mode === 'pistes' ? <TracksView /> : <ChartView />}</main>
        <Transport />
      </div>
      <SeparationPanelHost />
      <StorageNotice />
      <IRealNotice />
      <NewPieceDialog />
      <StandardsMessage />
      <ExportAudioDialog />
      <ExportLogicDialog />
      <ExportAbletonDialog />
      <PrintDialog />
      <SaveProjectDialog />
      <SettingsDialog />
      <SaveActivity />
      <LeaveProjectDialog />
      <ApplyWaiting />
      <TempoFixMenu />
      <TapFixDialog />
      <MeterDialog />
      <PartDialog />
      <ModulationDialog />
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
