/**
 * The settings a font was made at, written into its name: every axis moved from the font's
 * default, by its tag and exact value ("wght1100 opsz72"). Two downloads share a name only when
 * they share every setting, so Windows can install them side by side.
 */
import type { Axis } from "./axis";
import type { AxisSetting } from "./settings";

// The common axes lead, in the order people read a style; the font's own axes follow in its order.
const LEAD = ["wght", "wdth", "ital", "slnt", "opsz"];

/** At most two decimals, no trailing zeros: 72, 0.5, -10. */
const num = (v: number) => String(Number(v.toFixed(2)));

export function settingsCode(axes: readonly Axis[], settings: Readonly<Record<string, AxisSetting>>): string {
  const rank = (a: Axis) => (LEAD.includes(a.tag) ? LEAD.indexOf(a.tag) : LEAD.length);
  return [...axes]
    .sort((a, b) => rank(a) - rank(b))
    .flatMap((a) => {
      const s = settings[a.tag];
      if (s === undefined) return [];
      if (typeof s !== "number") return [`${a.tag}${num(s[0])}-${num(s[1])}`];
      return num(s) === num(a.default) ? [] : [`${a.tag}${num(s)}`];
    })
    .join(" ");
}

/** Whether the letters lean: an italic axis past its middle, or any slant. Such a font is grouped as Italic. */
export function isSloped(axes: readonly Axis[], settings: Readonly<Record<string, AxisSetting>>): boolean {
  const at = (tag: string) => {
    const axis = axes.find((a) => a.tag === tag);
    const s = settings[tag];
    return !axis ? null : s === undefined ? axis.default : typeof s === "number" ? s : null;
  };
  const ital = at("ital"), slnt = at("slnt");
  return (ital !== null && ital >= 0.5) || (slnt !== null && slnt !== 0);
}
