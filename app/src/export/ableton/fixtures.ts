// Inputs of the writer's tests: shapes the session model gives (a lead-in
// bar, a tempo that changes at every beat, signature changes, many locators).

import type { AbletonSetInput, TempoSegmentInput } from './types';

/** A piece of `bars` 4/4 bars after a one-bar lead-in, its tempo drifting from beat to beat, a 6/8 passage and a 7/8 bar. */
export function sampleSet(): { input: AbletonSetInput; beats: { quarters: number; time: number }[] } {
  const sampleRate = 48000;
  const leadInSeconds = 0.37;
  // Lead-in: one 1/4 bar lasting exactly the silence before the first bar line.
  const tempo: TempoSegmentInput[] = [{ quarters: 0, quarterBpm: 60 / leadInSeconds }];
  const beats: { quarters: number; time: number }[] = [{ quarters: 0, time: 0 }];
  let q = 1;
  let t = leadInSeconds;
  const meters = [
    { quarters: 0, numerator: 1, denominator: 4 },
    { quarters: 1, numerator: 4, denominator: 4 },
  ];
  const locators: { quarters: number; name: string }[] = [];
  const step = (quarters: number, bpm: number) => {
    tempo.push({ quarters: q, quarterBpm: bpm });
    beats.push({ quarters: q, time: t });
    q += quarters;
    t += (quarters * 60) / bpm;
  };
  for (let bar = 0; bar < 24; bar++) {
    if (bar === 8) meters.push({ quarters: q, numerator: 6, denominator: 8 });
    if (bar === 12) meters.push({ quarters: q, numerator: 7, denominator: 8 });
    if (bar === 13) meters.push({ quarters: q, numerator: 4, denominator: 4 });
    const inSix = bar >= 8 && bar < 12;
    const beatsInBar = inSix ? 6 : bar === 12 ? 7 : 4;
    const unit = inSix || bar === 12 ? 0.5 : 1;
    for (let b = 0; b < beatsInBar; b++) {
      // A slow drift with a little wobble, as an old recording.
      const bpm = 132 + 6 * Math.sin((bar * 4 + b) / 9) + ((bar * 7 + b * 3) % 5) * 0.37;
      // A section letter every four bars, joined to the chord as the exporter will write it.
      if (b === 0) locators.push({ quarters: q, name: bar % 4 === 0 ? `${'ABCDEF'[bar / 4]} · Cm7` : `Cm7 (${bar + 1})` });
      step(unit, bpm);
    }
  }
  beats.push({ quarters: q, time: t });
  const duration = t + 2.5;
  const frames = Math.round(duration * sampleRate);
  return {
    input: {
      title: 'Blues du dimanche',
      sampleRate,
      tracks: [
        { name: 'Morceau', file: 'Samples/Imported/01 Morceau.wav', frames },
        { name: 'Contrebasse', file: 'Samples/Imported/02 Contrebasse.wav', frames, fileSize: frames * 4 + 44, crc: 12345, absolutePath: '/Users/x/Music/Blues du dimanche Project/Samples/Imported/02 Contrebasse.wav' },
      ],
      tempo,
      meters,
      locators,
    },
    beats,
  };
}
