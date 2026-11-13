// Ranges of the two zoom sliders and their mapping. The horizontal slider is
// logarithmic: each step multiplies the scale by the same factor.

import { clamp } from '../grid/tempoMap';

/** Horizontal scale, pixels per second of source time. */
export const PX_PER_SECOND = { min: 2, max: 400, default: 40 } as const;
/** Track lane height, CSS pixels (DESIGN.md: 74 px by default). */
export const TRACK_HEIGHT = { min: 44, max: 150, default: 74 } as const;
/** Phone: the lanes scroll at 86 px per bar (DESIGN.md). */
export const PHONE_BAR_WIDTH = 86;

/** Resolution of the horizontal slider (`<input type=range min=0 max=SLIDER_STEPS>`). */
export const SLIDER_STEPS = 1000;

const LOG_MIN = Math.log(PX_PER_SECOND.min);
const LOG_SPAN = Math.log(PX_PER_SECOND.max) - LOG_MIN;

export function clampScale(pxPerSecond: number): number {
  return clamp(pxPerSecond, PX_PER_SECOND.min, PX_PER_SECOND.max);
}

export function clampTrackHeight(height: number): number {
  return Math.round(clamp(height, TRACK_HEIGHT.min, TRACK_HEIGHT.max));
}

export function scaleToSlider(pxPerSecond: number): number {
  return Math.round(((Math.log(clampScale(pxPerSecond)) - LOG_MIN) / LOG_SPAN) * SLIDER_STEPS);
}

export function sliderToScale(value: number): number {
  return clampScale(Math.exp(LOG_MIN + (clamp(value, 0, SLIDER_STEPS) / SLIDER_STEPS) * LOG_SPAN));
}
