"""Short corpus for the BS-RoFormer measurement: the first ~72 s of the busy pieces (ballads whole),
truth cut to the bars that end inside the cut in every condition. HTDemucs stems cut the same way.

Usage: BANC_DATA=<data> BANC_COURT=<short data> python3 -I banc/corpus-court.py
then BANC_DATA=<short data> node dist/separer.mjs --tool bs-roformer-sw ... and the variants."""
import json, os, subprocess, shutil

SRC = os.environ.get('BANC_DATA', 'data')
DST = os.environ.get('BANC_COURT', SRC + '-court')
CUT = {'blues-fa-swing': 72.0, 'tous-ces-trucs': 72.0, 'chorale-voix': None, 'ballade-cuivres': None}

os.makedirs(DST + '/corpus', exist_ok=True)
os.makedirs(DST + '/separes', exist_ok=True)
for link in ['modeles', 'recueils']:
    if not os.path.exists(f'{DST}/{link}'):
        os.symlink(f'{SRC}/{link}', f'{DST}/{link}')
os.makedirs(f'{SRC}/separes/bs-roformer-sw', exist_ok=True)
if not os.path.exists(f'{DST}/separes/bs-roformer-sw'):
    os.symlink(f'{SRC}/separes/bs-roformer-sw', f'{DST}/separes/bs-roformer-sw')


def cut(src, dst, secs):
    if os.path.exists(dst):
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if secs is None:
        shutil.copyfile(src, dst)
    else:
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-t', str(secs), dst], check=True)


for pid, secs in CUT.items():
    t = json.load(open(f'{SRC}/corpus/{pid}/truth.json'))
    if secs is not None:
        smax = max(c['timeScale'] for c in t['conditions'].values())
        bars = [b for b in t['bars'] if b['end'] * smax <= secs - 0.5]
        t['bars'] = bars
        last = bars[-1]['end']
        t['beats'] = [x for x in t['beats'] if x < last - 1e-6]
        t['duration'] = last
        t['sections'] = [s for s in t['sections'] if s['firstBar'] < len(bars)]
        for s in t['sections']:
            s['lastBar'] = min(s['lastBar'], len(bars) - 1)
    for cond, c in t['conditions'].items():
        for f in [c['mix']] + list(c['stems'].values()):
            cut(f'{SRC}/corpus/{pid}/{f}', f'{DST}/corpus/{pid}/{f}', secs)
        hd = f'{SRC}/separes/htdemucs-6s/{pid}/{cond}'
        if os.path.isdir(hd):
            for s in ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano']:
                cut(f'{hd}/{s}.flac', f'{DST}/separes/htdemucs-6s/{pid}/{cond}/{s}.flac', secs)
    json.dump(t, open(f'{DST}/corpus/{pid}/truth.json', 'w'))
    print(pid, len(t['bars']), 'bars', round(t['duration'], 1), 's')
