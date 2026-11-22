/**
 * What the download holds: the made font under the name the user gave it, and the license it
 * keeps from the font it came from (OFL 1.1 has to travel with the font).
 */
import type { Axis } from "./axis";
import type { CatalogFont } from "./catalog";
import { postScriptName, type Style } from "./names";
import type { AxisSetting } from "./settings";
import { isSloped, settingsCode } from "./settingsCode";
import type { ZipEntry } from "./zip";

export const defaultFamily = (font: CatalogFont) => `My ${font.family}`;

/** The longest family name; Windows shows at most 31 characters in font menus. */
export const FAMILY_MAX = 31;

/** `code` is the settings the font was made at ("wght1100 opsz72"), empty when none moved. */
export type MadeNames = { readonly family: string; readonly style: Style; readonly code: string };

/** The names a made font carries; an empty name falls back to the suggestion. */
export function madeNames(font: CatalogFont, typed: string, axes: readonly Axis[], settings: Readonly<Record<string, AxisSetting>>): MadeNames {
  const family = typed.trim().replace(/\s+/g, " ").slice(0, FAMILY_MAX).trim() || defaultFamily(font);
  return { family, style: isSloped(axes, settings) ? "Italic" : "Regular", code: settingsCode(axes, settings) };
}

export const fileStem = (names: MadeNames) => postScriptName(names.family, names.style, names.code);

/** The ZIP's files: the formats the user kept, TTF first, then the license, which always goes. */
export function downloadFiles(names: MadeNames, fonts: { readonly ttf?: Uint8Array; readonly woff2?: Uint8Array }, license: Uint8Array): ZipEntry[] {
  const stem = fileStem(names);
  return [
    ...(fonts.ttf ? [{ name: `${stem}.ttf`, bytes: fonts.ttf }] : []),
    ...(fonts.woff2 ? [{ name: `${stem}.woff2`, bytes: fonts.woff2 }] : []),
    { name: "OFL.txt", bytes: license },
  ];
}
