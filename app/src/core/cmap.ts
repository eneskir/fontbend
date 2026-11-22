/** Which characters a font draws, from its cmap table. */
import { view } from "./sfnt";

/** The code points the font maps to a glyph other than .notdef. */
export const codePoints = (cmap: Uint8Array): Set<number> => new Set(glyphMap(cmap).keys());

/**
 * Code point to glyph index, for every code point mapped to a glyph other than .notdef. Reads
 * the full Unicode subtable (format 12) when there is one, otherwise the BMP one (format 4).
 */
export function glyphMap(cmap: Uint8Array): Map<number, number> {
  const v = view(cmap);
  const count = v.getUint16(2);
  const subtables: { format: number; at: number; rank: number }[] = [];
  for (let i = 0; i < count; i++) {
    const platform = v.getUint16(4 + i * 8), encoding = v.getUint16(6 + i * 8);
    const at = v.getUint32(8 + i * 8);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode || at + 2 > cmap.length) continue;
    const format = v.getUint16(at);
    if (format === 12) subtables.push({ format, at, rank: 0 });
    else if (format === 4) subtables.push({ format, at, rank: 1 });
  }
  const best = subtables.sort((a, b) => a.rank - b.rank)[0];
  if (!best) throw new Error("the font has no Unicode character map");
  return best.format === 12 ? format12(v, best.at) : format4(v, best.at);
}

function format12(v: DataView, at: number): Map<number, number> {
  const out = new Map<number, number>();
  const groups = v.getUint32(at + 12);
  for (let g = 0; g < groups; g++) {
    const p = at + 16 + g * 12;
    const start = v.getUint32(p), end = v.getUint32(p + 4), glyph = v.getUint32(p + 8);
    for (let c = start; c <= end; c++) if (glyph + (c - start) !== 0) out.set(c, glyph + (c - start));
  }
  return out;
}

function format4(v: DataView, at: number): Map<number, number> {
  const out = new Map<number, number>();
  const segments = v.getUint16(at + 6) / 2;
  const ends = at + 14, starts = ends + segments * 2 + 2, deltas = starts + segments * 2, offsets = deltas + segments * 2;
  for (let s = 0; s < segments; s++) {
    const end = v.getUint16(ends + s * 2), start = v.getUint16(starts + s * 2);
    const delta = v.getInt16(deltas + s * 2), offsetAt = offsets + s * 2, offset = v.getUint16(offsetAt);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      const glyph = offset === 0 ? (c + delta) & 0xffff : (() => {
        const g = v.getUint16(offsetAt + offset + (c - start) * 2);
        return g === 0 ? 0 : (g + delta) & 0xffff;
      })();
      if (glyph !== 0) out.set(c, glyph);
    }
  }
  return out;
}
