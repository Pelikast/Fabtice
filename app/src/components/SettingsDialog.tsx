// « Réglages » (C7): a wide window with seven tabs, in the manner of the settings of Logic Pro.
//
//   - Computer (above 760 px): a window of the family of the other windows (paper, 1 px rule, the one warm
//     shadow), a row of tabs on top, the active one underlined in ink (as the two views are, never in ember),
//     a body that scrolls while the window keeps the same height from one tab to the next. Arrow keys change
//     tab; Escape and the cross close it; Tab stays inside the window.
//   - Phone (760 px and below): a full-screen sheet. First the list of the seven tabs as large rows, a touch
//     opens one with a button to go back. Opened by a « Tous les réglages… » link, it goes straight to the tab.
//
// The tab last seen is kept while the app stays open (`ui.settings.tab`). What each tab holds is in
// `components/settings/`.

import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { t } from '../i18n';
import { closeSettings, setSettingsTab } from '../store/actions';
import { SETTINGS_TABS, useApp, type SettingsTab } from '../store/store';
import { CloseIcon } from '../ui/icons';
import { usePhoneLayout } from '../util/media';
import { AdvancedTab } from './settings/AdvancedTab';
import { ChordsTab } from './settings/ChordsTab';
import { DisplayTab } from './settings/DisplayTab';
import { GeneralTab } from './settings/GeneralTab';
import { InstrumentsTab } from './settings/InstrumentsTab';
import { MetronomeTab } from './settings/MetronomeTab';
import { TempoTab } from './settings/TempoTab';

const PANELS: Record<SettingsTab, () => ReactElement> = {
  general: GeneralTab,
  instruments: InstrumentsTab,
  tempo: TempoTab,
  chords: ChordsTab,
  metronome: MetronomeTab,
  display: DisplayTab,
  advanced: AdvancedTab,
};

const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]';

export function SettingsDialog() {
  const open = useApp((s) => s.ui.settings.open);
  if (!open) return null;
  return <SettingsBox />;
}

function SettingsBox() {
  const tab = useApp((s) => s.ui.settings.tab);
  const direct = useApp((s) => s.ui.settings.direct);
  const phone = usePhoneLayout();
  // Phone: the list of the seven, or one of them. A link that names a tab goes straight to it.
  const [detail, setDetail] = useState(direct);
  const boxRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const Panel = PANELS[tab];

  // Focus goes into the window, and back to where it was when the window closes.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const target =
      (phone && detail ? box.querySelector<HTMLElement>('[data-retour]') : null) ??
      box.querySelector<HTMLElement>(phone ? `[data-tab="${tab}"]` : '[role="tab"][aria-selected="true"]') ??
      box.querySelector<HTMLElement>('[data-fermer]');
    target?.focus({ preventScroll: true });
    // Only when the window opens or changes form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [tab, detail]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Space belongs to the buttons and boxes of this window: it does not start the playback behind it.
    if (e.key === ' ') {
      e.stopPropagation();
      return;
    }
    if (e.key !== 'Tab') return;
    const box = boxRef.current;
    if (!box) return;
    const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => !el.closest('[inert]') && !(el as HTMLButtonElement).disabled && el.tabIndex >= 0 && el.getClientRects().length > 0,
    );
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) {
      e.preventDefault();
      first.focus();
    }
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = SETTINGS_TABS.length - 1;
    const next = e.key === 'ArrowRight' ? (index === last ? 0 : index + 1) : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    setSettingsTab(SETTINGS_TABS[next]!);
    // The new tab takes the focus once it is drawn.
    requestAnimationFrame(() => boxRef.current?.querySelector<HTMLElement>(`[role="tab"][data-tab="${SETTINGS_TABS[next]}"]`)?.focus());
  };

  const showList = phone && !detail;
  return (
    <div
      className="voile ouverte voile-reglages"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) closeSettings();
      }}
      onKeyUp={(e) => {
        if (e.key === ' ') e.stopPropagation();
      }}
    >
      <div
        ref={boxRef}
        className="reglages-fenetre"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reglages-titre"
        data-testid="reglages"
        data-forme={phone ? 'mobile' : 'ordinateur'}
        data-vue={phone ? (detail ? 'onglet' : 'liste') : undefined}
        onKeyDown={onKeyDown}
      >
        <header className="reglages-tete">
          {phone && detail && (
            <button className="reglages-retour" data-retour data-testid="reglages-retour" aria-label={t('settingsWin.back')} title={t('settingsWin.back')} onClick={() => setDetail(false)}>
              <span aria-hidden="true">‹</span>
            </button>
          )}
          <h2 id="reglages-titre">{phone && detail ? t(`settingsWin.tab.${tab}`) : t('settingsWin.title')}</h2>
          <button className="fermer" data-fermer data-testid="reglages-fermer" aria-label={t('settingsWin.close')} onClick={closeSettings}>
            <CloseIcon />
          </button>
        </header>

        {phone ? (
          showList ? (
            <ul className="reglages-liste" aria-label={t('settingsWin.list')}>
              {SETTINGS_TABS.map((id) => (
                <li key={id}>
                  <button
                    className="reglages-ligne"
                    data-tab={id}
                    onClick={() => {
                      setSettingsTab(id);
                      setDetail(true);
                    }}
                  >
                    <span>{t(`settingsWin.tab.${id}`)}</span>
                    <span className="chevron" aria-hidden="true">
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div ref={bodyRef} className="reglages-corps" role="region" aria-labelledby="reglages-titre" data-testid="reglages-panneau" data-onglet={tab}>
              <Panel />
            </div>
          )
        ) : (
          <>
            <div className="reglages-onglets" role="tablist" aria-label={t('settingsWin.tabs')}>
              {SETTINGS_TABS.map((id, i) => (
                <button
                  key={id}
                  id={`reglages-onglet-${id}`}
                  role="tab"
                  data-tab={id}
                  data-label={t(`settingsWin.tab.${id}`)}
                  aria-selected={tab === id}
                  aria-controls="reglages-panneau"
                  tabIndex={tab === id ? 0 : -1}
                  onClick={() => setSettingsTab(id)}
                  onKeyDown={(e) => onTabKey(e, i)}
                >
                  {t(`settingsWin.tab.${id}`)}
                </button>
              ))}
            </div>
            <div
              ref={bodyRef}
              id="reglages-panneau"
              className="reglages-corps"
              role="tabpanel"
              aria-labelledby={`reglages-onglet-${tab}`}
              data-testid="reglages-panneau"
              data-onglet={tab}
            >
              <Panel />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
