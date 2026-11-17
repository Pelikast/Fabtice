// « Lisez-moi.txt » of the folder for Logic Pro: what is in it and the three
// gestures (see `export/midi/LOGIC.md` for what they rest on). Plain French
// text, pure.

import type { Session } from '../session';

/** The three gestures, as the end of the export repeats them on screen too. */
export function logicGestures(midiName: string): string[] {
  return [
    `Dans Logic Pro, choisissez Fichier > Ouvrir… (File > Open…) et ouvrez « ${midiName} ». Logic crée un nouveau projet avec le tempo, les signatures, les armures, les accords en marqueurs et une piste « Accords ».`,
    'En haut de la fenêtre, à côté du tempo, réglez le mode de tempo du projet sur « Conserver » (KEEP) : Logic gardera le tempo du fichier quand vous ajouterez les pistes. Logic 10.0 à 10.3 n’ont pas ce réglage : passez au geste 3.',
    'Dans le Finder, sélectionnez tous les fichiers .wav du dossier et glissez-les dans la zone des pistes de Logic, sous la piste « Accords », au tout début (mesure 1). Choisissez « Créer de nouvelles pistes » (Create new tracks). Si Logic propose de passer le projet à 48 kHz, acceptez.',
  ];
}

/** The Logic bar where Fabtice's « mesure 1 » is, or null when it is not in the file (the piece starts later). */
export function logicBarOfFirstBar(session: Session): number | null {
  if (session.start.bar > 0) return null;
  return 1 + (session.leadIn?.bars ?? 0) + (0 - session.start.bar);
}

const frNumber = (n: number, decimals = 1) => n.toFixed(decimals).replace(/\.0+$/, '').replace('.', ',');

export function logicReadme(session: Session, files: { tracks: string[]; midi: string; changes: string }): string {
  const lines: string[] = [];
  lines.push('Fabtice – Dossier pour Logic Pro', '', `« ${session.title} »${files.changes ? ` ${files.changes.trim()}` : ''}`, '');
  lines.push('Ce dossier contient :');
  for (const t of files.tracks) lines.push(`  - ${t}`);
  lines.push(
    '    les pistes, en Wave 48 kHz 16 bits, toutes de la même longueur et alignées au début, dans le tempo et la tonalité choisis dans Fabtice (sans le volume, le muet ni le solo) ;',
  );
  lines.push(`  - ${files.midi}`, '    le tempo exact du morceau, les signatures rythmiques, les armures et les accords en marqueurs (sections comprises), avec une piste « Accords » qui les joue.', '');
  lines.push('Dans Logic Pro, en trois gestes :');
  logicGestures(files.midi).forEach((g, i) => lines.push(`  ${i + 1}. ${g}`));
  lines.push('');
  lines.push('Pour vérifier : activez le métronome de Logic (touche K) ; il bat sur les temps du morceau. La piste « Accords » joue les accords : coupez-la (touche M) si vous ne voulez pas l’entendre.');
  const bar = logicBarOfFirstBar(session);
  if (session.leadIn) {
    lines.push(
      `Le début : avant la première barre de mesure du morceau, la mesure 1 de Logic est une mesure d’attente de ${frNumber(session.leadIn.duration, 2)} s (${session.leadIn.meter.numerator}/${session.leadIn.meter.denominator}), qui dure exactement le temps qui précède la musique.`,
    );
  }
  if (bar !== null && bar !== 1) lines.push(`La mesure 1 de Fabtice est la mesure ${bar} de Logic.`);
  lines.push('', 'Fabtice est gratuit et libre (GPL-3.0). https://fabtice.netlify.app', '');
  return lines.join('\n');
}
