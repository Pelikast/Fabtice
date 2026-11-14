// « Exporter » in the top bar: a small menu. The chord chart for iReal Pro
// and printing the chart (lot 2, shown « bientôt » until written), audio
// export visible but inactive (lot 3).

import { useCallback, useRef, type Ref } from 'react';
import { chartForExport, exportToIRealPro, IREAL_EXPORT_READY, printChart, PRINT_READY } from '../export';
import { t } from '../i18n';
import { closePanel, togglePanel } from '../store/actions';
import { selectHasChords } from '../store/chartSelectors';
import { appStore, useApp } from '../store/store';
import { useOutsideClose } from '../ui/useOutsideClose';

export function ExportMenu() {
  const open = useApp((s) => s.ui.panel === 'export');
  const hasProject = useApp((s) => s.project !== null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const refs = useRef([buttonRef, panelRef]).current;
  useOutsideClose(open, refs, useCallback(() => closePanel(), []));
  return (
    <span className="menu-ancre cache-tel">
      <button
        ref={buttonRef}
        className="menu"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={!hasProject}
        onClick={() => togglePanel('export')}
      >
        {t('top.export')}
      </button>
      {open && <ExportPanel ref={panelRef} />}
    </span>
  );
}

/** Hands the iReal Pro chart over: a page with the link, saved by the browser (the export agent may refine this). */
function exportIReal(): void {
  const chart = chartForExport(appStore.getState());
  if (!chart) return;
  const out = exportToIRealPro(chart);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([out.html], { type: 'text/html' }));
  a.download = out.fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

function ExportPanel({ ref }: { ref: Ref<HTMLDivElement> }) {
  const hasChords = useApp(selectHasChords);
  const items: { key: string; label: string; ready: boolean; enabled: boolean; note: string; run: () => void }[] = [
    { key: 'ireal', label: t('export.ireal'), ready: IREAL_EXPORT_READY, enabled: hasChords, note: hasChords ? t('export.soon') : t('export.needsChords'), run: exportIReal },
    { key: 'print', label: t('export.print'), ready: PRINT_READY, enabled: hasChords, note: hasChords ? t('export.soon') : t('export.needsChords'), run: printChart },
    { key: 'audio', label: t('export.audio'), ready: false, enabled: false, note: t('export.audioLater'), run: () => {} },
  ];
  return (
    <div ref={ref} className="fenetre menu-export" role="menu" aria-label={t('top.export')}>
      {items.map((it) => {
        const active = it.ready && it.enabled;
        return (
          <button
            key={it.key}
            className="option"
            role="menuitem"
            data-export={it.key}
            disabled={!active}
            onClick={() => {
              closePanel();
              it.run();
            }}
          >
            <span>{it.label}</span>
            {!active && <small>{it.ready ? t('export.needsChords') : it.note}</small>}
          </button>
        );
      })}
    </div>
  );
}
