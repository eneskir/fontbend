import { reach, type Axis } from "./axis";

export type Category = "sans" | "serif" | "slab" | "display" | "mono" | "handwriting";

export type FontFile = { readonly path: string; readonly source: string; readonly bytes: number };

export type CatalogFont = {
  readonly id: string;
  readonly category: Category;
  readonly family: string;
  readonly version: string;
  readonly copyright: string;
  /** How many glyphs the upright file has: what "all glyphs" means for this font. */
  readonly glyphs: number;
  readonly axes: readonly Axis[];
  readonly files: { readonly upright: FontFile; readonly italic?: FontFile };
  readonly licenseFile: string;
  /** The default instance cut to the letters of the family name, for the font list. */
  readonly nameFile: string;
  /** liga joins f and i and no Turkish locl rule stops it, so 'fi' may lose the dot of a Turkish i. */
  readonly fiLigatureNoTurkishRule: boolean;
};

export type Catalog = { readonly source: { readonly repository: string; readonly commit: string }; readonly fonts: readonly CatalogFont[] };

const CATEGORIES: readonly Category[] = ["sans", "serif", "slab", "display", "mono", "handwriting"];
export const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const TAG = /^[A-Za-z0-9]{4}$/;

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Turns catalog.json, as scripts/build-catalog.py writes it, into the catalog the app uses.
 * This is the one place that decides what may enter the catalog: a font with a Reserved
 * Font Name, a license other than OFL 1.1, or missing Turkish letters is refused, and every
 * problem is listed at once.
 */
export function parseCatalog(data: unknown): Catalog {
  const problems: string[] = [];
  if (!isObject(data) || data.schemaVersion !== 1 || !isObject(data.source) || !Array.isArray(data.fonts)) {
    throw new Error("catalog.json: expected schemaVersion 1, source and fonts");
  }
  const seen = new Set<string>();
  const fonts = data.fonts.flatMap((raw: unknown, index): CatalogFont[] => {
    const at = isObject(raw) && typeof raw.id === "string" ? raw.id : `font ${index}`;
    const fail = (why: string) => problems.push(`${at}: ${why}`);
    if (!isObject(raw)) return fail("not an object"), [];
    const { id, category, family, version, copyright, licenseCopyright, licenseDescription, glyphs, axes, files, licenseFile, nameFile, missingTurkish, fiLigatureWithoutLocl } = raw;
    const before = problems.length;
    if (typeof id !== "string" || !ID.test(id)) fail("id must be lowercase words joined by hyphens");
    else if (seen.has(id)) fail("id used twice");
    else seen.add(id);
    if (!CATEGORIES.includes(category as Category)) fail(`unknown category ${String(category)}`);
    if (typeof family !== "string" || !family) fail("no family name");
    if (typeof copyright !== "string" || typeof licenseCopyright !== "string" || /reserved\s+font\s+names?/i.test(copyright + licenseCopyright)) {
      fail("declares a Reserved Font Name");
    }
    if (typeof licenseDescription !== "string" || !/SIL Open Font License, Version 1\.1/.test(licenseDescription)) fail("license is not SIL OFL 1.1");
    if (!Number.isInteger(glyphs) || (glyphs as number) < 1) fail(`bad glyph count ${String(glyphs)}`);
    if (!Array.isArray(missingTurkish) || missingTurkish.length > 0) fail(`missing Turkish letters ${JSON.stringify(missingTurkish)}`);
    const parsedAxes = Array.isArray(axes) ? axes.flatMap((a: unknown) => {
      if (isObject(a) && typeof a.tag === "string" && TAG.test(a.tag) && typeof a.min === "number" && typeof a.default === "number" && typeof a.max === "number" && a.min <= a.default && a.default <= a.max) {
        const axis: Axis = { tag: a.tag, min: a.min, default: a.default, max: a.max };
        // A break point lies past the font's own range and inside the slider's reach.
        const r = reach(axis);
        const below = a.breaksBelow, above = a.breaksAbove;
        const belowOk = below === undefined || (typeof below === "number" && below >= r.min && below <= a.min);
        const aboveOk = above === undefined || (typeof above === "number" && above <= r.max && above >= a.max);
        if (belowOk && aboveOk) return [{ ...axis, ...(below !== undefined ? { breaksBelow: below as number } : {}), ...(above !== undefined ? { breaksAbove: above as number } : {}) }];
      }
      fail(`bad axis ${JSON.stringify(a)}`);
      return [];
    }) : [];
    if (parsedAxes.length === 0) fail("not a variable font");
    const file = (f: unknown): FontFile | undefined =>
      isObject(f) && typeof f.path === "string" && typeof f.source === "string" && typeof f.bytes === "number" ? { path: f.path, source: f.source, bytes: f.bytes } : undefined;
    const upright = isObject(files) ? file(files.upright) : undefined;
    const italic = isObject(files) && files.italic !== undefined ? file(files.italic) : undefined;
    if (!upright) fail("no upright file");
    if (isObject(files) && files.italic !== undefined && !italic) fail("bad italic file");
    if (typeof licenseFile !== "string") fail("no license file");
    if (typeof nameFile !== "string") fail("no name preview file");
    if (problems.length > before) return [];
    return [{
      id: id as string, category: category as Category, family: family as string, version: String(version), copyright: copyright as string,
      glyphs: glyphs as number, axes: parsedAxes, files: italic ? { upright: upright!, italic } : { upright: upright! }, licenseFile: licenseFile as string, nameFile: nameFile as string,
      fiLigatureNoTurkishRule: fiLigatureWithoutLocl === true,
    }];
  });
  if (problems.length > 0) throw new Error(`catalog.json has ${problems.length} problem(s):\n${problems.join("\n")}`);
  const source = data.source;
  return { source: { repository: String(source.repository), commit: String(source.commit) }, fonts };
}
