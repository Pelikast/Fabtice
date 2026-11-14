// What « Exporter le son » makes, from the state and the choices: pure,
// tested in Node.

import { t } from '../../i18n';
import type { ExportPreferences } from '../../model/audioExport';
import type { Track } from '../../model/project';
import type { AppState } from '../../store/store';
import { ExportError, type ExportFileSpec, type ExportPlan } from './types';

/** A file name that every system accepts: no path separators nor reserved signs, at most 120 signs. */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return (cleaned || 'Fabtice').slice(0, 120).trim();
}

/** The tracks heard now: the soloed ones if any, else the ones not muted. */
export function audibleTracks(tracks: readonly Track[]): Track[] {
  const solo = tracks.some((tr) => tr.solo);
  return tracks.filter((tr) => (solo ? tr.solo : !tr.mute));
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

/** « (+2 demi-tons, tempo 90 %) » when key or tempo differ from the original, else ''. */
export function changesSuffix(semitones: number, cents: number, tempoRatio: number): string {
  const bits: string[] = [];
  if (semitones !== 0) bits.push(t('exportAudio.nameSemitones', { n: signed(semitones) }));
  if (cents !== 0) bits.push(t('exportAudio.nameCents', { n: signed(cents) }));
  if (tempoRatio !== 1) bits.push(t('exportAudio.nameTempo', { n: Math.round(tempoRatio * 100) }));
  return bits.length ? ` (${bits.join(', ')})` : '';
}

/**
 * The plan of an export. `chosen`: the track ids to export one by one (the
 * `tracks` choice; every shown track when null). Throws `ExportError('nothing')`
 * when nothing would be heard (every track muted) or chosen.
 */
export function planAudioExport(s: AppState, prefs: ExportPreferences, chosen: readonly string[] | null = null): ExportPlan {
  const project = s.project;
  if (!project) throw new ExportError('nothing', 'no piece');
  const loop = prefs.range === 'loop' && s.loop.region ? s.loop.region : null;
  const range = loop ?? { start: 0, end: project.duration };
  const { semitones, cents, tempoRatio } = s.playback;
  const base = safeFileName(project.title);
  const suffix = `${loop ? ` – ${t('exportAudio.nameLoop')}` : ''}${changesSuffix(semitones, cents, tempoRatio)}`;
  const ext = prefs.format;
  let files: ExportFileSpec[];
  let archiveName: string | null = null;
  if (prefs.what === 'mix') {
    const heard = audibleTracks(s.tracks);
    if (heard.length === 0) throw new ExportError('nothing', 'every track is muted');
    files = [{ name: `${safeFileName(`${base} – ${t('exportAudio.nameMix')}${suffix}`)}.${ext}`, sources: heard.map((tr) => ({ trackId: tr.id, audioId: tr.audio.id, gain: tr.volume })) }];
  } else {
    const ids = new Set(chosen ?? s.tracks.map((tr) => tr.id));
    const picked = s.tracks.filter((tr) => ids.has(tr.id));
    if (picked.length === 0) throw new ExportError('nothing', 'no track chosen');
    const names = new Set<string>();
    files = picked.map((tr) => {
      let name = safeFileName(`${base} – ${tr.name}${suffix}`);
      for (let k = 2; names.has(name); k++) name = safeFileName(`${base} – ${tr.name} ${k}${suffix}`);
      names.add(name);
      return { name: `${name}.${ext}`, sources: [{ trackId: tr.id, audioId: tr.audio.id, gain: 1 }] };
    });
    if (files.length > 1) archiveName = `${safeFileName(`${base} – ${t('exportAudio.nameTracks')}${suffix}`)}.zip`;
  }
  return { format: prefs.format, range, semitones, cents, tempoRatio, formants: s.settings.advanced.formants, files, archiveName };
}
