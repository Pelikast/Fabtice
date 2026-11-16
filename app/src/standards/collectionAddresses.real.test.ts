// Online check of EVERY address of the collection list: each page is downloaded and read with the
// app's own reader (`readPage`, the code the Mac app runs), and the collection must give at least
// its `minTunes` tunes. Off unless FABTICE_COLLECTIONS_ONLINE=1 (it needs the network, so it is
// skipped on a machine that has none); the macOS build turns it on.
//
//   FABTICE_COLLECTIONS_ONLINE=1 FABTICE_COLLECTIONS_REPORT=/tmp/report.txt \
//     npx vitest run src/standards/collectionAddresses.real --silent=false
//
// One line per page of the report: collection, page address, HTTP status, tunes read. A collection
// marked `candidate` that gives nothing is only REPORTED (the list of failing addresses is printed and
// written at the end); a collection already in place that gives nothing fails the test.

import { appendFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bundledCollectionList, type CollectionPage, type CollectionSpec } from './collections';
import { readPage, type TextFetcher } from './library';

const online = process.env.FABTICE_COLLECTIONS_ONLINE === '1';
const reportFile = process.env.FABTICE_COLLECTIONS_REPORT;
const run = online ? describe : describe.skip;

const status = new Map<string, string>();

/** Plain Node fetch, redirects followed, the status of each address kept for the report. */
const fetchText: TextFetcher = async (url, signal) => {
  const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(60_000), redirect: 'follow', headers: { 'User-Agent': 'Fabtice' } });
  status.set(url, String(res.status));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
};

function log(line: string): void {
  console.log(line);
  if (reportFile) appendFileSync(reportFile, `${line}\n`);
}

interface Row {
  spec: CollectionSpec;
  page: CollectionPage;
  tunes: number;
  source: string | null;
  error: string | null;
}

run('collection addresses (online)', () => {
  const rows: Row[] = [];
  const list = bundledCollectionList();
  if (reportFile) writeFileSync(reportFile, `# collection addresses, ${new Date().toISOString()}\n# collection | page | http | tunes read (min) | role\n`);

  for (const spec of list.collections) {
    it(`${spec.id}: at least one page gives ${spec.minTunes} tunes`, async () => {
      let found = false;
      for (const page of spec.pages) {
        let tunes = 0;
        let source: string | null = null;
        let error: string | null = null;
        try {
          const r = await readPage(spec, page, fetchText);
          if (r) {
            tunes = r.tunes;
            source = r.source;
            found = true;
          } else error = 'nothing readable (login page, no link, wrong or truncated playlist)';
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
        rows.push({ spec, page, tunes, source, error });
        log(`${spec.id} | ${page.url} | HTTP ${status.get(page.url) ?? 'none'} | ${tunes} read (min ${spec.minTunes}) | ${spec.candidate ? 'candidate' : 'in place'}/${page.role}${source && source !== page.url ? ` | via ${source}` : ''}${error ? ` | ${error}` : ''}`);
        if (found) break;
      }
      if (!found) {
        const line = `FAILING ${spec.candidate ? 'candidate' : 'collection in place'}: ${spec.id}`;
        log(line);
        // A candidate is reported, not required; one already in place must work.
        if (!spec.candidate) expect.fail(`${spec.id}: no page of the collection gives ${spec.minTunes} tunes`);
      }
    }, 300_000);
  }

  it('summary: the addresses that fail', () => {
    const failing = list.collections.filter((c) => !rows.some((r) => r.spec === c && r.tunes >= c.minTunes));
    const candidates = failing.filter((c) => c.candidate).map((c) => c.id);
    const placed = failing.filter((c) => !c.candidate).map((c) => c.id);
    log(`SUMMARY: ${list.collections.length} collections, ${list.collections.length - failing.length} readable; failing candidates: [${candidates.join(', ')}]; failing in place: [${placed.join(', ')}]`);
    expect(placed).toEqual([]);
  });
});
