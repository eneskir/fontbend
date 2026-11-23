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
  /** Nothing could be read; the first catalog font opened as designed. `reason` is for the console. */
  | { readonly kind: "damaged"; readonly reason: string };

/** The text after the # that opens `state`'s settings. */
export const linkText = (state: EditorState): string => encodeSettings(state.settings);

/** The editor state a link opens, and what to tell the user about it. `fonts` is the catalog, first font first. */
export function openLink(fonts: readonly CatalogFont[], text: string): { readonly state: EditorState; readonly opened: Opened } {
  const damaged = (reason: string) => ({ state: startEditing(fonts[0]!), opened: { kind: "damaged", reason } as const });
  const decoded = decodeSettings(text);
  if (!decoded.ok) return damaged(decoded.error);
  const s = decoded.settings;
  if (s.source.kind !== "catalog") return damaged("a font file opened on another computer");
  const id = s.source.id, font = fonts.find((f) => f.id === id);
  if (!font) return damaged(`no font ${id}`);

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
