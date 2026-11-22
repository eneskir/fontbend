import { clampToAxis } from "./axis";
import type { CatalogFont } from "./catalog";
import type { FontSettings } from "./settings";
import type { SampleId } from "./samples";

/** The one owner of what the editor shows; every view is derived from it. */
export type EditorState = {
  readonly font: CatalogFont;
  readonly settings: FontSettings;
  readonly sample: SampleId;
  /** What the user typed into the preview; replaces the sample's first line when set. */
  readonly text: string | null;
  readonly size: number;
};

export function startEditing(font: CatalogFont, sample: SampleId = "pangram"): EditorState {
  return { font, settings: freshSettings(font), sample, text: null, size: 96 };
}

const freshSettings = (font: CatalogFont): FontSettings => ({
  schemaVersion: 1,
  source: { kind: "catalog", id: font.id },
  axes: {},
  subset: "all",
  formats: ["ttf", "woff2"],
});

/** Switching fonts starts from the new font's defaults and keeps the text and size. */
export function selectFont(state: EditorState, font: CatalogFont): EditorState {
  return font.id === state.font.id ? state : { ...state, font, settings: freshSettings(font) };
}

/** A value equal to the default is dropped, so "changed" means "has an entry". */
export function setAxis(state: EditorState, tag: string, value: number): EditorState {
  const axis = state.font.axes.find((a) => a.tag === tag);
  if (!axis) return state;
  const v = clampToAxis(axis, value);
  const { [tag]: _old, ...rest } = state.settings.axes;
  const axes = v === axis.default ? rest : { ...rest, [tag]: v };
  return { ...state, settings: { ...state.settings, axes } };
}

export function resetAxes(state: EditorState): EditorState {
  return { ...state, settings: { ...state.settings, axes: {} } };
}

/** The value an axis shows: the user's when set (the low end of a range), else the default. */
export function axisValue(state: EditorState, tag: string): number {
  const set = state.settings.axes[tag];
  if (set !== undefined) return typeof set === "number" ? set : set[0];
  return state.font.axes.find((a) => a.tag === tag)?.default ?? 0;
}

/** CSS font-variation-settings for every axis, so the browser never picks one by itself. */
export function variationSettings(state: EditorState): string {
  return state.font.axes.map((a) => `"${a.tag}" ${axisValue(state, a.tag)}`).join(", ");
}
