/**
 * A share link carries one font's settings after the # (core/settings), so they never reach a
 * server. Opening one starts the editor at those settings and says what came through.
 */
import { clampToReach } from "./axis";
import type { CatalogFont } from "./catalog";
import { startEditing, type EditorState } from "./editor";
import { decodeSettings, encodeSettings, type AxisSetting } from "./settings";

export type Opened =
  /** Everything opened as shared; `changes` counts the axes moved from the font's defaults. */
  | { readonly kind: "shared"; readonly changes: number }
  /** Opened, but these axis tags were left out: the font no longer has them, or can't keep them as a range. */
  | { readonly kind: "older"; readonly skipped: readonly string[] }
  /** Made by a later Fontbend than this page; the first catalog font opened as designed. */
  | { readonly kind: "newer" }
  /** For a font file that isn't open on this page; the first catalog font opened as designed. */
  | { readonly kind: "noFile" }
  /** Nothing could be read; the first catalog font opened as designed. `reason` is for the console. */
  | { readonly kind: "damaged"; readonly reason: string };

/** The text after the # that opens `state`'s settings. */
export const linkText = (state: EditorState): string => encodeSettings(state.settings);

/** The editor state a link opens, and what to tell the user about it. `fonts` is the catalog, first font first, then any font files open on this page. */
export function openLink(fonts: readonly CatalogFont[], text: string): { readonly state: EditorState; readonly opened: Opened } {
  const instead = (opened: Opened) => ({ state: startEditing(fonts[0]!), opened });
  const damaged = (reason: string) => instead({ kind: "damaged", reason });
  const decoded = decodeSettings(text);
  if (!decoded.ok) {
    // Versions count up from 1; a higher one is a page that has not caught up yet, not a broken link.
    const version = Number(new URLSearchParams(text).get("v"));
    return Number.isInteger(version) && version > 1 ? instead({ kind: "newer" }) : damaged(decoded.error);
  }
  const s = decoded.settings;
  const source = s.source;
  const font = source.kind === "catalog" ? fonts.find((f) => !f.local && f.id === source.id) : fonts.find((f) => f.local?.sha256 === source.sha256);
  if (!font) return source.kind === "catalog" ? damaged(`no font ${source.id}`) : instead({ kind: "noFile" });

  const axes: Record<string, AxisSetting> = {}, skipped: string[] = [];
  for (const [tag, value] of Object.entries(s.axes)) {
    const axis = font.axes.find((a) => a.tag === tag);
    // A synthetic axis is drawn by stretching the outlines, so it can't stay variable (core/build).
    if (!axis || (typeof value !== "number" && axis.synthetic)) { skipped.push(tag); continue; }
    const v = typeof value === "number" ? clampToReach(axis, value) : [clampToReach(axis, value[0]), clampToReach(axis, value[1])] as const;
    // As setAxis does: a value at the default is no change.
    if (v !== axis.default) axes[tag] = v;
  }
  const state = { ...startEditing(font), settings: { ...s, axes } };
  return { state, opened: skipped.length ? { kind: "older", skipped } : { kind: "shared", changes: Object.keys(axes).length } };
}
