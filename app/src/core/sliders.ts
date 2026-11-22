import type { Axis } from "./axis";
import type { CatalogFont } from "./catalog";

/**
 * Plain-word sliders for axes a non-designer can read. The one table every font's slider
 * list comes from: a font shows the rows whose axis it has, in this order. Axes not listed
 * here (Roboto Flex's parametric ones, for example) appear only under Font axes.
 */
export const SIMPLE_SLIDERS = [
  { key: "weight", label: "Weight", tag: "wght" },
  { key: "width", label: "Width", tag: "wdth" },
  { key: "slant", label: "Slant", tag: "slnt" },
  { key: "opticalSize", label: "Optical size", tag: "opsz" },
  { key: "grade", label: "Grade", tag: "GRAD" },
  { key: "softness", label: "Softness", tag: "SOFT" },
  { key: "wonky", label: "Wonky", tag: "WONK" },
  { key: "casual", label: "Casual", tag: "CASL" },
  { key: "monospace", label: "Monospace", tag: "MONO" },
  { key: "cursive", label: "Cursive", tag: "CRSV" },
  { key: "sharpness", label: "Sharpness", tag: "SHRP" },
  { key: "contrast", label: "Contrast", tag: "CTRS" },
  { key: "flare", label: "Flare", tag: "FLAR" },
  { key: "volume", label: "Volume", tag: "VOLM" },
  { key: "bounce", label: "Bounce", tag: "BNCE" },
  { key: "informal", label: "Informal", tag: "INFM" },
  { key: "spacing", label: "Spacing", tag: "SPAC" },
] as const;

export type SimpleSlider = (typeof SIMPLE_SLIDERS)[number] & { readonly axis: Axis };

export function slidersFor(font: CatalogFont): SimpleSlider[] {
  return SIMPLE_SLIDERS.flatMap((s) => {
    const axis = font.axes.find((a) => a.tag === s.tag);
    return axis ? [{ ...s, axis }] : [];
  });
}

/** The plain name of an axis when it has one, else its tag. */
export function axisLabel(tag: string): string {
  return SIMPLE_SLIDERS.find((s) => s.tag === tag)?.label ?? tag;
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
