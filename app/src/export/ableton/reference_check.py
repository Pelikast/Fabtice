"""Reads an .als written by Fabtice with independent, published readers of the format.

Development tool, never a dependency of the app: run by ableton.reference.test.ts
when ALS_REFERENCE_PYTHON points at a Python that has them (see that file).

    python -I reference_check.py set.als project_folder expected.json  ->  one JSON line

- abletoolz (MPL-2.0, PyPI): parses the set; reads its version, tempo, time
  signatures, tracks and sample references (and whether each file is found in
  the project folder); checks Live's loader rule on warp markers; and carries
  Live's own schemas (the class members of every MinorVersion, extracted from
  Live 12.4.7) and a census of 1 389 sets saved by Live 9.0.1 to 12.4.15: every
  element of the file is walked against the schema of 11.0_433 and against the
  release where the census first saw it (nothing newer than 11.0.0 may appear:
  Live refuses a set over one unknown element or attribute).
- dawtool (BSD-3-Clause, GitHub): computes the time in seconds of every locator
  from the tempo automation, with its reimplementation of Live's timeline
  (tempo read sixteenth by sixteenth).
- fastcrc (MIT, PyPI, a dependency of abletoolz): Live's file checksum.
"""

import gzip
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter

TARGET_MINOR = "11.0_433"
TARGET_RELEASE = (11, 0, 0)
GENERIC = re.compile(r"^\w+<(\w+)>$")
NUMBERED = re.compile(r"^(.*)\.(\d+)$")


def schema_walk(root):
    """Elements the schema of 11.0_433 does not declare, or the census first saw after 11.0.0."""
    from abletoolz.schema import structure
    from abletoolz.schema.live_schemas import live_schemas

    schemas = live_schemas()
    problems = Counter()
    checked = Counter()

    def newer(parent, child):
        folded = NUMBERED.sub(r"\1.{n}", child.tag)
        first = structure.NEWER_CHILDREN.get(parent.tag, {}).get(folded)
        if first is not None and first > TARGET_RELEASE:
            problems[f"child {parent.tag}/{child.tag} first written by Live {first}"] += 1
        for a in child.attrib:
            fa = structure.NEWER_ATTRIBUTES.get(child.tag, {}).get(a)
            if fa is not None and fa > TARGET_RELEASE:
                problems[f"attribute {child.tag}@{a} first written by Live {fa}"] += 1

    def visit(el, cls):
        for child in el:
            newer(el, child)
            if cls is None:
                visit_list_item(child)
                continue
            kind = schemas.member_type(TARGET_MINOR, cls, child.tag)
            if kind is None and NUMBERED.match(child.tag):
                kind = schemas.member_type(TARGET_MINOR, cls, NUMBERED.match(child.tag).group(1) + ".0")
            if kind is None:
                problems[f"member {cls}/{child.tag} not declared by {TARGET_MINOR}"] += 1
                continue
            checked[cls] += 1
            generic = GENERIC.match(kind)
            if generic or not schemas.declares_class(TARGET_MINOR, kind):
                for item in child:
                    newer(child, item)
                    visit_list_item(item)
            else:
                visit(child, kind)

    def visit_list_item(item):
        if schemas.declares_class(TARGET_MINOR, item.tag):
            visit(item, item.tag)
        elif len(item):
            # An untyped holder (a value slot): its children name their own class.
            for c in item:
                newer(item, c)
                visit_list_item(c)

    visit(root.find("LiveSet"), "LiveSet")
    return dict(problems), sum(checked.values())


def missing_members(root):
    """Members the schema declares that the file leaves out, per class (Live fills its defaults: reported, not refused)."""
    from abletoolz.schema.live_schemas import live_schemas

    schemas = live_schemas()
    out = {}
    for tag in ("LiveSet", "AudioTrack", "MasterTrack", "PreHearTrack", "AudioClip", "SampleRef", "FileRef", "Locator", "Scene", "Transport", "Mixer"):
        declared = schemas.members_of(TARGET_MINOR, tag) or frozenset()
        for el in root.iter(tag):
            present = {c.tag for c in el}
            gone = sorted(m for m in declared if m not in present)
            if gone:
                out[tag] = gone
            break
    return out


def abletoolz_read(path, project):
    from abletoolz.formats import live_document
    from abletoolz.live_set.document import AbletonSet

    root = live_document.read(path)
    live_document.validate(root)  # Live's loader rule: warp markers even when the clip is not warped
    s = AbletonSet.from_root(root, path, project_root=project)
    s.load_version()
    refs = list(s.samples.iterate())
    return root, {
        "version": list(s.version_tuple),
        "bpm": s.transport.bpm(),
        "meters": [[beat, m.numerator, m.denominator] for beat, m in s.transport.meters()],
        "tracks": [[t.track_root.tag, t.name] for t in s.tracks.load()],
        "samples": [{"relative": str(r.relative), "absolute": str(r.absolute) if r.absolute else None, "resolution": str(r.resolution), "size": r.size, "crc": r.crc} for r in refs],
    }


def dawtool_read(path):
    import dawtool

    with open(path, "rb") as f:
        proj = dawtool.load_project(str(path), f)
        proj.parse()
    return {
        "markers": [[m.time, m.text] for m in proj.markers],
        "tempoEvents": [[e.beat, e.bpm] for e in proj.tempo_automation_events],
    }


def main(als, project, expected_path):
    path = pathlib.Path(als)
    project = pathlib.Path(project)
    expected = json.load(open(expected_path))
    root, toolz = abletoolz_read(path, project)
    problems, walked = schema_walk(root)
    from fastcrc.crc16 import umts

    # Live checksums the first 16 384 bytes of a file (abletoolz.samples.crc.MAX_CRC_SIZE).
    crcs = [umts(bytes(b)[:16384]) for b in expected.get("crcInputs", [])]
    print(json.dumps({
        "abletoolz": toolz,
        "schemaProblems": problems,
        "walked": walked,
        "missingMembers": missing_members(root),
        "dawtool": dawtool_read(path),
        "fastcrc": crcs,
    }))


if __name__ == "__main__":
    main(*sys.argv[1:4])
