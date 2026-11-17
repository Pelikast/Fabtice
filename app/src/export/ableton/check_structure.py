"""Structural check of an .als written by Fabtice, with Python's own XML parser.

Standard library only: run by `ableton.test.ts` when `python3` is there.

    python3 -I check_structure.py file.als   ->  one JSON line on stdout

It reads the file as Live would have to (gzip, then XML) and checks the rules
the sources of ALS-FORMAT.md give: Live's gzip header, the root attributes of
Live 11.0, unique ids in the NextPointeeId space and below it, every PointeeId
pointing at one of them, one clip slot per scene in every slot list, unwarped
clips with warp markers, the tempo and time-signature envelopes, the order of
the LiveSet's children as Live 11 writes them. The facts it reads back
(envelopes, clips, locators) go in the JSON, for the test to compare with the
input.
"""

import gzip
import json
import re
import sys
import xml.etree.ElementTree as ET

ROOT = {"MajorVersion": "5", "MinorVersion": "11.0_433", "Creator": "Ableton Live 11.0", "Revision": "9dc150af94686f816d2cf27815fcf2907d4b86f8"}
ENVELOPE_START = -63072000.0

# The LiveSet's children, in the order Live 11 writes them (a set saved by Live 11.1.5,
# without the members that appeared after 11.0.0: ResetNonautomatedMidiControllersOnClipStarts).
LIVESET_ORDER = [
    "NextPointeeId", "OverwriteProtectionNumber", "LomId", "LomIdView", "Tracks", "MasterTrack", "PreHearTrack",
    "SendsPre", "Scenes", "Transport", "SongMasterValues", "SignalModulations", "GlobalQuantisation",
    "AutoQuantisation", "Grid", "ScaleInformation", "InKey", "SmpteFormat", "TimeSelection", "SequencerNavigator",
    "ViewStateExtendedClipProperties", "IsContentSplitterOpen", "IsExpressionSplitterOpen", "ExpressionLanes",
    "ContentLanes", "ViewStateFxSlotCount", "ViewStateSessionMixerHeight", "Locators", "DetailClipKeyMidis",
    "TracksListWrapper", "VisibleTracksListWrapper", "ReturnTracksListWrapper", "ScenesListWrapper",
    "CuePointsListWrapper", "ChooserBar", "Annotation", "SoloOrPflSavedValue", "SoloInPlace", "CrossfadeCurve",
    "LatencyCompensation", "HighlightedTrackIndex", "GroovePool", "AutomationMode", "SnapAutomationToGrid",
    "ArrangementOverdub", "ColorSequenceIndex", "AutoColorPickerForPlayerAndGroupTracks",
    "AutoColorPickerForReturnAndMasterTracks", "ViewData", "MidiFoldIn", "MidiFoldMode", "MultiClipFocusMode",
    "MultiClipLoopBarHeight", "MidiPrelisten", "LinkedTrackGroups", "AccidentalSpellingPreference",
    "PreferFlatRootNote", "UseWarperLegacyHiQMode", "VideoWindowRect", "ShowVideoWindow", "TrackHeaderWidth",
    "ViewStateArrangerHasDetail", "ViewStateSessionHasDetail", "ViewStateDetailIsSample", "ViewStates",
]
# An audio track's children, in the order of Live 11/12 (Live 12 adds nothing here before 12.1).
AUDIOTRACK_ORDER = [
    "LomId", "LomIdView", "IsContentSelectedInDocument", "PreferredContentViewMode", "TrackDelay", "Name", "Color",
    "AutomationEnvelopes", "TrackGroupId", "TrackUnfolded", "DevicesListWrapper", "ClipSlotsListWrapper", "ViewData",
    "TakeLanes", "LinkedTrackGroupId", "SavedPlayingSlot", "SavedPlayingOffset", "Freeze", "VelocityDetail",
    "NeedArrangerRefreeze", "PostProcessFreezeClips", "DeviceChain",
]
# An arrangement audio clip's children: Live 10.1's order with Live 11's renames (Color, FollowAction, TakeId).
AUDIOCLIP_ORDER = [
    "LomId", "LomIdView", "CurrentStart", "CurrentEnd", "Loop", "Name", "Annotation", "Color", "LaunchMode",
    "LaunchQuantisation", "TimeSignature", "Envelopes", "ScrollerTimePreserver", "TimeSelection", "Legato", "Ram",
    "GrooveSettings", "Disabled", "VelocityAmount", "FollowAction", "Grid", "FreezeStart", "FreezeEnd", "IsWarped",
    "TakeId", "SampleRef", "Onsets", "WarpMode", "GranularityTones", "GranularityTexture", "FluctuationTexture",
    "TransientResolution", "TransientLoopMode", "TransientEnvelope", "ComplexProFormants", "ComplexProEnvelope",
    "Sync", "HiQ", "Fade", "Fades", "PitchCoarse", "PitchFine", "SampleVolume", "MarkerDensity", "AutoWarpTolerance",
    "WarpMarkers", "SavedWarpMarkersForStretched", "MarkersGenerated", "IsSongTempoMaster",
]
FILEREF_ORDER = ["RelativePathType", "RelativePath", "Path", "Type", "LivePackName", "LivePackId", "OriginalFileSize", "OriginalCrc"]


def owns_pointee_id(tag):
    return tag == "Pointee" or tag.endswith("AutomationTarget") or tag.endswith("ModulationTarget") or tag.startswith("ControllerTargets.")


def value(el, path):
    x = el.find(path)
    if x is None:
        raise AssertionError(f"missing {path} under {el.tag}")
    return x.get("Value")


def main(path):
    errors = []

    def check(cond, msg):
        if not cond:
            errors.append(msg)

    raw = open(path, "rb").read()
    check(raw[:4] == b"\x1f\x8b\x08\x00", f"gzip header {raw[:4].hex()}")
    check(raw[4:8] == b"\x00\x00\x00\x00", "gzip mtime not 0")
    check(raw[9] == 0xFF, "gzip OS byte not 255")
    data = gzip.decompress(raw)
    check(data.startswith(b'<?xml version="1.0" encoding="UTF-8"?>\n<Ableton '), "prolog")
    root = ET.fromstring(data)
    check(root.tag == "Ableton", "root tag")
    check(dict(root.attrib) == ROOT, f"root attributes {root.attrib}")
    check(list(root.attrib) == list(ROOT), "root attribute order")
    check(len(root) == 1 and root[0].tag == "LiveSet", "one LiveSet")
    ls = root[0]

    order = [c.tag for c in ls]
    check(order == LIVESET_ORDER, f"LiveSet children order: {order}")

    # Ids of the NextPointeeId space.
    ids = [int(e.get("Id")) for e in root.iter() if owns_pointee_id(e.tag)]
    check(len(ids) == len(set(ids)), "duplicate pointee ids")
    nxt = int(value(ls, "NextPointeeId"))
    check(max(ids) < nxt, f"NextPointeeId {nxt} not above every id ({max(ids)})")
    # In the sets Live saves, every Id of the file (automation events included) is below NextPointeeId.
    every = [int(e.get("Id")) for e in root.iter() if e.get("Id") is not None]
    check(max(every) < nxt, f"NextPointeeId {nxt} not above every Id of the file ({max(every)})")
    idset = set(ids)
    pointees = [int(e.get("Value")) for e in root.iter("PointeeId")]
    for p in pointees:
        check(p in idset, f"PointeeId {p} points at nothing")

    # Every Id attribute is an integer; ids of siblings in a list are unique.
    for parent in root.iter():
        sib = [c.get("Id") for c in parent if c.get("Id") is not None]
        check(len(sib) == len(set(sib)), f"duplicate sibling Id under {parent.tag}")
        for c in parent:
            if c.get("Id") is not None:
                check(re.fullmatch(r"-?\d+", c.get("Id")) is not None, f"non-integer Id on {c.tag}")

    scenes = len(ls.find("Scenes"))
    check(scenes >= 1, "no scene")

    tracks = []
    for t in ls.find("Tracks"):
        check(t.tag == "AudioTrack", f"unexpected track {t.tag}")
        check([c.tag for c in t] == AUDIOTRACK_ORDER, f"AudioTrack order: {[c.tag for c in t]}")
        for seq in ("MainSequencer", "FreezeSequencer"):
            n = len(t.find(f"DeviceChain/{seq}/ClipSlotList"))
            check(n == scenes, f"{seq} has {n} clip slots for {scenes} scenes")
        clips = list(t.find("DeviceChain/MainSequencer/Sample/ArrangerAutomation/Events"))
        check(len(clips) == 1 and clips[0].tag == "AudioClip", "one arrangement audio clip per track")
        c = clips[0]
        check([x.tag for x in c] == AUDIOCLIP_ORDER, f"AudioClip order: {[x.tag for x in c]}")
        fr = c.find("SampleRef/FileRef")
        check([x.tag for x in fr] == FILEREF_ORDER, f"FileRef order: {[x.tag for x in fr]}")
        check(value(c, "IsWarped") == "false", "clip is warped")
        check(len(c.find("WarpMarkers")) >= 1, "empty WarpMarkers (Live refuses it)")
        check(c.get("Time") == value(c, "CurrentStart"), "Time != CurrentStart")
        check(value(c, "Loop/LoopOn") == "false", "clip loops")
        frames = int(value(c, "SampleRef/DefaultDuration"))
        rate = int(value(c, "SampleRef/DefaultSampleRate"))
        check(abs(float(value(c, "Loop/LoopEnd")) - frames / rate) < 1e-9, "LoopEnd is not the file's length in seconds")
        check(float(value(c, "CurrentEnd")) > float(value(c, "CurrentStart")), "empty clip")
        tracks.append({
            "name": value(t, "Name/EffectiveName"),
            "start": float(value(c, "CurrentStart")),
            "end": float(value(c, "CurrentEnd")),
            "seconds": float(value(c, "Loop/LoopEnd")),
            "relativePath": value(fr, "RelativePath"),
            "relativePathType": int(value(fr, "RelativePathType")),
            "path": value(fr, "Path"),
            "size": int(value(fr, "OriginalFileSize")),
            "crc": int(value(fr, "OriginalCrc")),
            "frames": frames,
            "rate": rate,
        })

    master = ls.find("MasterTrack")
    mixer = master.find("DeviceChain/Mixer")
    tempo_id = int(mixer.find("Tempo/AutomationTarget").get("Id"))
    sig_id = int(mixer.find("TimeSignature/AutomationTarget").get("Id"))
    envs = {int(value(e, "EnvelopeTarget/PointeeId")): e for e in master.find("AutomationEnvelopes/Envelopes")}
    check(set(envs) == {tempo_id, sig_id}, "the main track's envelopes are Tempo and TimeSignature")
    tempo_events = [(e.tag, float(e.get("Time")), float(e.get("Value")), int(e.get("Id"))) for e in envs[tempo_id].find("Automation/Events")]
    sig_events = [(e.tag, float(e.get("Time")), int(e.get("Value")), int(e.get("Id"))) for e in envs[sig_id].find("Automation/Events")]
    event_ids = [e[3] for e in tempo_events + sig_events]
    check(len(event_ids) == len(set(event_ids)), "duplicate automation event ids")
    check(all(e[0] == "FloatEvent" for e in tempo_events), "tempo events are FloatEvents")
    check(all(e[0] == "EnumEvent" for e in sig_events), "signature events are EnumEvents")
    check(tempo_events[0][1] == ENVELOPE_START and sig_events[0][1] == ENVELOPE_START, "first event at -63072000")
    times = [e[1] for e in tempo_events]
    check(times == sorted(times), "tempo events not in time order")
    check(all(20 <= e[2] <= 999 for e in tempo_events), "tempo outside 20-999")
    check(float(value(mixer, "Tempo/Manual")) == tempo_events[0][2], "Tempo Manual differs from the first point")
    check(int(value(mixer, "TimeSignature/Manual")) == sig_events[0][2], "TimeSignature Manual differs from the first point")
    for _, _, code, _ in sig_events:
        check(code % 99 + 1 <= 99 and code // 99 <= 4, f"time signature code {code}")
    # Steps: after the first point, the events come in pairs at the same time (old value, new value).
    pairs = tempo_events[1:]
    check(len(pairs) % 2 == 0, "tempo events not in pairs")
    for i in range(0, len(pairs), 2):
        check(pairs[i][1] == pairs[i + 1][1], f"tempo step at {pairs[i][1]} is not vertical")
        before = tempo_events[0][2] if i == 0 else pairs[i - 1][2]
        check(pairs[i][2] == before, f"tempo step at {pairs[i][1]} does not start from the value in force")
        check(abs(pairs[i][1] * 4 - round(pairs[i][1] * 4)) < 1e-9, f"tempo step at {pairs[i][1]} is not on a sixteenth")

    locs = ls.find("Locators/Locators")
    locators = [(float(value(l, "Time")), value(l, "Name")) for l in locs]
    check([l[0] for l in locators] == sorted(l[0] for l in locators), "locators not sorted")

    print(json.dumps({
        "errors": errors,
        "scenes": scenes,
        "nextPointeeId": nxt,
        "pointeeIds": len(ids),
        "tracks": tracks,
        "tempo": [[e[1], e[2]] for e in tempo_events],
        "signatures": [[e[1], e[2]] for e in sig_events],
        "locators": locators,
        "elements": sum(1 for _ in root.iter()),
    }))


if __name__ == "__main__":
    main(sys.argv[1])
