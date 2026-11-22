/** The font's own .notdef glyph as an SVG path, so a missing letter shows the box this font draws. */
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
  const head = t.get("head"), hhea = t.get("hhea"), hmtx = t.get("hmtx"), loca = t.get("loca"), glyf = t.get("glyf");
  if (!head || !hhea || !hmtx || !loca || !glyf) return null;
  const longLoca = view(head).getInt16(50) === 1;
  const l = view(loca);
  const start = longLoca ? l.getUint32(0) : l.getUint16(0) * 2;
  const end = longLoca ? l.getUint32(4) : l.getUint16(2) * 2;
  const metrics = {
    advance: view(hmtx).getUint16(0),
    unitsPerEm: view(head).getUint16(18),
    ascender: view(hhea).getInt16(4),
    descender: view(hhea).getInt16(6),
  };
  if (end <= start) return { path: "", ...metrics };
  const path = outline(glyf.subarray(start, end));
  return path === null ? null : { path, ...metrics };
}

const ON_CURVE = 1, X_SHORT = 2, Y_SHORT = 4, REPEAT = 8, X_SAME = 16, Y_SAME = 32;

function outline(g: Uint8Array): string | null {
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

  let d = "";
  let first = 0;
  for (const last of ends) {
    const pts = [];
    for (let i = first; i <= last; i++) pts.push({ x: xs[i]!, y: ys[i]!, on: (flags[i]! & ON_CURVE) !== 0 });
    first = last + 1;
    if (pts.length === 0) continue;
    // Start on an on-curve point; between two off-curve points TrueType implies one halfway.
    const k = pts.findIndex((p) => p.on);
    const ring = k < 0 ? pts : [...pts.slice(k), ...pts.slice(0, k)];
    const start = k < 0 ? { x: (pts.at(-1)!.x + pts[0]!.x) / 2, y: (pts.at(-1)!.y + pts[0]!.y) / 2, on: true } : ring[0]!;
    d += `M${start.x} ${start.y}`;
    let control: { x: number; y: number } | null = null;
    for (const p of k < 0 ? ring : ring.slice(1)) {
      if (p.on) {
        d += control ? `Q${control.x} ${control.y} ${p.x} ${p.y}` : `L${p.x} ${p.y}`;
        control = null;
      } else {
        if (control) d += `Q${control.x} ${control.y} ${(control.x + p.x) / 2} ${(control.y + p.y) / 2}`;
        control = p;
      }
    }
    if (control) d += `Q${control.x} ${control.y} ${start.x} ${start.y}`;
    d += "Z";
  }
  return d;
}
