// The short French report (resultats/<variant>.md) from the JSON result.

import type { Counts, Rates } from './score';

interface Entry {
  rates: Rates;
  counts: Counts;
}
interface Result {
  variant: string;
  date: string;
  seconds: number;
  pieces: number;
  groups: Record<string, Record<string, Entry>>;
}

const pc = (x: number) => (Number.isFinite(x) ? `${Math.round(100 * x)} %` : '—');
const CONDITIONS: [string, string][] = [
  ['propre', 'synthèse, son propre'],
  ['disque', 'synthèse, vieux disque'],
  ['reel', 'enregistrements réels'],
  ['reel-disque', 'réels, façon vieux disque'],
];
const GRIDS: [string, string][] = [
  ['detected', 'grille détectée'],
  ['truth', 'vraie grille'],
];

export function report(r: Result): string {
  const L: string[] = [];
  const cond = r.groups.condition!;
  L.push(`# Banc accords — variante \`${r.variant}\``);
  L.push('');
  L.push(`${r.pieces} morceaux, mesuré le ${r.date.slice(0, 10)} (${r.seconds} s). Chiffres « par temps » : chaque temps de chaque mesure compte une fois.`);
  L.push('');
  L.push('| Grille | Son | Morceaux | Fondamentale | Famille | Couleur | Complet | Basse | Accords manqués | Accords en trop | Temps trouvés | Premiers temps | Tonalité |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [g, gl] of GRIDS) {
    for (const [c, cl] of CONDITIONS) {
      const e = cond[`${g}|${c}`];
      if (!e) continue;
      const x = e.rates;
      L.push(`| ${gl} | ${cl} | ${x.pieces} | ${pc(x.beat.fondamentale)} | ${pc(x.beat.famille)} | ${pc(x.beat.couleur)} | ${pc(x.beat.complet)} | ${pc(x.beat.basse)} | ${pc(x.missing)} | ${pc(x.extra)} | ${g === 'truth' ? '(vraie)' : pc(x.beatF)} | ${g === 'truth' ? '(vraie)' : pc(x.downbeats)} | ${pc(x.key)} |`);
    }
  }
  L.push('');
  L.push('Même mesure pondérée par la durée (échantillons toutes les 50 ms) :');
  L.push('');
  L.push('| Grille | Son | Fondamentale | Couleur |');
  L.push('|---|---|---|---|');
  for (const [g, gl] of GRIDS) {
    for (const [c, cl] of CONDITIONS) {
      const e = cond[`${g}|${c}`];
      if (e) L.push(`| ${gl} | ${cl} | ${pc(e.rates.time.fondamentale)} | ${pc(e.rates.time.couleur)} |`);
    }
  }
  L.push('');
  L.push('## Par style (fondamentale / couleur, par temps)');
  L.push('');
  const styles = [...new Set(Object.keys(r.groups.style!).map((k) => k.split('|')[2]!))].sort();
  const present = CONDITIONS.filter(([c]) => GRIDS.some(([g]) => cond[`${g}|${c}`]));
  L.push(`| Style | ${present.flatMap(([, cl]) => GRIDS.map(([, gl]) => `${cl}, ${gl}`)).join(' | ')} |`);
  L.push(`|---|${present.flatMap(() => GRIDS.map(() => '---')).join('|')}|`);
  for (const s of styles) {
    const cells = present.flatMap(([c]) =>
      GRIDS.map(([g]) => {
        const e = r.groups.style![`${g}|${c}|${s}`];
        return e ? `${pc(e.rates.beat.fondamentale)} / ${pc(e.rates.beat.couleur)}` : '';
      }),
    );
    L.push(`| ${s} | ${cells.join(' | ')} |`);
  }
  L.push('');
  L.push('## Ce qui est faux (part des temps où fondamentale + couleur est fausse)');
  L.push('');
  const kinds = new Set<string>();
  for (const e of Object.values(cond)) for (const k of Object.keys(e.counts.errors)) kinds.add(k);
  const keys = GRIDS.flatMap(([g, gl]) => present.map(([c, cl]) => [`${g}|${c}`, `${cl}, ${gl}`] as const)).filter(([k]) => cond[k]);
  L.push(`| Type d’erreur | ${keys.map(([, l]) => l).join(' | ')} |`);
  L.push(`|---|${keys.map(() => '---').join('|')}|`);
  const order = [...kinds].sort((a, b) => (cond[keys[0]![0]]!.counts.errors[b] ?? 0) - (cond[keys[0]![0]]!.counts.errors[a] ?? 0));
  for (const k of order) L.push(`| ${k} | ${keys.map(([key]) => pc((cond[key]!.counts.errors[k] ?? 0) / (cond[key]!.counts.wrong || 1))).join(' | ')} |`);
  L.push(`| *temps faux / tous les temps* | ${keys.map(([key]) => pc(cond[key]!.counts.wrong / cond[key]!.counts.beats)).join(' | ')} |`);
  L.push('');
  L.push('Bonne fondamentale mais mauvaise qualité, les confusions les plus fréquentes (vraie → trouvée, part de ces erreurs, toutes conditions, grille détectée) :');
  L.push('');
  const pairs: Record<string, number> = {};
  let tot = 0;
  for (const [k, e] of Object.entries(cond)) {
    if (!k.startsWith('detected|')) continue;
    for (const [p, n] of Object.entries(e.counts.qualityPairs)) {
      pairs[p] = (pairs[p] ?? 0) + n;
      tot += n;
    }
  }
  const top = Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 12);
  L.push(top.map(([p, n]) => `${p} (${pc(n / tot)})`).join(' · ') || '—');
  L.push('');
  L.push('## Le signal « douteux »');
  L.push('');
  L.push('| Grille | Son | Temps marqués douteux | Faux quand douteux | Faux quand sûr | Erreurs signalées |');
  L.push('|---|---|---|---|---|---|');
  for (const [g, gl] of GRIDS) {
    for (const [c, cl] of CONDITIONS) {
      const e = cond[`${g}|${c}`];
      if (e) L.push(`| ${gl} | ${cl} | ${pc(e.rates.doubtfulShare)} | ${pc(e.rates.errorIfDoubtful)} | ${pc(e.rates.errorIfSure)} | ${pc(e.rates.errorsFlagged)} |`);
    }
  }
  L.push('');
  L.push('Lecture : *Fondamentale* = la note qui nomme l’accord est juste ; *Famille* = majeur, mineur, diminué, augmenté ou suspendu juste ; *Couleur* = la qualité exacte (7, maj7, m7, m7b5, 6, m6…) juste ; *Complet* = couleur, extensions et basse justes ; *Basse* = note la plus grave (renversement) juste. *Accords manqués* : mesures à deux accords où un seul est trouvé ; *en trop* : mesures à un accord où plusieurs sont trouvés.');
  L.push('');
  return L.join('\n');
}
