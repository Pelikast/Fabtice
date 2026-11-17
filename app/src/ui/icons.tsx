// Line icons from the validated mockup. Ink only (currentColor), never coloured.

export function MagnetIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 3.5v6.2a5 5 0 0 0 10 0V3.5h-3.2v6.2a1.8 1.8 0 0 1-3.6 0V3.5z" />
      <path d="M5 6.6h3.2M11.8 6.6H15" />
    </svg>
  );
}

export function ZoomHIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10h14M6 6.8 3 10l3 3.2M14 6.8l3 3.2-3 3.2" />
    </svg>
  );
}

export function ZoomVIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 3v14M6.8 6 10 3l3.2 3M6.8 14l3.2 3 3.2-3" />
    </svg>
  );
}

export function TripletIcon() {
  return (
    <svg viewBox="0 0 26 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.5 12V6.5h7.2M17.3 6.5h7.2V12" />
      <text x="13" y="10.2" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="currentColor" stroke="none" fontFamily="inherit">
        3
      </text>
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <rect x="3" y="4" width="2.2" height="12" rx="1" />
      <path d="M16.2 4.6v10.8a.7.7 0 0 1-1.1.6L7.3 10.6a.7.7 0 0 1 0-1.2l7.8-5.4a.7.7 0 0 1 1.1.6z" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg className="lire" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 4.9v14.2a1 1 0 0 0 1.5.9l11.6-7.1a1 1 0 0 0 0-1.8L9.5 4a1 1 0 0 0-1.5.9z" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg className="pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4.5" width="4.4" height="15" rx="1.2" />
      <rect x="13.6" y="4.5" width="4.4" height="15" rx="1.2" />
    </svg>
  );
}

export function LoopIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9V8a3 3 0 0 1 3-3h8.5" />
      <path d="M13 2.5 15.6 5 13 7.5" />
      <path d="M16 11v1a3 3 0 0 1-3 3H4.5" />
      <path d="M7 17.5 4.4 15 7 12.5" />
    </svg>
  );
}

export function MetronomeIcon() {
  return (
    <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.2 3.5h5.6l3.4 15H4.8z" />
      <path d="M6 14.5h10" />
      <path d="M11 14.5 15.5 6" />
    </svg>
  );
}

export function ChevronIcon() {
  return (
    <svg className="chevron" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.5 1.5 6 6l4.5-4.5" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="M3 3l10 10M13 3 3 13" />
    </svg>
  );
}

/** Lot 4: a bookmark, for « Repères ». */
export function MarkerIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3.5h8v13l-4-3.2-4 3.2z" />
    </svg>
  );
}

/** Lot 4: three small sliders, for the metronome's settings. */
export function SlidersIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M5 3.5v13M10 3.5v13M15 3.5v13" />
      <path d="M3.2 12h3.6M8.2 7h3.6M13.2 10.5h3.6" strokeWidth="2.2" />
    </svg>
  );
}

/** A printer, in the same line as the other icons: the quiet « Imprimer » of the chart. */
export function PrinterIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 7V3.5h8V7M6 14H3.8V7.6h12.4V14H14M6 11.6h8v5H6z" />
    </svg>
  );
}

/** A pencil, in the same line: the quiet « Modifier » beside a part of the structure. */
export function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.6 4.4l3 3L7.2 15.8l-3.7.8.8-3.7zM11 6l3 3" />
    </svg>
  );
}
