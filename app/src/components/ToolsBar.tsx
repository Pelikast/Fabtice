import { t } from '../i18n';
import { setAuto, setTrackHeight, setZoom, toggleSnap } from '../store/actions';
import { useApp } from '../store/store';
import { MagnetIcon, ZoomHIcon, ZoomVIcon } from '../ui/icons';
import { SLIDER_STEPS, TRACK_HEIGHT, scaleToSlider, sliderToScale } from '../view/zoom';

/** Magnet, Auto and the two zoom sliders, floating at the bottom right of the tracks. */
export function ToolsBar() {
  const snap = useApp((s) => s.view.snap);
  const auto = useApp((s) => s.view.auto);
  const pxPerSecond = useApp((s) => s.view.pxPerSecond);
  const trackHeight = useApp((s) => s.view.trackHeight);
  return (
    <div className="outils" role="toolbar" aria-label={t('tools.label')}>
      <button className="outil" aria-pressed={snap} aria-label={t('tools.magnet')} title={t('tools.magnetTitle')} onClick={toggleSnap}>
        <MagnetIcon />
      </button>
      <button className="outil outil-texte" aria-pressed={auto} title={t('tools.autoTitle')} onClick={() => setAuto(!auto)}>
        {t('tools.auto')}
      </button>
      <label className="zoom" title={t('tools.zoomH')}>
        <ZoomHIcon />
        <input
          type="range"
          min={0}
          max={SLIDER_STEPS}
          value={scaleToSlider(pxPerSecond)}
          aria-label={t('tools.zoomH')}
          onChange={(e) => setZoom(sliderToScale(Number(e.target.value)))}
        />
      </label>
      <label className="zoom" title={t('tools.zoomV')}>
        <ZoomVIcon />
        <input
          type="range"
          min={TRACK_HEIGHT.min}
          max={TRACK_HEIGHT.max}
          value={trackHeight}
          aria-label={t('tools.zoomV')}
          onChange={(e) => setTrackHeight(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
