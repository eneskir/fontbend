/** One variation axis, as the font's fvar table declares it. */
export type Axis = {
  readonly tag: string;
  readonly min: number;
  readonly default: number;
  readonly max: number;
};

/** Pulls a value back inside the axis range. */
export function clampToAxis(axis: Axis, value: number): number {
  return Math.min(axis.max, Math.max(axis.min, value));
}
