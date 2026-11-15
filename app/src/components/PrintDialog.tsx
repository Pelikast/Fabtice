// « Imprimer la grille »: a small dialog with few choices. The orientation of
// the page (portrait or landscape), the size (as it is, or fitted to one page
// when the piece allows it), then « Imprimer… » (the system's or the browser's
// print window) or « Enregistrer en PDF… » (a PDF file written by the Mac app;
// in a browser the print window does it: « Enregistrer au format PDF »).
// What is printed and how is in `chart/print.ts` and `styles/print.css`.

import { useEffect, useRef, useState } from 'react';
import {
  canSavePdfDirectly,
  chartLineCount,
  fitsOnePage,
  loadPrintOptions,
  printChart,
  saveChartPdf,
  savePrintOptions,
  type PrintOptions,
  type PrintOrientation,
  type PrintSize,
} from '../chart/print';
import { t } from '../i18n';
import { closePrint } from '../store/exportActions';
import { useApp } from '../store/store';
import { CloseIcon } from '../ui/icons';

type Phase = { kind: 'choose' } | { kind: 'working' } | { kind: 'saved' } | { kind: 'error' };

export function PrintDialog() {
  const open = useApp((s) => s.ui.printOpen);
  if (!open) return null;
  return <PrintBox />;
}

function PrintBox() {
  const [options, setOptions] = useState<PrintOptions>(loadPrintOptions);
  const [phase, setPhase] = useState<Phase>({ kind: 'choose' });
  const firstRef = useRef<HTMLButtonElement>(null);
  // Lines of bars at the moment the dialog opens (the chart does not change under it).
  const [lines] = useState(chartLineCount);
  const one = fitsOnePage(lines, options.orientation);
  const pdfDirect = canSavePdfDirectly();
  const working = phase.kind === 'working';

  useEffect(() => firstRef.current?.focus({ preventScroll: true }), []);

  const choose = (patch: Partial<PrintOptions>) => {
    const next = { ...options, ...patch };
    setOptions(next);
    savePrintOptions(next);
    if (phase.kind !== 'working') setPhase({ kind: 'choose' });
  };
  // « Sur une page » is only offered while the piece fits; otherwise the page is printed as it is.
  const effective: PrintOptions = { ...options, size: options.size === 'une' && one ? 'une' : 'libre' };

  const run = async (action: 'print' | 'pdf') => {
    setPhase({ kind: 'working' });
    try {
      if (action === 'print' || !pdfDirect) {
        await printChart(effective);
        closePrint();
        return;
      }
      const result = await saveChartPdf(effective);
      if (result.kind === 'saved') setPhase({ kind: 'saved' });
      else if (result.kind === 'cancelled') setPhase({ kind: 'choose' });
      else setPhase({ kind: 'error' });
    } catch {
      setPhase({ kind: 'error' });
    }
  };

  return (
    <div
      className="voile ouverte"
      role="dialog"
      aria-modal="true"
      aria-labelledby="impression-titre"
      data-testid="impression"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !working) closePrint();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !working) closePrint();
      }}
    >
      <div className="accueil export-son impression">
        <div className="accueil-entete">
          <h2 id="impression-titre">{t('print.title')}</h2>
          <button className="fermer" aria-label={t('print.close')} onClick={closePrint} disabled={working}>
            <CloseIcon />
          </button>
        </div>

        <h3>{t('print.orientation')}</h3>
        <div className="choix-export duo-export" role="radiogroup" aria-label={t('print.orientation')}>
          <Choice refEl={firstRef} on={options.orientation === 'portrait'} id="portrait" label={t('print.portrait')} onPick={() => choose({ orientation: 'portrait' })} />
          <Choice on={options.orientation === 'paysage'} id="paysage" label={t('print.landscape')} onPick={() => choose({ orientation: 'paysage' })} />
        </div>

        <h3>{t('print.size')}</h3>
        <div className="choix-export duo-export" role="radiogroup" aria-label={t('print.size')}>
          <Choice on={effective.size === 'libre'} id="libre" label={t('print.sizeAsIs')} note={t('print.sizeAsIsNote')} onPick={() => choose({ size: 'libre' as PrintSize })} />
          <Choice
            on={effective.size === 'une'}
            id="une"
            disabled={!one}
            label={t('print.sizeOne')}
            note={one ? t('print.sizeOneNote') : t('print.sizeOneTooLong')}
            onPick={() => choose({ size: 'une' as PrintSize })}
          />
        </div>

        {!pdfDirect && <p className="export-resume">{t('print.browserPdf')}</p>}
        {phase.kind === 'saved' && (
          <p className="export-resume" role="status" data-testid="impression-ok">
            {t('print.saved')}
          </p>
        )}
        {phase.kind === 'error' && (
          <div className="import-erreur" role="alert">
            <p>{t('print.failed')}</p>
          </div>
        )}

        <div className="import-actions">
          <button className="bouton-cadre" data-testid="impression-pdf" disabled={working} onClick={() => void run('pdf')}>
            {t('print.savePdf')}
          </button>
          <button className="plein" data-testid="impression-imprimer" disabled={working} onClick={() => void run('print')}>
            {t('print.print')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Choice({
  on,
  id,
  label,
  note,
  disabled,
  onPick,
  refEl,
}: {
  on: boolean;
  id: PrintOrientation | PrintSize;
  label: string;
  note?: string;
  disabled?: boolean;
  onPick: () => void;
  refEl?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button ref={refEl} role="radio" aria-checked={on} disabled={disabled} className="choix" data-choix={id} onClick={onPick}>
      <span>{label}</span>
      {note && <small>{note}</small>}
    </button>
  );
}
