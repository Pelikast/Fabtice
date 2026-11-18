// « Place sur cet appareil », at the end of the advanced settings (lot 4): one
// line per thing kept, its size, and « Libérer » for the downloaded tools.
// Read when the advanced settings are unfolded; nothing is measured before.

import { useCallback, useEffect, useState } from 'react';
import { formatNumber, t } from '../i18n';
import { deviceUsage, freeDownloaded, type DeviceUsage, type FreeTarget } from '../settings/deviceUsage';
import { formatSize } from '../separation/useChoice';
import { useApp } from '../store/store';
import { forgetKeptRender } from '../render/controller';
import { freeOtherSeparation, freeSeparatedTracks } from '../separation/runner';
import { tracksBytes } from './KeptSeparations';

export function DeviceStorage() {
  const [usage, setUsage] = useState<DeviceUsage | null>(null);
  const [freeing, setFreeing] = useState<string | null>(null);
  const analysing = useApp((s) => s.analysisRun.status === 'running');
  const separation = useApp((s) => s.separation);
  const shown = useApp((s) => s.tracks);
  const keptRender = useApp((s) => s.keptRender);
  const currentTracks = separation.result ? (separation.showing === 'instruments' ? shown : separation.aside) : [];
  const separating = useApp((s) => s.separationRun.status === 'running');
  const refresh = useCallback(() => {
    void deviceUsage().then(setUsage, () => setUsage(null));
  }, []);
  useEffect(refresh, [refresh, separation, keptRender]);

  const free = (target: string, job: () => Promise<unknown>) => {
    setFreeing(target);
    void job()
      .catch(() => {})
      .finally(() => {
        setFreeing(null);
        refresh();
      });
  };

  const rows: { key: string; label: string; size: string; target?: FreeTarget; busy?: boolean; run?: () => Promise<unknown> }[] = [];
  if (usage) {
    // The piece's own tracks (version 5): each separation, the kept render; sizes from what they hold.
    if (separation.result && currentTracks.length)
      rows.push({ key: `sep-${separation.result.id}`, label: t('storage.separationOf', { tool: separation.result.modelName }), size: formatSize(tracksBytes(currentTracks)), busy: separating, run: freeSeparatedTracks });
    for (const o of separation.others)
      rows.push({ key: `sep-${o.result.id}`, label: t('storage.separationOf', { tool: o.result.modelName }), size: formatSize(tracksBytes(o.tracks)), busy: separating, run: () => freeOtherSeparation(o.result.id) });
    if (keptRender)
      rows.push({ key: 'rendu', label: t('storage.keptRender'), size: formatSize(keptRender.tracks.reduce((n, tr) => n + tr.frames * tr.channels * 2, 0)), run: forgetKeptRender });
    if (usage.analysis) rows.push({ key: 'analysis', label: t('storage.analysis'), size: formatSize(usage.analysis), target: 'analysis', busy: analysing });
    if (usage.fineChords) rows.push({ key: 'fine', label: t('storage.fineChords'), size: formatSize(usage.fineChords), target: 'fineChords', busy: analysing });
    if (usage.sheetsage2) rows.push({ key: 'sheetsage2', label: t('storage.sheetsage2'), size: formatSize(usage.sheetsage2), target: 'sheetsage2', busy: analysing });
    if (usage.separation) rows.push({ key: 'separation', label: t('storage.separation'), size: formatSize(usage.separation), target: 'separation', busy: separating });
    if (usage.standardsTunes)
      rows.push({ key: 'standards', label: t('storage.standards'), size: t(usage.standardsTunes === 1 ? 'storage.tunes.one' : 'storage.tunes.other', { n: formatNumber(usage.standardsTunes, 0) }), target: 'standards' });
  }

  return (
    <div className="option option-colonne place-appareil" data-testid="place-appareil">
      <span>{t('storage.title')}</span>
      {usage === null ? (
        <small>{t('storage.measuring')}</small>
      ) : (
        <>
          {usage.total !== null && <small data-testid="place-totale">{t('storage.total', { size: formatSize(usage.total) })}</small>}
          {rows.length === 0 && <small>{t('storage.nothing')}</small>}
          {rows.length > 0 && (
            <ul className="place-lignes">
              {rows.map((r) => (
                <li key={r.key} data-place={r.key}>
                  <span>{r.label}</span>
                  <span className="place-taille">{r.size}</span>
                  {r.target || r.run ? (
                    <button
                      type="button"
                      className="lien discret"
                      disabled={freeing !== null || r.busy}
                      title={r.busy ? t('storage.busy') : undefined}
                      onClick={() => free(r.key, r.run ?? (() => freeDownloaded(r.target!)))}
                    >
                      {freeing === r.key ? t('storage.freeing') : t('storage.free')}
                    </button>
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ul>
          )}
          {rows.some((r) => r.target) && <small>{t('storage.freeNote')}</small>}
          {rows.some((r) => r.run) && <small>{t('storage.freePieceNote')}</small>}
        </>
      )}
    </div>
  );
}
