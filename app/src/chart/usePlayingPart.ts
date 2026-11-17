// The part being played, quietly marked in the structure list while the
// piece plays (an ink bar and a bolder name: the ember stays with the play
// button and the playhead). Driven by the app's frame loop and written straight
// in the DOM as `data-jouee` on the part's row, like the current bar of the
// chart (`usePlayheadBar`): the position never goes through React.

import { useRef, type RefObject } from 'react';
import { getEngine } from '../audio';
import { appStore } from '../store/store';
import { partAt } from '../store/structureSelectors';
import { useFrame } from '../ui/frameLoop';

/** Marks, inside `root`, the `[data-part]` row of the part heard at the playhead. */
export function usePlayingPart(root: RefObject<HTMLElement | null>): void {
  const current = useRef<{ id: string | null; el: HTMLElement | null }>({ id: null, el: null });
  useFrame(() => {
    const host = root.current;
    if (!host) return;
    const s = appStore.getState();
    const id = s.project ? (partAt(s, getEngine().getPosition())?.id ?? null) : null;
    const c = current.current;
    if (id === c.id && (id === null || c.el?.isConnected)) return;
    c.el?.removeAttribute('data-jouee');
    c.id = id;
    c.el = id === null ? null : ([...host.querySelectorAll<HTMLElement>('[data-part]')].find((el) => el.dataset.part === id) ?? null);
    c.el?.setAttribute('data-jouee', '');
  });
}
