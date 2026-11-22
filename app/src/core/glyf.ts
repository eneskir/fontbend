/** Simple glyphs from the glyf table: points and contours, as the font stores them. */
import { readTables, view } from "./sfnt";

export type Point = { x: number; y: number; on: boolean };
export type Glyph = { readonly points: Point[]; readonly ends: readonly number[] };

const ON_CURVE = 1, X_SHORT = 2, Y_SHORT = 4, REPEAT = 8, X_SAME = 16, Y_SAME = 32;

/** The glyph's data in glyf, found through loca; empty for a glyph with no outline. */
export function glyphData(tables: Map<string, Uint8Array>, gid: number): Uint8Array | null {
  const head = tables.get("head"), loca = tables.get("loca"), glyf = tables.get("glyf");
  if (!head || !loca || !glyf) return null;
  const long = view(head).getInt16(50) === 1, l = view(loca);
  if ((gid + 1) * (long ? 4 : 2) >= loca.length) return null;
  const start = long ? l.getUint32(gid * 4) : l.getUint16(gid * 2) * 2;
  const end = long ? l.getUint32(gid * 4 + 4) : l.getUint16(gid * 2 + 2) * 2;
  return glyf.subarray(start, Math.max(start, end));
}

/** Points and contour ends of a simple glyph; null for a composite. */
export function parseGlyph(g: Uint8Array): Glyph | null {
  if (g.length === 0) return { points: [], ends: [] };
  const v = view(g);
  const contours = v.getInt16(0);
  if (contours < 0) return null;
  const ends = Array.from({ length: contours }, (_, i) => v.getUint16(10 + i * 2));
  const count = contours ? ends[contours - 1]! + 1 : 0;
  let at = 10 + contours * 2;
  at += 2 + v.getUint16(at); // instructions
  const flags: number[] = [];
  while (flags.length < count) {
    const f = g[at++]!;
    flags.push(f);
    if (f & REPEAT) for (let n = g[at++]!; n > 0; n--) flags.push(f);
  }
  const coords = (short: number, same: number) => {
    let value = 0;
    return flags.map((f) => {
      if (f & short) { const d = g[at++]!; value += f & same ? d : -d; }
      else if (!(f & same)) { value += v.getInt16(at); at += 2; }
      return value;
    });
  };
  const xs = coords(X_SHORT, X_SAME), ys = coords(Y_SHORT, Y_SAME);
  return { points: flags.map((f, i) => ({ x: xs[i]!, y: ys[i]!, on: (f & ON_CURVE) !== 0 })), ends };
}

/** A glyph of a font file by index; null when it is missing or a composite. */
export function readGlyph(font: Uint8Array, gid: number): Glyph | null {
  const data = glyphData(readTables(font), gid);
  return data ? parseGlyph(data) : null;
}

const WORDS = 1, XY_VALUES = 2, SCALE = 8, MORE = 0x20, XY_SCALE = 0x40, TWO_BY_TWO = 0x80, SCALED_OFFSET = 0x800;

/**
 * A glyph's outline with composites resolved into their parts' points. Null when the glyph is
 * missing, or a part is placed by matching points (rare; its place would need the parts' points).
 */
export function outline(tables: Map<string, Uint8Array>, gid: number, depth = 0): Glyph | null {
  const g = glyphData(tables, gid);
  if (!g || depth > 8) return null;
  if (g.length === 0 || view(g).getInt16(0) >= 0) return parseGlyph(g);
  const v = view(g), points: Point[] = [], ends: number[] = [];
  let at = 10, flags: number;
  do {
    flags = v.getUint16(at);
    const part = v.getUint16(at + 2);
    at += 4;
    const dx = flags & WORDS ? v.getInt16(at) : v.getInt8(at), dy = flags & WORDS ? v.getInt16(at + 2) : v.getInt8(at + 1);
    at += flags & WORDS ? 4 : 2;
    if (!(flags & XY_VALUES)) return null;
    const f2 = () => { const n = v.getInt16(at) / 16384; at += 2; return n; };
    let a = 1, b = 0, c = 0, d = 1;
    if (flags & SCALE) a = d = f2();
    else if (flags & XY_SCALE) { a = f2(); d = f2(); }
    else if (flags & TWO_BY_TWO) { a = f2(); b = f2(); c = f2(); d = f2(); }
    const p = outline(tables, part, depth + 1);
    if (!p) return null;
    const [ox, oy] = flags & SCALED_OFFSET ? [a * dx + c * dy, b * dx + d * dy] : [dx, dy];
    for (const e of p.ends) ends.push(points.length + e);
    for (const q of p.points) points.push({ x: a * q.x + c * q.y + ox, y: b * q.x + d * q.y + oy, on: q.on });
  } while (flags & MORE);
  return { points, ends };
}

export type Segment = { x0: number; y0: number; cx: number | null; cy: number | null; x1: number; y1: number };

/** Each contour as lines and quadratic curves, with the on-curve points TrueType implies between two off-curve ones. */
export function segments(glyph: Glyph): Segment[][] {
  const out: Segment[][] = [];
  let first = 0;
  for (const last of glyph.ends) {
    const pts = glyph.points.slice(first, last + 1);
    first = last + 1;
    if (pts.length === 0) continue;
    const k = pts.findIndex((p) => p.on);
    const ring = k < 0 ? pts : [...pts.slice(k), ...pts.slice(0, k)];
    const start = k < 0 ? { x: (pts.at(-1)!.x + pts[0]!.x) / 2, y: (pts.at(-1)!.y + pts[0]!.y) / 2, on: true } : ring[0]!;
    const contour: Segment[] = [];
    let from = start;
    let control: Point | null = null;
    const to = (p: Point) => { contour.push({ x0: from.x, y0: from.y, cx: control?.x ?? null, cy: control?.y ?? null, x1: p.x, y1: p.y }); from = p; control = null; };
    for (const p of k < 0 ? ring : ring.slice(1)) {
      if (p.on) to(p);
      else {
        if (control) to({ x: (control.x + p.x) / 2, y: (control.y + p.y) / 2, on: true });
        control = p;
      }
    }
    to(start); // closes the contour, through the last control point if one is left
    out.push(contour);
  }
  return out;
}
