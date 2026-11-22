/**
 * A style name read from the settings, for the downloaded file's name: width, then weight,
 * then slope, as static fonts are named ("CondensedBoldOblique"). A font made at width 75 and
 * weight 700 should not be called "Regular" just because it is alone in its family.
 */
import type { Axis } from "./axis";
import type { AxisSetting } from "./settings";

// OS/2 usWidthClass percentages and usWeightClass values with their usual names.
const WIDTHS: readonly [number, string][] = [
  [50, "UltraCondensed"], [62.5, "ExtraCondensed"], [75, "Condensed"], [87.5, "SemiCondensed"], [100, ""],
  [112.5, "SemiExpanded"], [125, "Expanded"], [150, "ExtraExpanded"], [200, "UltraExpanded"],
];
const WEIGHTS: readonly [number, string][] = [
  [100, "Thin"], [200, "ExtraLight"], [300, "Light"], [400, ""], [500, "Medium"],
  [600, "SemiBold"], [700, "Bold"], [800, "ExtraBold"], [900, "Black"],
];

/** The name of the nearest step; values past the last step take the last name. */
const nearest = (steps: readonly [number, string][], v: number) =>
  steps.reduce((best, s) => (Math.abs(s[0] - v) < Math.abs(best[0] - v) ? s : best))[1];

/**
 * The axis value the font is made at: the user's number, or the default. A range stays
 * variable, so it names nothing.
 */
function pinned(axes: readonly Axis[], settings: Readonly<Record<string, AxisSetting>>, tag: string): number | null {
  const axis = axes.find((a) => a.tag === tag);
  if (!axis) return null;
  const s = settings[tag];
  if (s === undefined) return axis.default;
  return typeof s === "number" ? s : null;
}

export function styleName(axes: readonly Axis[], settings: Readonly<Record<string, AxisSetting>>): string {
  const wdth = pinned(axes, settings, "wdth"), wght = pinned(axes, settings, "wght");
  const ital = pinned(axes, settings, "ital"), slnt = pinned(axes, settings, "slnt");
  const slope = ital !== null && ital >= 0.5 ? "Italic" : slnt !== null && slnt !== 0 ? "Oblique" : "";
  const name = [wdth === null ? "" : nearest(WIDTHS, wdth), wght === null ? "" : nearest(WEIGHTS, wght), slope].join("");
  return name || "Regular";
}

/** Italic for the style bits and name ID 2 whenever the letters lean; every other made font is Regular. */
export const isSloped = (name: string) => /(Italic|Oblique)$/.test(name);
