// « Réglages → Avancé → Grilles des standards » (C9): the chord charts of iReal Pro kept on this device, in
// place in the tab (no window of its own). The list of collections (name, style, tunes, source and the known
// licence, kept or not), one button per collection to download or remove it, « Vérifier les mises à jour de
// grilles », « Tout télécharger » while some are missing, and the import of a file exported from iReal Pro.
// What the download and the check do is `standards/offer.ts`; the message at start-up is `StandardsMessage`.

import { useRef, useState } from 'react';
import { formatNumber, t, type MessageKey } from '../../i18n';
import { fr } from '../../i18n/fr';
import type { CollectionSpec } from '../../standards/collections';
import { getCollectionList, isDownloadable, type StandardsStatus } from '../../standards/library';
import {
  cancelStandardsDownload,
  checkStandardsUpdates,
  dismissStandardsResult,
  downloadAllStandards,
  downloadOneStandard,
  importStandards,
  removeStandard,
  reportText,
  useStandards,
} from '../../standards/offer';
import { SubTitle } from './parts';
import { StandardsProgress } from '../StandardsProgress';

const formatCount = (n: number): string => formatNumber(n, 0);
const tunesText = (n: number): string => t(n === 1 ? 'standards.tunes.one' : 'standards.tunes.other', { n: new Intl.NumberFormat(t('meta.locale')).format(n) });

/** « Jazz, Standards »: the first two styles of a collection, in French (an unknown one is shown as it is written). */
function styleText(spec: CollectionSpec): string {
  return spec.genres
    .slice(0, 2)
    .map((g) => {
      const key = `standards.genre.${g}`;
      return key in fr ? t(key as MessageKey) : g;
    })
    .join(', ');
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

function dateText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat(t('meta.locale'), { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

type Kept = StandardsStatus['collections'][number];

/** One collection: what it is, whether it is kept, and its one button (download, or remove after a question). */
function CollectionRow({ spec, kept, name, busy }: { spec: CollectionSpec | null; kept: Kept | null; name: string; busy: boolean }) {
  const [asking, setAsking] = useState(false);
  const downloadable = spec !== null && isDownloadable(spec);
  const id = spec?.id ?? kept?.id ?? name;
  const detail = [
    spec ? styleText(spec) : '',
    kept ? tunesText(kept.tunes) : spec?.tunes != null ? tunesText(spec.tunes) : spec ? t('standards.tunesUnknown') : '',
    kept ? (kept.fromFile ? t('standards.keptFile') : t('standards.keptOn', { date: dateText(kept.date) })) : downloadable ? t('standards.notKept') : t('standards.webFileOnly'),
  ].filter(Boolean);
  return (
    <li className="recueil recueil-grille" data-id={id} data-garde={kept ? 'oui' : 'non'} data-downloadable={downloadable || kept !== null}>
      <div className="recueil-tete">
        <span className="recueil-nom">{name}</span>
        {kept && !asking && (
          <button type="button" className="lien discret" disabled={busy} data-testid="standards-retirer" aria-label={`${t('standards.rowRemove')} : ${name}`} onClick={() => setAsking(true)}>
            {t('standards.rowRemove')}
          </button>
        )}
        {!kept && downloadable && (
          <button type="button" className="lien discret" disabled={busy} data-testid="standards-telecharger" aria-label={`${t('standards.rowDownload')} : ${name}`} onClick={() => void downloadOneStandard(id)}>
            {t('standards.rowDownload')}
          </button>
        )}
      </div>
      <small className="recueil-detail">{detail.join(' · ')}</small>
      {spec && (
        <small className="recueil-source">
          {t('standards.sourceLine', { host: hostOf(spec.sourcePage), licence: spec.licence })}
        </small>
      )}
      {asking && (
        <div className="reprise-confirme" role="group" aria-label={t('standards.rowRemoveAsk', { name })}>
          <p>{t('standards.rowRemoveAsk', { name })}</p>
          <div className="reprise-actions">
            <button
              type="button"
              className="bouton-cadre"
              data-testid="standards-retirer-oui"
              onClick={() => {
                setAsking(false);
                void removeStandard(id);
              }}
            >
              {t('standards.rowRemoveYes')}
            </button>
            <button type="button" className="bouton-cadre" autoFocus onClick={() => setAsking(false)}>
              {t('standards.rowRemoveNo')}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** « Importer un fichier de grilles… »: an `.html` page or `.txt` file exported from iReal Pro, or saved from the forum. */
function FileImport() {
  const ref = useRef<HTMLInputElement>(null);
  const note = useStandards((s) => s.importNote);
  return (
    <div className="option option-colonne standards-fichier">
      <input
        ref={ref}
        type="file"
        accept=".html,.htm,.txt,text/html,text/plain"
        hidden
        data-testid="standards-fichier"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importStandards(file);
        }}
      />
      <button type="button" className="bouton-cadre" data-testid="standards-importer" onClick={() => ref.current?.click()}>
        {t('standards.importFile')}
      </button>
      <small>{t('standards.importWhere')}</small>
      {note && (
        <small className="standards-note" role="status" data-testid="standards-import-note">
          {note.kind === 'ok' ? t(note.tunes === 1 ? 'standards.importOk.one' : 'standards.importOk.other', { n: formatCount(note.tunes) }) : t(`standards.importError.${note.reason}`)}
        </small>
      )}
    </div>
  );
}

export function StandardsSection() {
  useStandards((s) => s.listVersion);
  const status = useStandards((s) => s.status);
  const run = useStandards((s) => s.run);
  const list = getCollectionList().list;
  const running = run.kind === 'running';
  const keptById = new Map((status?.collections ?? []).map((c) => [c.id, c]));
  const listed = new Set(list.collections.map((c) => c.id));
  // Kept collections that are not in the list (a file the user imported under its own name).
  const others = (status?.collections ?? []).filter((c) => !listed.has(c.id));
  const keptListed = list.collections.filter((c) => keptById.has(c.id)).length;
  const missing = list.collections.filter((c) => !keptById.has(c.id) && isDownloadable(c)).length;
  const total = status?.total ?? 0;
  return (
    <div className="grilles-standards" data-testid="standards-section">
      <SubTitle>{t('standards.title')}</SubTitle>
      <p className="panneau-note reglages-note">{t('standards.sectionNote')}</p>
      <div className="option option-colonne grilles-etat">
        <small data-testid="standards-etat">
          {total === 0 ? t('standards.summaryNone') : t(keptListed + others.length === 1 ? 'standards.summary.one' : 'standards.summary.other', { n: formatCount(keptListed + others.length), total: formatCount(list.collections.length), tunes: new Intl.NumberFormat(t('meta.locale')).format(total) })}
        </small>
        <div className="grilles-boutons">
          <button type="button" className="bouton-cadre" data-testid="standards-verifier" disabled={running} onClick={() => void checkStandardsUpdates()}>
            {t('standards.check')}
          </button>
          {missing > 0 && (
            <button type="button" className="bouton-cadre" data-testid="standards-tout" disabled={running} onClick={() => void downloadAllStandards('settings')}>
              {t('standards.downloadAll')}
            </button>
          )}
        </div>
        {run.kind === 'running' && (
          <>
            <StandardsProgress run={run} />
            <button type="button" className="lien discret" onClick={cancelStandardsDownload}>
              {t('standards.cancel')}
            </button>
          </>
        )}
        {run.kind === 'done' && (
          <div className="standards-resultat" role="status" data-testid="standards-resultat">
            <p>{reportText(run.report)}</p>
            <button type="button" className="lien discret" data-testid="standards-resultat-ok" onClick={dismissStandardsResult}>
              {t('standards.done')}
            </button>
          </div>
        )}
        {status && !status.persistent && total > 0 && <small>{t('standards.memoryOnly')}</small>}
      </div>
      <ul className="recueils" aria-label={t('standards.collections')} data-testid="standards-recueils">
        {list.collections.map((c) => (
          <CollectionRow key={c.id} spec={c} kept={keptById.get(c.id) ?? null} name={c.name} busy={running} />
        ))}
        {others.map((c) => (
          <CollectionRow key={c.id} spec={null} kept={c} name={c.name} busy={running} />
        ))}
      </ul>
      <FileImport />
    </div>
  );
}
