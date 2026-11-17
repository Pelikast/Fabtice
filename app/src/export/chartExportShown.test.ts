// « Ouvrir dans iReal Pro » / « Fichier iReal Pro… » export the chart that is on screen (C14): the full chart as it is,
// or the simplified chart with its repeats when « Grille complète simplifiée » is the display.

import { beforeEach, describe, expect, it } from 'vitest';
import { replaceEngine } from '../audio';
import { connectEngine } from '../audio/connect';
import { MockEngine } from '../audio/MockEngine';
import { autumnProject } from '../demo/demoAutumn';
import { readIRealLink } from '../standards/irealRead';
import { fakeClock } from '../test/fakeClock';
import * as actions from '../store/actions';
import { showFullChart, showSimplifiedChart } from '../store/chartDisplay';
import { appStore, initialState } from '../store/store';
import { chartForExport, chartForExportShown } from './chartExport';
import { exportToIRealPro } from './ireal';

beforeEach(async () => {
  appStore.setState(initialState(), true);
  const engine = new MockEngine(fakeClock().clock);
  replaceEngine(engine);
  connectEngine(appStore, engine);
  await actions.openProject(autumnProject());
});

describe('the chart handed to iReal Pro follows the display', () => {
  it('is the full chart, bar by bar, while the display is « Affichage complet »', () => {
    showFullChart();
    const chart = chartForExportShown(appStore.getState())!;
    expect(chart.repeats).toBe('none');
    expect(chart.bars).toHaveLength(chartForExport(appStore.getState())!.bars.length);
    expect(chart.bars.some((b) => b.repeatStart)).toBe(false);
  });

  it('is the simplified chart with its repeats while the display is « Grille complète simplifiée »', () => {
    showSimplifiedChart();
    const chart = chartForExportShown(appStore.getState())!;
    expect(chart.repeats).toBe('written');
    expect(chart.bars).toHaveLength(25);
    expect(chart.bars.filter((b) => b.repeatStart)).toHaveLength(1);
    expect(chart.bars.filter((b) => b.repeatEnd)).toHaveLength(1);
    expect(chart.bars.at(-1)!.final).toBe(true);
  });

  it('is read back by iReal Pro\'s own reader as 25 written bars, 33 played', () => {
    showSimplifiedChart();
    const song = readIRealLink(exportToIRealPro(chartForExportShown(appStore.getState())!).url).songs[0]!;
    expect(song.writtenBars).toBe(25);
    expect(song.bars).toHaveLength(33);
  });

  it('is the full chart again when the piece has nothing to fold', () => {
    showSimplifiedChart();
    appStore.setState((s) => ({ analysis: s.analysis ? { ...s.analysis, structure: null } : s.analysis }));
    const chart = chartForExportShown(appStore.getState())!;
    expect(chart.repeats).toBe('none');
  });
});
