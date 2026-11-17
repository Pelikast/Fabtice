// « Repères » (lot 4): the button next to the loop in the transport and its
// panel. Plain use needs no reading: « Garder cette boucle », then a press
// on a name brings the loop back. Renaming, moving and deleting wait behind
// « Modifier ». Sections are the chord chart's letters (one notion): they
// are listed, looped, added here, renamed and deleted, and the chart shows
// the same.

import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { formatLoop } from '../grid/loopText';
import { t } from '../i18n';
import { loopWithRegion, sectionRanges } from '../markers/markers';
import { SECTION_LABEL_MAX } from '../chart/edits';
import { MARKER_NAME_MAX, type NamedLoop } from '../model/markers';
import { closePanel, togglePanel } from '../store/actions';
import {
  addSection,
  deleteLoop,
  deleteSection,
  moveLoop,
  recallLoop,
  recallSection,
  renameLoop,
  renameSection,
  saveCurrentLoop,
} from '../store/markerActions';
import { useApp } from '../store/store';
import { sectionsInForce } from '../store/structureSelectors';
import { MarkerIcon } from '../ui/icons';
import { useFitPanel } from '../ui/useFitPanel';
import { useOutsideClose } from '../ui/useOutsideClose';

/** The transport's « Repères » button, beside the loop. */
export function MarkersControl() {
  const open = useApp((s) => s.ui.panel === 'markers');
  const hasProject = useApp((s) => s.project !== null);
  const count = useApp((s) => s.markers.loops.length + sectionsInForce(s).length);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const refs = useRef([buttonRef, panelRef]).current;
  // the ruler's « Repères » head opens the same panel: a press there toggles it instead of closing it
  useOutsideClose(open, refs, useCallback(() => closePanel(), []), '[data-panneau="markers"]');
  return (
    <div className="reperes-ancre">
      <button
        ref={buttonRef}
        className="rond reperes-bouton"
        data-testid="reperes"
        aria-label={t('markers.open')}
        title={t('markers.button')}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={!hasProject}
        onClick={() => togglePanel('markers')}
      >
        <MarkerIcon />
        {count > 0 && <span className="reperes-nombre" aria-hidden="true" />}
      </button>
      {open && <MarkersPanel ref={panelRef} />}
    </div>
  );
}

/** Up and down arrows move between the buttons of a list (keyboard use). */
function onListKeys(e: KeyboardEvent<HTMLElement>): void {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-rappel]')];
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  e.preventDefault();
  items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
}

function MarkersPanel({ ref }: { ref: Ref<HTMLDivElement> }) {
  const [editing, setEditing] = useState(false);
  const fitRef = useFitPanel(ref, true);
  return (
    <div ref={fitRef} className="fenetre panneau-reperes" role="dialog" aria-label={t('markers.title')} data-testid="panneau-reperes">
      <div className="metro-tete">
        <h2 className="libelle">{t('markers.title')}</h2>
        <button className="lien" data-testid="reperes-modifier" aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
          {editing ? t('markers.done') : t('markers.edit')}
        </button>
      </div>
      <LoopList editing={editing} />
      <SectionList editing={editing} />
    </div>
  );
}

function LoopList({ editing }: { editing: boolean }) {
  const loops = useApp((s) => s.markers.loops);
  const region = useApp((s) => s.loop.region);
  const enabled = useApp((s) => s.loop.enabled);
  const map = useApp((s) => s.tempoMap);
  const markers = useApp((s) => s.markers);
  const kept = loopWithRegion(markers, region);
  return (
    <section className="reperes-groupe" aria-labelledby="reperes-boucles">
      <h3 id="reperes-boucles" className="metro-nom">
        {t('markers.loops')}
      </h3>
      {kept ? (
        <p className="panneau-note">{t('markers.kept', { name: kept.name })}</p>
      ) : (
        <button className="bouton-cadre" data-testid="garder-boucle" disabled={!region} title={region ? undefined : t('markers.noLoop')} onClick={() => saveCurrentLoop()}>
          {t('markers.keep')}
        </button>
      )}
      {loops.length === 0 ? (
        <p className="panneau-note">{region ? t('markers.noLoops') : t('markers.noLoop')}</p>
      ) : (
        <ul className="reperes-liste" data-testid="liste-boucles" onKeyDown={onListKeys}>
          {loops.map((l, i) => (
            <LoopRow key={l.id} loop={l} first={i === 0} last={i === loops.length - 1} editing={editing} bars={formatLoop(map, l.region).text} current={enabled && kept?.id === l.id} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LoopRow({ loop, first, last, editing, bars, current }: { loop: NamedLoop; first: boolean; last: boolean; editing: boolean; bars: string; current: boolean }) {
  if (!editing) {
    return (
      <li>
        <button className="repere-rappel" data-rappel aria-current={current || undefined} aria-label={t('markers.recall', { name: loop.name, bars: t('markers.bars', { bars }) })} onClick={() => recallLoop(loop.id)}>
          <span className="repere-nom">{loop.name}</span>
          <span className="repere-mesures">{bars}</span>
        </button>
      </li>
    );
  }
  return (
    <li className="repere-edition">
      <NameField value={loop.name} max={MARKER_NAME_MAX} label={t('markers.rename', { name: loop.name })} onCommit={(v) => renameLoop(loop.id, v)} />
      <button className="petit" aria-label={t('markers.up', { name: loop.name })} disabled={first} onClick={() => moveLoop(loop.id, -1)}>
        ↑
      </button>
      <button className="petit" aria-label={t('markers.down', { name: loop.name })} disabled={last} onClick={() => moveLoop(loop.id, 1)}>
        ↓
      </button>
      <button className="petit" aria-label={t('markers.delete', { name: loop.name })} onClick={() => deleteLoop(loop.id)}>
        ×
      </button>
    </li>
  );
}

function SectionList({ editing }: { editing: boolean }) {
  const map = useApp((s) => s.tempoMap);
  const sections = useApp(sectionsInForce);
  const duration = useApp((s) => s.project?.duration ?? 0);
  const region = useApp((s) => (s.loop.enabled ? s.loop.region : null));
  const ranges = useMemo(() => sectionRanges(map, sections, duration), [map, sections, duration]);
  return (
    <section className="reperes-groupe" aria-labelledby="reperes-sections">
      <h3 id="reperes-sections" className="metro-nom">
        {t('markers.sections')}
      </h3>
      {ranges.length === 0 ? (
        <p className="panneau-note">{t('markers.noSections')}</p>
      ) : (
        <ul className="reperes-liste" data-testid="liste-sections" onKeyDown={onListKeys}>
          {ranges.map((r) => {
            const bars = formatLoop(map, r).text;
            const current = region !== null && Math.abs(region.start - r.start) < 1e-6 && Math.abs(region.end - r.end) < 1e-6;
            return editing ? (
              <li key={r.bar} className="repere-edition">
                <NameField value={r.label} max={SECTION_LABEL_MAX} label={t('markers.renameSection', { name: r.label })} onCommit={(v) => renameSection(r.bar, v)} />
                <button className="petit" aria-label={t('markers.deleteSection', { name: r.label })} onClick={() => deleteSection(r.bar)}>
                  ×
                </button>
              </li>
            ) : (
              <li key={r.bar}>
                <button className="repere-rappel" data-rappel aria-current={current || undefined} aria-label={t('markers.recallSection', { name: r.label, bars: t('markers.bars', { bars }) })} onClick={() => recallSection(r.bar)}>
                  <span className="repere-section">{r.label}</span>
                  <span className="repere-mesures">{bars}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button className="lien reperes-ajout" data-testid="nouvelle-section" title={t('markers.addSectionHint')} onClick={() => addSection()}>
        {t('markers.addSection')}
      </button>
    </section>
  );
}

/** A name typed in place: kept on Enter or when the field is left, Escape gives the old one back. */
function NameField({ value, max, label, onCommit }: { value: string; max: number; label: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    if (draft.trim() && draft !== value) onCommit(draft);
    else setDraft(value);
  };
  return (
    <input
      className="repere-champ"
      value={draft}
      maxLength={max}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.stopPropagation();
          setDraft(value);
        }
      }}
    />
  );
}
