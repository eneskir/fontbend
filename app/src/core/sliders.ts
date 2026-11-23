import type { Axis } from "./axis";
import type { CatalogFont } from "./catalog";

/**
 * The big sliders at the top of Adjust, stacked in this order: every font has all
 * three. Weight is the font's wght; Width and Slant are its wdth and slnt when it has them, else
 * axes Fontbend adds (SYNTHETIC_AXES). Slant shows degrees of lean, positive to the right, the
 * opposite sign of slnt.
 */
export const BIG_SLIDERS = [
  { key: "weight", label: "Weight", tag: "wght", unit: "", flip: false },
  { key: "width", label: "Width", tag: "wdth", unit: "%", flip: false },
  { key: "slant", label: "Slant", tag: "slnt", unit: "°", flip: true },
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

/** Plain names for axes a non-designer can read; an axis not listed shows its tag (Roboto Flex's parametric ones). */
export const AXIS_NAMES: Readonly<Record<string, string>> = {
  wght: "Weight", wdth: "Width", slnt: "Slant", opsz: "Optical size", GRAD: "Grade", SOFT: "Softness",
  WONK: "Wonky", CASL: "Casual", MONO: "Monospace", CRSV: "Cursive", SHRP: "Sharpness", CTRS: "Contrast",
  FLAR: "Flare", VOLM: "Volume", BNCE: "Bounce", INFM: "Informal", SPAC: "Spacing",
};

/** The plain name of an axis when it has one, else its tag. */
export function axisLabel(tag: string): string {
  return AXIS_NAMES[tag] ?? tag;
}

/** Slider step: fine enough for short ranges (0 to 1), whole numbers for long ones. */
export function stepFor(axis: Axis): number {
  const span = axis.max - axis.min;
  return span <= 2 ? 0.01 : span <= 20 ? 0.1 : 1;
}

/** A value as the slider shows it: no more decimals than the step has, no trailing zeros. */
export function formatValue(value: number, step: number): string {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return String(Number(value.toFixed(decimals)));
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
