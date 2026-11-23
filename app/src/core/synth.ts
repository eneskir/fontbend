/**
 * Gives a variable font Width and Slant axes it was not drawn with: wdth scales x (100 = as
 * drawn), slnt leans the letters (degrees; negative leans right, as an italic). Each is
 * transform.ts's linear map, x' = a·x + b·y + c, put into the font as variations, so the
 * browser draws any value live, and every instance is the mapped instance of the old axes.
 *
 * The map is linear, so each side of a new axis is one set of tuples: one that moves the
 * default outline to the axis end, and, for every old tuple, one on the old region times the
 * new axis that maps that tuple's deltas (a delta d moves by (a − 1)·d.x + b·d.y). Slant's
 * shear is linear in tan of the angle, not the angle, so avar bends the axis to keep degrees
 * exact. GPOS and GDEF get the same through their variation store (layout.ts).
 *
 * Kept from the old font: every outline and metric at the default; the new axes start
 * there. Dropped: HVAR, VVAR and MVAR, whose regions would lack the new axes (browsers then take
 * advances from gvar's phantom points). A composite with a part whose matrix a map would change
 * (a mirrored or squashed part: 24 glyphs in the catalog, accents of Fraunces and arrows of
 * JetBrains Mono) is flattened into one simple glyph (flatten.ts), since a variation cannot
 * change a matrix.
 */
import { glyphData } from "./glyf";
import { X_ADV, X_ADV_DEV, X_PLA, X_PLA_DEV, Y_ADV, Y_PLA, rewriteLayout, type LayoutMap } from "./layout";
import { readTables, view, writeFont } from "./sfnt";
import { flatten } from "./flatten";
import { encodeSimple, fullDeltas, plainOffset, pointCount, readSource, slant, type Part, type Source } from "./transform";
import { sharedPeaks, sparseOrFull, writeGvar, type Written } from "./gvar";
import { readTuples, type Tuple } from "./variation";
import type { Span, VarRef, VarStore } from "./varstore";

/** A new axis: its tag and range, in its own units (wdth in percent, slnt in degrees). */
export type SyntheticAxis = { readonly tag: "wdth" | "slnt"; readonly min: number; readonly default: number; readonly max: number };

const ONE = 16384; // 1.0 in F2Dot14
const XY_VALUES = 2, SCALED_OFFSET = 0x800;
// Points of slnt's avar map per side; the bend's worst miss at 18° is then under 0.01°.
const BEND_STEPS = 8;

function fail(why: string): never {
  throw new Error(`addAxes: ${why}`);
}

/** One end of a new axis: the map that takes the default there (A = a − 1). */
type Side = { readonly axis: number; readonly sign: 1 | -1; readonly A: number; readonly b: number; readonly c: number };

export function addAxes(input: Uint8Array, axes: readonly SyntheticAxis[]): Uint8Array {
  if (axes.length === 0) return input;
  const tables = readTables(input);
  const need = (tag: string) => tables.get(tag) ?? fail(`no ${tag} table`);
  const fvar = need("fvar"), gvar = need("gvar"), hmtx = need("hmtx"), hhea = need("hhea"), maxp = need("maxp");
  const old = view(fvar).getUint16(8);
  for (const a of axes) {
    if (!(a.min <= a.default && a.default <= a.max) || a.min === a.max) fail(`${a.tag} has no range`);
    if (fvarTags(fvar).includes(a.tag)) fail(`the font already has ${a.tag}`);
  }
  const sides = axes.flatMap((a, j) => ([[1, a.max], [-1, a.min]] as const)
    .filter(([, end]) => end !== a.default)
    .map(([sign, end]): Side => {
      if (a.tag === "wdth") return { axis: old + j, sign, A: end / a.default - 1, b: 0, c: 0 };
      const s = slant(input, -end);
      return { axis: old + j, sign, A: 0, b: s.b, c: s.c };
    }));

  const out = new Map(tables);
  out.set("fvar", writeFvar(fvar, axes));
  out.set("avar", writeAvar(tables.get("avar") ?? null, old, axes));

  const glyphCount = view(maxp).getUint16(4), metrics = view(hhea).getUint16(34);
  const hv = view(hmtx);
  const shared = sharedPeaks(gvar).map((p) => [...p, ...axes.map(() => 0)]);
  const lsbAt = (g: number) => (g < metrics ? g * 4 + 2 : metrics * 4 + (g - metrics) * 2);
  const flattened = new Map<number, { data: Uint8Array; lsb: number }>();
  const glyphs = Array.from({ length: glyphCount }, (_, g) => {
    const data = glyphData(tables, g);
    let source = readSource(data);
    let tuples = readTuples(gvar, g, pointCount(source) + 4);
    const advance = hv.getUint16(Math.min(g, metrics - 1) * 4);
    const xMin = data && data.length >= 10 ? view(data).getInt16(2) : 0;
    const origin = source.kind === "empty" ? 0 : xMin - hv.getInt16(lsbAt(g));
    if (source.kind === "composite" && source.parts.some((p) => !commutes(p.m))) {
      const f = flatten(tables, gvar, g);
      if (f) {
        source = { kind: "simple", glyph: f.glyph, overlap: true };
        tuples = f.tuples;
        const encoded = encodeSimple(f.glyph, true);
        // The origin stays where it was, so the side bearing follows the new bounds.
        flattened.set(g, { data: encoded, lsb: view(encoded).getInt16(2) - origin });
      }
    }
    const phantoms = [origin, origin + advance, 0, 0];
    return glyphTuples(source, pointCount(source), phantoms, tuples, sides, old + axes.length);
  });
  out.set("gvar", writeGvar(old + axes.length, shared, glyphs));
  if (flattened.size) writeFlattened(tables, out, flattened, lsbAt);

  for (const [tag, data] of rewriteLayout(tables, (store) => synthLayout(store, sides, old + axes.length), axes.length)) out.set(tag, data);
  for (const tag of ["HVAR", "VVAR", "MVAR"]) out.delete(tag);
  return writeFont(input, out);
}

/** Whether a part's matrix is left as it is by every map of x (a uniform scale: no mirror, squash or turn). */
const commutes = ([a, b, c, d]: readonly number[]) => b === 0 && c === 0 && a === d;

/** glyf and loca with the flattened glyphs in place, their side bearings, and maxp's point counts. */
function writeFlattened(tables: Map<string, Uint8Array>, out: Map<string, Uint8Array>, flattened: ReadonlyMap<number, { data: Uint8Array; lsb: number }>, lsbAt: (g: number) => number) {
  const maxp = tables.get("maxp")!, count = view(maxp).getUint16(4);
  const datas = Array.from({ length: count }, (_, g) => flattened.get(g)?.data ?? glyphData(tables, g) ?? new Uint8Array(0));
  const loca = new Uint8Array((count + 1) * 4), glyf = new Uint8Array(datas.reduce((n, d) => n + d.length + (d.length & 1), 0));
  let at = 0;
  datas.forEach((d, g) => { view(loca).setUint32(g * 4, at); glyf.set(d, at); at += d.length + (d.length & 1); });
  view(loca).setUint32(count * 4, at);
  const head = tables.get("head")!.slice();
  view(head).setInt16(50, 1); // long loca
  const hmtx = tables.get("hmtx")!.slice();
  for (const [g, f] of flattened) view(hmtx).setInt16(lsbAt(g), f.lsb);
  out.set("glyf", glyf); out.set("loca", loca); out.set("head", head); out.set("hmtx", hmtx);
  if (view(maxp).getUint32(0) === 0x00010000) {
    const m = maxp.slice(), v = view(m);
    for (const f of flattened.values()) {
      const contours = view(f.data).getInt16(0), points = view(f.data).getUint16(10 + (contours - 1) * 2) + 1;
      v.setUint16(6, Math.max(v.getUint16(6), points)); v.setUint16(8, Math.max(v.getUint16(8), contours));
    }
    out.set("maxp", m);
  }
}

function fvarTags(fvar: Uint8Array): string[] {
  const v = view(fvar), at = v.getUint16(4), size = v.getUint16(10);
  return Array.from({ length: v.getUint16(8) }, (_, k) => String.fromCharCode(...fvar.subarray(at + k * size, at + k * size + 4)));
}

/** The span of a new axis on one side, as a region's: from the default to the end. */
const sideSpan = (sign: 1 | -1): Span => (sign > 0 ? [0, ONE, ONE] : [-ONE, -ONE, 0]);

function glyphTuples(source: Source, n: number, phantoms: readonly number[], tuples: readonly Tuple[], sides: readonly Side[], total: number): Written[] {
  const grow = (xs: readonly number[] | null) => (xs ? [...xs, ...new Array<number>(total - xs.length).fill(0)] : null);
  const out: Written[] = tuples.map((t) => ({ peak: grow(t.peak)!, start: grow(t.start), end: grow(t.end), points: t.points, dx: t.dx, dy: t.dy }));
  const glyph = source.kind === "simple" ? source.glyph : null;
  for (const s of sides) {
    const [lo, pk, hi] = sideSpan(s.sign);
    const on = (xs: readonly number[] | null, x: number) => {
      const r = grow(xs);
      if (r) r[s.axis] = x;
      return r;
    };
    // The default outline, carried to the axis end.
    const [bx, by] = baseDeltas(source, n, phantoms, s);
    if (bx.some((x) => x !== 0) || by.some((y) => y !== 0)) out.push({ peak: on(new Array<number>(total).fill(0), pk)!, start: null, end: null, points: null, dx: bx, dy: by });
    // Each old tuple's deltas, carried along on its own region times this side.
    for (const t of tuples) {
      const [fx, fy] = fullDeltas(t, source);
      const nx = fx.map((x, i) => (i < n ? moveX(source, i, x, fy[i]!, s) : Math.round(s.A * x)));
      if (nx.every((x) => x === 0)) continue;
      out.push(sparseOrFull({ peak: on(t.peak, pk)!, start: on(t.start, lo), end: on(t.end, hi) }, t.points, nx, nx.map(() => 0), n, glyph));
    }
  }
  return out;
}

/** A part's x move for a delta (dx, dy) of a point or of a part's offset. */
function moveX(source: Source, i: number, dx: number, dy: number, s: Side): number {
  if (source.kind !== "composite") return Math.round(s.A * dx + s.b * dy);
  const part = source.parts[i]!;
  if (!(part.flags & XY_VALUES)) return 0; // placed by matching points, which move with their glyphs
  const [px, py] = plainOffset(part, dx, dy);
  return stored(part, s.A * px + s.b * py, 0)[0];
}

/** Deltas that take the default outline to a side's end; the origin and advance only scale. */
function baseDeltas(source: Source, n: number, phantoms: readonly number[], s: Side): [number[], number[]] {
  const dx = new Array<number>(n + 4).fill(0), dy = new Array<number>(n + 4).fill(0);
  if (source.kind === "simple") source.glyph.points.forEach((p, i) => { dx[i] = Math.round(s.A * p.x + s.b * p.y + s.c); });
  else if (source.kind === "composite") {
    source.parts.forEach((part, i) => {
      if (!(part.flags & XY_VALUES)) return;
      // The part's own points move by the map already, so its offset moves by (T − 1)·o + c − M·c.
      const [ox, oy] = plainOffset(part, part.dx, part.dy);
      [dx[i], dy[i]] = stored(part, s.A * ox + s.b * oy + s.c * (1 - part.m[0]), -part.m[1] * s.c);
    });
  }
  phantoms.forEach((x, j) => { dx[n + j] = Math.round(s.A * x); });
  return [dx, dy];
}

/** An offset move as the part stores it: through the inverse of its matrix when offsets are scaled. */
function stored(part: Part, x: number, y: number): [number, number] {
  if (!(part.flags & SCALED_OFFSET)) return [Math.round(x), Math.round(y)];
  const [a, b, c, d] = part.m, det = a * d - b * c;
  if (det === 0) return [0, 0];
  return [Math.round((d * x - c * y) / det), Math.round((-b * x + a * y) / det)];
}

function synthLayout(store: VarStore | null, sides: readonly Side[], total: number): LayoutMap {
  const st = () => store ?? fail("GPOS varies with no variation store");
  // An x item plus, on each side, its own regions times the side and the side's own region.
  const carry = (base: (s: Side) => number, xr: VarRef | null, yr: VarRef | null): VarRef | null => {
    const s0 = st();
    const xs = s0.row(xr), ys = s0.row(yr), out = new Map(xs);
    const add = (region: number, d: number) => out.set(region, (out.get(region) ?? 0) + d);
    for (const s of sides) {
      const own = Array.from({ length: total }, (): Span => [0, 0, 0]);
      own[s.axis] = sideSpan(s.sign);
      add(s0.region(own), base(s));
      for (const r of new Set([...xs.keys(), ...ys.keys()])) {
        const spans = [...s0.spans(r)];
        spans[s.axis] = sideSpan(s.sign);
        add(s0.region(spans), s.A * (xs.get(r) ?? 0) + s.b * (ys.get(r) ?? 0));
      }
    }
    return s0.item(out);
  };
  return {
    point: (x: number, y: number, xr: VarRef | null, yr: VarRef | null) => ({ x, xr: carry((s) => s.A * x + s.b * y + s.c, xr, yr) }),
    move: (dx: number, dy: number, xr: VarRef | null, yr: VarRef | null) =>
      ({ x: dx, xr: dx || dy || xr || yr ? carry((s) => s.A * dx + s.b * dy, xr, yr) : null }),
    // Every x field and y field gets an x device for the variation.
    format: (f: number) => f | (f & (X_PLA | Y_PLA) ? X_PLA_DEV : 0) | (f & (X_ADV | Y_ADV) ? X_ADV_DEV : 0),
    caret: null,
  };
}

function writeFvar(fvar: Uint8Array, axes: readonly SyntheticAxis[]): Uint8Array {
  const v = view(fvar);
  const axesAt = v.getUint16(4), count = v.getUint16(8), axisSize = v.getUint16(10);
  const instances = v.getUint16(12), instanceSize = v.getUint16(14);
  const total = count + axes.length;
  const psName = instanceSize >= 4 + count * 4 + 2;
  const newSize = 4 + total * 4 + (psName ? 2 : 0);
  const out = new Uint8Array(16 + total * 20 + instances * newSize), w = view(out);
  w.setUint32(0, 0x00010000); w.setUint16(4, 16); w.setUint16(6, 2);
  w.setUint16(8, total); w.setUint16(10, 20); w.setUint16(12, instances); w.setUint16(14, newSize);
  for (let k = 0; k < count; k++) out.set(fvar.subarray(axesAt + k * axisSize, axesAt + k * axisSize + 20), 16 + k * 20);
  // The new axes borrow the first axis's name record; only the browser reads this font.
  const nameId = v.getUint16(axesAt + 18);
  axes.forEach((a, j) => {
    const r = 16 + (count + j) * 20;
    for (let c = 0; c < 4; c++) out[r + c] = a.tag.charCodeAt(c);
    w.setInt32(r + 4, Math.round(a.min * 65536)); w.setInt32(r + 8, Math.round(a.default * 65536)); w.setInt32(r + 12, Math.round(a.max * 65536));
    w.setUint16(r + 16, 0); w.setUint16(r + 18, nameId);
  });
  const oldAt = axesAt + count * axisSize, newAt = 16 + total * 20;
  for (let i = 0; i < instances; i++) {
    const from = oldAt + i * instanceSize, to = newAt + i * newSize;
    out.set(fvar.subarray(from, from + 4 + count * 4), to);
    axes.forEach((a, j) => w.setInt32(to + 4 + (count + j) * 4, Math.round(a.default * 65536)));
    if (psName) w.setUint16(to + 4 + total * 4, v.getUint16(from + 4 + count * 4));
  }
  return out;
}

/** avar with a straight map for wdth and one that keeps slnt's degrees exact (see top). */
function writeAvar(avar: Uint8Array | null, old: number, axes: readonly SyntheticAxis[]): Uint8Array {
  const maps: (readonly [number, number])[][] = [];
  if (avar) {
    const v = view(avar);
    if (v.getUint16(0) !== 1) fail("only avar version 1 is supported");
    let at = 8;
    for (let k = 0; k < v.getUint16(6); k++) {
      const n = v.getUint16(at); at += 2;
      maps.push(Array.from({ length: n }, (_, i) => [v.getInt16(at + i * 4), v.getInt16(at + i * 4 + 2)] as const));
      at += n * 4;
    }
    if (maps.length !== old) fail("avar and fvar disagree on the number of axes");
  } else for (let k = 0; k < old; k++) maps.push([[-ONE, -ONE], [0, 0], [ONE, ONE]]);
  for (const a of axes) {
    if (a.tag === "wdth") { maps.push([[-ONE, -ONE], [0, 0], [ONE, ONE]]); continue; }
    // A value v of slnt is normalized to v / (end − default); the shear at it is tan(−v), so the
    // coordinate the tuples see must be tan(−v) / tan(−end).
    const side = (end: number) => Array.from({ length: BEND_STEPS }, (_, i) => {
      const f = (i + 1) / BEND_STEPS, deg = a.default + f * (end - a.default);
      const to = Math.tan((-deg * Math.PI) / 180) / Math.tan((-end * Math.PI) / 180);
      return [Math.round(Math.sign(end - a.default) * f * ONE), Math.round(Math.sign(end - a.default) * to * ONE)] as const;
    });
    const lo = a.min < a.default ? side(a.min).reverse() : [[-ONE, -ONE] as const];
    const hi = a.max > a.default ? side(a.max) : [[ONE, ONE] as const];
    maps.push([...lo, [0, 0], ...hi]);
  }
  const out = new Uint8Array(8 + maps.reduce((n, m) => n + 2 + m.length * 4, 0)), w = view(out);
  w.setUint16(0, 1); w.setUint16(2, 0); w.setUint16(4, 0); w.setUint16(6, maps.length);
  let at = 8;
  for (const m of maps) {
    w.setUint16(at, m.length); at += 2;
    for (const [from, to] of m) { w.setInt16(at, from); w.setInt16(at + 2, to); at += 4; }
  }
  return out;
}
