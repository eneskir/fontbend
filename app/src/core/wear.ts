/**
 * The interface wears the font being made: every menu and label is set in it, with the Adjust
 * settings, inside a readable band. The font name and the sample show the exact settings.
 */
import type { Axis } from "./axis";
import type { AxisSetting } from "./settings";

/**
 * How far the interface follows each axis. Width and Slant stop where menus still read; weight
 * is left out so the interface keeps its own levels (labels regular, headings bold); any other
 * axis stops at the font's own range, past which letters may break.
 */
const BANDS: Readonly<Record<string, readonly [number, number]>> = { wdth: [75, 125], slnt: [-5, 5] };

/** CSS font-variation-settings for the interface; "normal" when no axis is left. */
export function wearSettings(axes: readonly Axis[], settings: Readonly<Record<string, AxisSetting>>): string {
  const parts = axes.filter((a) => a.tag !== "wght").map((a) => {
    const s = settings[a.tag];
    const value = s === undefined ? a.default : typeof s === "number" ? s : s[0];
    const [lo, hi] = BANDS[a.tag] ?? [a.min, a.max];
    return `"${a.tag}" ${Math.min(hi, Math.max(lo, value))}`;
  });
  return parts.length ? parts.join(", ") : "normal";
}
