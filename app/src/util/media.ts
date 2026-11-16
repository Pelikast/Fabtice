import { useSyncExternalStore } from 'react';

/** Phone layout breakpoint (DESIGN.md « Téléphone »), mirrored in the CSS. */
export const PHONE_QUERY = '(max-width: 760px)';

export function isPhoneLayout(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches;
}

/** React hook on the phone layout: follows the window as it is resized or turned. */
export function usePhoneLayout(): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const query = window.matchMedia(PHONE_QUERY);
      query.addEventListener('change', notify);
      return () => query.removeEventListener('change', notify);
    },
    isPhoneLayout,
    () => false,
  );
}
