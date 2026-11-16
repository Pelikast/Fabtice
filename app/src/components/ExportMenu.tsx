// The former « Exporter » menu of the top bar. Its commands now live in the
// menu Fabtice (`ui/commands.ts`, `components/FabticeMenu.tsx`); what is left
// is only read by the former settings popover, and goes with it.

import { useEffect, useState } from 'react';
import { PRINT_READY } from '../chart/print';
import { chartForExport, exportToIRealPro } from '../export';
import '../export/export.css';
import { t } from '../i18n';
import { closePanel } from '../store/actions';
import { selectHasChords } from '../store/chartSelectors';
import { getDesktopBridge } from '../platform/desktopBridge';
import { openExportAudio, openPrint, openSaveProject } from '../store/exportActions';
import { appStore, useApp } from '../store/store';

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

/** The entries of « Exporter »; also listed in the phone menu (« ⋯ »), where the top bar has no room for the menu. */
export function ExportItems() {
  const hasChords = useApp(selectHasChords);
  const hasTracks = useApp((s) => s.tracks.length > 0);
  const hasProject = useApp((s) => s.project !== null && s.project.source.kind !== 'demo');
  const isDemo = useApp((s) => s.project?.source.kind === 'demo');
  const items: { key: string; label: string; ready: boolean; enabled: boolean; note: string; run: () => void }[] = [
    { key: 'print', label: t('export.print'), ready: PRINT_READY, enabled: hasChords, note: hasChords ? t('export.soon') : t('export.needsChords'), run: openPrint },
    { key: 'audio', label: t('export.audio'), ready: true, enabled: hasTracks, note: '', run: openExportAudio },
  ];
  return (
    <>
      {/* Lot 4: the whole project as one file, first: it is what one keeps. */}
      <button
        className="option"
        role="menuitem"
        data-export="project"
        disabled={!hasProject}
        onClick={() => {
          closePanel();
          openSaveProject();
        }}
      >
        <span>{t('export.saveProject')}</span>
        <small>{isDemo ? t('export.saveProjectDemo') : t('export.saveProjectNote')}</small>
      </button>
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
