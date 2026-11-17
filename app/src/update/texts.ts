// The sentences of the update (C16), from the codes the Mac app sends (`desktop/src/updater.js`).

import { t } from '../i18n';
import { formatAmount } from '../import/amount';
import type { UpdateBlock, UpdateErrorCode, UpdateState } from '../platform/desktopBridge';
import type { BusyWork } from './updates';

const BLOCK_KEYS = {
  translocated: 'update.block.translocated',
  'read-only': 'update.block.readOnly',
  'not-writable': 'update.block.notWritable',
  'not-packaged': 'update.block.notPackaged',
  'not-mac': 'update.block.notPackaged',
  system: 'update.block.system',
} as const;

/** Why it cannot update itself from here, in one or two sentences. */
export function blockText(code: UpdateBlock, state: UpdateState): string {
  return t(BLOCK_KEYS[code] ?? 'update.block.notPackaged', {
    version: state.available?.version ?? '',
    minimum: state.blocked?.minimum ?? '',
    current: state.current,
  });
}

/** What went wrong, in one or two sentences. */
export function errorText(code: UpdateErrorCode, state: UpdateState): string {
  switch (code) {
    case 'network':
      return t('update.error.network');
    case 'server':
      return t('update.error.server');
    case 'unreadable':
      return t('update.error.unreadable');
    case 'damaged':
      return t('update.error.damaged');
    case 'download':
      return t('update.error.download');
    case 'disk-space':
      return t('update.error.diskSpace', { needed: formatAmount(state.room?.needed ?? (state.available?.size ?? 0) * 3) });
    case 'refused':
      return t('update.error.refused');
    case 'install':
      return t('update.error.install', { current: state.current });
    default:
      return blockText(code, state);
  }
}

/** The manual download is the way out: a block, or a failure that trying again may not mend. */
export function offersManual(state: UpdateState): boolean {
  if (state.blocked && state.blocked.code !== 'system') return true;
  const code = state.error?.code;
  return code === 'unreadable' || code === 'damaged' || code === 'install' || code === 'download' || (code !== undefined && code in BLOCK_KEYS && code !== 'system');
}

export function busyText(work: BusyWork): string {
  return t(`update.busy.${work}`);
}

/** « 38,2 Mo sur 120,4 Mo ». */
export function amountText(received: number, total: number): string {
  return t('update.amount', { received: formatAmount(received), total: formatAmount(total) });
}
