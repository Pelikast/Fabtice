// « Changer de tonalité » / « Modifier la modulation » (C10): a small window, opened from the mark of a modulation
// (chart, ruler) or from the bar menu (`ui/keyDialog.ts`), to choose the key from this bar on (major or minor, the
// twelve notes, as the chart writes them: transposition and instrument applied), to move the modulation to another
// bar, to delete it, or to give the modulations back to the analysis. Every change is one undo step. On a phone it
// is a sheet at the bottom of the screen. Model: `PartDialog.tsx`; the pieces of the key window of the chart title
// (`chart/KeyEditor.tsx`) are reused.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from 'zustand';
import { keyChoices } from '../chart/editor';
import { chartBounds } from '../chart/structureDisplay';
import { sectionBar } from '../chart/layout';
import { keyLabel, keyTonicName, transposeKey } from '../harmony/key';
import { noteText } from '../harmony/pitch';
import { withAccidentals } from '../harmony/ChordSymbol';
import { t } from '../i18n';
import type { Key, KeyMode } from '../model/harmony';
import { keyInForce, selectChartBars, selectDisplayContext } from '../store/chartSelectors';
import { untransposeKeyForStorage } from '../store/harmonyActions';
import { removeKeyChange, resetKeyChanges } from '../store/keyActions';
import { keyChangesInForce } from '../store/keySelectors';
import { saveModulation } from '../store/modulationActions';
import { appStore, useApp } from '../store/store';
import { CloseIcon } from '../ui/icons';
import { closeKeyDialog, keyDialog } from '../ui/keyDialog';
import { checkModulation, keyBefore, modulationBarRange, type ModulationEnv } from '../ui/modulationForm';
import '../styles/modulationDialog.css';

export function ModulationDialog() {
  const at = useStore(keyDialog, (s) => s.at);
  if (!at) return null;
  return <ModulationBox key={at.bar} bar={at.bar} />;
}

/** How long the window ignores the pointer after it opens (the click that follows a tap). */
const OPENING_GUARD_MS = 350;
const FOCUSABLE = 'input:not(:disabled), select:not(:disabled), button:not(:disabled)';

/** What the window starts from: the piece as the window reads it, the modulation at the bar (if any). */
function startOf(bar: number): { env: ModulationEnv; editing: { time: number; key: Key } | null; shift: number } | null {
  const s = appStore.getState();
  const bounds = chartBounds(selectChartBars(s));
  if (!bounds || !s.project) return null;
  const list = keyChangesInForce(s);
  const env: ModulationEnv = { map: s.tempoMap, duration: s.project.duration, chart: bounds, main: keyInForce(s).key, list };
  const found = list.find((c) => sectionBar(s.tempoMap, c.time) === bar) ?? null;
  return { env, editing: found ? { time: found.time, key: found.key } : null, shift: selectDisplayContext(s).shift };
}

function ModulationBox({ bar }: { bar: number }) {
  const [start] = useState(() => startOf(bar));
  useEffect(() => {
    if (!start) closeKeyDialog();
  }, [start]);
  const minor = useApp((s) => s.settings.minorNotation);
  const byHand = useApp((s) => s.corrections.keyChanges !== null);
  const box = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const editing = start?.editing ?? null;
  const shift = start?.shift ?? 0;
  const initial = editing ? transposeKey(editing.key, shift) : null;
  const before = start ? keyBefore(start.env.map, start.env.main, start.env.list.filter((c) => editing === null || c.time !== editing.time), bar) : null;
  const [mode, setMode] = useState<KeyMode>(initial?.mode ?? before?.mode ?? 'major');
  const [tonic, setTonic] = useState<number | null>(initial?.tonic ?? null);
  const [barText, setBarText] = useState(String(bar + 1));
  // A tap on the mark opens the window under the finger: the click the browser sends after it must not press a key.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setArmed(true), OPENING_GUARD_MS);
    return () => window.clearTimeout(id);
  }, []);
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  useEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [opener]);

  if (!start) return null;
  const { env } = start;
  const chosen: Key | null = tonic === null ? null : { tonic, mode };
  // What is stored is the key of the original recording: what was picked is what the chart writes.
  const stored = chosen ? untransposeKeyForStorage(chosen, appStore.getState()) : null;
  const check = stored ? checkModulation(env, { barText, key: stored, editing: editing?.time ?? null }) : null;
  const range = modulationBarRange(env.chart);
  const problem = check && !check.ok ? check.problem : null;
  const beforeShown = before ? withAccidentals(keyLabel(transposeKey(before, shift), minor)) : null;

  const confirm = () => {
    if (!check || !check.ok || !stored) return;
    saveModulation(editing?.time ?? null, check.time, stored);
    closeKeyDialog();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Space and Escape are this window's: they must not reach the shortcuts of the page behind it.
    if (e.key === ' ' || e.code === 'Space') e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeKeyDialog();
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing && target.tagName === 'INPUT') {
      e.preventDefault();
      confirm();
    } else if (e.key === 'Tab') {
      const items = [...(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      const edge = e.shiftKey ? items[0] : items[items.length - 1];
      if (target === edge) {
        e.preventDefault();
        (e.shiftKey ? items[items.length - 1] : items[0])?.focus();
      }
    }
  };

  return (
    <div
      className="voile ouverte voile-modulation"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modulation-titre"
      data-testid="modulation-dialogue"
      style={armed ? undefined : { pointerEvents: 'none' }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) closeKeyDialog();
      }}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.code === 'Space') e.stopPropagation();
      }}
    >
      <div className="accueil fenetre-modulation" ref={box}>
        <div className="accueil-entete">
          <h2 id="modulation-titre">{t(editing ? 'modulationDialog.title.edit' : 'modulationDialog.title.add')}</h2>
          <button className="fermer" aria-label={t('modulationDialog.close')} onClick={closeKeyDialog}>
            <CloseIcon />
          </button>
        </div>
        {beforeShown && (
          <p className="modulation-avant" data-testid="modulation-avant">
            {t('modulationDialog.before')}
            {beforeShown}
          </p>
        )}

        <div className="modulation-groupe">
          <span className="libelle">{t('modulationDialog.key')}</span>
          <div className="duo cle-mode" role="group" aria-label={t('modulationDialog.mode')}>
            {(['major', 'minor'] as const).map((m, i) => (
              <button key={m} ref={i === 0 ? firstRef : undefined} aria-pressed={mode === m} data-testid={`modulation-mode-${m}`} onClick={() => setMode(m)}>
                {t(m === 'major' ? 'modulationDialog.major' : 'modulationDialog.minor')}
              </button>
            ))}
          </div>
          <div className="cle-notes" role="radiogroup" aria-label={t('modulationDialog.tonic')}>
            {keyChoices(mode).map((k) => {
              const checked = tonic === k.tonic;
              return (
                <button key={k.tonic} className="choix-accord" role="radio" aria-checked={checked} data-checked={checked} data-testid={`modulation-note-${k.tonic}`} onClick={() => setTonic(k.tonic)}>
                  {withAccidentals(noteText(keyTonicName(k)))}
                </button>
              );
            })}
          </div>
        </div>

        <div className="modulation-groupe">
          <label className="modulation-barre">
            <span className="libelle">{t('modulationDialog.bar')}</span>
            <input type="text" inputMode="numeric" autoComplete="off" maxLength={5} value={barText} aria-invalid={problem === 'bar' || problem === 'taken'} data-testid="modulation-mesure" onChange={(e) => setBarText(e.target.value)} onFocus={(e) => e.target.select()} />
          </label>
        </div>
        <p className="modulation-erreur" role="status" data-testid="modulation-erreur">
          {problem === 'same'
            ? t('modulationDialog.same')
            : problem === 'taken'
              ? t('modulationDialog.taken')
              : problem === 'bar'
                ? range
                  ? t('modulationDialog.barInvalid', { min: range.min, max: range.max })
                  : ''
                : ''}
        </p>
        {editing && <p className="modulation-origine">{t(byHand ? 'modulationDialog.byHand' : 'modulationDialog.byAnalysis')}</p>}

        <div className="modulation-liens">
          {editing && (
            <button
              className="lien-encre"
              data-testid="modulation-supprimer"
              onClick={() => {
                removeKeyChange(editing.time);
                closeKeyDialog();
              }}
            >
              {t('modulationDialog.remove')}
            </button>
          )}
          {byHand && (
            <button
              className="lien-encre"
              data-testid="modulation-revenir"
              onClick={() => {
                resetKeyChanges();
                closeKeyDialog();
              }}
            >
              {t('modulationDialog.reset')}
            </button>
          )}
        </div>

        <div className="import-actions">
          <button className="bouton-cadre" data-testid="modulation-annuler" onClick={closeKeyDialog}>
            {t('modulationDialog.cancel')}
          </button>
          <button className="plein" data-testid="modulation-valider" disabled={!check || !check.ok} onClick={confirm}>
            {t(editing ? 'modulationDialog.confirmEdit' : 'modulationDialog.confirmAdd')}
          </button>
        </div>
      </div>
    </div>
  );
}
