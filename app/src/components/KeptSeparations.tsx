// « Séparations gardées » (owner's decision of 15 November): every separation
// made on the piece is kept, one per tool. Shown in the separation panel,
// under the current one, only when there is more than one: a short line per
// separation, the one heard marked, « Écouter » to switch at once (nothing is
// computed again; each keeps its own mute, solo and volume), « Libérer » to
// forget one. Calm: links, no colour, no new control style.

import { useState } from 'react';
import { formatSize, formatWait } from '../separation/useChoice';
import { t } from '../i18n';
import type { Track } from '../model/project';
import { chooseSeparation, freeOtherSeparation, freeSeparatedTracks } from '../separation/runner';
import { useApp } from '../store/store';

/** Room a set of instrument tracks takes on the device (16-bit samples). */
export function tracksBytes(tracks: readonly Track[]): number {
  return tracks.reduce((n, tr) => n + tr.audio.frames * Math.max(1, Math.min(2, tr.audio.channels)) * 2, 0);
}

export function KeptSeparations() {
  const separation = useApp((s) => s.separation);
  const shown = useApp((s) => s.tracks);
  const current = separation.result;
  const currentTracks = current ? (separation.showing === 'instruments' ? shown : separation.aside) : [];
  const others = separation.others;
  const running = useApp((s) => s.separationRun.status === 'running');
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  if (others.length === 0) return null;
  const rows = [
    ...(current ? [{ result: current, tracks: currentTracks, current: true }] : []),
    ...others.map((o) => ({ result: o.result, tracks: o.tracks, current: false })),
  ];
  const act = (id: string, job: () => Promise<unknown>) => {
    setBusy(id);
    void job().finally(() => setBusy(null));
  };
  return (
    <div className="separations-gardees" data-testid="separations-gardees">
      <h3 className="libelle">{t('separation.keptTitle')}</h3>
      <ul>
        {rows.map((r) => (
          <li key={r.result.id} data-separation={r.result.modelId} aria-current={r.current || undefined}>
            <span className="separation-nom">
              {r.result.modelName}
              <small>
                {' '}
                {t('separation.keptLine', { time: formatWait(r.result.computeSeconds), size: formatSize(tracksBytes(r.tracks)) })}
                {r.current && ` · ${t('separation.keptCurrent')}`}
              </small>
            </span>
            {asking === r.result.id ? (
              <span className="separation-actions">
                <button
                  className="lien discret"
                  data-testid="liberer-separation-oui"
                  onClick={() => {
                    setAsking(null);
                    act(r.result.id, () => (r.current ? freeSeparatedTracks() : freeOtherSeparation(r.result.id)));
                  }}
                >
                  {t('separation.keptFreeYes')}
                </button>
                <button className="lien discret" onClick={() => setAsking(null)}>
                  {t('separation.freeNo')}
                </button>
              </span>
            ) : (
              <span className="separation-actions">
                {!r.current && (
                  <button className="lien" data-testid="ecouter-separation" disabled={busy !== null || running} onClick={() => act(r.result.id, () => chooseSeparation(r.result.id))}>
                    {busy === r.result.id ? '…' : t('separation.keptListen')}
                  </button>
                )}
                <button className="lien discret" data-testid="liberer-separation" disabled={busy !== null || running} onClick={() => setAsking(r.result.id)}>
                  {t('separation.free')}
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="panneau-note discret">{t('separation.keptNote')}</p>
    </div>
  );
}
