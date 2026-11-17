// « Exporter » → « Audio… »: one window to choose what leaves and how.
//
//   Format    Wave (sampling rate, quantization), Flac, MP3 (constant bit rate);
//   What      the full mix as heard, or the tracks ticked in a list;
//   One file  when several tracks are ticked: one file each (in a .zip) or one
//             file mixing them;
//   Duration  the whole piece, or the loop when there is one.
//
// The key and tempo of the transport are the export's (the best engine, or the
// applied render when it matches): the window only says so. The choices are
// kept with the piece (`ExportPreferences`). On a phone the window is a sheet
// from the bottom, one column, the button stuck at its foot.
// What it makes is `export/audio/` (`planAudioExport`, `exportWithApp`).

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { deliverable, ExportError, exportWithApp, hasEncoder, planAudioExport, type Delivered, type ExportPlan } from '../export/audio';
import { formatSigned } from '../grid/format';
import { formatLoop } from '../grid/loopText';
import { formatNumber, t } from '../i18n';
import { MP3_KBPS, WAVE_BASE_RATE, WAVE_BITS, WAVE_RATES, type AudioFormat, type ExportPreferences, type WaveBits } from '../model/audioExport';
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

/** What the choices make, or null when there is nothing to export (every track muted, none ticked). */
function previewPlan(prefs: ExportPreferences, ticked: readonly string[]): ExportPlan | null {
  try {
    return planAudioExport(appStore.getState(), prefs, ticked);
  } catch (e) {
    if (e instanceof ExportError) return null;
    throw e;
  }
}

/** The order of the window: Wave, Flac, MP3. */
const SHOWN_FORMATS: readonly AudioFormat[] = ['wav', 'flac', 'mp3'];

const bitsLabel = (bits: WaveBits) => t(bits === 16 ? 'exportAudio.waveBits16' : bits === 24 ? 'exportAudio.waveBits24' : 'exportAudio.waveBits32');

function ExportAudioBox() {
  const prefs = useApp((s) => s.exportPrefs);
  const tracks = useApp((s) => s.tracks);
  const loop = useApp((s) => s.loop.region);
  // Read for the plan shown under the choices (the file names say the loop, the key, the tempo, the title).
  useApp((s) => s.playback);
  useApp((s) => s.project?.title);
  const loopNote = useApp((s) => {
    if (!s.loop.region) return null;
    const l = formatLoop(s.tempoMap, s.loop.region);
    return t(l.whole ? 'exportAudio.loopBars' : 'exportAudio.loopSpan', l.whole ? { bars: l.text } : { span: l.text });
  });
  const hasLoop = loop !== null;
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
  const ticked = tracks.filter((tr) => chosen.includes(tr.id)).map((tr) => tr.id);
  const plan = previewPlan(prefs, ticked);
  const run = async () => {
    const abort = new AbortController();
    abortRef.current = abort;
    setExportProgress(0);
    setPhase({ kind: 'working' });
    try {
      const out = await exportWithApp(planAudioExport(appStore.getState(), appStore.getState().exportPrefs, ticked), { signal: abort.signal, onProgress: setExportProgress });
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

  const tracksMode = prefs.what === 'tracks';
  const severalTicked = ticked.length > 1;
  const separateOff = !tracksMode || !severalTicked;
  const separateNote = !tracksMode ? t('exportAudio.mixOneFile') : !severalTicked ? t('exportAudio.oneTrackNote') : prefs.separate ? t('exportAudio.separateNote') : t('exportAudio.togetherNote');
  const all = ticked.length === tracks.length;
  const result = plan
    ? plan.files.length === 1
      ? t('exportAudio.resultOne', { name: plan.files[0]!.name })
      : t('exportAudio.resultMany', { n: plan.files.length, name: plan.archiveName ?? '' })
    : t('exportAudio.error.nothing');

  return (
    <div
      className="voile ouverte voile-export"
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
      <div className="fenetre-export" data-phase={phase.kind}>
        <div className="exp-entete">
          <h2 id="export-son-titre">{t('exportAudio.title')}</h2>
          <button className="fermer" aria-label={t('exportAudio.close')} onClick={close}>
            <CloseIcon />
          </button>
        </div>

        {phase.kind === 'choose' && (
          <>
            <div className="exp-corps">
              <div className="exp-colonne">
                <Group label={t('exportAudio.format')}>
                  <div className="duo exp-duo exp-formats" role="radiogroup" aria-label={t('exportAudio.format')}>
                    {SHOWN_FORMATS.map((f, i) => (
                      <button key={f} ref={i === 0 ? firstRef : undefined} role="radio" aria-checked={prefs.format === f} disabled={!hasEncoder(f)} data-format={f} onClick={() => set({ format: f })}>
                        {t(`exportAudio.format.${f}`)}
                      </button>
                    ))}
                  </div>
                  <div className="exp-reglages" data-testid="export-reglages-format">
                    {prefs.format === 'wav' && (
                      <>
                        <label className="exp-champ">
                          <span>{t('exportAudio.waveRate')}</span>
                          <select className="exp-liste" data-testid="export-frequence" value={prefs.waveRate} onChange={(e) => set({ waveRate: Number(e.target.value) })}>
                            {WAVE_RATES.map((r) => (
                              <option key={r} value={r}>
                                {t('exportAudio.waveRateValue', { n: formatNumber(r / 1000, 1) })}
                              </option>
                            ))}
                          </select>
                        </label>
                        {prefs.waveRate > WAVE_BASE_RATE && (
                          <p className="exp-note" data-testid="export-note-frequence">
                            {t('exportAudio.waveRateNote')}
                          </p>
                        )}
                        <div className="exp-champ">
                          <span id="export-bits-libelle">{t('exportAudio.waveBits')}</span>
                          <div className="duo exp-duo" role="radiogroup" aria-labelledby="export-bits-libelle">
                            {WAVE_BITS.map((b) => (
                              <button key={b} role="radio" aria-checked={prefs.waveBits === b} data-bits={b} onClick={() => set({ waveBits: b })}>
                                {bitsLabel(b)}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                    {prefs.format === 'flac' && <p className="exp-note">{t('exportAudio.flacNote')}</p>}
                    {prefs.format === 'mp3' && (
                      <>
                        <label className="exp-champ">
                          <span>{t('exportAudio.mp3Rate')}</span>
                          <select className="exp-liste" data-testid="export-debit" value={prefs.mp3Kbps} onChange={(e) => set({ mp3Kbps: Number(e.target.value) })}>
                            {MP3_KBPS.map((k) => (
                              <option key={k} value={k}>
                                {t(k === 320 ? 'exportAudio.mp3RateBest' : 'exportAudio.mp3RateValue', { n: k })}
                              </option>
                            ))}
                          </select>
                        </label>
                        <p className="exp-note">{t('exportAudio.mp3Note')}</p>
                      </>
                    )}
                  </div>
                </Group>

                <Group label={t('exportAudio.range')}>
                  <div className="exp-cartes" role="radiogroup" aria-label={t('exportAudio.range')}>
                    <Card on={prefs.range === 'whole' || !hasLoop} label={t('exportAudio.whole')} onPick={() => set({ range: 'whole' })} data="whole" />
                    <Card
                      on={prefs.range === 'loop' && hasLoop}
                      disabled={!hasLoop}
                      label={t('exportAudio.loop')}
                      note={loopNote ?? t('exportAudio.noLoop')}
                      onPick={() => set({ range: 'loop' })}
                      data="loop"
                    />
                  </div>
                </Group>
              </div>

              <div className="exp-colonne">
                <Group label={t('exportAudio.what')}>
                  <div className="exp-cartes" role="radiogroup" aria-label={t('exportAudio.what')}>
                    <Card on={prefs.what === 'mix'} label={t('exportAudio.mix')} note={t('exportAudio.mixNote')} onPick={() => set({ what: 'mix' })} data="mix" />
                    <Card on={tracksMode} label={t('exportAudio.tracks')} note={t('exportAudio.tracksNote')} onPick={() => set({ what: 'tracks' })} data="tracks" />
                  </div>
                </Group>

                <Group
                  label={t('exportAudio.pickTracks')}
                  aside={
                    <button className="exp-lien" disabled={!tracksMode} data-testid="export-tout" onClick={() => setChosen(all ? [] : tracks.map((tr) => tr.id))}>
                      {all ? t('exportAudio.tickNone') : t('exportAudio.tickAll')}
                    </button>
                  }
                >
                  <div className="exp-pistes" role="group" aria-label={t('exportAudio.pickTracks')} data-grise={tracksMode ? undefined : ''}>
                    {tracks.map((tr) => (
                      <label key={tr.id} className="exp-piste" style={{ '--teinte': `var(--${tr.role})` } as CSSProperties}>
                        <input
                          type="checkbox"
                          data-testid={`export-piste-${tr.id}`}
                          disabled={!tracksMode}
                          checked={ticked.includes(tr.id)}
                          onChange={(e) => setChosen((c) => (e.target.checked ? [...c, tr.id] : c.filter((x) => x !== tr.id)))}
                        />
                        <i aria-hidden="true" />
                        <span>{tr.name}</span>
                      </label>
                    ))}
                  </div>
                  <label className="exp-case" data-grise={separateOff ? '' : undefined}>
                    <input type="checkbox" data-testid="export-separes" disabled={separateOff} checked={prefs.separate} aria-describedby="export-separes-note" onChange={(e) => set({ separate: e.target.checked })} />
                    <span>{t('exportAudio.separate')}</span>
                  </label>
                  <p className="exp-note" id="export-separes-note" data-testid="export-separes-note">
                    {separateNote}
                  </p>
                </Group>
              </div>
            </div>

            <div className="exp-pied">
              <div className="exp-resume" data-testid="export-resume">
                <p className="exp-sortie" data-testid="export-sortie" title={result}>
                  {result}
                </p>
                <p>
                  {keyTempo} {formants && t('exportAudio.formants')}
                </p>
              </div>
              <button className="plein" data-testid="exporter-son" disabled={plan === null} onClick={() => void run()}>
                {t('exportAudio.go')}
              </button>
            </div>
          </>
        )}

        {phase.kind === 'working' && (
          <div className="exp-simple">
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
          </div>
        )}

        {phase.kind === 'ready' && (
          <div className="exp-simple">
            <p>{t('exportAudio.ready')}</p>
            <a className="plein fichier-pret" data-testid="fichier-son" href={phase.file.href} download={phase.file.name}>
              {t('exportAudio.save', { name: phase.file.name })}
            </a>
            <p className="exp-note">{formatSize(phase.file.bytes)}</p>
            <div className="import-actions">
              <button className="bouton-cadre" onClick={() => setPhase({ kind: 'choose' })}>
                {t('exportAudio.again')}
              </button>
              <button className="bouton-cadre" onClick={close}>
                {t('exportAudio.close')}
              </button>
            </div>
          </div>
        )}

        {phase.kind === 'error' && (
          <div className="exp-simple">
            <div className="import-erreur" role="alert">
              <p>{t(`exportAudio.error.${phase.code as 'failed'}`)}</p>
            </div>
            <div className="import-actions">
              <button className="bouton-cadre" onClick={() => setPhase({ kind: 'choose' })}>
                {t('import.retry')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Group({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="exp-groupe">
      <div className="exp-groupe-tete">
        <h3>{label}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A choice between a few, with its one line of explanation. */
function Card({ on, label, note, disabled, onPick, data }: { on: boolean; label: string; note?: string; disabled?: boolean; onPick: () => void; data: string }) {
  return (
    <button role="radio" aria-checked={on} disabled={disabled} className="exp-carte" data-choix={data} onClick={onPick}>
      <span>{label}</span>
      {note && <small>{note}</small>}
    </button>
  );
}
