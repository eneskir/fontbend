/** One variation axis, as the font's fvar table declares it. */
export type Axis = {
  readonly tag: string;
  readonly min: number;
  readonly default: number;
  readonly max: number;
  /** Past these values some letters break: a contour turns inside out. Measured for catalog fonts by scripts/build-catalog.py. */
  readonly breaksBelow?: number;
  readonly breaksAbove?: number;
};

/** How far past its own range Fontbend lets an axis go: this share of each side's span. */
export const STRETCH = 0.5;

/**
 * The range a slider covers: each side grows by half its span, and a side with no range of
 * its own (default at an end) borrows the other side's span, so every axis can go both ways.
 */
export function reach(axis: Axis, extra = STRETCH): { readonly min: number; readonly max: number } {
  const { min, default: def, max } = axis;
  return {
    min: min < def ? min - extra * (def - min) : def - extra * (max - def),
    max: max > def ? max + extra * (max - def) : def + extra * (def - min),
  };
}

/** Pulls a value back inside the reach of the axis. */
export function clampToReach(axis: Axis, value: number): number {
  const r = reach(axis);
  return Math.min(r.max, Math.max(r.min, value));
}

/** Whether a value lies past the font's own range. */
export const isBeyond = (axis: Axis, value: number) => value < axis.min || value > axis.max;

/** Where some letters start to break on the way to this value, or null if none do. */
export const breakPast = (axis: Axis, value: number): number | null =>
  axis.breaksBelow !== undefined && value < axis.breaksBelow ? axis.breaksBelow : axis.breaksAbove !== undefined && value > axis.breaksAbove ? axis.breaksAbove : null;
