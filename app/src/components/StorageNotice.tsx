import { t } from '../i18n';
import { setStorageNotice } from '../store/actions';
import { useApp } from '../store/store';

/**
 * A calm sentence when the open piece cannot be kept on this device (storage
 * blocked or full). The piece stays fully usable; the notice only says that
 * it will have to be opened again next time.
 */
export function StorageNotice() {
  const notice = useApp((s) => s.ui.storageNotice);
  if (!notice) return null;
  return (
    <div className="avis-stockage" role="status">
      <p>{t(`storage.${notice}`)}</p>
      <button className="bouton-cadre" onClick={() => setStorageNotice(null)}>
        {t('storage.dismiss')}
      </button>
    </div>
  );
}
