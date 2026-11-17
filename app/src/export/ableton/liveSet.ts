// The Live Set document, in one of two schemas (ALS-FORMAT.md):
//
//   - « live11 » (default), `MinorVersion` 11.0_433, as Live 11.0 writes it:
//     Live 11 and Live 12 open it (a Live release reads the sets of every
//     older schema, back to Live 8) and find its audio files by their path
//     relative to the set;
//   - « live10 », `MinorVersion` 10.0_377, as Live 10.1 writes it: for Live
//     10. Live 10 finds an audio file through a macOS alias record that only
//     the Mac where the file lies can produce, so the clips of this set open
//     « missing » and the user points Live to the folder once (File Manager).
//
// Shape of the document: what Live writes for a new set with audio tracks and
// no return track, element by element in Live's order (sets saved by Live
// 10.1.7, 11.1.5 and 12.0 compared, ALS-FORMAT.md), with:
//   - one audio track per input track, one unwarped arrangement clip on each;
//   - the main track's Tempo and TimeSignature automated (steps on sixteenths,
//     `tempo.ts`), the tempo lane's view range fitted to the curve;
//   - the locators;
//   - eight empty scenes, as in Live's default set (every clip slot list has
//     one slot per scene: Live crashes on a mismatch).
// Nothing newer than the target release is written (11.0.0, or 10.1.0): Live
// refuses a whole set over one element or attribute it does not know.
// `reference_check.py` walks the result against Live's own schemas.

import { ENVELOPE_START, liveTempoSteps, quartersToSeconds, secondsToQuarters, tempoEvents, timeSignatureCode } from './tempo';
import type { AbletonSetInput, AbletonSetResult, AbletonTarget, AbletonTrackInput, AbletonWarning, LiveTempoPoint } from './types';
import { el, float32, serialize, v, type XmlElement } from './xml';

interface Dialect {
  target: AbletonTarget;
  /** Root attributes, as the release writes them, in its order. */
  root: Record<string, string>;
  /** `OverwriteProtectionNumber`: Live writes its own major and minor version there. */
  overwriteProtection: number;
  live11: boolean;
}

export const DIALECTS: Record<AbletonTarget, Dialect> = {
  // Live 11.0.0 to 11.0.2 wrote no SchemaChangeCount.
  live11: {
    target: 'live11',
    root: { MajorVersion: '5', MinorVersion: '11.0_433', Creator: 'Ableton Live 11.0', Revision: '9dc150af94686f816d2cf27815fcf2907d4b86f8' },
    overwriteProtection: 0x0b00,
    live11: true,
  },
  live10: {
    target: 'live10',
    root: { MajorVersion: '5', MinorVersion: '10.0_377', SchemaChangeCount: '2', Creator: 'Ableton Live 10.1', Revision: '820f098a4a1eff42a9be3d90e07536cb8104c459' },
    overwriteProtection: 0x0a01,
    live11: false,
  },
};

/** Root attributes of the default target. */
export const LIVE_SCHEMA = DIALECTS.live11.root;

/** Scenes of Live's default set. */
const SCENES = 8;
/** Warm colours of Live's palette (indices 0..59): ochre, rust, brown, tan, sand… one per track in turn. */
const TRACK_COLORS = [2, 57, 16, 43, 30, 42, 58, 44, 29, 15];
const MASTER_COLOR = 21;

/**
 * A track's colour as the schema stores it. Live 11 writes the palette index;
 * Live 10 writes a clip's palette index as it is and shifts a track's or a
 * scene's (0..59 → 140..199, 60..69 → 278..287: ableton-als, measured).
 */
function trackColor(d: Dialect, index: number): number {
  if (d.live11) return index;
  if (index < 0) return 0; // no colour: -1 in Live 11, 0 in Live 10
  return index < 60 ? index + 140 : index + 218;
}

// Automation targets and pointees share one id space, counted by `NextPointeeId`. Automation events have ids of
// their own, but in the sets Live saves they stay below `NextPointeeId` too (and a validator of generated sets,
// ableton-als, requires every Id of the file to): one counter for both keeps every Id unique and below it.
class Ids {
  private pointee = 1;
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

interface Ctx {
  d: Dialect;
  ids: Ids;
  sampleRate: number;
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

function automationLanes(d: Dialect): XmlElement {
  return el('AutomationLanes', null, [
    el('AutomationLanes', null, [
      el('AutomationLane', { Id: 0 }, [
        v('SelectedDevice', 0),
        v('SelectedEnvelope', 0),
        v(d.live11 ? 'IsContentSelectedInDocument' : 'IsContentSelected', false),
        v('LaneHeight', 68),
      ]),
    ]),
    v('AreAdditionalAutomationLanesFolded', false),
  ]);
}

function clipEnvelopeChooser(): XmlElement {
  return el('ClipEnvelopeChooserViewState', null, [v('SelectedDevice', 0), v('SelectedEnvelope', 0), v('PreferModulationVisible', false)]);
}

/** The members every track starts with, up to `ViewData` (and Live 11's take lanes). */
function trackHead(d: Dialect, name: string, userName: string, color: number, envelopes: XmlElement[]): XmlElement[] {
  return [
    v('LomId', 0),
    v('LomIdView', 0),
    ...(d.live11 ? [v('IsContentSelectedInDocument', false), v('PreferredContentViewMode', 0)] : [v('IsContentSelected', false), v('EnvelopeModePreferred', false)]),
    el('TrackDelay', null, [v('Value', 0), v('IsValueSampleBased', false)]),
    el('Name', null, [v('EffectiveName', name), v('UserName', userName), v('Annotation', ''), v('MemorizedFirstClipName', '')]),
    v(d.live11 ? 'Color' : 'ColorIndex', trackColor(d, color)),
    el('AutomationEnvelopes', null, [el('Envelopes', null, envelopes)]),
    v('TrackGroupId', -1),
    v('TrackUnfolded', true),
    listWrapper('DevicesListWrapper'),
    listWrapper('ClipSlotsListWrapper'),
    v('ViewData', '{}'),
    ...(d.live11 ? [el('TakeLanes', null, [el('TakeLanes'), v('AreTakeLanesFolded', true)]), v('LinkedTrackGroupId', -1)] : []),
  ];
}

/** The members of a device (mixer, sequencer) up to its `SourceContext`. */
function deviceHead(c: Ctx): XmlElement[] {
  return [
    v('LomId', 0),
    v('LomIdView', 0),
    v('IsExpanded', true),
    boolParam(c.ids, 'On', true),
    ...(c.d.live11 ? [v('ModulationSourceCount', 0)] : []),
    listWrapper('ParametersListWrapper'),
    ...(c.d.live11 ? [el('Pointee', { Id: c.ids.next() })] : []),
    v('LastSelectedTimeableIndex', 0),
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

function mixer(c: Ctx, extra: XmlElement[] = []): XmlElement {
  return el('Mixer', null, [
    ...deviceHead(c),
    el('Sends'),
    boolParam(c.ids, 'Speaker', true),
    v('SoloSink', false),
    v('PanMode', 0),
    floatParam(c.ids, 'Pan', 0, -1, 1),
    floatParam(c.ids, 'SplitStereoPanL', -1, -1, 1),
    floatParam(c.ids, 'SplitStereoPanR', 1, -1, 1),
    floatParam(c.ids, 'Volume', 1, '0.0003162277571', '1.99526238'),
    v('ViewStateSesstionTrackWidth', 93),
    el('CrossFadeState', null, [v('LomId', 0), v('Manual', 1), target('AutomationTarget', c.ids.next())]),
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
function sequencer(c: Ctx, tag: string, attrs: Record<string, number> | null, slots: number, monitoring: number, clips: XmlElement[]): XmlElement {
  return el(tag, attrs, [
    ...deviceHead(c),
    slots > 0 ? clipSlots(slots) : el('ClipSlotList'),
    v('MonitoringEnum', monitoring),
    el('Sample', null, [
      el('ArrangerAutomation', null, [
        el('Events', null, clips),
        el('AutomationTransformViewState', null, [v('IsTransformPending', false), el('TimeAndValueTransforms')]),
      ]),
    ]),
    target('VolumeModulationTarget', c.ids.next()),
    target('TranspositionModulationTarget', c.ids.next()),
    target('GrainSizeModulationTarget', c.ids.next()),
    target('FluxModulationTarget', c.ids.next()),
    target('SampleOffsetModulationTarget', c.ids.next()),
    v('PitchViewScrollPosition', -1073741824),
    v('SampleOffsetModulationScrollPosition', -1073741824),
    el('Recorder', null, [v('IsArmed', false), v('TakeCounter', 1)]),
  ]);
}

function innerDeviceChain(d: Dialect): XmlElement {
  return el('DeviceChain', null, [el('Devices'), d.live11 && el('SignalModulations')]);
}

interface ClipPlacement {
  start: number;
  end: number;
  seconds: number;
}

function pathElements(tag: string, dirs: string[]): XmlElement {
  return el(
    tag,
    null,
    dirs.map((dir, i) => el('RelativePathElement', { Id: i, Dir: dir })),
  );
}

function fileRef(d: Dialect, track: AbletonTrackInput): XmlElement {
  if (d.live11) {
    return el('FileRef', null, [
      // 3: a file of the set's project, found by its RelativePath first (Path is the fallback).
      v('RelativePathType', 3),
      v('RelativePath', track.file),
      v('Path', track.absolutePath ?? ''),
      v('Type', 1),
      v('LivePackName', ''),
      v('LivePackId', ''),
      v('OriginalFileSize', track.fileSize ?? 0),
      v('OriginalCrc', track.crc ?? 0),
    ]);
  }
  // Live 10's shape for a file of the project (as Live 10.1 writes a recorded sample). `Data` would hold the
  // macOS alias record Live 10 resolves the file with; without it the clip opens « missing », and the search
  // hint (folders, size, checksum) is what Live's File Manager matches the file with.
  const parts = track.file.split('/');
  const name = parts.pop()!;
  const known = (track.fileSize ?? 0) > 0;
  return el('FileRef', null, [
    v('HasRelativePath', true),
    v('RelativePathType', 3),
    pathElements('RelativePath', parts),
    v('Name', name),
    v('Type', 2),
    el('Data'),
    v('RefersToFolder', false),
    el('SearchHint', null, [
      pathElements('PathHint', track.absolutePath ? track.absolutePath.split('/').filter(Boolean).slice(0, -1) : []),
      v('FileSize', track.fileSize ?? 0),
      v('Crc', track.crc ?? 0),
      v('MaxCrcSize', known ? 16384 : 0),
      v('HasExtendedInfo', known),
    ]),
    v('LivePackName', ''),
    v('LivePackId', ''),
  ]);
}

function sampleRef(c: Ctx, track: AbletonTrackInput): XmlElement {
  return el('SampleRef', null, [
    fileRef(c.d, track),
    v('LastModDate', track.lastModified ?? 0),
    el('SourceContext'),
    v('SampleUsageHint', 0),
    v('DefaultDuration', track.frames),
    v('DefaultSampleRate', c.sampleRate),
  ]);
}

/** An arrangement clip that plays its file as it is: warp off, no loop, from its first sample. */
function audioClip(c: Ctx, track: AbletonTrackInput, color: number, place: ClipPlacement): XmlElement {
  const secs = place.seconds;
  const d = c.d;
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
    v(d.live11 ? 'Color' : 'ColorIndex', color),
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
    ...(d.live11
      ? [
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
        ]
      : [v('FollowTime', 4), v('FollowActionA', 0), v('FollowActionB', 0), v('FollowChanceA', 1), v('FollowChanceB', 0)]),
    el('Grid', null, [v('FixedNumerator', 1), v('FixedDenominator', 16), v('GridIntervalPixel', 20), v('Ntoles', 2), v('SnapToGrid', true), v('Fixed', false)]),
    v('FreezeStart', 0),
    v('FreezeEnd', 0),
    v('IsWarped', false),
    d.live11 && v('TakeId', 1),
    sampleRef(c, track),
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

function audioTrack(c: Ctx, id: number, track: AbletonTrackInput, color: number, place: ClipPlacement): XmlElement {
  return el('AudioTrack', { Id: id }, [
    ...trackHead(c.d, track.name, track.name, color, []),
    v('SavedPlayingSlot', -1),
    v('SavedPlayingOffset', 0),
    v('Freeze', false),
    v('VelocityDetail', 0),
    v('NeedArrangerRefreeze', true),
    v('PostProcessFreezeClips', 0),
    el('DeviceChain', null, [
      automationLanes(c.d),
      clipEnvelopeChooser(),
      routing('AudioInputRouting', 'AudioIn/External/S0', 'Ext. In', '1/2'),
      routing('MidiInputRouting', 'MidiIn/External.All/-1', 'Ext: All Ins', ''),
      routing('AudioOutputRouting', 'AudioOut/Master', 'Master', ''),
      routing('MidiOutputRouting', 'MidiOut/None', 'None', ''),
      mixer(c),
      sequencer(c, 'MainSequencer', null, SCENES, 2, [audioClip(c, track, color, place)]),
      sequencer(c, 'FreezeSequencer', null, SCENES, 1, []),
      innerDeviceChain(c.d),
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

function masterTrack(c: Ctx, steps: LiveTempoPoint[], meters: { quarters: number; code: number }[]): XmlElement {
  const { ids } = c;
  // The mixer first (its parameters' ids), then the envelopes that point at them.
  const tempoTarget = ids.next();
  const tempoModulation = ids.next();
  const signatureTarget = ids.next();
  const bpms = steps.map((s) => s.quarterBpm);
  // The tempo lane's view range (« Range Minimum / Maximum » in Live), around the curve.
  const viewBottom = Math.max(20, Math.floor(Math.min(...bpms) / 10) * 10 - 10);
  const viewTop = Math.min(999, Math.ceil(Math.max(...bpms) / 10) * 10 + 10);
  const m = mixer(c, [
    el('Tempo', null, [
      v('LomId', 0),
      v('Manual', float32(steps[0]!.quarterBpm)),
      range(60, 200),
      target('AutomationTarget', tempoTarget),
      target('ModulationTarget', tempoModulation),
    ]),
    el('TimeSignature', null, [v('LomId', 0), v('Manual', meters[0]!.code), target('AutomationTarget', signatureTarget)]),
    floatParam(ids, 'GlobalGrooveAmount', 100, 0, 131.25),
    floatParam(ids, 'CrossFade', 0, -1, 1),
    v('TempoAutomationViewBottom', viewBottom),
    v('TempoAutomationViewTop', viewTop),
  ]);
  const freeze = el('FreezeSequencer', null, [sequencer(c, 'AudioSequencer', { Id: 0 }, 0, 1, [])]);

  const tempoEvts = tempoEvents(steps).map((e) => el('FloatEvent', { Id: ids.nextEvent(), Time: e.time, Value: float32(e.value) }));
  const meterEvts = [
    el('EnumEvent', { Id: ids.nextEvent(), Time: ENVELOPE_START, Value: meters[0]!.code }),
    ...meters.slice(1).map((mt) => el('EnumEvent', { Id: ids.nextEvent(), Time: mt.quarters, Value: mt.code })),
  ];
  return el('MasterTrack', null, [
    // The main track's name is not the user's: Live leaves UserName empty.
    ...trackHead(c.d, 'Master', '', MASTER_COLOR, [envelope(0, tempoTarget, tempoEvts), envelope(1, signatureTarget, meterEvts)]),
    el('DeviceChain', null, [
      automationLanes(c.d),
      clipEnvelopeChooser(),
      routing('AudioInputRouting', 'AudioIn/External/S0', 'Ext. In', '1/2'),
      routing('MidiInputRouting', 'MidiIn/External.All/-1', 'Ext: All Ins', ''),
      routing('AudioOutputRouting', 'AudioOut/External/S0', 'Ext. Out', '1/2'),
      routing('MidiOutputRouting', 'MidiOut/None', 'None', ''),
      m,
      freeze,
      innerDeviceChain(c.d),
    ]),
  ]);
}

function preHearTrack(c: Ctx): XmlElement {
  return el('PreHearTrack', null, [
    ...trackHead(c.d, 'Master', '', -1, []),
    el('DeviceChain', null, [
      automationLanes(c.d),
      clipEnvelopeChooser(),
      routing('AudioInputRouting', 'AudioIn/External/S0', 'Ext. In', '1/2'),
      routing('MidiInputRouting', 'MidiIn/External.All/-1', 'Ext: All Ins', ''),
      routing('AudioOutputRouting', 'AudioOut/External/S0', 'Ext. Out', '1/2'),
      routing('MidiOutputRouting', 'MidiOut/None', 'None', ''),
      mixer(c),
      innerDeviceChain(c.d),
    ]),
  ]);
}

function scenes(d: Dialect): XmlElement {
  const list: XmlElement[] = [];
  for (let i = 0; i < SCENES; i++) {
    list.push(
      d.live11
        ? el('Scene', { Id: i }, [
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
          ])
        : // Live 10: the scene's name is its Value (« 1 », « 2 »… with a leading space, as Live writes them).
          el('Scene', { Id: i, Value: ` ${i + 1}` }, [v('Annotation', ''), v('ColorIndex', 0), v('LomId', 0), listWrapper('ClipSlotsListWrapper')]),
    );
  }
  return el(d.live11 ? 'Scenes' : 'SceneNames', null, list);
}

function expressionLane(id: number, type: number, size: number, minimized: boolean): XmlElement {
  return el('ExpressionLane', { Id: id }, [v('Type', type), v('Size', size), v('IsMinimized', minimized)]);
}

function locatorsOf(input: AbletonSetInput, warnings: AbletonWarning[]): { quarters: number; name: string }[] {
  const sorted = input.locators
    .filter((l) => Number.isFinite(l.quarters))
    .map((l, i) => ({ ...l, i }))
    .sort((a, b) => a.quarters - b.quarters || a.i - b.i);
  const out: { quarters: number; names: string[] }[] = [];
  for (const l of sorted) {
    if (l.quarters < 0) warnings.push({ kind: 'locator-outside', quarters: l.quarters, name: l.name });
    const last = out[out.length - 1];
    if (last && Math.abs(last.quarters - l.quarters) < 1e-9) {
      last.names.push(l.name);
      continue;
    }
    out.push({ quarters: l.quarters, names: [l.name] });
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
    if (!t.file || t.file.startsWith('/') || t.file.includes('\\') || t.file.split('/').some((p) => p === '..' || p === '.' || p === '')) {
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
  const d = DIALECTS[input.target ?? 'live11'];
  const warnings: AbletonWarning[] = [];
  const steps = liveTempoSteps(input.tempo, warnings);
  const meters = input.meters
    .map((m) => ({ quarters: m.quarters, code: timeSignatureCode(m.numerator, m.denominator) }))
    .filter((m, i, all) => i === 0 || m.code !== all[i - 1]!.code);
  const c: Ctx = { d, ids: new Ids(), sampleRate: input.sampleRate };

  const clipEnds: number[] = [];
  const tracks = input.tracks.map((t, i) => {
    const start = t.startQuarters ?? 0;
    const seconds = t.frames / input.sampleRate;
    // Warp off, the clip lasts its file's seconds wherever the tempo curve puts that.
    const end = secondsToQuarters(steps, quartersToSeconds(steps, start) + seconds);
    clipEnds.push(end);
    const color = t.color ?? TRACK_COLORS[i % TRACK_COLORS.length]!;
    return audioTrack(c, 10 + i, t, color, { start, end, seconds });
  });
  const master = masterTrack(c, steps, meters);
  const preHear = preHearTrack(c);
  const locators = locatorsOf(input, warnings);

  const annotation = input.annotation ?? `${input.title} — exporté par Fabtice (format à l'essai)`;
  const L11 = d.live11;
  const liveSet = el('LiveSet', null, [
    v('NextPointeeId', 0), // set below, once every id is taken
    v('OverwriteProtectionNumber', d.overwriteProtection),
    v('LomId', 0),
    v('LomIdView', 0),
    el('Tracks', null, tracks),
    master,
    preHear,
    el('SendsPre'),
    scenes(d),
    el('Transport', null, [
      v('PhaseNudgeTempo', 10),
      v('LoopOn', false),
      v('LoopStart', 0),
      v('LoopLength', 16),
      v('LoopIsSongStart', false),
      v('CurrentTime', 0),
      v('PunchIn', false),
      v('PunchOut', false),
      L11 && v('MetronomeTickDuration', 0), // since Live 10.1.6
      v('DrawMode', false),
    ]),
    el('SongMasterValues', null, [el('SessionScrollerPos', { X: 0, Y: 0 })]),
    L11 && el('SignalModulations'),
    v('GlobalQuantisation', 4),
    v('AutoQuantisation', 0),
    el('Grid', null, [v('FixedNumerator', 1), v('FixedDenominator', 16), v('GridIntervalPixel', 20), v('Ntoles', 2), v('SnapToGrid', true), v('Fixed', false)]),
    el('ScaleInformation', null, [v('RootNote', 0), v('Name', 'Major')]),
    L11 && v('InKey', false),
    v('SmpteFormat', 0),
    el('TimeSelection', null, [v('AnchorTime', 0), v('OtherTime', 0)]),
    el('SequencerNavigator', null, [el('BeatTimeHelper', null, [v('CurrentZoom', 0.5)]), el('ScrollerPos', { X: 0, Y: 0 }), el('ClientSize', { X: 548, Y: 396 })]),
    ...(L11
      ? [
          v('ViewStateExtendedClipProperties', false),
          v('IsContentSplitterOpen', true),
          v('IsExpressionSplitterOpen', true),
          el('ExpressionLanes', null, [expressionLane(0, 0, 41, false), expressionLane(1, 1, 41, false), expressionLane(2, 2, 41, true), expressionLane(3, 3, 41, true)]),
          el('ContentLanes', null, [expressionLane(0, 4, 41, false), expressionLane(1, 5, 25, true)]),
        ]
      : [
          v('ViewStateLaunchPanel', false),
          v('ViewStateEnvelopePanel', false),
          v('ViewStateSamplePanel', true),
          el('ContentSplitterProperties', null, [v('Open', true), v('Size', 35)]),
        ]),
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
    el('GroovePool', null, [L11 && v('LomId', 0), el('Grooves')]),
    v('AutomationMode', false),
    v('SnapAutomationToGrid', true),
    v('ArrangementOverdub', false),
    v('ColorSequenceIndex', 1),
    el('AutoColorPickerForPlayerAndGroupTracks', null, [v('NextColorIndex', 0)]),
    el('AutoColorPickerForReturnAndMasterTracks', null, [v('NextColorIndex', 0)]),
    v('ViewData', '{}'),
    v('MidiFoldIn', false),
    ...(L11 ? [v('MidiFoldMode', 0), v('MultiClipFocusMode', false), v('MultiClipLoopBarHeight', 0)] : []),
    v('MidiPrelisten', false),
    ...(L11 ? [el('LinkedTrackGroups'), v('AccidentalSpellingPreference', 3), v('PreferFlatRootNote', false)] : []),
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
  liveSet.children[0] = v('NextPointeeId', c.ids.nextPointeeId);

  const root = el('Ableton', { ...d.root }, [liveSet]);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${serialize(root)}\n`;
  return { xml, target: d.target, tempo: steps, clipEnds, warnings };
}
