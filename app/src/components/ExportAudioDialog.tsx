// « Exporter le son » (lot 3): the mix or the tracks, the whole piece or the
// loop, in the key and tempo chosen, as wav, mp3 or flac. One file for a mix,
// one archive for several tracks, handed over as a link (`export/audio/deliver.ts`).

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { deliverable, ExportError, exportWithApp, hasEncoder, planAudioExport, type Delivered } from '../export/audio';
import { formatLoopBars, formatSigned } from '../grid/format';
import { formatNumber, t } from '../i18n';
import { AUDIO_FORMATS, type AudioFormat, type ExportPreferences } from '../model/audioExport';
import { setExportProgress, useRenderProgress } from '../render/progress';
import { targetBpm } from '../store/derived';
import { closeExportAudio, setExportPrefs } from '../store/exportActions';
import { appStore, useApp } from '../store/store';
import { formatSize } from '../separation/useChoice';
import { CloseIcon } from '../ui/icons';

type Phase = { kind: 'choose' } | { kind: 'working' } | { kind: 'ready'; file: Delivered } | { kind: 'error'; code: string };

export function ExportAudioDialog() {
  const open = useApp((s) => s.ui.exportAudioOpen);
  if (!open) return null;
  return <ExportAudioBox />;
}

function ExportAudioBox() {
  const prefs = useApp((s) => s.exportPrefs);
  const tracks = useApp((s) => s.tracks);
  const hasLoop = useApp((s) => s.loop.region !== null);
  const loopText = useApp((s) => (s.loop.region ? formatLoopBars(s.tempoMap, s.loop.region) : null));
  const semitones = useApp((s) => s.playback.semitones);
  const cents = useApp((s) => s.playback.cents);
  const ratio = useApp((s) => s.playback.tempoRatio);
  const bpm = useApp((s) => targetBpm(s));
  const formants = useApp((s) => s.settings.advanced.formants);
  const [chosen, setChosen] = useState<string[]>(() => tracks.map((tr) => tr.id));
  const [phase, setPhase] = useState<Phase>({ kind: 'choose' });
  const fraction = useRenderProgress((p) => Math.round(p.export * 100) / 100);
  const abortRef = useRef<AbortController | null>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => firstRef.current?.focus({ preventScroll: true }), []);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => () => (phase.kind === 'ready' ? phase.file.release() : undefined), [phase]);

  const set = (patch: Partial<ExportPreferences>) => setExportPrefs(patch);
  const close = () => {
    abortRef.current?.abort();
    closeExportAudio();
  };
  const run = async () => {
    const abort = new AbortController();
    abortRef.current = abort;
    setExportProgress(0);
    setPhase({ kind: 'working' });
    try {
      const plan = planAudioExport(appStore.getState(), appStore.getState().exportPrefs, chosen);
      const out = await exportWithApp(plan, { signal: abort.signal, onProgress: setExportProgress });
      if (abort.signal.aborted) return;
      setPhase({ kind: 'ready', file: deliverable(out.blob, out.name) });
    } catch (e) {
      if (abort.signal.aborted) return setPhase({ kind: 'choose' });
      setPhase({ kind: 'error', code: e instanceof ExportError ? e.code : 'failed' });
    }
  };

  const changes: string[] = [];
  if (semitones !== 0) changes.push(t('exportAudio.semitones', { n: formatSigned(semitones) }));
  if (cents !== 0) changes.push(t('exportAudio.cents', { n: formatSigned(cents) }));
  if (ratio !== 1) changes.push(t('exportAudio.tempo', { n: bpm !== null ? `${formatNumber(Math.round(bpm), 0)} BPM` : `${Math.round(ratio * 100)} %` }));
  const keyTempo = t('exportAudio.keyTempo', { what: changes.length ? changes.join(', ') : t('exportAudio.original') });

  return (
    <div
      className="voile ouverte"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-son-titre"
      data-testid="export-son"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && phase.kind !== 'working') close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && phase.kind !== 'working') close();
      }}
    >
      <div className="accueil export-son">
        <div className="accueil-entete">
          <h2 id="export-son-titre">{t('exportAudio.title')}</h2>
          <button className="fermer" aria-label={t('exportAudio.close')} onClick={close}>
            <CloseIcon />
          </button>
        </div>
        {phase.kind === 'choose' && (
          <>
            <h3>{t('exportAudio.what')}</h3>
            <div className="choix-export" role="radiogroup" aria-label={t('exportAudio.what')}>
              <Choice refEl={firstRef} on={prefs.what === 'mix'} label={t('exportAudio.mix')} note={t('exportAudio.mixNote')} onPick={() => set({ what: 'mix' })} />
              <Choice on={prefs.what === 'tracks'} label={t('exportAudio.tracks')} note={t('exportAudio.tracksNote')} onPick={() => set({ what: 'tracks' })} />
            </div>
            {prefs.what === 'tracks' && (
              <div className="pistes-export" role="group" aria-label={t('exportAudio.tracks')}>
                {tracks.map((tr) => (
                  <label key={tr.id} className="stem coche" style={{ '--teinte': `var(--${tr.role})` } as CSSProperties} data-on={chosen.includes(tr.id)}>
                    <input
                      type="checkbox"
                      checked={chosen.includes(tr.id)}
                      onChange={(e) => setChosen((c) => (e.target.checked ? [...c, tr.id] : c.filter((x) => x !== tr.id)))}
                    />
                    {tr.name}
                  </label>
                ))}
              </div>
            )}
            <h3>{t('exportAudio.range')}</h3>
            <div className="choix-export duo-export" role="radiogroup" aria-label={t('exportAudio.range')}>
              <Choice on={prefs.range === 'whole' || !hasLoop} label={t('exportAudio.whole')} onPick={() => set({ range: 'whole' })} />
              <Choice
                on={prefs.range === 'loop' && hasLoop}
                disabled={!hasLoop}
                label={t('exportAudio.loop')}
                note={loopText ? t('exportAudio.loopBars', { bars: loopText }) : t('exportAudio.noLoop')}
                onPick={() => set({ range: 'loop' })}
              />
            </div>
            <h3>{t('exportAudio.format')}</h3>
            <div className="formats-export" role="radiogroup" aria-label={t('exportAudio.format')}>
              {AUDIO_FORMATS.map((f: AudioFormat) => {
                const ready = hasEncoder(f);
                return (
                  <button key={f} role="radio" aria-checked={prefs.format === f} disabled={!ready} data-format={f} onClick={() => set({ format: f })}>
                    {f.toUpperCase()}
                    {!ready && <small>{t('exportAudio.formatSoon')}</small>}
                  </button>
                );
              })}
            </div>
            <p className="export-resume">
              {keyTempo} {formants && t('exportAudio.formants')}
            </p>
            <div className="import-actions">
              <button className="plein" data-testid="exporter-son" disabled={prefs.what === 'tracks' && chosen.length === 0} onClick={() => void run()}>
                {t('exportAudio.go')}
              </button>
            </div>
          </>
        )}
        {phase.kind === 'working' && (
          <div className="import-etat" role="status" aria-live="polite">
            <div className="phase">
              <span>{t('exportAudio.working')}</span>
              <span>{t('import.percent', { n: Math.round(fraction * 100) })}</span>
            </div>
            <div className="jauge" style={{ '--avance': fraction } as CSSProperties}>
              <span />
            </div>
            <div className="import-actions">
              <button className="bouton-cadre" onClick={() => abortRef.current?.abort()}>
                {t('exportAudio.cancel')}
              </button>
            </div>
          </div>
        )}
        {phase.kind === 'ready' && (
          <>
            <p>{t('exportAudio.ready')}</p>
            <a className="plein fichier-pret" data-testid="fichier-son" href={phase.file.href} download={phase.file.name}>
              {t('exportAudio.save', { name: phase.file.name })}
            </a>
            <p className="export-resume">{formatSize(phase.file.bytes)}</p>
            <div className="import-actions">
              <button className="bouton-cadre" onClick={() => setPhase({ kind: 'choose' })}>
                {t('exportAudio.again')}
              </button>
              <button className="bouton-cadre" onClick={close}>
                {t('exportAudio.close')}
              </button>
            </div>
          </>
        )}
        {phase.kind === 'error' && (
          <>
            <div className="import-erreur" role="alert">
              <p>{t(`exportAudio.error.${phase.code as 'failed'}`)}</p>
            </div>
            <div className="import-actions">
              <button className="bouton-cadre" onClick={() => setPhase({ kind: 'choose' })}>
                {t('import.retry')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Choice({
  on,
  label,
  note,
  disabled,
  onPick,
  refEl,
}: {
  on: boolean;
  label: string;
  note?: string;
  disabled?: boolean;
  onPick: () => void;
  refEl?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button ref={refEl} role="radio" aria-checked={on} disabled={disabled} className="choix" onClick={onPick}>
      <span>{label}</span>
      {note && <small>{note}</small>}
    </button>
  );
}
