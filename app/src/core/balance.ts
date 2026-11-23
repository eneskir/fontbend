/**
 * Width on an axis Fontbend added only scales x, so vertical stems thin as letters narrow and
 * thicken as they widen. The weight shown stays the user's; the font is drawn at the weight that
 * brings the stem of H back to its thickness at that weight and the original width.
 */
import { reach, type Axis } from "./axis";
import type { AxisSetting } from "./settings";
import { stemWidth } from "./summary";
import { variableGlyph } from "./variation";

const STEPS = 30;

/**
 * The wght to draw with, or null when nothing needs balancing: Width is the font's own, at 100%,
 * or the stem can't be measured. `stem` gives H's stem width at axis values; `values` holds every
 * axis. The weight stays within the axis reach and short of where letters break, unless the
 * user's own weight is already past that.
 */
export function balancedWeight(axes: readonly Axis[], values: Readonly<Record<string, number>>, stem: (values: Readonly<Record<string, number>>) => number | null): number | null {
  const width = axes.find((a) => a.tag === "wdth"), weight = axes.find((a) => a.tag === "wght");
  if (!width?.synthetic || !weight) return null;
  const scale = (values.wdth ?? width.default) / width.default, w = values.wght ?? weight.default;
  if (scale === 1) return null;
  const upright = { ...values, wdth: width.default };
  const at = (x: number) => stem({ ...upright, wght: x });
  const own = at(w);
  if (own === null || own <= 0) return null;
  const target = own / scale;
  const r = reach(weight);
  const lo = Math.min(w, weight.breaksBelow ?? r.min), hi = Math.max(w, weight.breaksAbove ?? r.max);
  const sLo = at(lo), sHi = at(hi);
  if (sLo === null || sHi === null) return null;
  if (target >= sHi) return hi;
  if (target <= sLo) return lo;
  let a = lo, b = hi;
  for (let i = 0; i < STEPS; i++) {
    const m = (a + b) / 2, s = at(m);
    if (s === null) return null;
    if (s < target) a = m;
    else b = m;
  }
  return Math.round(((a + b) / 2) * 10) / 10;
}

/**
 * Settings for a download with the weight balanced as the preview draws it; `font` gives a font
 * whose wght reaches as far as the slider (the stretched one), read only when needed. A weight
 * kept as a range is left as it is.
 */
export function balanceSettings(axes: readonly Axis[], settings: Readonly<Record<string, AxisSetting>>, font: () => Uint8Array): Readonly<Record<string, AxisSetting>> {
  const width = axes.find((a) => a.tag === "wdth"), wdth = settings.wdth, wght = settings.wght;
  if (!width?.synthetic || typeof wdth !== "number" || wdth === width.default || Array.isArray(wght)) return settings;
  const H = variableGlyph(font(), 0x48);
  if (!H) return settings;
  const values = Object.fromEntries(axes.map((a) => {
    const s = settings[a.tag];
    return [a.tag, s === undefined ? a.default : typeof s === "number" ? s : s[0]];
  }));
  const w = balancedWeight(axes, values, (v) => stemWidth(H(v)));
  return w === null ? settings : { ...settings, wght: w };
}
