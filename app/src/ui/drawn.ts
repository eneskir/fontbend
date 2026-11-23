import type { CatalogFont } from "../core/catalog";
import { balancedWeight } from "../core/balance";
import { axisValues, variationSettings, type EditorState } from "../core/editor";
import type { Glyph } from "../core/glyf";
import { stemWidth } from "../core/summary";
import { variableGlyph } from "../core/variation";
import { stretchedFont } from "./faces";

type GlyphAt = (values: Readonly<Record<string, number>>) => Glyph;

/** H as each stretched font draws it, read once the font has arrived; null when it has no plain H. */
const letters = new Map<string, GlyphAt | null>();

/** Reads H from the font's stretched file, once; resolves when the values below can balance it. */
export const loadStems = (font: CatalogFont) =>
  stretchedFont(font).then((b) => { if (!letters.has(font.id)) letters.set(font.id, variableGlyph(new Uint8Array(b), 0x48)); });

/** H at axis values, or null before the stretched font has arrived. */
export const letterH = (font: CatalogFont): GlyphAt | null => letters.get(font.id) ?? null;

/**
 * The values the font is drawn at: the sliders', with the weight balanced for a Width the font
 * lacks (core/balance) once its stretched file has arrived.
 */
export function drawnValues(state: EditorState): Record<string, number> {
  const H = letterH(state.font), known = drawn.get(state);
  if (known && known.H === H) return known.values;
  const values = axisValues(state);
  const w = H ? balancedWeight(state.font.axes, values, (v) => stemWidth(H(v))) : null;
  const out = w === null ? values : { ...values, wght: w };
  drawn.set(state, { H, values: out });
  return out;
}

// The sample, the name and the sentence all ask for one state's values; a state never changes.
const drawn = new WeakMap<EditorState, { H: GlyphAt | null; values: Record<string, number> }>();

/** CSS font-variation-settings for the font as drawn. */
export const drawnSettings = (state: EditorState) => variationSettings(state, drawnValues(state));
