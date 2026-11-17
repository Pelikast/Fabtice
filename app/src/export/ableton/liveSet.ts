// The Live Set document, in the schema of Live 11.0 (`MinorVersion`
// « 11.0_433 »): Live 11 and Live 12 open it (a Live release opens the sets
// of every older schema, back to Live 8); Live 10 does not (see ALS-FORMAT.md
// for why Live 10 is not targeted, and for the source of every element).
//
// Shape of the document: what Live 11 writes for a new set with audio tracks
// and no return track, element by element in Live's order, with:
//   - one audio track per input track, one unwarped arrangement clip on each;
//   - the main track's Tempo and TimeSignature automated (steps on sixteenths,
//     `tempo.ts`), the tempo lane's view range fitted to the curve;
//   - the locators;
//   - eight empty scenes, as in Live's default set (every clip slot list has
//     one slot per scene: Live crashes on a mismatch).
// Nothing newer than Live 11.0.0 is written: Live refuses a whole set over one
// element or attribute it does not know. `reference_check.py` walks the
// result against Live's own schema of 11.0_433.

import { liveFileCrc } from './crc';
import { ENVELOPE_START, liveTempoSteps, quartersToSeconds, secondsToQuarters, tempoEvents, timeSignatureCode } from './tempo';
import type { AbletonSetInput, AbletonSetResult, AbletonWarning, LiveTempoPoint } from './types';
import { el, float32, serialize, v, type XmlElement } from './xml';

/** Root attributes, as Live 11.0 writes them (no `SchemaChangeCount` in 11.0.0 to 11.0.2). */
export const LIVE_SCHEMA = {
  MajorVersion: '5',
  MinorVersion: '11.0_433',
  Creator: 'Ableton Live 11.0',
  Revision: '9dc150af94686f816d2cf27815fcf2907d4b86f8',
} as const;

/** `OverwriteProtectionNumber`: Live writes its own major and minor version there (0x0B00 for 11.0). */
const OVERWRITE_PROTECTION = 0x0b00;
/** Scenes of Live's default set. */
const SCENES = 8;
/** Warm colours of Live's palette (indices 0..69), one per track in turn. */
const TRACK_COLORS = [2, 3, 4, 1, 15, 16, 17, 14, 28, 29];
const MASTER_COLOR = 21;
const NUM_ID_FLOOR = 1;

// Automation targets and pointees share one id space, counted by `NextPointeeId`. Automation events have ids of
// their own, but in the sets Live saves they stay below `NextPointeeId` too (and a validator of generated sets,
// ableton-als, requires every Id of the file to): one counter for both keeps every Id unique and below it.
class Ids {
  private pointee = NUM_ID_FLOOR;
  /** A new id in the set-global space counted by `NextPointeeId` (targets, pointees). */
  next(): number {
    return this.pointee++;
  }
  /** A new automation event id (from the same counter). */
  nextEvent(): number {
    return this.pointee++;
  }
  get nextPointeeId(): number {
    return this.pointee;
  }
}

const lockEnvelope = () => v('LockEnvelope', 0);
const target = (tag: string, id: number) => el(tag, { Id: id }, [lockEnvelope()]);
const range = (min: number | string, max: number | string) => el('MidiControllerRange', null, [v('Min', min), v('Max', max)]);
const listWrapper = (tag: string) => el(tag, { LomId: 0 });

function boolParam(ids: Ids, tag: string, manual: boolean): XmlElement {
  return el(tag, null, [
    v('LomId', 0),
    v('Manual', manual),
    target('AutomationTarget', ids.next()),
    el('MidiCCOnOffThresholds', null, [v('Min', 64), v('Max', 127)]),
  ]);
}

function floatParam(ids: Ids, tag: string, manual: number | string, min: number | string, max: number | string): XmlElement {
  return el(tag, null, [
    v('LomId', 0),
    v('Manual', manual),
    range(min, max),
    target('AutomationTarget', ids.next()),
    target('ModulationTarget', ids.next()),
  ]);
}

function routing(tag: string, targetName: string, upper: string, lower: string): XmlElement {
  return el(tag, null, [v('Target', targetName), v('UpperDisplayString', upper), v('LowerDisplayString', lower)]);
}

function automationLanes(): XmlElement {
  return el('AutomationLanes', null, [
    el('AutomationLanes', null, [
      el('AutomationLane', { Id: 0 }, [v('SelectedDevice', 0), v('SelectedEnvelope', 0), v('IsContentSelectedInDocument', false), v('LaneHeight', 68)]),
    ]),
    v('AreAdditionalAutomationLanesFolded', false),
  ]);
}

function clipEnvelopeChooser(): XmlElement {
  return el('ClipEnvelopeChooserViewState', null, [v('SelectedDevice', 0), v('SelectedEnvelope', 0), v('PreferModulationVisible', false)]);
}

/** The members every track starts with, up to `LinkedTrackGroupId`. */
function trackHead(name: string, color: number, envelopes: XmlElement[]): XmlElement[] {
  return [
    v('LomId', 0),
    v('LomIdView', 0),
    v('IsContentSelectedInDocument', false),
    v('PreferredContentViewMode', 0),
    el('TrackDelay', null, [v('Value', 0), v('IsValueSampleBased', false)]),
    el('Name', null, [v('EffectiveName', name), v('UserName', name), v('Annotation', ''), v('MemorizedFirstClipName', '')]),
    v('Color', color),
    el('AutomationEnvelopes', null, [el('Envelopes', null, envelopes)]),
    v('TrackGroupId', -1),
    v('TrackUnfolded', true),
    listWrapper('DevicesListWrapper'),
    listWrapper('ClipSlotsListWrapper'),
    v('ViewData', '{}'),
    el('TakeLanes', null, [el('TakeLanes'), v('AreTakeLanesFolded', true)]),
    v('LinkedTrackGroupId', -1),
  ];
}

/** The members of a device (mixer, sequencer) up to its `SourceContext`. */
function deviceHead(ids: Ids, lastTimeable: number): XmlElement[] {
  return [
    v('LomId', 0),
    v('LomIdView', 0),
    v('IsExpanded', true),
    boolParam(ids, 'On', true),
    v('ModulationSourceCount', 0),
    listWrapper('ParametersListWrapper'),
    el('Pointee', { Id: ids.next() }),
    v('LastSelectedTimeableIndex', lastTimeable),
    v('LastSelectedClipEnvelopeIndex', 0),
    el('LastPresetRef', null, [el('Value')]),
    el('LockedScripts'),
    v('IsFolded', false),
    v('ShouldShowPresetName', false),
    v('UserName', ''),
    v('Annotation', ''),
    el('SourceContext', null, [el('Value')]),
  ];
}

function mixer(ids: Ids, extra: XmlElement[] = []): XmlElement {
  return el('Mixer', null, [
    ...deviceHead(ids, 0),
    el('Sends'),
    boolParam(ids, 'Speaker', true),
    v('SoloSink', false),
    v('PanMode', 0),
    floatParam(ids, 'Pan', 0, -1, 1),
    floatParam(ids, 'SplitStereoPanL', -1, -1, 1),
    floatParam(ids, 'SplitStereoPanR', 1, -1, 1),
    floatParam(ids, 'Volume', 1, '0.0003162277571', '1.99526238'),
    v('ViewStateSesstionTrackWidth', 93),
    el('CrossFadeState', null, [v('LomId', 0), v('Manual', 1), target('AutomationTarget', ids.next())]),
    listWrapper('SendsListWrapper'),
    ...extra,
  ]);
}

function clipSlots(count: number): XmlElement {
  const slots: XmlElement[] = [];
  for (let i = 0; i < count; i++) {
    slots.push(el('ClipSlot', { Id: i }, [v('LomId', 0), el('ClipSlot', null, [el('Value')]), v('HasStop', true), v('NeedRefreeze', true)]));
  }
  return el('ClipSlotList', null, slots);
}

/** A track's audio sequencer (`MainSequencer`, `FreezeSequencer`, the main track's `AudioSequencer`). */
function sequencer(ids: Ids, tag: string, attrs: Record<string, number> | null, slots: number, monitoring: number, clips: XmlElement[]): XmlElement {
  return el(tag, attrs, [
    ...deviceHead(ids, 0),
    slots > 0 ? clipSlots(slots) : el('ClipSlotList'),
    v('MonitoringEnum', monitoring),
    el('Sample', null, [
      el('ArrangerAutomation', null, [
        el('Events', null, clips),
        el('AutomationTransformViewState', null, [v('IsTransformPending', false), el('TimeAndValueTransforms')]),
      ]),
    ]),
    target('VolumeModulationTarget', ids.next()),
    target('TranspositionModulationTarget', ids.next()),
    target('GrainSizeModulationTarget', ids.next()),
    target('FluxModulationTarget', ids.next()),
    target('SampleOffsetModulationTarget', ids.next()),
    v('PitchViewScrollPosition', -1073741824),
    v('SampleOffsetModulationScrollPosition', -1073741824),
    el('Recorder', null, [v('IsArmed', false), v('TakeCounter', 1)]),
  ]);
}

function innerDeviceChain(): XmlElement {
  return el('DeviceChain', null, [el('Devices'), el('SignalModulations')]);
}

interface ClipPlacement {
  start: number;
  end: number;
  seconds: number;
}

function sampleRef(track: AbletonSetInput['tracks'][number], sampleRate: number): XmlElement {
  return el('SampleRef', null, [
    el('FileRef', null, [
      // 3: a file of the set's project, found by its RelativePath (Path is the fallback).
      v('RelativePathType', 3),
      v('RelativePath', track.file),
      v('Path', track.absolutePath ?? ''),
      v('Type', 1),
      v('LivePackName', ''),
      v('LivePackId', ''),
      v('OriginalFileSize', track.fileSize ?? 0),
      v('OriginalCrc', track.crc ?? 0),
    ]),
    v('LastModDate', track.lastModified ?? 0),
    el('SourceContext'),
    v('SampleUsageHint', 0),
    v('DefaultDuration', track.frames),
    v('DefaultSampleRate', sampleRate),
  ]);
}

/** An arrangement clip that plays its file as it is: warp off, no loop, from its first sample. */
function audioClip(track: AbletonSetInput['tracks'][number], color: number, place: ClipPlacement, sampleRate: number): XmlElement {
  const secs = place.seconds;
  return el('AudioClip', { Id: 0, Time: place.start }, [
    v('LomId', 0),
    v('LomIdView', 0),
    v('CurrentStart', place.start),
    v('CurrentEnd', place.end),
    // Warp off: the loop markers count seconds of the file, not beats.
    el('Loop', null, [
      v('LoopStart', 0),
      v('LoopEnd', secs),
      v('StartRelative', 0),
      v('LoopOn', false),
      v('OutMarker', secs),
      v('HiddenLoopStart', 0),
      v('HiddenLoopEnd', secs),
    ]),
    v('Name', track.name),
    v('Annotation', ''),
    v('Color', color),
    v('LaunchMode', 0),
    v('LaunchQuantisation', 0),
    el('TimeSignature', null, [
      el('TimeSignatures', null, [el('RemoteableTimeSignature', { Id: 0 }, [v('Numerator', 4), v('Denominator', 4), v('Time', 0)])]),
    ]),
    el('Envelopes', null, [el('Envelopes')]),
    el('ScrollerTimePreserver', null, [v('LeftTime', 0), v('RightTime', 0)]),
    el('TimeSelection', null, [v('AnchorTime', 0), v('OtherTime', 0)]),
    v('Legato', false),
    v('Ram', false),
    el('GrooveSettings', null, [v('GrooveId', -1)]),
    v('Disabled', false),
    v('VelocityAmount', 0),
    el('FollowAction', null, [
      v('FollowTime', 4),
      v('IsLinked', true),
      v('LoopIterations', 1),
      v('FollowActionA', 4),
      v('FollowActionB', 0),
      v('FollowChanceA', 100),
      v('FollowChanceB', 0),
      v('JumpIndexA', 1),
      v('JumpIndexB', 1),
      v('FollowActionEnabled', false),
    ]),
    el('Grid', null, [v('FixedNumerator', 1), v('FixedDenominator', 16), v('GridIntervalPixel', 20), v('Ntoles', 2), v('SnapToGrid', true), v('Fixed', false)]),
    v('FreezeStart', 0),
    v('FreezeEnd', 0),
    v('IsWarped', false),
    v('TakeId', 1),
    sampleRef(track, sampleRate),
    el('Onsets', null, [el('UserOnsets'), v('HasUserOnsets', false)]),
    v('WarpMode', 0),
    v('GranularityTones', 30),
    v('GranularityTexture', 65),
    v('FluctuationTexture', 25),
    v('TransientResolution', 6),
    v('TransientLoopMode', 2),
    v('TransientEnvelope', 100),
    v('ComplexProFormants', 100),
    v('ComplexProEnvelope', 128),
    v('Sync', true),
    v('HiQ', true),
    v('Fade', true),
    el('Fades', null, [
      v('FadeInLength', 0),
      v('FadeOutLength', 0),
      v('ClipFadesAreInitialized', true),
      v('CrossfadeInState', 0),
      v('FadeInCurveSkew', 0),
      v('FadeInCurveSlope', 0),
      v('FadeOutCurveSkew', 0),
      v('FadeOutCurveSlope', 0),
      v('IsDefaultFadeIn', true),
      v('IsDefaultFadeOut', true),
    ]),
    v('PitchCoarse', 0),
    v('PitchFine', 0),
    v('SampleVolume', 1),
    v('MarkerDensity', 2),
    v('AutoWarpTolerance', 4),
    // Live refuses an audio clip without warp markers, warped or not; these are the ones it writes for a new one.
    el('WarpMarkers', null, [
      el('WarpMarker', { Id: 0, SecTime: 0, BeatTime: 0 }),
      el('WarpMarker', { Id: 1, SecTime: 0.015625, BeatTime: 0.03125 }),
    ]),
    el('SavedWarpMarkersForStretched'),
    v('MarkersGenerated', false),
    v('IsSongTempoMaster', false),
  ]);
}

function audioTrack(ids: Ids, id: number, track: AbletonSetInput['tracks'][number], color: number, place: ClipPlacement, sampleRate: number): XmlElement {
  return el('AudioTrack', { Id: id }, [
    ...trackHead(track.name, color, []),
    v('SavedPlayingSlot', -1),
    v('SavedPlayingOffset', 0),
    v('Freeze', false),
    v('VelocityDetail', 0),
    v('NeedArrangerRefreeze', true),
    v('PostProcessFreezeClips', 0),
    el('DeviceChain', null, [
      automationLanes(),
      clipEnvelopeChooser(),
      routing('AudioInputRouting', 'AudioIn/External/S0', 'Ext. In', '1/2'),
      routing('MidiInputRouting', 'MidiIn/External.All/-1', 'Ext: All Ins', ''),
      routing('AudioOutputRouting', 'AudioOut/Master', 'Master', ''),
      routing('MidiOutputRouting', 'MidiOut/None', 'None', ''),
      mixer(ids),
      sequencer(ids, 'MainSequencer', null, SCENES, 2, [audioClip(track, color, place, sampleRate)]),
      sequencer(ids, 'FreezeSequencer', null, SCENES, 1, []),
      innerDeviceChain(),
    ]),
  ]);
}

function envelope(id: number, pointee: number, events: XmlElement[]): XmlElement {
  return el('AutomationEnvelope', { Id: id }, [
    el('EnvelopeTarget', null, [v('PointeeId', pointee)]),
    el('Automation', null, [
      el('Events', null, events),
      el('AutomationTransformViewState', null, [v('IsTransformPending', false), el('TimeAndValueTransforms')]),
    ]),
  ]);
}

function masterTrack(ids: Ids, steps: LiveTempoPoint[], meters: { quarters: number; code: number }[]): XmlElement {
  // The mixer first (its parameters' ids), then the envelopes that point at them.
  const tempoTarget = { id: 0 };
  const signatureTarget = { id: 0 };
  const bpms = steps.map((s) => s.quarterBpm);
  const viewBottom = Math.max(20, Math.floor(Math.min(...bpms) / 10) * 10 - 10);
  const viewTop = Math.min(999, Math.ceil(Math.max(...bpms) / 10) * 10 + 10);
  const tempoParam = (): XmlElement => {
    const at = ids.next();
    tempoTarget.id = at;
    return el('Tempo', null, [
      v('LomId', 0),
      el('Manual', { Value: float32(steps[0]!.quarterBpm) }),
      range(60, 200),
      target('AutomationTarget', at),
      target('ModulationTarget', ids.next()),
    ]);
  };
  const signatureParam = (): XmlElement => {
    const at = ids.next();
    signatureTarget.id = at;
    return el('TimeSignature', null, [v('LomId', 0), v('Manual', meters[0]!.code), target('AutomationTarget', at)]);
  };
  const m = mixer(ids, [
    tempoParam(),
    signatureParam(),
    floatParam(ids, 'GlobalGrooveAmount', 100, 0, 131.25),
    floatParam(ids, 'CrossFade', 0, -1, 1),
    v('TempoAutomationViewBottom', viewBottom),
    v('TempoAutomationViewTop', viewTop),
  ]);
  const freeze = el('FreezeSequencer', null, [sequencer(ids, 'AudioSequencer', { Id: 0 }, 0, 1, [])]);

  const tempoEvts = tempoEvents(steps).map((e) => el('FloatEvent', { Id: ids.nextEvent(), Time: e.time, Value: float32(e.value) }));
  const meterEvts = [
    el('EnumEvent', { Id: ids.nextEvent(), Time: ENVELOPE_START, Value: meters[0]!.code }),
    ...meters.slice(1).map((mt) => el('EnumEvent', { Id: ids.nextEvent(), Time: mt.quarters, Value: mt.code })),
  ];
  return el('MasterTrack', null, [
    ...trackHead('Master', MASTER_COLOR, [envelope(0, tempoTarget.id, tempoEvts), envelope(1, signatureTarget.id, meterEvts)]).map((e) =>
      // The main track's name is not the user's: Live leaves UserName empty.
      e.tag === 'Name' ? el('Name', null, [v('EffectiveName', 'Master'), v('UserName', ''), v('Annotation', ''), v('MemorizedFirstClipName', '')]) : e,
    ),
    el('DeviceChain', null, [
      automationLanes(),
      clipEnvelopeChooser(),
      routing('AudioInputRouting', 'AudioIn/External/S0', 'Ext. In', '1/2'),
      routing('MidiInputRouting', 'MidiIn/External.All/-1', 'Ext: All Ins', ''),
      routing('AudioOutputRouting', 'AudioOut/External/S0', 'Ext. Out', '1/2'),
      routing('MidiOutputRouting', 'MidiOut/None', 'None', ''),
      m,
      freeze,
      innerDeviceChain(),
    ]),
  ]);
}

function preHearTrack(ids: Ids): XmlElement {
  return el('PreHearTrack', null, [
    ...trackHead('Master', -1, []).map((e) =>
      e.tag === 'Name' ? el('Name', null, [v('EffectiveName', 'Master'), v('UserName', ''), v('Annotation', ''), v('MemorizedFirstClipName', '')]) : e,
    ),
    el('DeviceChain', null, [
      automationLanes(),
      clipEnvelopeChooser(),
      routing('AudioInputRouting', 'AudioIn/External/S0', 'Ext. In', '1/2'),
      routing('MidiInputRouting', 'MidiIn/External.All/-1', 'Ext: All Ins', ''),
      routing('AudioOutputRouting', 'AudioOut/External/S0', 'Ext. Out', '1/2'),
      routing('MidiOutputRouting', 'MidiOut/None', 'None', ''),
      mixer(ids),
      innerDeviceChain(),
    ]),
  ]);
}

function scene(i: number): XmlElement {
  return el('Scene', { Id: i }, [
    el('FollowAction', null, [
      v('FollowTime', 4),
      v('IsLinked', true),
      v('LoopIterations', 1),
      v('FollowActionA', 4),
      v('FollowActionB', 0),
      v('FollowChanceA', 100),
      v('FollowChanceB', 0),
      v('JumpIndexA', 0),
      v('JumpIndexB', 0),
      v('FollowActionEnabled', false),
    ]),
    v('Name', ''),
    v('Annotation', ''),
    v('Color', -1),
    v('Tempo', 120),
    v('IsTempoEnabled', false),
    v('TimeSignatureId', 201),
    v('IsTimeSignatureEnabled', false),
    v('LomId', 0),
    listWrapper('ClipSlotsListWrapper'),
  ]);
}

function expressionLane(id: number, type: number, size: number, minimized: boolean): XmlElement {
  return el('ExpressionLane', { Id: id }, [v('Type', type), v('Size', size), v('IsMinimized', minimized)]);
}

function locatorsOf(input: AbletonSetInput, warnings: AbletonWarning[]): { quarters: number; name: string }[] {
  const sorted = input.locators
    .filter((l) => Number.isFinite(l.quarters))
    .map((l, i) => ({ ...l, i }))
    .sort((a, b) => a.quarters - b.quarters || a.i - b.i);
  const out: { quarters: number; name: string; names: string[] }[] = [];
  for (const l of sorted) {
    if (l.quarters < 0) warnings.push({ kind: 'locator-outside', quarters: l.quarters, name: l.name });
    const last = out[out.length - 1];
    if (last && Math.abs(last.quarters - l.quarters) < 1e-9) {
      last.names.push(l.name);
      continue;
    }
    out.push({ quarters: l.quarters, name: l.name, names: [l.name] });
  }
  return out.map((l) => {
    if (l.names.length > 1) warnings.push({ kind: 'locators-merged', quarters: l.quarters, names: l.names });
    return { quarters: l.quarters, name: l.names.join(' · ') };
  });
}

function validate(input: AbletonSetInput): void {
  if (!(input.sampleRate > 0) || !Number.isInteger(input.sampleRate)) throw new RangeError('sampleRate must be a positive integer');
  if (input.tracks.length === 0) throw new RangeError('at least one track');
  for (const t of input.tracks) {
    if (!Number.isInteger(t.frames) || t.frames <= 0) throw new RangeError(`track « ${t.name} »: frames must be a positive integer`);
    if (!t.file || t.file.startsWith('/') || t.file.includes('\\') || t.file.split('/').includes('..')) {
      throw new RangeError(`track « ${t.name} »: file must be relative to the set's folder, with / separators`);
    }
    if (t.color !== undefined && (!Number.isInteger(t.color) || t.color < 0 || t.color > 69)) throw new RangeError(`track « ${t.name} »: color 0..69`);
  }
  if (input.meters.length === 0 || Math.abs(input.meters[0]!.quarters) > 1e-9) throw new RangeError('meters: the first one must be at quarter 0');
  for (let i = 1; i < input.meters.length; i++) {
    if (!(input.meters[i]!.quarters > input.meters[i - 1]!.quarters)) throw new RangeError('meters: sorted, without duplicates');
  }
}

/** Builds the document (uncompressed) and what was written. */
export function buildLiveSet(input: AbletonSetInput): AbletonSetResult {
  validate(input);
  const warnings: AbletonWarning[] = [];
  const steps = liveTempoSteps(input.tempo, warnings);
  const meters = input.meters
    .map((m) => ({ quarters: m.quarters, code: timeSignatureCode(m.numerator, m.denominator) }))
    .filter((m, i, all) => i === 0 || m.code !== all[i - 1]!.code);
  const ids = new Ids();

  const clipEnds: number[] = [];
  const tracks = input.tracks.map((t, i) => {
    const start = t.startQuarters ?? 0;
    const seconds = t.frames / input.sampleRate;
    // Warp off, the clip lasts its file's seconds wherever the tempo curve puts that.
    const end = secondsToQuarters(steps, quartersToSeconds(steps, start) + seconds);
    clipEnds.push(end);
    const color = t.color ?? TRACK_COLORS[i % TRACK_COLORS.length]!;
    return audioTrack(ids, 10 + i, t, color, { start, end, seconds }, input.sampleRate);
  });
  const master = masterTrack(ids, steps, meters);
  const preHear = preHearTrack(ids);
  const locators = locatorsOf(input, warnings);

  const annotation = input.annotation ?? `${input.title} — exporté par Fabtice (format à l'essai)`;
  const liveSet = el('LiveSet', null, [
    v('NextPointeeId', 0), // set below, once every id is taken
    v('OverwriteProtectionNumber', OVERWRITE_PROTECTION),
    v('LomId', 0),
    v('LomIdView', 0),
    el('Tracks', null, tracks),
    master,
    preHear,
    el('SendsPre'),
    el('Scenes', null, Array.from({ length: SCENES }, (_, i) => scene(i))),
    el('Transport', null, [
      v('PhaseNudgeTempo', 10),
      v('LoopOn', false),
      v('LoopStart', 0),
      v('LoopLength', 16),
      v('LoopIsSongStart', false),
      v('CurrentTime', 0),
      v('PunchIn', false),
      v('PunchOut', false),
      v('MetronomeTickDuration', 0),
      v('DrawMode', false),
    ]),
    el('SongMasterValues', null, [el('SessionScrollerPos', { X: 0, Y: 0 })]),
    el('SignalModulations'),
    v('GlobalQuantisation', 4),
    v('AutoQuantisation', 0),
    el('Grid', null, [v('FixedNumerator', 1), v('FixedDenominator', 16), v('GridIntervalPixel', 20), v('Ntoles', 2), v('SnapToGrid', true), v('Fixed', false)]),
    el('ScaleInformation', null, [v('RootNote', 0), v('Name', 'Major')]),
    v('InKey', false),
    v('SmpteFormat', 0),
    el('TimeSelection', null, [v('AnchorTime', 0), v('OtherTime', 0)]),
    el('SequencerNavigator', null, [
      el('BeatTimeHelper', null, [v('CurrentZoom', 0.5)]),
      el('ScrollerPos', { X: 0, Y: 0 }),
      el('ClientSize', { X: 548, Y: 396 }),
    ]),
    v('ViewStateExtendedClipProperties', false),
    v('IsContentSplitterOpen', true),
    v('IsExpressionSplitterOpen', true),
    el('ExpressionLanes', null, [expressionLane(0, 0, 41, false), expressionLane(1, 1, 41, false), expressionLane(2, 2, 41, true), expressionLane(3, 3, 41, true)]),
    el('ContentLanes', null, [expressionLane(0, 4, 41, false), expressionLane(1, 5, 25, true)]),
    v('ViewStateFxSlotCount', 4),
    v('ViewStateSessionMixerHeight', 120),
    el('Locators', null, [
      el(
        'Locators',
        null,
        locators.map((l, i) => el('Locator', { Id: i }, [v('LomId', 0), v('Time', l.quarters), v('Name', l.name), v('Annotation', ''), v('IsSongStart', false)])),
      ),
    ]),
    el('DetailClipKeyMidis'),
    listWrapper('TracksListWrapper'),
    listWrapper('VisibleTracksListWrapper'),
    listWrapper('ReturnTracksListWrapper'),
    listWrapper('ScenesListWrapper'),
    listWrapper('CuePointsListWrapper'),
    v('ChooserBar', 0),
    v('Annotation', annotation),
    v('SoloOrPflSavedValue', true),
    v('SoloInPlace', true),
    v('CrossfadeCurve', 2),
    v('LatencyCompensation', 2),
    v('HighlightedTrackIndex', 0),
    el('GroovePool', null, [v('LomId', 0), el('Grooves')]),
    v('AutomationMode', false),
    v('SnapAutomationToGrid', true),
    v('ArrangementOverdub', false),
    v('ColorSequenceIndex', 1),
    el('AutoColorPickerForPlayerAndGroupTracks', null, [v('NextColorIndex', 0)]),
    el('AutoColorPickerForReturnAndMasterTracks', null, [v('NextColorIndex', 0)]),
    v('ViewData', '{}'),
    v('MidiFoldIn', false),
    v('MidiFoldMode', 0),
    v('MultiClipFocusMode', false),
    v('MultiClipLoopBarHeight', 0),
    v('MidiPrelisten', false),
    el('LinkedTrackGroups'),
    v('AccidentalSpellingPreference', 3),
    v('PreferFlatRootNote', false),
    v('UseWarperLegacyHiQMode', false),
    el('VideoWindowRect', { Top: -2147483648, Left: -2147483648, Bottom: -2147483648, Right: -2147483648 }),
    v('ShowVideoWindow', true),
    v('TrackHeaderWidth', 93),
    v('ViewStateArrangerHasDetail', true),
    v('ViewStateSessionHasDetail', true),
    v('ViewStateDetailIsSample', true),
    el('ViewStates', null, [
      v('SessionIO', 1),
      v('SessionSends', 1),
      v('SessionReturns', 1),
      v('SessionMixer', 1),
      v('SessionTrackDelay', 0),
      v('SessionCrossFade', 0),
      v('SessionShowOverView', 0),
      v('ArrangerIO', 1),
      v('ArrangerReturns', 1),
      v('ArrangerMixer', 1),
      v('ArrangerTrackDelay', 0),
      v('ArrangerShowOverView', 1),
    ]),
  ]);
  liveSet.children[0] = v('NextPointeeId', ids.nextPointeeId);

  const root = el('Ableton', { ...LIVE_SCHEMA }, [liveSet]);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${serialize(root)}\n`;
  return { xml, tempo: steps, clipEnds, warnings };
}

export { liveFileCrc };
