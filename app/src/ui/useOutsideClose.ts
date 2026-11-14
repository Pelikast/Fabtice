import { useEffect, type RefObject } from 'react';

/**
 * Calls `onClose` when the user presses outside every element of `refs`
 * (the panel and the button that opens it). `ignore`: a CSS selector of other
 * elements that open the same panel (a press on them toggles it instead).
 */
export function useOutsideClose(open: boolean, refs: RefObject<HTMLElement | null>[], onClose: () => void, ignore?: string): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && refs.some((r) => r.current?.contains(target))) return;
      if (ignore && target instanceof Element && target.closest(ignore)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, refs, onClose, ignore]);
}
