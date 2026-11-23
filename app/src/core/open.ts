/**
 * A font file the user opens: read and checked here, at the edge, before any other part sees it.
 * The file never leaves the computer; only what it says about itself is read.
 */
import { withSynthetic, type Axis } from "./axis";
import { TAG, type CatalogFont } from "./catalog";
import { readNames, type NameRecord } from "./names";
import { readTables, tagAt, view } from "./sfnt";

/** The largest file Fontbend opens; most font sites also offer a smaller, Latin-only one. */
export const OPEN_MAX = 20 * 1024 * 1024;

/**
 * "ofl": SIL OFL 1.1, so the license travels with the made font. "reserved": OFL 1.1 with a
 * Reserved Font Name, which a changed font may not carry. "unknown": anything else.
 */
export type License = "ofl" | "reserved" | "unknown";

export type OpenedFile = {
  /** The font as a plain TrueType file, unpacked from WOFF or WOFF2. */
  readonly bytes: Uint8Array;
  readonly family: string;
  readonly version: string;
  readonly copyright: string;
  readonly glyphs: number;
  /** The font's own axes, as its fvar table declares them. */
  readonly axes: readonly Axis[];
  readonly license: License;
};

export type OpenProblem =
  | { readonly kind: "too-big"; readonly bytes: number }
  | { readonly kind: "broken"; readonly why: string }
  | { readonly kind: "not-variable" }
  /** PostScript (CFF) outlines: Fontbend changes TrueType outlines only. */
  | { readonly kind: "outlines" };

export type Opened = { readonly ok: true; readonly file: OpenedFile } | { readonly ok: false; readonly problem: OpenProblem };

const broken = (why: string): Opened => ({ ok: false, problem: { kind: "broken", why } });

/**
 * Reads a TTF, OTF, WOFF or WOFF2 file. `woff2` unpacks WOFF2, which needs Brotli; it is passed
 * in so the page loads the decoder only for such a file.
 */
export async function readFontFile(input: Uint8Array, woff2: (bytes: Uint8Array) => Promise<Uint8Array>): Promise<Opened> {
  if (input.length > OPEN_MAX) return { ok: false, problem: { kind: "too-big", bytes: input.length } };
  if (input.length < 12) return broken("too short to be a font");
  const magic = tagAt(input, 0);
  let bytes: Uint8Array;
  try {
    if (magic === "wOFF") bytes = await unpackWoff(input);
    // A copy: the decoder may hand back a view of its own memory, which its next run overwrites.
    else if (magic === "wOF2") bytes = (await woff2(input)).slice();
    else bytes = input;
  } catch (err) {
    return broken(`can't unpack ${magic}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const flavor = tagAt(bytes, 0);
  if (flavor === "ttcf") return broken("a font collection");
  if (flavor === "OTTO") return { ok: false, problem: { kind: "outlines" } };
  if (flavor !== "\0\x01\0\0" && flavor !== "true") return broken("not a font file");

  let tables: Map<string, Uint8Array>;
  try { tables = readTables(bytes); } catch (err) { return broken(err instanceof Error ? err.message : String(err)); }
  if (!tables.has("glyf")) return tables.has("CFF ") || tables.has("CFF2") ? { ok: false, problem: { kind: "outlines" } } : broken("no glyf table");
  for (const tag of ["head", "hhea", "hmtx", "maxp", "loca", "cmap", "name", "post"]) if (!tables.has(tag)) return broken(`no ${tag} table`);
  if (!tables.has("fvar") || !tables.has("gvar")) return { ok: false, problem: { kind: "not-variable" } };

  try {
    const axes = readAxes(tables.get("fvar")!);
    if (axes.length === 0) return { ok: false, problem: { kind: "not-variable" } };
    const names = readNames(tables.get("name")!);
    const copyright = nameText(names, 0);
    return {
      ok: true,
      file: {
        bytes,
        family: nameText(names, 16) || nameText(names, 1),
        version: nameText(names, 5),
        copyright,
        glyphs: view(tables.get("maxp")!).getUint16(4),
        axes,
        license: licenseOf(copyright, `${nameText(names, 13)} ${nameText(names, 14)}`),
      },
    };
  } catch (err) {
    return broken(err instanceof Error ? err.message : String(err));
  }
}

/** The license a font declares in its copyright (name 0) and license description and URL (names 13, 14). */
export function licenseOf(copyright: string, license: string): License {
  const ofl = /SIL Open Font License,?\s*(Version\s*|v\.?\s*)?1\.1/i.test(license) || /openfontlicense\.org|scripts\.sil\.org\/OFL/i.test(license);
  const reserved = /reserved\s+font\s+names?/i.test(`${copyright} ${license}`);
  return ofl ? (reserved ? "reserved" : "ofl") : "unknown";
}

/** A name in English where the font has one, else in any language it has. */
function nameText(names: readonly NameRecord[], id: number): string {
  const all = names.filter((r) => r.id === id);
  const pick = all.find((r) => r.platform === 3 && r.language === 0x409) ?? all.find((r) => r.platform === 3) ?? all[0];
  return pick?.text.trim() ?? "";
}

/** The axes of an fvar table; a bad one makes the whole file unreadable. */
function readAxes(fvar: Uint8Array): Axis[] {
  const v = view(fvar);
  const first = v.getUint16(4), count = v.getUint16(8), size = v.getUint16(10);
  if (size < 20 || first + count * size > fvar.length) throw new Error("fvar runs past its end");
  const axes: Axis[] = [];
  for (let i = 0; i < count; i++) {
    const at = first + i * size;
    const tag = tagAt(fvar, at), min = v.getInt32(at + 4) / 65536, def = v.getInt32(at + 8) / 65536, max = v.getInt32(at + 12) / 65536;
    if (!TAG.test(tag) || !(min <= def && def <= max) || axes.some((a) => a.tag === tag)) throw new Error(`bad axis ${JSON.stringify(tag)} ${min} ${def} ${max}`);
    axes.push({ tag, min, default: def, max });
  }
  return axes;
}

/** A WOFF 1.0 file back to the font it packs: each table is stored as is or zlib-compressed. */
async function unpackWoff(woff: Uint8Array): Promise<Uint8Array> {
  const v = view(woff);
  const flavor = v.getUint32(4), count = v.getUint16(12);
  const tables: { tag: string; data: Uint8Array }[] = [];
  for (let i = 0; i < count; i++) {
    const at = 44 + i * 20;
    const offset = v.getUint32(at + 4), compLength = v.getUint32(at + 8), origLength = v.getUint32(at + 12);
    if (offset + compLength > woff.length) throw new Error(`table ${tagAt(woff, at)} runs past the end of the file`);
    const stored = woff.subarray(offset, offset + compLength);
    const data = compLength === origLength ? stored : await inflate(stored);
    if (data.length !== origLength) throw new Error(`table ${tagAt(woff, at)} unpacks to the wrong length`);
    tables.push({ tag: tagAt(woff, at), data });
  }
  // A plain table directory, each table 4-byte aligned; checksums aren't read by anything here.
  let at = 12 + count * 16;
  const out = new Uint8Array(at + tables.reduce((n, t) => n + ((t.data.length + 3) & ~3), 0));
  const o = view(out);
  o.setUint32(0, flavor);
  o.setUint16(4, count);
  tables.forEach((t, i) => {
    const d = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[d + k] = t.tag.charCodeAt(k);
    o.setUint32(d + 8, at);
    o.setUint32(d + 12, t.data.length);
    out.set(t.data, at);
    at += (t.data.length + 3) & ~3;
  });
  return out;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * The opened file as a font the editor works with, beside the catalog's. `url` serves its bytes
 * on this page only (a blob: URL); `oflTemplate` is a catalog OFL.txt, whose license text travels
 * with an OFL font (oflText).
 */
export function openedFont(file: OpenedFile, origin: { readonly sha256: string; readonly fileName: string; readonly url: string; readonly oflTemplate: string }): CatalogFont {
  const stem = origin.fileName.replace(/\.[^.]+$/, "");
  return {
    id: `local-${origin.sha256.slice(0, 16)}`,
    category: null,
    family: file.family || stem || "Font",
    version: file.version,
    copyright: file.copyright,
    glyphs: file.glyphs,
    axes: withSynthetic(file.axes),
    files: { upright: { path: origin.url, source: origin.fileName, bytes: file.bytes.length } },
    licenseFile: origin.oflTemplate,
    nameFile: origin.url,
    local: { sha256: origin.sha256, fileName: origin.fileName, license: file.license },
  };
}

/** OFL.txt for an opened OFL font: its own copyright line over the license text of a catalog OFL.txt. */
export function oflText(copyright: string, template: string): string {
  const start = template.indexOf("This Font Software is licensed");
  return `${copyright}\n\n${start >= 0 ? template.slice(start) : template}`;
}
