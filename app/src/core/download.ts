/**
 * What the download holds: the made font under the name the user gave it, and the license it
 * keeps from the font it came from (OFL 1.1 has to travel with the font).
 */
import type { Axis } from "./axis";
import type { CatalogFont } from "./catalog";
import { postScriptName, type Style } from "./names";
import type { AxisSetting } from "./settings";
import { isSloped, styleName } from "./styleName";
import type { ZipEntry } from "./zip";

export const defaultFamily = (font: CatalogFont) => `My ${font.family}`;

/** The longest family name; Windows shows at most 31 characters in font menus. */
export const FAMILY_MAX = 31;

export type MadeNames = { readonly family: string; readonly style: Style; readonly styleName: string };

/** The names a made font carries; an empty name falls back to the suggestion. */
export function madeNames(font: CatalogFont, typed: string, axes: readonly Axis[], settings: Readonly<Record<string, AxisSetting>>): MadeNames {
  const family = typed.trim().replace(/\s+/g, " ").slice(0, FAMILY_MAX).trim() || defaultFamily(font);
  const name = styleName(axes, settings);
  return { family, style: isSloped(name) ? "Italic" : "Regular", styleName: name };
}

export const fileStem = (names: MadeNames) => postScriptName(names.family, names.styleName);

export function downloadFiles(names: MadeNames, ttf: Uint8Array, license: Uint8Array): ZipEntry[] {
  return [{ name: `${fileStem(names)}.ttf`, bytes: ttf }, { name: "OFL.txt", bytes: license }];
}
