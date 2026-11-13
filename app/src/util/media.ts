/** Phone layout breakpoint (DESIGN.md « Téléphone »), mirrored in the CSS. */
export const PHONE_QUERY = '(max-width: 760px)';

export function isPhoneLayout(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches;
}
