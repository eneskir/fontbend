/**
 * Slants or widens a whole font, variable or not, by one linear map of x: x' = a·x + b·y + c.
 * A slant for a font with no slnt axis is a shear (b = tan of the angle, c centers it on half
 * the x-height); a width for a font with no wdth axis is a scale (a). Lines stay lines and
 * quadratic curves stay quadratic, so outlines keep their points, and gvar's deltas map the same
 * way: the font stays variable, and every instance of the new font is the old instance, mapped.
 *
 * Measured on the catalog (29 files, 12° and 80%, 3-5 instances each): an instance of the mapped
 * font is the mapped instance within a few units, from rounding each tuple's deltas (mean 0.32,
 * worst 4.2); every file passes OTS. Two traps the phase 7a measurement found first: hmtx's lsb
 * must become the new xMin, or readers shift the glyph back by the difference; and a component's
 * own matrix must become T·M·T⁻¹, or the part is mapped twice.
 *
 * gvar deltas that readers infer (IUP) are inferred from x along x: after a shear the inferred
 * value is no longer the mapped one, so such a tuple lists every point unless its inferred
 * values still land within half a unit. HVAR and VVAR are dropped: readers then take advances
 * from gvar's phantom points, which map with the rest. Hinting is dropped, since it moves
 * points along x by the old outlines. GPOS and GDEF map in layout.ts; MVAR's x values (the
 * caret's run, sub- and superscript x offsets) map here with their OS/2 and hhea fields.
 */
import { glyphData, outline, parseGlyph, type Glyph } from "./glyf";
import { mapLayout } from "./layout";
import { readTables, tagAt, view, writeFont } from "./sfnt";
import { sharedPeaks, sparseOrFull, writeGvar as encodeGvar, type Written } from "./gvar";
import { deltasFor, readTuples, type Tuple } from "./variation";
import { VarStore, varRef, type VarRef } from "./varstore";

/** x' = a·x + b·y + c; y stays. */
export type Shear = { readonly a: number; readonly b: number; readonly c: number };

/** Leans the font by `degrees` (positive: to the right, as an italic), turning about half its x-height. */
export function slant(font: Uint8Array, degrees: number): Shear {
  const b = Math.tan((degrees * Math.PI) / 180);
  return { a: 1, b, c: -b * xHeight(font) / 2 };
}

/** Scales the font's width by `scale` (1 keeps it). */
export function widen(scale: number): Shear {
  return { a: scale, b: 0, c: 0 };
}

/** OS/2's x-height, or half the em when the font does not give one. */
function xHeight(font: Uint8Array): number {
  const t = readTables(font);
  const os2 = t.get("OS/2"), head = t.get("head");
  const given = os2 && view(os2).getUint16(0) >= 2 && os2.length >= 88 ? view(os2).getInt16(86) : 0;
  return given > 0 ? given : head ? view(head).getUint16(18) / 2 : 500;
}

function fail(why: string): never {
  throw new Error(`transformFont: ${why}`);
}

// Composite flags (glyf).
const WORDS = 1, XY_VALUES = 2, ROUND_XY = 4, SCALE = 8, MORE = 0x20, XY_SCALE = 0x40, TWO_BY_TWO = 0x80;
const MY_METRICS = 0x200, OVERLAP_COMPOUND = 0x400, SCALED_OFFSET = 0x800, UNSCALED_OFFSET = 0x1000;
// Simple glyph flags.
const ON_CURVE = 1, X_SHORT = 2, Y_SHORT = 4, REPEAT = 8, X_SAME = 16, Y_SAME = 32, OVERLAP_SIMPLE = 0x40;
const DROPPED = ["fpgm", "prep", "cvt ", "cvar", "hdmx", "LTSH", "VDMX", "HVAR", "VVAR", "DSIG"];

/** A component's 2×2 matrix as glyf stores it: x' = a·x + c·y, y' = b·x + d·y. */
type Matrix = readonly [a: number, b: number, c: number, d: number];
export type Part = { flags: number; gid: number; dx: number; dy: number; m: Matrix };
export type Source =
  | { kind: "empty" }
  | { kind: "simple"; glyph: Glyph; overlap: boolean }
  | { kind: "composite"; parts: Part[] };

export function transformFont(input: Uint8Array, t: Shear): Uint8Array {
  if (!(t.a > 0)) fail("the scale must be positive");
  const tables = readTables(input);
  const need = (tag: string) => tables.get(tag) ?? fail(`no ${tag} table`);
  const head = need("head"), maxp = need("maxp"), hhea = need("hhea"), hmtx = need("hmtx");
  need("glyf"); need("loca");
  const glyphCount = view(maxp).getUint16(4), metricCount = view(hhea).getUint16(34);
  if (metricCount === 0 || metricCount > glyphCount || hmtx.length < metricCount * 4 + (glyphCount - metricCount) * 2) fail("hmtx is shorter than its glyphs");
  const advances = Array.from({ length: glyphCount }, (_, g) => view(hmtx).getUint16(Math.min(g, metricCount - 1) * 4));

  const sources = Array.from({ length: glyphCount }, (_, g) => readSource(glyphData(tables, g)));
  const gvar = tables.get("gvar");
  const tuples = gvar ? sources.map((s, g) => readTuples(gvar, g, pointCount(s) + 4)) : null;

  const moved = sources.map((s) => moveSource(s, t));
  const glyphs = moved.map(encodeGlyph);
  const loca = new Uint8Array((glyphCount + 1) * 4);
  const glyf = new Uint8Array(glyphs.reduce((n, g) => n + g.length, 0));
  let at = 0;
  glyphs.forEach((g, i) => { view(loca).setUint32(i * 4, at); glyf.set(g, at); at += g.length; });
  view(loca).setUint32(glyphCount * 4, at);
  const newHead = head.slice();
  view(newHead).setInt16(50, 1); // long loca

  const out = new Map(tables);
  for (const tag of DROPPED) out.delete(tag);
  out.set("glyf", glyf);
  out.set("loca", loca);
  out.set("head", newHead);

  // A composite's bounds come from its parts, now mapped.
  const bounds = glyphs.map((g, i) => {
    if (g.length === 0) return null;
    if (moved[i]!.kind === "simple") return readBounds(g);
    const o = outline(out, i);
    const box = o && o.points.length ? boxOf(o.points) : mappedBox(readBounds(g), t);
    const v = view(g);
    v.setInt16(2, box.xMin); v.setInt16(4, box.yMin); v.setInt16(6, box.xMax); v.setInt16(8, box.yMax);
    return box;
  });

  if (gvar && tuples) out.set("gvar", writeGvar(gvar, sources, moved, tuples, t));
  for (const [tag, data] of mapLayout(tables, t)) out.set(tag, data);

  // Metrics: advances scale, and the left side bearing is the new xMin.
  const newAdvances = advances.map((x) => Math.round(t.a * x));
  const lsbs = bounds.map((b) => b?.xMin ?? 0);
  const newHmtx = new Uint8Array(metricCount * 4 + (glyphCount - metricCount) * 2);
  for (let g = 0; g < glyphCount; g++) {
    if (g < metricCount) { view(newHmtx).setUint16(g * 4, newAdvances[g]!); view(newHmtx).setInt16(g * 4 + 2, lsbs[g]!); }
    else view(newHmtx).setInt16(metricCount * 4 + (g - metricCount) * 2, lsbs[g]!);
  }
  out.set("hmtx", newHmtx);

  const inked = bounds.flatMap((b, g) => (b ? [{ ...b, adv: newAdvances[g]! }] : []));
  const h = view(newHead);
  if (inked.length) {
    h.setInt16(36, Math.min(...inked.map((b) => b.xMin))); h.setInt16(38, Math.min(...inked.map((b) => b.yMin)));
    h.setInt16(40, Math.max(...inked.map((b) => b.xMax))); h.setInt16(42, Math.max(...inked.map((b) => b.yMax)));
  }

  const newHhea = hhea.slice(), hh = view(newHhea);
  hh.setUint16(10, Math.max(...newAdvances));
  if (inked.length) {
    hh.setInt16(12, Math.min(...inked.map((b) => b.xMin)));
    hh.setInt16(14, Math.min(...inked.map((b) => b.adv - b.xMax)));
    hh.setInt16(16, Math.max(...inked.map((b) => b.xMax)));
  }
  // The caret leans with the letters: the vector (run, rise), mapped and scaled by k so that a
  // small run (an upright font's is often 0 over 1) keeps its precision.
  const rise = hh.getInt16(18) || 1, run = hh.getInt16(20);
  const mvar = tables.get("MVAR"), metrics = mvar ? readMvar(mvar) : null;
  const k = caretFactor(metrics, t, rise, run);
  hh.setInt16(18, Math.round(k * rise)); hh.setInt16(20, Math.round(k * (t.a * run + t.b * rise)));
  hh.setInt16(22, Math.round(t.a * hh.getInt16(22))); // caretOffset
  out.set("hhea", newHhea);
  if (mvar && metrics) out.set("MVAR", mapMvar(mvar, metrics, t, k));

  const post = tables.get("post");
  if (post) {
    const p = post.slice();
    const was = Math.tan((-view(p).getInt32(4) / 65536) * Math.PI / 180);
    view(p).setInt32(4, Math.round((-Math.atan(t.a * was + t.b) * 180 / Math.PI) * 65536));
    out.set("post", p);
  }
  const os2 = tables.get("OS/2");
  if (os2) {
    const o = os2.slice();
    const v = view(o);
    v.setInt16(2, Math.round(t.a * v.getInt16(2))); // xAvgCharWidth
    // Sub- and superscripts move with the map; a subscript's y offset counts downward.
    v.setInt16(14, Math.round(t.a * v.getInt16(14) - t.b * v.getInt16(16)));
    v.setInt16(22, Math.round(t.a * v.getInt16(22) + t.b * v.getInt16(24)));
    out.set("OS/2", o);
  }
  if (view(maxp).getUint32(0) === 0x00010000) {
    const m = maxp.slice();
    view(m).setUint16(26, 0); // maxSizeOfInstructions
    out.set("maxp", m);
  }
  return writeFont(input, out);
}

type Mvar = { readonly store: VarStore; readonly refs: ReadonlyMap<string, VarRef> };

/** MVAR's store and its items by tag; null when it has no store. */
function readMvar(mvar: Uint8Array): Mvar | null {
  const v = view(mvar), size = v.getUint16(6), count = v.getUint16(8), storeAt = v.getUint16(10);
  if (!storeAt) return null;
  const refs = new Map<string, VarRef>();
  for (let i = 0; i < count; i++) {
    const r = 12 + i * size;
    const ref = varRef(v.getUint16(r + 4), v.getUint16(r + 6));
    if (ref) refs.set(tagAt(mvar, r), ref);
  }
  return { store: new VarStore(mvar.subarray(storeAt)), refs };
}

/**
 * The caret vector's scale: rise 1000, unless MVAR then moves rise or run past 16 bits (a font
 * with a slnt axis may keep rise 1 at the default and add 999 along the axis).
 */
function caretFactor(m: Mvar | null, t: Shear, rise: number, run: number): number {
  const was = (tag: string) => m?.refs.get(tag) ?? null;
  const reachRise = Math.abs(rise) + (m ? m.store.reach([[was("hcrs"), 1]]) : 0);
  const reachRun = Math.abs(t.a * run + t.b * rise) + (m ? m.store.reach([[was("hcrn"), t.a], [was("hcrs"), t.b]]) : 0);
  return Math.min(1000 / Math.abs(rise), 30000 / Math.max(reachRise, reachRun));
}

/** MVAR's variations of the x values mapped above; `k` is the factor the caret vector was scaled by. */
function mapMvar(mvar: Uint8Array, m: Mvar, t: Shear, k: number): Uint8Array {
  const { store, refs } = m;
  const was = (tag: string) => refs.get(tag) ?? null;
  const mapped = new Map(refs);
  const set = (tag: string, ref: VarRef | null) => (ref ? mapped.set(tag, ref) : mapped.delete(tag));
  set("hcrs", store.combine([[was("hcrs"), k]]));
  set("hcrn", store.combine([[was("hcrn"), k * t.a], [was("hcrs"), k * t.b]]));
  set("hcof", store.combine([[was("hcof"), t.a]]));
  set("sbxo", store.combine([[was("sbxo"), t.a], [was("sbyo"), -t.b]]));
  set("spxo", store.combine([[was("spxo"), t.a], [was("spyo"), t.b]]));

  const tags = [...mapped.keys()].sort(), body = store.write();
  const out = new Uint8Array(12 + tags.length * 8 + body.length), w = view(out);
  out.set(mvar.subarray(0, 6));
  w.setUint16(6, 8); w.setUint16(8, tags.length); w.setUint16(10, 12 + tags.length * 8);
  tags.forEach((tag, i) => {
    const r = 12 + i * 8, ref = mapped.get(tag)!;
    for (let c = 0; c < 4; c++) out[r + c] = tag.charCodeAt(c);
    w.setUint16(r + 4, ref.outer); w.setUint16(r + 6, ref.inner);
  });
  out.set(body, 12 + tags.length * 8);
  return out;
}

export function readSource(g: Uint8Array | null): Source {
  if (!g || g.length < 10) return { kind: "empty" };
  const v = view(g);
  const contours = v.getInt16(0);
  if (contours === 0) return { kind: "empty" };
  if (contours > 0) {
    const glyph = parseGlyph(g)!;
    const flagsAt = 10 + contours * 2 + 2 + v.getUint16(10 + contours * 2);
    return { kind: "simple", glyph, overlap: ((g[flagsAt] ?? 0) & OVERLAP_SIMPLE) !== 0 };
  }
  const parts: Part[] = [];
  let at = 10, flags: number;
  do {
    flags = v.getUint16(at);
    const gid = v.getUint16(at + 2);
    at += 4;
    const signed = (flags & XY_VALUES) !== 0;
    const word = (o: number) => (signed ? v.getInt16(o) : v.getUint16(o));
    const byte = (o: number) => (signed ? v.getInt8(o) : v.getUint8(o));
    const dx = flags & WORDS ? word(at) : byte(at), dy = flags & WORDS ? word(at + 2) : byte(at + 1);
    at += flags & WORDS ? 4 : 2;
    const f2 = () => { const n = v.getInt16(at) / 16384; at += 2; return n; };
    let m: Matrix = [1, 0, 0, 1];
    if (flags & SCALE) { const s = f2(); m = [s, 0, 0, s]; }
    else if (flags & XY_SCALE) { const sx = f2(), sy = f2(); m = [sx, 0, 0, sy]; }
    else if (flags & TWO_BY_TWO) { const a = f2(), b = f2(), c = f2(), d = f2(); m = [a, b, c, d]; }
    parts.push({ flags, gid, dx, dy, m });
  } while (flags & MORE);
  return { kind: "composite", parts };
}

/** The part's matrix in mapped space: T·M·T⁻¹, with T = [[a, b], [0, 1]] (the c of the map cancels). */
function conjugate([ma, mb, mc, md]: Matrix, t: Shear): Matrix {
  // M = [[ma, mc], [mb, md]] on column vectors; T·M = [[a·ma + b·mb, a·mc + b·md], [mb, md]].
  const r00 = t.a * ma + t.b * mb, r01 = t.a * mc + t.b * md;
  return [r00 / t.a, mb / t.a, -r00 * t.b / t.a + r01, -mb * t.b / t.a + md];
}

/**
 * A part's offset in mapped space. The part's own points become T·p + c, so for the composite
 * to stay T(M·p + o) + c the offset becomes T·o + c − M'·c. Offsets scaled by the matrix
 * (SCALED_OFFSET) are first made plain.
 */
function partOffset(p: Part, t: Shear): { m: Matrix; x: number; y: number } {
  const m = conjugate(p.m, t);
  if (!(p.flags & XY_VALUES)) return { m, x: p.dx, y: p.dy }; // placed by matching points, which move with their glyphs
  const [ox, oy] = plainOffset(p, p.dx, p.dy);
  return { m, x: t.a * ox + t.b * oy + t.c - m[0] * t.c, y: oy - m[1] * t.c };
}

export function plainOffset(p: Part, x: number, y: number): [number, number] {
  const [a, b, c, d] = p.m;
  return p.flags & SCALED_OFFSET ? [a * x + c * y, b * x + d * y] : [x, y];
}

type Moved =
  | { kind: "empty" }
  | { kind: "simple"; glyph: Glyph; overlap: boolean }
  | { kind: "composite"; parts: (Part & { exact: { x: number; y: number } })[] };

function moveSource(s: Source, t: Shear): Moved {
  if (s.kind === "empty") return s;
  if (s.kind === "simple") {
    const points = s.glyph.points.map((p) => ({ x: Math.round(t.a * p.x + t.b * p.y + t.c), y: p.y, on: p.on }));
    return { kind: "simple", glyph: { points, ends: s.glyph.ends }, overlap: s.overlap };
  }
  return {
    kind: "composite",
    parts: s.parts.map((p) => {
      const o = partOffset(p, t);
      const xy = (p.flags & XY_VALUES) !== 0;
      return { ...p, m: o.m, dx: xy ? Math.round(o.x) : o.x, dy: xy ? Math.round(o.y) : o.y, exact: o, flags: xy && p.flags & SCALED_OFFSET ? (p.flags & ~SCALED_OFFSET) | UNSCALED_OFFSET : p.flags };
    }),
  };
}

type Box = { xMin: number; yMin: number; xMax: number; yMax: number };

function boxOf(points: readonly { x: number; y: number }[]): Box {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  return { xMin: Math.floor(Math.min(...xs)), yMin: Math.floor(Math.min(...ys)), xMax: Math.ceil(Math.max(...xs)), yMax: Math.ceil(Math.max(...ys)) };
}

function readBounds(g: Uint8Array): Box {
  const v = view(g);
  return { xMin: v.getInt16(2), yMin: v.getInt16(4), xMax: v.getInt16(6), yMax: v.getInt16(8) };
}

/** The box around a box's mapped corners: only for composites whose parts are placed by matching points. */
function mappedBox(b: Box, t: Shear): Box {
  return boxOf([b.xMin, b.xMax].flatMap((x) => [b.yMin, b.yMax].map((y) => ({ x: t.a * x + t.b * y + t.c, y }))));
}

function encodeGlyph(m: Moved): Uint8Array {
  if (m.kind === "empty") return new Uint8Array(0);
  return m.kind === "simple" ? encodeSimple(m.glyph, m.overlap) : encodeComposite(m.parts);
}

/** A simple glyph with short coordinates where they fit and repeated flags; no instructions. */
export function encodeSimple(glyph: Glyph, overlap: boolean): Uint8Array {
  const flags: number[] = [], xs: number[] = [], ys: number[] = [];
  let px = 0, py = 0;
  glyph.points.forEach((p, i) => {
    let f = p.on ? ON_CURVE : 0;
    if (i === 0 && overlap) f |= OVERLAP_SIMPLE;
    const coord = (d: number, short: number, same: number, out: number[]) => {
      if (d === 0) return same;
      if (d > -256 && d < 256) { out.push(Math.abs(d)); return short | (d > 0 ? same : 0); }
      out.push((d >> 8) & 0xff, d & 0xff);
      return 0;
    };
    f |= coord(p.x - px, X_SHORT, X_SAME, xs);
    f |= coord(p.y - py, Y_SHORT, Y_SAME, ys);
    px = p.x; py = p.y;
    flags.push(f);
  });
  const packed: number[] = [];
  for (let i = 0; i < flags.length;) {
    let n = 1;
    while (i + n < flags.length && flags[i + n] === flags[i] && n < 256) n++;
    if (n > 1) packed.push(flags[i]! | REPEAT, n - 1);
    else packed.push(flags[i]!);
    i += n;
  }
  const contours = glyph.ends.length;
  const size = 10 + contours * 2 + 2 + packed.length + xs.length + ys.length;
  const out = new Uint8Array(size + (size & 1));
  const v = view(out);
  const box = boxOf(glyph.points);
  v.setInt16(0, contours);
  v.setInt16(2, box.xMin); v.setInt16(4, box.yMin); v.setInt16(6, box.xMax); v.setInt16(8, box.yMax);
  glyph.ends.forEach((e, i) => v.setUint16(10 + i * 2, e));
  let at = 10 + contours * 2;
  v.setUint16(at, 0); at += 2;
  out.set(packed, at); at += packed.length;
  out.set(xs, at); at += xs.length;
  out.set(ys, at);
  return out;
}

const f2dot14 = (x: number) => {
  const n = Math.round(x * 16384);
  if (n < -32768 || n > 32767) fail("a component's matrix no longer fits");
  return n;
};

/** A composite with word offsets and the smallest matrix form; its bounds are filled in later. */
function encodeComposite(parts: readonly Part[]): Uint8Array {
  const bytes: number[] = [];
  const u16 = (x: number) => bytes.push((x >> 8) & 0xff, x & 0xff);
  u16(0xffff); for (let i = 0; i < 4; i++) u16(0);
  parts.forEach((p, i) => {
    const [a, b, c, d] = p.m.map(f2dot14) as [number, number, number, number];
    const form = b === 0 && c === 0 ? (a === 16384 && d === 16384 ? 0 : a === d ? SCALE : XY_SCALE) : TWO_BY_TWO;
    const xy = (p.flags & XY_VALUES) !== 0;
    const words = xy || (p.flags & WORDS) !== 0;
    const keep = p.flags & (XY_VALUES | ROUND_XY | MY_METRICS | OVERLAP_COMPOUND | SCALED_OFFSET | UNSCALED_OFFSET);
    u16(keep | form | (words ? WORDS : 0) | (i < parts.length - 1 ? MORE : 0));
    u16(p.gid);
    if (words) { u16(p.dx); u16(p.dy); } else bytes.push(p.dx & 0xff, p.dy & 0xff);
    if (form === SCALE) u16(a);
    else if (form === XY_SCALE) { u16(a); u16(d); }
    else if (form === TWO_BY_TWO) { u16(a); u16(b); u16(c); u16(d); }
  });
  if (bytes.length & 1) bytes.push(0);
  return Uint8Array.from(bytes);
}

/** gvar with every tuple's deltas mapped; peaks and regions stay, so shared tuples keep their meaning. */
function writeGvar(gvar: Uint8Array, sources: readonly Source[], moved: readonly Moved[], tuples: readonly Tuple[][], t: Shear): Uint8Array {
  const v = view(gvar);
  if (v.getUint16(12) !== sources.length) fail("gvar and maxp disagree on the number of glyphs");
  return encodeGvar(v.getUint16(4), sharedPeaks(gvar), tuples.map((list, g) => list.map((tuple) => mapTuple(tuple, sources[g]!, moved[g]!, t))));
}

/**
 * One tuple's deltas in mapped space: a point that moves by d moves by T·d (the c of the map
 * cancels). Rounding T·d on its own keeps each tuple within half a unit; rounding T(p + d) − T·p
 * instead doubled the drift where tuples meet (measured on the catalog: worst 8.4 against 4.2).
 */
function mapTuple(tuple: Tuple, source: Source, moved: Moved, t: Shear): Written {
  const n = pointCount(source);
  // Every point's delta, the inferred ones made explicit; points a tuple leaves out of a composite stay put.
  const [fx, fy] = fullDeltas(tuple, source);
  const nx = fx.slice(), ny = fy.slice();
  for (let i = 0; i < n; i++) {
    if (source.kind === "simple") nx[i] = Math.round(t.a * fx[i]! + t.b * fy[i]!);
    else if (source.kind === "composite") {
      const part = source.parts[i]!;
      if (!(part.flags & XY_VALUES)) continue; // point numbers do not move
      const [dx, dy] = plainOffset(part, fx[i]!, fy[i]!);
      nx[i] = Math.round(t.a * dx + t.b * dy);
      ny[i] = Math.round(dy);
    }
  }
  // Phantom points: the origin and the advance move along x only, so they scale.
  for (let i = n; i < n + 4; i++) nx[i] = Math.round(t.a * fx[i]!);
  return sparseOrFull(tuple, tuple.points, nx, ny, n, moved.kind === "simple" ? moved.glyph : null);
}

/** Outline points (or parts) of a glyph, phantoms not counted. */
export function pointCount(s: Source): number {
  return s.kind === "simple" ? s.glyph.points.length : s.kind === "composite" ? s.parts.length : 0;
}

/** A tuple's delta for every point and phantom: inferred ones made explicit, unlisted parts of a composite 0. */
export function fullDeltas(tuple: Tuple, source: Source): [number[], number[]] {
  const n = pointCount(source);
  const fx = new Array<number>(n + 4).fill(0), fy = new Array<number>(n + 4).fill(0);
  if (!tuple.points) tuple.dx.forEach((d, i) => { fx[i] = d; fy[i] = tuple.dy[i]!; });
  else tuple.points.forEach((p, i) => { if (p < n + 4) { fx[p] = tuple.dx[i]!; fy[p] = tuple.dy[i]!; } });
  if (source.kind === "simple" && tuple.points) {
    const [ix, iy] = deltasFor(tuple, source.glyph);
    for (let i = 0; i < n; i++) { fx[i] = ix[i]!; fy[i] = iy[i]!; }
  }
  return [fx, fy];
}
