/**
 * Turns the editor's settings into a font file: Width and Slant on axes Fontbend added (core/synth)
 * are drawn into the outlines (core/transform), HarfBuzz pins or narrows the font's own axes, then
 * the font gets its own name, one style and Fontbend's signature.
 */
import { isBeyond, type Axis } from "./axis";
import type { Instancer } from "./harfbuzz";
import { pruneStat, writeNames, writeStyleBits, type Style } from "./names";
import type { AxisSetting } from "./settings";
import { subsetCodePoints, type Subset } from "./subsets";
import { readTables, view, writeFont } from "./sfnt";
import { slant, transformFont, type Shear } from "./transform";
import { fixTurkish } from "./turkish";

export type BuildErrorCode = "NEEDS_STRETCHED" | "FONT_DAMAGED" | "INSTANCE_FAILED" | "SYNTHETIC_RANGE";

export class BuildError extends Error {
  readonly code: BuildErrorCode;
  constructor(code: BuildErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** The made file, and whether Turkish text got its ligatures turned off (core/turkish). */
export type BuiltFont = { readonly bytes: Uint8Array; readonly turkishFix: boolean };

export type BuildSource = {
  /** The font file as it ships. */
  readonly original: Uint8Array;
  /** The same font stretched past its axis ends (core/stretch), without added axes; needed only for such values. */
  readonly stretched: Uint8Array | null;
  readonly axes: readonly Axis[];
};

/** Whether these settings reach past the font's own range, so only the stretched font can make them. */
export function needsStretched(axes: readonly Axis[], settings: Readonly<Record<string, AxisSetting>>): boolean {
  return axes.some((a) => {
    if (a.synthetic) return false;
    const s = settings[a.tag];
    if (s === undefined) return false;
    return (typeof s === "number" ? [s] : s).some((v) => isBeyond(a, v));
  });
}

/** A TrueType or OpenType file whose tables all lie inside it, with the tables a font needs to be made. */
function isWholeFont(font: Uint8Array, variable: boolean): boolean {
  try {
    const version = view(font).getUint32(0);
    if (version !== 0x00010000 && version !== 0x74727565 && version !== 0x4f54544f) return false; // 1.0, "true", "OTTO"
    const t = readTables(font);
    return ["head", "name", "OS/2", "cmap", "hmtx", ...(variable ? ["fvar"] : [])].every((tag) => t.has(tag))
      && (t.has("glyf") || t.has("CFF ") || t.has("CFF2"));
  } catch {
    return false; // the table directory itself is cut off
  }
}

/**
 * The GSUB table with the fi ligatures that lose i's dot turned off for Turkish, or null when the
 * font needs no fix. A table the fix cannot rewrite (offsets past 64 KB, feature variations on the
 * ligatures, parameters of an unknown format) is left as HarfBuzz made it.
 */
function turkishFix(tables: Map<string, Uint8Array>): Uint8Array | null {
  try {
    return fixTurkish(tables).gsub;
  } catch {
    return null;
  }
}

/**
 * Width (percent) and Slant (degrees, negative leans right) as one map: the added axes' variations
 * add up to x' = a·x + b·y + c (core/synth), so both are one transform. Null when neither moves.
 */
function drawnMap(font: Uint8Array, drawn: Readonly<Record<string, number>>): Shear | null {
  const a = (drawn.wdth ?? 100) / 100, degrees = -(drawn.slnt ?? 0);
  if (a === 1 && degrees === 0) return null;
  const s = degrees === 0 ? { b: 0, c: 0 } : slant(font, degrees);
  return { a, b: s.b, c: s.c };
}

export function buildFont(
  hb: Instancer,
  source: BuildSource,
  settings: Readonly<Record<string, AxisSetting>>,
  /** `code` is the settings in the name ("wght1100 opsz72"); `style` is what families group by. */
  names: { family: string; style: Style; code?: string; signed?: boolean },
  subset: Subset = "all",
): BuiltFont {
  // Inside the font's own range the shipped file is used: it keeps HVAR and MVAR exactly.
  const stretch = needsStretched(source.axes, settings);
  const base = stretch ? source.stretched : source.original;
  if (!base) throw new BuildError("NEEDS_STRETCHED", "Values past the font's own range need the stretched font, and none was given.");
  // HarfBuzz makes a font even from a cut-off file, so a damaged one is stopped here.
  if (!isWholeFont(base, source.axes.length > 0)) throw new BuildError("FONT_DAMAGED", "The font file arrived damaged. Reload the page and try again.");

  const pins: Record<string, number> = {};
  const ranges: Record<string, readonly [number, number]> = {};
  const drawn: Record<string, number> = {};
  for (const [tag, s] of Object.entries(settings)) {
    const synthetic = source.axes.some((a) => a.tag === tag && a.synthetic);
    if (synthetic && typeof s !== "number") throw new BuildError("SYNTHETIC_RANGE", `This font has no ${tag} axis of its own, so ${tag} can only be set to one value.`);
    if (synthetic) drawn[tag] = s as number;
    else if (typeof s === "number") pins[tag] = s;
    else ranges[tag] = s;
  }
  const map = drawnMap(base, drawn);
  let font = base;
  if (map) {
    try {
      font = transformFont(base, map);
    } catch (err) {
      throw new BuildError("INSTANCE_FAILED", `The font could not be made with these settings (${err instanceof Error ? err.message : String(err)}).`);
    }
  }

  let instance: Uint8Array;
  try {
    instance = hb.instance(font, pins, ranges, subsetCodePoints(subset));
  } catch (err) {
    throw new BuildError("INSTANCE_FAILED", `The font could not be made with these settings (${err instanceof Error ? err.message : String(err)}).`);
  }

  const tables = new Map(readTables(instance));
  const need = (tag: string) => tables.get(tag) ?? (() => { throw new BuildError("INSTANCE_FAILED", `The new font file has no ${tag} table.`); })();
  tables.set("name", writeNames(need("name"), { ...names, variable: tables.has("fvar") }));
  const { os2, head } = writeStyleBits(need("OS/2"), need("head"), names.style);
  tables.set("OS/2", os2);
  tables.set("head", head);
  const stat = tables.get("STAT") && pruneStat(tables.get("STAT")!, tables.get("fvar"));
  if (stat) tables.set("STAT", stat);
  else tables.delete("STAT");
  // A digital signature no longer matches once the font changed.
  tables.delete("DSIG");
  const turkish = turkishFix(tables);
  if (turkish) tables.set("GSUB", turkish);
  return { bytes: writeFont(instance, tables), turkishFix: turkish !== null };
}
