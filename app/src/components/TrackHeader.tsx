import type { CSSProperties } from 'react';
import { t } from '../i18n';
import type { Track } from '../model/project';
import { setTrackVolume, toggleMute, toggleSolo } from '../store/actions';

export function TrackHeader({ track, silenced }: { track: Track; silenced: boolean }) {
  const name = track.name;
  return (
    <div
      className={`piste-tete${silenced ? ' eteinte' : ''}`}
      data-track={track.id}
      style={{ '--teinte': `var(--${track.role})` } as CSSProperties}
    >
      <span className="pastille" />
      <span className="nom" title={name}>
        {name}
      </span>
      <span className="ms">
        <button className="muet" aria-pressed={track.mute} aria-label={t('track.mute', { name })} onClick={() => toggleMute(track.id)}>
          {t('track.muteShort')}
        </button>
        <button className="solo" aria-pressed={track.solo} aria-label={t('track.solo', { name })} onClick={() => toggleSolo(track.id)}>
          {t('track.soloShort')}
        </button>
      </span>
      <input
        className="volume"
        type="range"
        min={0}
        max={100}
        value={Math.round(track.volume * 100)}
        aria-label={t('track.volume', { name })}
        onChange={(e) => setTrackVolume(track.id, Number(e.target.value) / 100)}
      />
    </div>
  );
}
