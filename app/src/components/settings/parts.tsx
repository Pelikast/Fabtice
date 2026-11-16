// Small building blocks shared by the tabs of « Réglages »: a titled section that says whether its settings
// hold for the app or for the open piece (and is greyed, with a sentence, when no piece is open), and a
// checkbox row in the style of the other settings.

import { useId, type ReactNode } from 'react';
import { t } from '../../i18n';
import { useApp } from '../../store/store';

/**
 * A titled group of settings. `scope`: `app` (kept on the device, holds for every piece) or `piece` (acts on the
 * open piece: greyed, with a calm sentence, when there is none). `title` replaces the scope's own label.
 */
export function Section({ scope, title, children }: { scope: 'app' | 'piece' | null; title?: string; children: ReactNode }) {
  const id = useId();
  const hasProject = useApp((s) => s.project !== null);
  const label = title ?? (scope ? t(`settingsWin.scope.${scope}`) : '');
  const off = scope === 'piece' && !hasProject;
  return (
    <section className="reglages-section" data-scope={scope ?? undefined} data-grise={off || undefined} aria-labelledby={id}>
      <h3 id={id} className="libelle">
        {label}
      </h3>
      {off && (
        <p className="reglages-grise-phrase" data-testid="reglages-sans-morceau">
          {t('settingsWin.noPiece')}
        </p>
      )}
      {/* `inert`: greyed out and out of reach of the keyboard and of touch, but still showing what is there. */}
      <div className="reglages-section-corps" inert={off}>
        {children}
      </div>
    </section>
  );
}

/** A smaller heading inside a section (« Analyse », « Accordage »…). */
export function SubTitle({ children }: { children: ReactNode }) {
  return <h4 className="reglages-sous-titre">{children}</h4>;
}

/** A checkbox with an optional note under it. */
export function CheckRow({
  checked,
  onChange,
  label,
  note,
  testId,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  note?: string;
  testId?: string;
}) {
  return (
    <label className="option option-colonne">
      <span className="option-ligne">
        <input type="checkbox" checked={checked} data-testid={testId} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </span>
      {note && <small>{note}</small>}
    </label>
  );
}
