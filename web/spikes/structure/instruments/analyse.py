"""Confusions and the threshold curve, from the scores written by bench.py.

Usage: python analyse.py DATA_DIR --set synth [--model ced-tiny] [--threshold 0.6] [--curve]

The decision rule is the one of the app (`app/src/structure/instruments/decide.ts`):
mean of the window scores, the named groups compete, the margin between the best
and the second best named group is the confidence.
"""

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

WINDS = ["trumpet", "trombone", "saxophone", "clarinet", "flute"]
OTHERS = ["piano", "guitar", "vibraphone", "violin", "organ", "voice"]
NAMED = WINDS + OTHERS
SHORT = {"trumpet": "tpt", "trombone": "tbn", "saxophone": "sax", "clarinet": "cla", "flute": "flu", "piano": "pia",
         "guitar": "gui", "vibraphone": "vib", "violin": "vln", "organ": "org", "voice": "voi", "winds": "VENTS",
         None: "rien"}

# Defaults of the rule (the app's `DECISION` in decide.ts must hold the same values).
#   silence          below this score for every named group (and the wind families): nothing is played
#   threshold        margin needed to name a wind: 1 - (second best named score) / (best)
#   other_threshold  the same for a non-wind lead (piano, guitar, vibraphone, violin, organ, voice)
#   min_score        the best named score must also reach this (a weak top is never named)
#   winds_family     a non-wind top that is unsure still gives « Vents » when the wind evidence reaches
#                    this and half the top score
RULE = dict(silence=0.03, threshold=0.7, other_threshold=0.75, min_score=0.3, winds_family=0.15)


def decide(g, groups, rule=RULE):
    """g: [windows, groups] scores. Returns (answer, confidence); answer is a NAMED id, 'winds' or None."""
    m = np.asarray(g).mean(axis=0)
    s = {k: float(m[groups.index(k)]) for k in groups}
    named = np.array([s[k] for k in NAMED])
    if named.max() < rule["silence"] and max(s["brass"], s["woodwind"]) < rule["silence"]:
        return None, 0.0
    order = np.argsort(-named)
    i, j = int(order[0]), int(order[1])
    top = NAMED[i]
    margin = float(1 - named[j] / named[i])
    sure = named[i] >= rule["min_score"]
    wind_ev = max(max(s[k] for k in WINDS), s["brass"], s["woodwind"])
    if top in WINDS:
        return (top, margin) if sure and margin >= rule["threshold"] else ("winds", margin)
    if sure and margin >= rule["other_threshold"]:
        return top, margin
    if wind_ev >= rule["winds_family"] and wind_ev >= 0.5 * named[i]:
        return "winds", margin
    return None, margin


def load(data, set_, model):
    d = json.loads((data / "scores" / f"{set_}-{model}.json").read_text())
    return d["groups"], d["items"]


def summary(items, groups, rule):
    by = defaultdict(list)
    for it in items:
        a, c = decide(it["scores"], groups, rule)
        by[it["cond"]].append((it["truth"], a, c))
    return by


def stats(rows):
    named = [(t, a) for t, a, _ in rows if a in NAMED]
    wrong = sum(1 for t, a in named if a != t)
    winds_truth = [r for r in rows if r[0] in WINDS]
    return dict(
        n=len(rows),
        named=len(named),
        wrong=wrong,
        wrong_rate=wrong / len(named) if named else 0.0,
        winds_named_right=sum(1 for t, a, _ in winds_truth if a == t) / max(1, len(winds_truth)),
        winds_said_winds=sum(1 for t, a, _ in winds_truth if a == "winds") / max(1, len(winds_truth)),
        nonwind_said_winds=sum(1 for t, a, _ in rows if t not in WINDS and a == "winds") / max(1, sum(1 for r in rows if r[0] not in WINDS)),
    )


def confusion(rows):
    truths = [t for t in NAMED if any(r[0] == t for r in rows)]
    cols = NAMED + ["winds", None]
    c = Counter((t, a) for t, a, _ in rows)
    lines = ["vérité \\ réponse " + " ".join(f"{SHORT[a]:>5}" for a in cols)]
    for t in truths:
        lines.append(f"{SHORT[t]:>17} " + " ".join(f"{c[(t, a)] or '.':>5}" for a in cols))
    return "\n".join(lines)


def mixes(items, groups, rule):
    """IRMAS: the truth is every instrument heard ('piano+saxophone'). A name is wrong when that
    instrument is not heard; « Vents » is wrong when no wind is heard."""
    rows = [(set(it["truth"].split("+")), *decide(it["scores"], groups, rule)) for it in items]
    named = [(t, a) for t, a, _ in rows if a in NAMED]
    wrong = [(t, a) for t, a in named if a not in t]
    with_wind = [r for r in rows if r[0] & set(WINDS)]
    no_wind = [r for r in rows if not r[0] & set(WINDS)]
    print(f"{len(rows)} extraits ({len(with_wind)} avec un vent) : {len(named)} nommés, {len(wrong)} faux "
          f"({100 * len(wrong) / max(1, len(named)):.1f} %)")
    print(f"  avec un vent : vent juste {sum(1 for t, a, _ in with_wind if a in t and a in WINDS)}, "
          f"« Vents » {sum(1 for t, a, _ in with_wind if a == 'winds')}, autre vent (faux) "
          f"{sum(1 for t, a, _ in with_wind if a in WINDS and a not in t)}")
    print(f"  sans vent : un vent nommé (faux) {sum(1 for t, a, _ in no_wind if a in WINDS)}, "
          f"« Vents » (faux) {sum(1 for t, a, _ in no_wind if a == 'winds')}, sur {len(no_wind)}")
    for t, a in wrong:
        print("   faux :", "+".join(sorted(t)), "→", a)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("data", type=Path)
    ap.add_argument("--set", default="synth")
    ap.add_argument("--model", default="ced-tiny")
    ap.add_argument("--threshold", type=float, default=RULE["threshold"])
    ap.add_argument("--other", type=float, default=RULE["other_threshold"])
    ap.add_argument("--curve", action="store_true")
    ap.add_argument("--conf", action="store_true", help="print the confusion matrices")
    args = ap.parse_args()
    groups, items = load(args.data, args.set, args.model)
    rule = dict(RULE, threshold=args.threshold, other_threshold=args.other)
    if args.set == "irmas":
        return mixes(items, groups, rule)
    by = summary(items, groups, dict(rule, threshold=0.0, other_threshold=0.0))
    print(f"== {args.set} / {args.model}: sans seuil (le groupe le plus fort)")
    for cond, rows in sorted(by.items()):
        s = stats(rows)
        print(f"{cond:>14}: {s['n']:4d} extraits, {s['named']:4d} nommés, faux {100 * s['wrong_rate']:5.1f} %")
        if args.conf:
            print(confusion(rows))
    by = summary(items, groups, rule)
    print(f"== avec seuil {args.threshold} (vents), {args.other} (autres)")
    for cond, rows in sorted(by.items()):
        s = stats(rows)
        print(f"{cond:>14}: nommés {s['named']:4d}/{s['n']:4d}, faux {100 * s['wrong_rate']:5.1f} % ; vents bien nommés "
              f"{100 * s['winds_named_right']:5.1f} %, vents → « Vents » {100 * s['winds_said_winds']:5.1f} %, "
              f"autres → « Vents » {100 * s['nonwind_said_winds']:5.1f} %")
        if args.conf:
            print(confusion(rows))
    if args.curve:
        print("== courbe (toutes conditions) : seuil, part des vents nommés, part de faux parmi les nommés")
        for th in np.arange(0.3, 0.96, 0.05):
            r2 = dict(rule, threshold=float(th), other_threshold=max(float(th), args.other))
            by = summary(items, groups, r2)
            line = []
            for cond, rows in sorted(by.items()):
                s = stats(rows)
                line.append(f"{cond}: {100 * s['winds_named_right']:3.0f}/{100 * s['wrong_rate']:3.0f}")
            print(f"{th:.2f}  " + "  ".join(line))


if __name__ == "__main__":
    main()
