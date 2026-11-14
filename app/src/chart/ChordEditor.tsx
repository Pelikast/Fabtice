// The chord editor: a small window anchored to the bar (a sheet from the bottom
// on a phone). Every click is applied at once through the harmony actions, and
// what is typed is read in the key and instrument the chart is displayed in
// (`harmonyActions.ts` stores it at concert pitch in the original key).
//
// Fields, from the top: the bar and its chords, a doubt notice (with a
// one-click « C'est le bon accord »), a text field for typing a symbol, the
// twelve notes, the qualities written as on the chart, « Extension et basse »,
// then split / merge / no chord / remove / back to the analysis, and the
// section letter of the bar.

import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type KeyboardEvent, type RefObject } from 'react';
import { chordParts, extensionText } from '../harmony/chord';
import { displayChord, spellingKey } from '../harmony/display';
import { noteText } from '../harmony/pitch';
import { parseChord } from '../harmony/parse';
import { ChordPartsView, ChordSymbol, withAccidentals } from '../harmony/ChordSymbol';
import { formatBarNumber } from '../grid/format';
import { t, type MessageKey } from '../i18n';
import type { ChordExtension, ChordQuality, PitchClass } from '../model/harmony';
import { selectChartBars, selectDisplayContext } from '../store/chartSelectors';
import { confirmBar, mergeBar, removeChord, replaceChord, replaceDisplayedChord, resetBar, setSection, splitBar, writeChordText } from '../store/harmonyActions';
import { useApp } from '../store/store';
import { hasBarEdit, SECTION_LABEL_MAX } from './edits';
import { EXTENSION_CHOICES, noteChoices, patchChord, QUALITY_CHOICES, type EditorAction, type EditorState } from './editor';
import { chordGoingOn } from './layout';
import { placeEditor } from './editorPlacement';
import { CloseIcon } from '../ui/icons';

const SECTION_QUICK = ['A', 'B', 'C', 'D'];
const SHEET_QUERY = '(max-width: 760px)';

interface Props {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  grid: RefObject<HTMLElement | null>;
  scroller: RefObject<HTMLElement | null>;
  /** Closes the editor; `refocus`: the focus goes back to the chord. */
  onClose: (refocus: boolean) => void;
  /** A symbol was typed and applied: the chart moves on to the next chord. */
  onTyped: () => void;
}

export function ChordEditor({ state, dispatch, grid, scroller, onClose, onTyped }: Props) {
  const target = state.target!;
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const sectionField = useRef<HTMLInputElement>(null);
  const bars = useApp(selectChartBars);
  const ctx = useApp(selectDisplayContext);
  const edited = useApp((s) => hasBarEdit(s.corrections, s.tempoMap, target.bar));
  const bar = bars.find((b) => b.bar === target.bar);
  const chords = bar?.chords ?? [];
  const current = target.index >= 0 ? chords[target.index] : undefined;
  const going = chordGoingOn(bars, target.bar);
  // The chord the clicks start from, as stored: the one being edited, or the one that goes on in this bar.
  const base = current ? current.chord : going;
  const shown = base ? displayChord(base, ctx).chord : base;
  const fallbackRoot = ctx.key?.tonic ?? 0;
  const keyForSpelling = spellingKey(ctx);

  const [text, setText] = useState(state.seed);
  const [unknown, setUnknown] = useState(false);
  // Null until measured (hidden meanwhile); 'sheet' on a phone, where CSS places it.
  const [, setResized] = useState(0);
  const [placement, setPlacement] = useState<{ left: number; top: number } | 'sheet' | null>(null);

  // Another chord, another typed text.
  useEffect(() => {
    setText(state.seed);
    setUnknown(false);
  }, [target.bar, target.index, state.seed]);

  // The bar's chords changed under the editor (split, merge, removal, first chord of a bar that had none).
  useEffect(() => {
    dispatch({ type: 'fit', count: chords.length });
  }, [chords.length, dispatch]);

  // Where the focus goes when it opens.
  useEffect(() => {
    if (state.focus === 'field') {
      const f = field.current;
      if (f) {
        f.focus({ preventScroll: true });
        f.setSelectionRange(f.value.length, f.value.length);
      }
    } else if (state.focus === 'section') sectionField.current?.focus({ preventScroll: true });
    else root.current?.focus({ preventScroll: true });
  }, [target.bar, target.index, state.focus, state.seed]);

  // Anchored under the bar (or over it when there is no room); a phone gets a sheet and the bar scrolls clear of it.
  const placedFor = useRef<{ bar: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const host = grid.current;
    const sc = scroller.current;
    const pop = root.current;
    const cell = host?.querySelector<HTMLElement>(`[data-mesure="${target.bar}"]`);
    if (!host || !sc || !pop || !cell) return;
    const phone = window.matchMedia(SHEET_QUERY).matches;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Brought into view when it opens, moves to another bar, or grows (« Extension et basse »).
    // The height compared is the natural one (what it would be without a maximum), read without changing anything.
    const natural = pop.scrollHeight + pop.offsetHeight - pop.clientHeight;
    const first = placedFor.current?.bar !== target.bar || placedFor.current.height !== natural;
    placedFor.current = { bar: target.bar, height: natural };
    if (phone) {
      pop.style.removeProperty('max-height');
      pop.style.removeProperty('left');
      pop.style.removeProperty('top');
      host.style.setProperty('--editeur-bas', `${pop.offsetHeight}px`);
      if (first) {
        const overlap = cell.getBoundingClientRect().bottom + 12 - pop.getBoundingClientRect().top;
        const above = cell.getBoundingClientRect().top - sc.getBoundingClientRect().top;
        if (overlap > 0) sc.scrollBy({ top: overlap, behavior: smooth ? 'smooth' : 'auto' });
        else if (above < 0) sc.scrollBy({ top: above - 8, behavior: smooth ? 'smooth' : 'auto' });
      }
      setPlacement('sheet');
      return;
    }
    // On a window: measured at its natural height, then placed by `placeEditor` (under, over or beside the
    // bar, the sheet scrolled if needed, its own scrolling as a last resort) so that all of it and the bar are in view.
    if (!first) return;
    pop.style.maxHeight = 'none';
    const hostLeft = host.offsetLeft;
    const hostTop = host.offsetTop;
    const plan = placeEditor({
      view: { left: sc.scrollLeft, top: sc.scrollTop, width: sc.clientWidth, height: sc.clientHeight },
      cell: { left: hostLeft + cell.offsetLeft, top: hostTop + cell.offsetTop, width: cell.offsetWidth, height: cell.offsetHeight },
      size: { width: pop.offsetWidth, height: pop.offsetHeight },
    });
    const left = plan.left - hostLeft;
    const top = plan.top - hostTop;
    pop.style.maxHeight = plan.maxHeight === null ? '' : `${plan.maxHeight}px`;
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    setPlacement((p) => (p && p !== 'sheet' && p.left === left && p.top === top ? p : { left, top }));
    if (Math.abs(plan.scrollTop - sc.scrollTop) > 1) sc.scrollTo({ top: plan.scrollTop, behavior: smooth ? 'smooth' : 'auto' });
  });

  // A new window size means a new placement.
  useEffect(() => {
    const onResize = () => {
      placedFor.current = null;
      setResized((n) => n + 1);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Leaving the editor on the phone gives the room back.
  useEffect(() => {
    const host = grid.current;
    return () => {
      host?.style.removeProperty('--editeur-bas');
    };
  }, [grid]);

  // A press outside the window closes it (a press on a chord or a section letter moves it instead).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (root.current?.contains(el) || el.closest('.accord-case, .section, .cle-editeur')) return;
      onClose(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [onClose]);

  if (!bar) return null;
  const n = formatBarNumber(bar.bar);
  const index = target.index;

  const apply = (patch: Parameters<typeof patchChord>[1]) => replaceDisplayedChord(bar.bar, index, patchChord(shown, patch, fallbackRoot));
  const submit = () => {
    const value = text.trim();
    if (!value) return;
    if (!parseChord(value).ok) {
      setUnknown(true);
      return;
    }
    writeChordText(bar.bar, index, value);
    onTyped();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose(true);
    }
  };

  const noChord = current ? current.chord === null : false;
  const roots = noteChoices(ctx);
  const canSplit = chords.length < 2 && (chords.length > 0 || going !== undefined);
  const section = bar.section;

  return (
    <div
      ref={root}
      className="fenetre editeur"
      role="dialog"
      aria-label={t('editor.title', { n })}
      tabIndex={-1}
      // Until measured (in the same frame, before paint) it is transparent; `visibility: hidden` would refuse the focus.
      style={placement === null ? { opacity: 0 } : placement === 'sheet' ? undefined : { left: placement.left, top: placement.top }}
      data-testid="editeur"
      onKeyDown={onKeyDown}
    >
      <div className="editeur-tete">
        <h2 className="libelle">{t('editor.bar', { n })}</h2>
        {chords.length > 1 && (
          <div className="duo editeur-accords" role="group" aria-label={t('editor.chords')}>
            {chords.map((_, i) => (
              <button key={i} aria-pressed={i === index} onClick={() => dispatch({ type: 'select', index: i })}>
                {i + 1}
              </button>
            ))}
          </div>
        )}
        <span className="editeur-apercu" aria-hidden="true">
          {current ? <ChordSymbol chord={current.chord} ctx={ctx} /> : going ? <span className="continue"><ChordSymbol chord={going} ctx={ctx} /></span> : <span className="aucun">—</span>}
        </span>
        <button className="fermer" aria-label={t('editor.close')} onClick={() => onClose(true)}>
          <CloseIcon />
        </button>
      </div>

      {current?.doubtful && (
        <div className="editeur-doute" data-testid="editeur-doute">
          <p>{t('editor.doubtful')}</p>
          <button className="bouton-cadre" onClick={() => confirmBar(bar.bar)}>
            {t('editor.confirm')}
          </button>
          {current.alternatives.length > 0 && (
            <div className="editeur-autres">
              <span>{t('editor.alternatives')}</span>
              {current.alternatives.slice(0, 3).map((alt, i) => (
                <button key={i} className="puce" onClick={() => replaceChord(bar.bar, index, alt)}>
                  <ChordSymbol chord={alt} ctx={ctx} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {!current && going && <p className="editeur-note">{t('editor.goesOn')}</p>}

      <form
        className="editeur-saisie"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={field}
          type="text"
          value={text}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-label={t('editor.type')}
          aria-invalid={unknown}
          placeholder={t('editor.typePlaceholder')}
          onChange={(e) => {
            setText(e.target.value);
            setUnknown(false);
          }}
        />
      </form>
      {unknown && (
        <p className="editeur-erreur" role="alert">
          {t('editor.unknown')}
        </p>
      )}

      <Group label={t('editor.root')} columns={6} className="editeur-notes">
        {roots.map(({ pc, note }) => (
          <Choice key={pc} checked={shown?.root === pc} onPick={() => apply({ root: pc as PitchClass })}>
            {withAccidentals(noteText(note))}
          </Choice>
        ))}
      </Group>

      <Group label={t('editor.quality')} columns={4} className="editeur-natures">
        {QUALITY_CHOICES.map((q: ChordQuality) => (
          <Choice key={q} checked={shown?.quality === q} title={t(`quality.${q}` as MessageKey)} onPick={() => apply({ quality: q })}>
            <ChordPartsView parts={chordParts({ root: shown?.root ?? fallbackRoot, quality: q, extensions: [], bass: null }, { key: keyForSpelling, minor: ctx.minor })} />
          </Choice>
        ))}
      </Group>

      <button className="lien-encre editeur-plus" aria-expanded={state.more} onClick={() => dispatch({ type: 'more', open: !state.more })}>
        {t(state.more ? 'editor.less' : 'editor.more')}
      </button>
      {state.more && (
        <>
          <Group label={t('editor.extension')} columns={6} className="editeur-extensions" multi>
            {EXTENSION_CHOICES.map((x: ChordExtension) => (
              <Choice key={x} multi checked={shown?.extensions.includes(x) ?? false} onPick={() => apply({ toggle: x })}>
                {withAccidentals(extensionText(x))}
              </Choice>
            ))}
          </Group>
          <label className="editeur-basse">
            <span>{t('editor.bass')}</span>
            <select value={shown?.bass ?? ''} onChange={(e) => apply({ bass: e.target.value === '' ? null : Number(e.target.value) })}>
              <option value="">{t('editor.noBass')}</option>
              {roots.map(({ pc, note }) => (
                <option key={pc} value={pc}>
                  {noteText(note)}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      <div className="editeur-actions">
        <button className="bouton-cadre" aria-pressed={noChord} onClick={() => replaceChord(bar.bar, index, null)}>
          {t('editor.noChord')}
        </button>
        {chords.length >= 2 ? (
          <button className="bouton-cadre" onClick={() => mergeBar(bar.bar, Math.max(index, 0))}>
            {t('editor.merge')}
          </button>
        ) : (
          canSplit && (
            <button
              className="bouton-cadre"
              onClick={() => {
                splitBar(bar.bar);
                dispatch({ type: 'select', index: 1 });
              }}
            >
              {t('editor.split')}
            </button>
          )
        )}
        {current && (
          <button className="bouton-cadre" onClick={() => removeChord(bar.bar, index)}>
            {t('editor.remove')}
          </button>
        )}
        {edited && (
          <button className="bouton-cadre" onClick={() => resetBar(bar.bar)}>
            {t('editor.backToAnalysis')}
          </button>
        )}
      </div>

      <SectionRow
        key={bar.bar}
        bar={bar.bar}
        section={section}
        inputRef={sectionField}
        quick={SECTION_QUICK}
      />
    </div>
  );
}

// ---------------------------------------------------------------- small pieces

/** A group of single choices (or of switches), one tab stop, arrows to move. */
function Group({ label, columns, className, multi, children }: { label: string; columns: number; className: string; multi?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? columns : e.key === 'ArrowUp' ? -columns : 0;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : at + step;
    if (!step && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    items[Math.min(items.length - 1, Math.max(0, to))]?.focus();
  };
  // One tab stop: the chosen button, or the first.
  useLayoutEffect(() => {
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const chosen = items.findIndex((b) => b.getAttribute(multi ? 'aria-pressed' : 'aria-checked') === 'true');
    items.forEach((b, i) => (b.tabIndex = i === Math.max(0, chosen) ? 0 : -1));
  });
  return (
    <div ref={ref} className={`editeur-groupe ${className}`} role={multi ? 'group' : 'radiogroup'} aria-label={label} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}

function Choice({ checked, multi, title, onPick, children }: { checked: boolean; multi?: boolean; title?: string; onPick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="choix-accord"
      data-checked={checked}
      title={title}
      aria-label={title}
      {...(multi ? { 'aria-pressed': checked } : { role: 'radio', 'aria-checked': checked })}
      onClick={onPick}
    >
      {children}
    </button>
  );
}

/** The section letter of the bar: four quick letters, a free name (short), and removing it. */
function SectionRow({ bar, section, inputRef, quick }: { bar: number; section: string | null; inputRef: RefObject<HTMLInputElement | null>; quick: string[] }) {
  const [label, setLabel] = useState(section ?? '');
  useEffect(() => setLabel(section ?? ''), [section]);
  const commit = () => {
    const next = label.trim();
    if (next !== (section ?? '')) setSection(bar, next === '' ? null : next);
  };
  return (
    <div className="editeur-section">
      <span className="libelle">{t('editor.section')}</span>
      <div className="editeur-section-champs">
        {quick.map((q) => (
          <button key={q} className="puce puce-lettre" aria-pressed={section === q} onClick={() => setSection(bar, section === q ? null : q)}>
            {q}
          </button>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={label}
          maxLength={SECTION_LABEL_MAX}
          autoComplete="off"
          spellCheck={false}
          aria-label={t('editor.sectionName')}
          placeholder={t('editor.sectionPlaceholder')}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
        />
        {section !== null && (
          <button className="lien-encre" onClick={() => setSection(bar, null)}>
            {t('editor.sectionRemove')}
          </button>
        )}
      </div>
    </div>
  );
}
