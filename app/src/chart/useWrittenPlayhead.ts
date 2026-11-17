// « Suivi intelligent » of the simplified chart: the written bar that corresponds to the audio is filled by the same
// ember hairline as the playing bar of the full chart (`usePlayheadBar`: straight in the DOM, driven by the app's
// frame loop), the played bar being mapped through `chart.places`; and while a written bar that is played several times
// plays, the heading of its block says which time it is (« 2ᵉ fois », « reprise 3/6 »), in ink-soft small text.
// A played bar that is not written highlights nothing.

import { useRef, type RefObject } from 'react';
import { getEngine } from '../audio';
import { t } from '../i18n';
import { appStore } from '../store/store';
import type { SimplifiedChart } from '../structure';
import { useFrame } from '../ui/frameLoop';
import { barProgress } from './layout';
import { placeOf, repeatTag, type RepeatTag } from './simplifiedLayout';

/** The words of the repeat tag. */
export function repeatTagText(tag: RepeatTag | null): string {
  if (!tag) return '';
  if (tag.kind === 'of') return t('simplified.tagOf', { n: tag.n, total: tag.total });
  return tag.n === 1 ? t('simplified.tagFirst') : t('simplified.tagNth', { n: tag.n });
}

/** Marks, inside `root`, the `[data-ecrite]` cell of the written bar being played, and tags its block. */
export function useWrittenPlayhead(root: RefObject<HTMLElement | null>, chart: SimplifiedChart): void {
  const current = useRef<{ el: HTMLElement | null; written: number; progress: number; tag: HTMLElement | null; tagKey: string }>({ el: null, written: -1, progress: -1, tag: null, tagKey: '' });
  useFrame(() => {
    const host = root.current;
    if (!host) return;
    const { tempoMap, project } = appStore.getState();
    if (!project) return;
    const { bar, progress } = barProgress(tempoMap, getEngine().getPosition());
    const place = placeOf(chart, bar);
    const c = current.current;
    const written = place ? place.written : -1;
    // The cell may have been re-rendered: look it up again when the written bar changes or it left the DOM.
    if (written !== c.written || (written >= 0 && (!c.el || !c.el.isConnected))) {
      c.el?.classList.remove('jouee');
      c.el?.removeAttribute('data-passe');
      c.el = written >= 0 ? host.querySelector<HTMLElement>(`[data-ecrite="${written}"]`) : null;
      c.el?.classList.add('jouee');
      c.written = written;
      c.progress = -1;
    } else if (c.el && !c.el.classList.contains('jouee')) {
      // React rewrote the cell's classes (loop changed): put the mark back.
      c.el.classList.add('jouee');
    }
    if (c.el && place) {
      if (c.el.dataset.passe !== String(place.pass)) c.el.dataset.passe = String(place.pass);
      if (Math.abs(progress - c.progress) >= 0.002) {
        c.el.style.setProperty('--avance', progress.toFixed(3));
        c.progress = progress;
      }
    }
    // The tag, in the heading of the block that is playing.
    const text = repeatTagText(repeatTag(place));
    const key = `${c.el ? written : -1}:${text}`;
    if (key !== c.tagKey || (c.tag && !c.tag.isConnected)) {
      if (c.tag) {
        c.tag.textContent = '';
        c.tag.removeAttribute('data-fois');
      }
      c.tag = c.el ? (c.el.closest('.bloc')?.querySelector<HTMLElement>('.bloc-fois') ?? null) : null;
      if (c.tag && text) {
        c.tag.textContent = text;
        c.tag.dataset.fois = String(place!.pass);
      }
      c.tagKey = key;
    }
  });
}
