// How much has been received, in plain French (« 12,4 Mo reçus »).

import { formatNumber } from '../i18n';

/** « 640 ko » below a megabyte, « 12,4 Mo » above, « 1,3 Go » beyond a gigabyte. */
export function formatAmount(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} ko`;
  if (bytes < 1_000_000_000) return `${formatNumber(bytes / 1_000_000, 1)} Mo`;
  return `${formatNumber(bytes / 1_000_000_000, 1)} Go`;
}
