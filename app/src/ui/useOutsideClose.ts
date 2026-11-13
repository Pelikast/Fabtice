import { useEffect, type RefObject } from 'react';

/**
 * Calls `onClose` when the user presses outside every element of `refs`
 * (the panel and the button that opens it).
 */
export function useOutsideClose(open: boolean, refs: RefObject<HTMLElement | null>[], onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && refs.some((r) => r.current?.contains(target))) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, refs, onClose]);
}
