// « Lisez-moi.txt » of the Ableton Live project: what is in the folder, which
// set to open in which Live, what to do when Live says files are missing, and
// the safe fallback. Plain French text, pure. The export is « à l'essai »
// (ALS-FORMAT.md): the read-me says so first.

import type { Meter } from '../../model/tempoMap';
import { logicBarOfFirstBar } from '../logic/readme';
import type { Session } from '../session';
import type { AbletonNote } from './fromSession';
import type { AbletonWarning } from './types';

export interface AbletonReadmeFiles {
  set: string;
  set10: string;
  midi: string;
  tracks: string[];
  samples: string;
  folder: string;
  changes: string;
}

const frNumber = (n: number, decimals = 1) => n.toFixed(decimals).replace(/\.0+$/, '').replace('.', ',');
const meterText = (m: Meter) => `${m.numerator}/${m.denominator}`;

/** What to do when Live says files are missing: the steps, as the end of the export says them too. */
export function abletonMissingSteps(folder: string): string[] {
  return [
    'Live affiche un message en bas de sa fenêtre (« … fichiers manquants », missing files) : cliquez dessus. Le gestionnaire de fichiers (File Manager) s’ouvre sur les fichiers manquants.',
    `Choisissez la recherche dans un dossier (Search Folder / Set Folder), indiquez ce dossier-ci, « ${folder} », puis lancez la recherche (Go). Live retrouve les pistes par leur nom et leur taille.`,
    'Enregistrez ensuite le Live Set (Fichier > Enregistrer le Live Set) : Live s’en souviendra.',
  ];
}

/** The fallback that works in every Live: the MIDI file, then the tracks. */
export function abletonFallbackSteps(midi: string, samples: string): string[] {
  return [
    `Dans un nouveau Live Set, glissez « ${midi} » dans la vue Arrangement, au tout début : il porte le tempo exact du morceau, les signatures, les armures et les accords en marqueurs (selon la version, Live peut n’en reprendre qu’une partie).`,
    `Glissez ensuite les fichiers .wav du dossier « ${samples} » au tout début, chacun sur sa piste, et désactivez Warp sur chaque clip (bouton « Warp » de la vue Clip) : ils jouent alors tels quels.`,
  ];
}

/** Lines about what was written differently for Live (signatures over 32, tempo clamped). Empty when nothing. */
export function abletonNoteLines(notes: readonly AbletonNote[], warnings: readonly AbletonWarning[]): string[] {
  const lines: string[] = [];
  const where = (bar: number | null) => (bar === null ? 'la mesure d’attente' : `la mesure ${bar + 1}`);
  for (const n of notes) {
    if (n.kind === 'meter-32-even') lines.push(`Live n’a pas de signature sur 32 : à partir de ${where(n.bar)}, ${meterText(n.from)} est écrit ${meterText(n.to)} (même durée).`);
    else if (n.kind === 'meter-32-doubled')
      lines.push(`Live n’a pas de signature sur 32 : à partir de ${where(n.bar)}, ${meterText(n.from)} est écrit ${meterText(n.to)} avec le tempo doublé ; les temps tombent au même moment.`);
    else
      lines.push(
        `Live n’a pas de signature sur 32 : à partir de ${where(n.bar)}, ${meterText(n.from)} est écrit ${meterText(n.to)} (le tempo y serait trop rapide pour Live autrement) ; les barres de mesure tombent au même moment, les temps à l’intérieur un peu à côté.`,
      );
  }
  const clamped = warnings.filter((w) => w.kind === 'tempo-clamped');
  if (clamped.length) lines.push('Par endroits, le tempo dépasse ce que Live accepte (de 20 à 999) : là, Live peut s’écarter un peu de l’enregistrement.');
  return lines;
}

export function abletonReadme(session: Session, files: AbletonReadmeFiles, notes: readonly AbletonNote[], warnings: readonly AbletonWarning[]): string {
  const L: string[] = [];
  L.push('Fabtice – Projet Ableton Live (à l’essai)', '', `« ${session.title} »${files.changes ? ` ${files.changes.trim()}` : ''}`, '');
  L.push(
    'À L’ESSAI : personne n’a encore pu ouvrir ces projets dans un vrai Ableton Live. Ils ont été vérifiés avec des outils qui lisent le format de Live, pas avec Live lui-même. Si quelque chose ne va pas, le fichier MIDI et les pistes de ce dossier marchent dans tous les cas (voir « Si rien ne marche »).',
    '',
  );
  L.push('Ce dossier contient :');
  L.push(`  - ${files.set}`, '    le projet pour Live 11 et Live 12 ;');
  L.push(`  - ${files.set10}`, '    le même projet pour Live 10 ;');
  L.push(`  - ${files.samples}/`);
  for (const t of files.tracks) L.push(`      ${t}`);
  L.push(
    '    les pistes, en Wave 48 kHz 16 bits, toutes de la même longueur et alignées au début, dans le tempo et la tonalité choisis dans Fabtice (sans le volume, le muet ni le solo) ;',
  );
  L.push(`  - ${files.midi}`, '    le tempo exact, les signatures rythmiques, les armures et les accords en marqueurs (sections comprises).', '');
  L.push('Quel fichier ouvrir :');
  L.push(
    `  - Live 11 ou Live 12 : ouvrez « ${files.set} » (double-clic, ou Fichier > Ouvrir le Live Set…). Les pistes sont posées au début de l’Arrangement, Warp désactivé : elles jouent telles quelles, et la courbe de tempo de Live suit le morceau (métronome, grille, repères des accords et des sections).`,
  );
  L.push(
    `  - Live 10 : ouvrez « ${files.set10} ». Live 10 ne retrouve pas tout seul des fichiers qu’il n’a pas rangés lui-même : il annonce des fichiers manquants (clips grisés). Suivez alors les étapes ci-dessous, une seule fois.`,
    '',
  );
  L.push('Si Live dit que des fichiers manquent :');
  abletonMissingSteps(files.folder).forEach((g, i) => L.push(`  ${i + 1}. ${g}`));
  L.push('');
  L.push('Si rien ne marche (ou dans une version plus ancienne de Live) :');
  abletonFallbackSteps(files.midi, files.samples).forEach((g, i) => L.push(`  ${i + 1}. ${g}`));
  L.push('');
  const bar = logicBarOfFirstBar(session);
  if (session.leadIn) {
    L.push(
      `Le début : avant la première barre de mesure du morceau, la mesure 1 de Live est une mesure d’attente de ${frNumber(session.leadIn.duration, 2)} s, qui dure exactement le temps qui précède la musique.`,
    );
  }
  if (bar !== null && bar !== 1) L.push(`La mesure 1 de Fabtice est la mesure ${bar} de Live.`);
  for (const line of abletonNoteLines(notes, warnings)) L.push(line);
  L.push('', 'Fabtice est gratuit et libre (GPL-3.0). https://fabtice.netlify.app', '');
  return L.join('\n');
}
