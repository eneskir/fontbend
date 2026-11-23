import type { Axis } from "./axis";
import type { CatalogFont } from "./catalog";
import { MESSAGES, num, t, type Key } from "../i18n";

/**
 * The big sliders at the top of Adjust, stacked in this order: every font has all
 * three. Weight is the font's wght; Width and Slant are its wdth and slnt when it has them, else
 * axes Fontbend adds (SYNTHETIC_AXES). Slant shows degrees of lean, positive to the right, the
 * opposite sign of slnt.
 */
export const BIG_SLIDERS = [
  { key: "weight", tag: "wght", unit: "", flip: false },
  { key: "width", tag: "wdth", unit: "%", flip: false },
  { key: "slant", tag: "slnt", unit: "°", flip: true },
] as const;

export type BigSlider = (typeof BIG_SLIDERS)[number] & { readonly axis: Axis };

export function bigSliders(font: CatalogFont): BigSlider[] {
  return BIG_SLIDERS.flatMap((s) => {
    const axis = font.axes.find((a) => a.tag === s.tag);
    return axis ? [{ ...s, axis }] : [];
  });
}

/** The axes under Font axes: the font's own, less those the big sliders show. */
export function fontAxes(font: CatalogFont): Axis[] {
  return font.axes.filter((a) => !a.synthetic && !BIG_SLIDERS.some((s) => s.tag === a.tag));
}

/**
 * The plain name of an axis a non-designer can read ("axis.<tag>" in locales), else its tag
 * (Roboto Flex's parametric axes).
 */
export function axisLabel(tag: string): string {
  const key = `axis.${tag}`;
  return key in MESSAGES.en ? t(key as Key) : tag;
}

/** Slider step: fine enough for short ranges (0 to 1), whole numbers for long ones. */
export function stepFor(axis: Axis): number {
  const span = axis.max - axis.min;
  return span <= 2 ? 0.01 : span <= 20 ? 0.1 : 1;
}

const decimalsFor = (step: number) => (step >= 1 ? 0 : step >= 0.1 ? 1 : 2);

/** A value as the slider shows it: no more decimals than the step has, no trailing zeros. */
export function formatValue(value: number, step: number): string {
  const decimals = decimalsFor(step);
  return num(Number(value.toFixed(decimals)) + 0, decimals); // + 0: no −0
}

/**
 * A number typed into a slider, on its step grid and inside its ends; null when it isn't a number.
 * Either decimal mark reads ("1,5" is 1.5), and a unit or spaces are left out.
 */
export function typedValue(text: string, lo: number, hi: number, step: number): number | null {
  const plain = text.replace(/[\s%°]/g, "").replace(/[−–]/g, "-").replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(plain)) return null;
  const v = Math.min(hi, Math.max(lo, Math.round(Number(plain) / step) * step));
  return Number(v.toFixed(decimalsFor(step))) + 0;
}

/** How far a value is from the original, with its sign: "+300", "-25". */
export function formatDelta(value: number, original: number, step: number): string {
  const text = formatValue(value - original, step);
  return text.startsWith("-") ? text : `+${text}`;
}

/** An axis turned around, for a slider that shows the opposite sign (Slant). */
export function flipped(axis: Axis): Axis {
  const turn = (x: number) => 0 - x; // not -x: −0 would reach the slider
  return {
    tag: axis.tag, min: turn(axis.max), default: turn(axis.default), max: turn(axis.min),
    ...(axis.breaksAbove !== undefined ? { breaksBelow: turn(axis.breaksAbove) } : {}),
    ...(axis.breaksBelow !== undefined ? { breaksAbove: turn(axis.breaksBelow) } : {}),
    ...(axis.synthetic ? { synthetic: true as const } : {}),
  };
}
