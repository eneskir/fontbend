/**
 * Turns the editor's settings into a font file: HarfBuzz pins or narrows the axes, then the
 * font gets its own name, one style and Fontbend's signature.
 */
import { isBeyond, type Axis } from "./axis";
import type { Instancer } from "./harfbuzz";
import { writeNames, writeStyleBits, type Style } from "./names";
import type { AxisSetting } from "./settings";
import { subsetCodePoints, type Subset } from "./subsets";
import { readTables, view, writeFont } from "./sfnt";

export type BuildErrorCode = "NEEDS_STRETCHED" | "FONT_DAMAGED" | "INSTANCE_FAILED";

export class BuildError extends Error {
  readonly code: BuildErrorCode;
  constructor(code: BuildErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type BuildSource = {
  /** The font file as it ships. */
  readonly original: Uint8Array;
  /** The same font stretched past its axis ends (core/stretch); needed only for such values. */
  readonly stretched: Uint8Array | null;
  readonly axes: readonly Axis[];
};

/** Whether these settings reach past the font's own range, so only the stretched font can make them. */
export function needsStretched(axes: readonly Axis[], settings: Readonly<Record<string, AxisSetting>>): boolean {
  return axes.some((a) => {
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

export function buildFont(
  hb: Instancer,
  source: BuildSource,
  settings: Readonly<Record<string, AxisSetting>>,
  /** `styleName` names the PostScript name and file ("CondensedBold"); `style` is what families group by. */
  names: { family: string; style: Style; styleName?: string },
  subset: Subset = "all",
): Uint8Array {
  // Inside the font's own range the shipped file is used: it keeps HVAR and MVAR exactly.
  const stretch = needsStretched(source.axes, settings);
  const font = stretch ? source.stretched : source.original;
  if (!font) throw new BuildError("NEEDS_STRETCHED", "Values past the font's own range need the stretched font, and none was given.");
  // HarfBuzz makes a font even from a cut-off file, so a damaged one is stopped here.
  if (!isWholeFont(font, source.axes.length > 0)) throw new BuildError("FONT_DAMAGED", "The font file arrived damaged. Reload the page and try again.");

  const pins: Record<string, number> = {};
  const ranges: Record<string, readonly [number, number]> = {};
  for (const [tag, s] of Object.entries(settings)) {
    if (typeof s === "number") pins[tag] = s;
    else ranges[tag] = s;
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
  // A digital signature no longer matches once the font changed.
  tables.delete("DSIG");
  return writeFont(instance, tables);
}
