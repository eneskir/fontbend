/** The font's own .notdef glyph as an SVG path, so a missing letter shows the box this font draws. */
import { glyphData, parseGlyph, segments, type Segment } from "./glyf";
import { readTables, view } from "./sfnt";

export type Notdef = {
  /** SVG path in font units, y pointing up (flip it when drawing). */
  readonly path: string;
  readonly advance: number;
  readonly unitsPerEm: number;
  readonly ascender: number;
  readonly descender: number;
};

/** Null when the font has no TrueType outlines or glyph 0 is a composite. */
export function readNotdef(font: Uint8Array): Notdef | null {
  const t = readTables(font);
  const head = t.get("head"), hhea = t.get("hhea"), hmtx = t.get("hmtx"), data = glyphData(t, 0);
  if (!head || !hhea || !hmtx || !data) return null;
  const glyph = parseGlyph(data);
  if (!glyph) return null;
  return {
    path: toPath(segments(glyph)),
    advance: view(hmtx).getUint16(0),
    unitsPerEm: view(head).getUint16(18),
    ascender: view(hhea).getInt16(4),
    descender: view(hhea).getInt16(6),
  };
}

/** SVG path data; a contour's closing straight line is left to Z. */
function toPath(contours: Segment[][]): string {
  let d = "";
  for (const c of contours) {
    if (c.length === 0) continue;
    d += `M${c[0]!.x0} ${c[0]!.y0}`;
    c.forEach((s, i) => {
      if (s.cx !== null) d += `Q${s.cx} ${s.cy} ${s.x1} ${s.y1}`;
      else if (i < c.length - 1) d += `L${s.x1} ${s.y1}`;
    });
    d += "Z";
  }
  return d;
}
