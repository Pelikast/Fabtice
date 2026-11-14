// « Tonalité de … » on the chart header: a click opens a small window to
// correct the key (tonic and major or minor), as the chart displays it, and to
// go back to the key the analysis found. The choice is stored in the original
// key (`setDisplayedKey`), so it stays right when the transposition or the
// instrument changes.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { keyLabel, keyTonicName, sameKey } from '../harmony/key';
import { noteText } from '../harmony/pitch';
import { withAccidentals } from '../harmony/ChordSymbol';
import { t } from '../i18n';
import type { Key, KeyMode } from '../model/harmony';
import { keyInForce, selectDisplayContext } from '../store/chartSelectors';
import { setDisplayedKey } from '../store/harmonyActions';
import { useApp } from '../store/store';
import { useFitPanel } from '../ui/useFitPanel';
import { transposeKey } from '../harmony/key';
import { useOutsideClose } from '../ui/useOutsideClose';
import { ChevronIcon } from '../ui/icons';
import { keyChoices } from './editor';

/** The key button of the header and the window it opens; `children` is the button's text. */
export function KeyEditor({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const refs = useRef([button, panel]).current;
  const close = useCallback(() => setOpen(false), []);
  useOutsideClose(open, refs, close);
  // The window lives in the title block (a `<p>` cannot hold a dialog), under the button.
  const [place, setPlace] = useState<{ host: HTMLElement; style: CSSProperties } | null>(null);
  useLayoutEffect(() => {
    const b = button.current;
    const host = b?.closest<HTMLElement>('.feuille-tete');
    if (!open || !b || !host) {
      setPlace(null);
      return;
    }
    const br = b.getBoundingClientRect();
    const hr = host.getBoundingClientRect();
    const width = Math.min(300, hr.width);
    setPlace({ host, style: { left: Math.max(0, Math.min(br.left - hr.left - 6, hr.width - width)), top: br.bottom - hr.top + 10 } });
  }, [open]);
  return (
    <span className="cle-ancre">
      <button
        ref={button}
        className="cle-bouton"
        aria-expanded={open}
        aria-haspopup="dialog"
        title={t('key.edit.hint')}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (open && e.key === 'Escape') {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        data-testid="cle-bouton"
      >
        <span>{children}</span>
        <ChevronIcon />
      </button>
      {open && place && createPortal(<KeyPanel ref={panel} style={place.style} onClose={() => { setOpen(false); button.current?.focus(); }} />, place.host)}
    </span>
  );
}

function KeyPanel({ ref, style, onClose }: { ref: React.Ref<HTMLDivElement>; style: CSSProperties; onClose: () => void }) {
  const self = useRef<HTMLDivElement | null>(null);
  // Our own handle on the element, and the parent's, then the one that keeps the window above the transport.
  const both = useCallback(
    (el: HTMLDivElement | null) => {
      self.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) (ref as { current: HTMLDivElement | null }).current = el;
    },
    [ref],
  );
  const fitRef = useFitPanel(both);
  // Focus goes into the window (so that Escape reaches it), on the chosen note.
  useEffect(() => {
    const chosen = self.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? self.current?.querySelector<HTMLElement>('button');
    chosen?.focus({ preventScroll: true });
  }, []);
  const ctx = useApp(selectDisplayContext);
  // A primitive: `keyInForce` makes a new object on every call.
  const origin = useApp((s) => keyInForce(s).origin);
  const analysed = useApp((s) => s.analysis?.key ?? null);
  const [mode, setMode] = useState<KeyMode>(ctx.key?.mode ?? 'major');
  const byHand = origin === 'manual';
  const shift = ctx.shift;
  // The analysed key as displayed.
  const analysedShown: Key | null = analysed ? transposeKey(analysed, shift) : null;
  return (
    <div
      ref={fitRef}
      className="fenetre cle-editeur"
      role="dialog"
      aria-label={t('key.edit.title')}
      data-testid="cle-editeur"
      style={style}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <h2 className="libelle">{t('key.edit.title')}</h2>
      <div className="duo cle-mode" role="group" aria-label={t('key.edit.mode')}>
        {(['major', 'minor'] as const).map((m) => (
          <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
            {t(m === 'major' ? 'key.edit.major' : 'key.edit.minor')}
          </button>
        ))}
      </div>
      <div className="cle-notes" role="radiogroup" aria-label={t('key.edit.tonic')}>
        {keyChoices(mode).map((k) => {
          const checked = ctx.key !== null && sameKey(ctx.key, k);
          return (
            <button
              key={k.tonic}
              className="choix-accord"
              role="radio"
              aria-checked={checked}
              data-checked={checked}
              onClick={() => {
                setDisplayedKey(k);
                onClose();
              }}
            >
              {withAccidentals(noteText(keyTonicName(k)))}
            </button>
          );
        })}
      </div>
      <p className="panneau-note">{byHand ? t('key.edit.byHand') : analysed ? t('key.edit.byAnalysis') : t('key.edit.none')}</p>
      {byHand && analysedShown && (
        <button
          className="bouton-cadre"
          onClick={() => {
            setDisplayedKey(null);
            onClose();
          }}
        >
          {t('key.edit.back', { key: keyLabel(analysedShown, ctx.minor) })}
        </button>
      )}
    </div>
  );
}
