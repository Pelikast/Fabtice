// The small instrument-recognition model of the harmony pass (`../types.ts#InstrumentRecognizer`):
// which wind instrument leads in an excerpt of the separated track « Autres ». See `model.ts`
// for the model, `decide.ts` for the thresholds, `web/spikes/structure/instruments/` for the bench.

export { createInstrumentRecognizer, instrumentModelInfo, instrumentModelSourceText, INSTRUMENT_MODEL, type RecognizerOptions, type InstrumentsWorkerLike } from './recognizer';
export { classifyExcerpt, readExcerpt, sessionRunner, type WindowRunner, type ExcerptReading } from './classify';
export { decide, DECISION, type DecisionRule } from './decide';
export { excerptWindows, windowPlan } from './excerpt';
export { groupScores, meanScores, NAMED_GROUPS, WIND_GROUPS, type Group, type GroupScores } from './model';
