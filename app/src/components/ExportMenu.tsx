// « Exporter » in the top bar: a small menu. The chord chart for iReal Pro
// and printing the chart (lot 2), the sound (lot 3: « Exporter le son », a dialog).

import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import { PRINT_READY, printChart } from '../chart/print';
import { chartForExport, exportToIRealPro } from '../export';
import '../export/export.css';
import { t } from '../i18n';
import { closePanel, togglePanel } from '../store/actions';
import { useFitPanel } from '../ui/useFitPanel';
import { selectHasChords } from '../store/chartSelectors';
import { getDesktopBridge } from '../platform/desktopBridge';
import { openExportAudio } from '../store/exportActions';
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

/**
 * « Grille pour iReal Pro »: a link to a small page that holds the iReal Pro
 * link (named after the piece), so it is a normal link in a browser and a
 * normal download in the Mac app. The Mac app adds « Ouvrir dans iReal Pro »,
 * which hands the link itself to the system.
 */
interface IRealFile {
  href: string;
  name: string;
  url: string;
}

/** The page handed to the user for the chart as it is now, or null when there is nothing to export. */
function buildIRealFile(): IRealFile | null {
  const chart = chartForExport(appStore.getState());
  if (!chart) return null;
  const out = exportToIRealPro(chart);
  const href = URL.createObjectURL(new Blob([out.html], { type: 'text/html;charset=utf-8' }));
  return { href, name: out.fileName, url: out.url };
}

function IRealEntries({ enabled }: { enabled: boolean }) {
  // Built with the first render: the menu opens on the link itself, never on a
  // placeholder that turns into a link a moment later.
  const [file, setFile] = useState<IRealFile | null>(() => (enabled ? buildIRealFile() : null));
  const [failed, setFailed] = useState(false);
  // Chords that arrive while the menu is open (an analysis ending) turn the entry on.
  useEffect(() => {
    if (enabled && !file) setFile(buildIRealFile());
  }, [enabled, file]);
  const href = file?.href;
  useEffect(() => {
    if (!href) return;
    // Not at once: the menu closes on the click, and the download starts after it.
    return () => void setTimeout(() => URL.revokeObjectURL(href), 30_000);
  }, [href]);

  const bridge = getDesktopBridge();
  if (!file) {
    return (
      <button className="option" role="menuitem" data-export="ireal" disabled>
        <span>{t('export.ireal')}</span>
        <small>{enabled ? '…' : t('export.needsChords')}</small>
      </button>
    );
  }
  const open = bridge?.openInIRealPro;
  return (
    <>
      <a className="option" role="menuitem" data-export="ireal" href={file.href} download={file.name} onClick={() => closePanel()}>
        <span>{t('export.ireal')}</span>
      </a>
      {bridge && open && (
        <button
          className="option"
          role="menuitem"
          data-export="ireal-open"
          onClick={() => {
            void open.call(bridge, file.url).then(
              (result) => (result.ok ? closePanel() : setFailed(true)),
              () => setFailed(true),
            );
          }}
        >
          <span>{t('export.irealOpen')}</span>
        </button>
      )}
      {failed && (
        <p className="option-erreur" role="alert">
          {t('export.irealOpenFailed')}
        </p>
      )}
    </>
  );
}

/** The menu's window, under its button. */
function ExportPanel({ ref }: { ref: Ref<HTMLDivElement> }) {
  const fitRef = useFitPanel(ref);
  return (
    <div ref={fitRef} className="fenetre menu-export" role="menu" aria-label={t('top.export')}>
      <ExportItems />
    </div>
  );
}

/** The entries of « Exporter »; also listed in the phone menu (« ⋯ »), where the top bar has no room for the menu. */
export function ExportItems() {
  const hasChords = useApp(selectHasChords);
  const hasTracks = useApp((s) => s.tracks.length > 0);
  const items: { key: string; label: string; ready: boolean; enabled: boolean; note: string; run: () => void }[] = [
    { key: 'print', label: t('export.print'), ready: PRINT_READY, enabled: hasChords, note: hasChords ? t('export.soon') : t('export.needsChords'), run: () => void printChart() },
    { key: 'audio', label: t('export.audio'), ready: true, enabled: hasTracks, note: '', run: openExportAudio },
  ];
  return (
    <>
      <IRealEntries enabled={hasChords} />
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
            {!active && it.note && <small>{it.ready ? t('export.needsChords') : it.note}</small>}
          </button>
        );
      })}
    </>
  );
}
