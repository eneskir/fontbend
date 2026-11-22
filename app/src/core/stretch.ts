/**
 * Lets every axis of a variable font reach past its own ends, so the browser can show
 * values the font was never drawn for (Fontbend's "out of range").
 *
 * Old values keep their exact shapes. Past an old end the outlines go on in a straight line
 * from the default through that end; an axis whose default sits at one end (Fraunces's
 * weight: default 900 = max) goes on along the other side's line through the default.
 *
 * How: each side of an axis grows by `extra` times its own span, so old normalized
 * coordinates shrink by ne = old span / new span. A gvar tuple that reaches an old end
 * (peak of 1 or -1) keeps that peak, which now sits at the new end. Starting at the default,
 * its deltas grow by 1/ne; starting at an intermediate master, it keeps its old shape up to
 * the old end and a companion ramps in past it with 1/ne times its deltas. Either way old
 * values keep their shapes and past the end each tuple follows the line through the default;
 * where axes meet, the pieces multiply. Tuples peaking inside the range are moved by ne. An
 * axis with no range on one side gets mirror pieces of the other side's end tuples. HVAR, MVAR and
 * VVAR are dropped: browsers then take advances from gvar's phantom points, which follow
 * the same line. GDEF regions are only moved by ne, so variable kerning keeps its values
 * inside the old range and fades back toward the default past it.
 */

import { STRETCH, reach } from "./axis";
import { readTables, tagAt, view, writeFont } from "./sfnt";

export type StretchedAxis = {
  readonly tag: string;
  readonly default: number;
  /** The font's own range. */
  readonly min: number;
  readonly max: number;
  /** The range the stretched font accepts. */
  readonly reachMin: number;
  readonly reachMax: number;
};

const ONE = 16384; // 1.0 in F2Dot14
const EMBEDDED_PEAK = 0x8000, INTERMEDIATE = 0x4000, PRIVATE_POINTS = 0x2000, TUPLE_INDEX = 0x0fff;
const SHARED_POINTS = 0x8000, TUPLE_COUNT = 0x0fff;

type Side = { ne: number | null };
export type AxisPlan = { tag: string; lo: number; def: number; hi: number; newLo: number; newHi: number; pos: Side; neg: Side };

export function stretchFont(input: Uint8Array, extra = STRETCH): { bytes: Uint8Array; axes: StretchedAxis[] } {
  const tables = readTables(input);
  const need = (tag: string) => tables.get(tag) ?? fail(`no ${tag} table`);
  const plan = planAxes(need("fvar"), extra);

  const out = new Map(tables);
  out.set("fvar", writeFvar(need("fvar"), plan));
  out.set("gvar", writeGvar(need("gvar"), plan));
  const avar = tables.get("avar");
  if (avar) out.set("avar", writeAvar(avar, plan));
  const gdef = tables.get("GDEF");
  if (gdef) out.set("GDEF", writeGdef(gdef, plan));
  for (const tag of ["HVAR", "MVAR", "VVAR"]) out.delete(tag);

  return {
    bytes: writeFont(input, out),
    axes: plan.map((a) => ({ tag: a.tag, default: a.def, min: a.lo, max: a.hi, reachMin: a.newLo, reachMax: a.newHi })),
  };
}

function fail(why: string): never {
  throw new Error(`stretchFont: ${why}`);
}

function planAxes(fvar: Uint8Array, extra: number): AxisPlan[] {
  const v = view(fvar);
  const first = v.getUint16(4), count = v.getUint16(8), size = v.getUint16(10);
  const plan: AxisPlan[] = [];
  for (let i = 0; i < count; i++) {
    const at = first + i * size;
    plan.push(planAxis(tagAt(fvar, at), v.getInt32(at + 4) / 65536, v.getInt32(at + 8) / 65536, v.getInt32(at + 12) / 65536, extra));
  }
  return plan;
}

export function planAxis(tag: string, lo: number, def: number, hi: number, extra: number): AxisPlan {
  const { min: newLo, max: newHi } = reach({ tag, min: lo, default: def, max: hi }, extra);
  return {
    tag, lo, def, hi, newLo, newHi,
    pos: { ne: hi > def ? (hi - def) / (newHi - def) : null },
    neg: { ne: lo < def ? (def - lo) / (def - newLo) : null },
  };
}

function writeFvar(fvar: Uint8Array, plan: AxisPlan[]): Uint8Array {
  const out = fvar.slice();
  const v = view(out);
  const first = v.getUint16(4), size = v.getUint16(10);
  plan.forEach((a, i) => {
    v.setInt32(first + i * size + 4, Math.round(a.newLo * 65536));
    v.setInt32(first + i * size + 12, Math.round(a.newHi * 65536));
  });
  return out;
}

/** One axis's (start, peak, end) in F2Dot14 units after the range grows. */
function remap(s: number, p: number, e: number, a: AxisPlan): [number, number, number] {
  if (p > 0) {
    const ne = a.pos.ne ?? 1;
    return [Math.round(s * ne), Math.round(p * ne), e === ONE && p === ONE ? ONE : Math.round(e * ne)];
  }
  if (p < 0) {
    const ne = a.neg.ne ?? 1;
    return [s === -ONE && p === -ONE ? -ONE : Math.round(s * ne), Math.round(p * ne), Math.round(e * ne)];
  }
  return [s, p, e];
}

type Tuple = {
  /** Peak tuple index bits as read; reused when the peak does not move. */
  index: number;
  peak: number[]; start: number[]; end: number[];
  explicit: boolean; points: Uint8Array | null; deltas: Uint8Array;
};

function writeGvar(gvar: Uint8Array, plan: AxisPlan[]): Uint8Array {
  const v = view(gvar);
  const axisCount = v.getUint16(4);
  if (axisCount !== plan.length) fail("gvar and fvar disagree on the number of axes");
  const sharedCount = v.getUint16(6), sharedAt = v.getUint32(8);
  const glyphCount = v.getUint16(12), longOffsets = (v.getUint16(14) & 1) === 1, dataAt = v.getUint32(16);
  const offset = (i: number) => (longOffsets ? v.getUint32(20 + i * 4) : v.getUint16(20 + i * 2) * 2);
  const shared = Array.from({ length: sharedCount }, (_, i) => Array.from({ length: axisCount }, (_, k) => v.getInt16(sharedAt + (i * axisCount + k) * 2)));
  const sharedBytes = gvar.subarray(sharedAt, sharedAt + sharedCount * axisCount * 2);

  const glyphs: Uint8Array[] = [];
  for (let g = 0; g < glyphCount; g++) {
    const from = dataAt + offset(g), to = dataAt + offset(g + 1);
    glyphs.push(to > from ? rewriteGlyph(gvar.subarray(from, to), axisCount, shared, plan) : new Uint8Array(0));
  }

  // Peaks of 1 and -1 stay where they are, so the shared tuples keep their meaning.
  const tuplesAt = 20 + (glyphCount + 1) * 4;
  const header = tuplesAt + sharedBytes.length;
  const total = glyphs.reduce((n, d) => n + d.length, 0);
  const out = new Uint8Array(header + total);
  const w = view(out);
  w.setUint16(0, 1); w.setUint16(2, 0); w.setUint16(4, axisCount);
  w.setUint16(6, sharedCount); w.setUint32(8, tuplesAt);
  w.setUint16(12, glyphCount); w.setUint16(14, 1); w.setUint32(16, header);
  out.set(sharedBytes, tuplesAt);
  let at = 0;
  glyphs.forEach((d, g) => { w.setUint32(20 + g * 4, at); out.set(d, header + at); at += d.length; });
  w.setUint32(20 + glyphCount * 4, at);
  return out;
}

export type Piece = { start: number; peak: number; end: number; factor: number };

/** The new support of one axis of a tuple, as pieces whose weights add up to the old one in range. */
export function axisPieces(s: number, p: number, e: number, a: AxisPlan): Piece[] {
  if (p === 0) return [{ start: s, peak: 0, end: e, factor: 1 }];
  if (p !== ONE && p !== -ONE) {
    const [start, peak, end] = remap(s, p, e, a);
    return [{ start, peak, end, factor: 1 }];
  }
  const sign = p > 0 ? 1 : -1;
  // A support on this side from magnitudes, nearest the default first.
  const on = (side: number, lo: number, pk: number, hi: number, factor: number): Piece =>
    side > 0 ? { start: lo, peak: pk, end: hi, factor } : { start: -hi, peak: -pk, end: -lo, factor };
  const ne = (sign > 0 ? a.pos.ne : a.neg.ne) ?? fail("a tuple peaks on a side with no range");
  const inner = sign > 0 ? s : -e;
  if (inner < 0) fail("a tuple crosses the default");
  const knee = Math.round(ONE * ne);
  // From the default: one ramp, steeper by 1/ne. From an intermediate master: the old shape up
  // to the old end, then a ramp that carries the line from the default through the old end.
  const pieces = inner === 0
    ? [on(sign, 0, ONE, ONE, 1 / ne)]
    : [on(sign, Math.round(inner * ne), knee, ONE, 1), on(sign, knee, ONE, ONE, 1 / ne)];
  // A side with no range of its own continues this side's line through the default.
  if (sign < 0 && a.pos.ne === null && a.newHi > a.def) pieces.push(on(1, 0, ONE, ONE, -(a.newHi - a.def) / (a.def - a.lo)));
  if (sign > 0 && a.neg.ne === null && a.newLo < a.def) pieces.push(on(-1, 0, ONE, ONE, -(a.def - a.newLo) / (a.hi - a.def)));
  return pieces;
}

function rewriteGlyph(data: Uint8Array, axisCount: number, shared: number[][], plan: AxisPlan[]): Uint8Array {
  const v = view(data);
  const countWord = v.getUint16(0);
  const count = countWord & TUPLE_COUNT;
  let serial = v.getUint16(2);
  let sharedPoints: Uint8Array | null = null;
  if (countWord & SHARED_POINTS) {
    const len = pointsLength(data, serial);
    sharedPoints = data.subarray(serial, serial + len);
    serial += len;
  }

  const tuples: Tuple[] = [];
  let at = 4;
  for (let t = 0; t < count; t++) {
    const size = v.getUint16(at), index = v.getUint16(at + 2);
    at += 4;
    const read = () => { const xs: number[] = []; for (let k = 0; k < axisCount; k++, at += 2) xs.push(v.getInt16(at)); return xs; };
    const peak = index & EMBEDDED_PEAK ? read() : shared[index & TUPLE_INDEX] ?? fail("bad shared tuple index");
    const explicit = (index & INTERMEDIATE) !== 0;
    const [start, end] = explicit ? [read(), read()] : [peak.map((p) => Math.min(p, 0)), peak.map((p) => Math.max(p, 0))];
    const body = data.subarray(serial, serial + size);
    serial += size;
    const pointsLen = index & PRIVATE_POINTS ? pointsLength(body, 0) : 0;
    tuples.push({ index, peak, start, end, explicit, points: index & PRIVATE_POINTS ? body.subarray(0, pointsLen) : null, deltas: body.subarray(pointsLen) });
  }

  const all: Tuple[] = [];
  for (const t of tuples) {
    // Each axis gives one or more pieces that add up to its new weight; the tuple becomes one
    // tuple per combination of pieces, its deltas scaled by the product of their factors.
    let combos: Piece[][] = [[]];
    t.peak.forEach((p, k) => {
      const pieces = axisPieces(t.start[k]!, p, t.end[k]!, plan[k]!);
      combos = combos.flatMap((c) => pieces.map((piece) => [...c, piece]));
    });
    for (const c of combos) {
      const start = c.map((x) => x.start), peak = c.map((x) => x.peak), end = c.map((x) => x.end);
      const factor = c.reduce((x, piece) => x * piece.factor, 1);
      const moved = peak.some((x, k) => x !== t.peak[k]);
      const explicit = start.some((x, k) => x !== Math.min(peak[k]!, 0)) || end.some((x, k) => x !== Math.max(peak[k]!, 0));
      all.push({ ...t, start, peak, end, explicit, index: moved ? EMBEDDED_PEAK : t.index, deltas: factor === 1 ? t.deltas : scaleDeltas(t.deltas, factor) });
    }
  }
  if (all.length > TUPLE_COUNT) fail("too many tuples in one glyph");

  const headerOf = (t: Tuple) => 4 + (t.index & EMBEDDED_PEAK ? axisCount * 2 : 0) + (t.explicit ? axisCount * 4 : 0);
  const headerSize = 4 + all.reduce((n, t) => n + headerOf(t), 0);
  const bodies = all.map((t) => (t.points ? concat(t.points, t.deltas) : t.deltas));
  const size = headerSize + (sharedPoints?.length ?? 0) + bodies.reduce((n, b) => n + b.length, 0);
  const bytes = new Uint8Array(size + (size & 1));
  const w = view(bytes);
  w.setUint16(0, all.length | (sharedPoints ? SHARED_POINTS : 0));
  w.setUint16(2, headerSize);
  let h = 4;
  all.forEach((t, i) => {
    if (bodies[i]!.length > 0xffff) fail("tuple data too large");
    const embedded = (t.index & EMBEDDED_PEAK) !== 0;
    w.setUint16(h, bodies[i]!.length);
    w.setUint16(h + 2, (embedded ? EMBEDDED_PEAK : t.index & TUPLE_INDEX) | (t.explicit ? INTERMEDIATE : 0) | (t.points ? PRIVATE_POINTS : 0));
    h += 4;
    for (const xs of embedded ? [t.peak] : []) for (const x of xs) { w.setInt16(h, x); h += 2; }
    for (const xs of t.explicit ? [t.start, t.end] : []) for (const x of xs) { w.setInt16(h, x); h += 2; }
  });
  let b = headerSize;
  if (sharedPoints) { bytes.set(sharedPoints, b); b += sharedPoints.length; }
  for (const body of bodies) { bytes.set(body, b); b += body.length; }
  return bytes;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a); out.set(b, a.length);
  return out;
}

/** Byte length of a packed point number list starting at `at`. */
export function pointsLength(data: Uint8Array, at: number): number {
  let i = at;
  let count = data[i++] ?? fail("point number list has no count");
  if (count & 0x80) count = ((count & 0x7f) << 8) | (data[i++] ?? 0);
  let seen = 0;
  while (seen < count) {
    const control = data[i++] ?? fail("point number list ends before its runs do");
    const run = (control & 0x7f) + 1;
    i += control & 0x80 ? run * 2 : run;
    seen += run;
  }
  if (i > data.length) fail("point number run is longer than the data");
  return i - at;
}

/** All values of a packed delta stream (x deltas then y deltas). */
export function decodeDeltas(data: Uint8Array): number[] {
  const v = view(data);
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    const control = data[i++]!;
    const run = (control & 0x3f) + 1;
    if (control & 0x80) for (let k = 0; k < run; k++) out.push(0);
    else if (control & 0x40) for (let k = 0; k < run; k++, i += 2) out.push(v.getInt16(i));
    else for (let k = 0; k < run; k++, i++) out.push(v.getInt8(i));
  }
  if (i !== data.length) fail("packed deltas run past their tuple");
  return out;
}

/** Packs deltas with zero, byte and word runs of up to 64 values. */
export function encodeDeltas(values: readonly number[]): Uint8Array {
  const out: number[] = [];
  const kind = (x: number) => (x === 0 ? 0 : x >= -128 && x <= 127 ? 1 : 2);
  let i = 0;
  while (i < values.length) {
    const k = kind(values[i]!);
    let j = i;
    while (j < values.length && j - i < 64 && kind(values[j]!) === k) j++;
    const run = j - i;
    out.push((k === 0 ? 0x80 : k === 2 ? 0x40 : 0) | (run - 1));
    for (let n = i; n < j; n++) {
      const x = values[n]!;
      if (x < -32768 || x > 32767) fail("a stretched delta does not fit in 16 bits");
      if (k === 1) out.push(x & 0xff);
      else if (k === 2) out.push((x >> 8) & 0xff, x & 0xff);
    }
    i = j;
  }
  return Uint8Array.from(out);
}

/** Scales a tuple's x and y deltas; IUP is linear, so points left out scale with them. */
function scaleDeltas(data: Uint8Array, factor: number): Uint8Array {
  const all = decodeDeltas(data);
  if (all.length % 2) fail("odd number of deltas");
  const n = all.length / 2;
  const scaled = all.map((x) => Math.round(x * factor));
  return concat(encodeDeltas(scaled.slice(0, n)), encodeDeltas(scaled.slice(n)));
}

function writeAvar(avar: Uint8Array, plan: AxisPlan[]): Uint8Array {
  const v = view(avar);
  if (v.getUint16(0) !== 1) fail("only avar version 1 is supported");
  const count = v.getUint16(6);
  if (count !== plan.length) fail("avar and fvar disagree on the number of axes");
  const maps: [number, number][][] = [];
  let at = 8;
  for (let k = 0; k < count; k++) {
    const n = v.getUint16(at); at += 2;
    const a = plan[k]!;
    const map = new Map<number, number>([[-ONE, -ONE], [0, 0], [ONE, ONE]]);
    for (let i = 0; i < n; i++, at += 4) {
      const from = v.getInt16(at), to = v.getInt16(at + 2);
      if (from > 0 && a.pos.ne !== null) map.set(Math.round(from * a.pos.ne), Math.round(to * a.pos.ne));
      else if (from < 0 && a.neg.ne !== null) map.set(Math.round(from * a.neg.ne), Math.round(to * a.neg.ne));
    }
    maps.push([...map].sort((x, y) => x[0] - y[0]));
  }
  const out = new Uint8Array(8 + maps.reduce((n, m) => n + 2 + m.length * 4, 0));
  const w = view(out);
  w.setUint16(0, 1); w.setUint16(2, 0); w.setUint16(4, 0); w.setUint16(6, count);
  at = 8;
  for (const m of maps) {
    w.setUint16(at, m.length); at += 2;
    for (const [from, to] of m) { w.setInt16(at, from); w.setInt16(at + 2, to); at += 4; }
  }
  return out;
}

function writeGdef(gdef: Uint8Array, plan: AxisPlan[]): Uint8Array {
  const out = gdef.slice();
  const v = view(out);
  if (v.getUint16(0) !== 1 || v.getUint16(2) < 3) return out;
  const store = v.getUint32(14);
  if (!store) return out;
  const list = store + v.getUint32(store + 2);
  const axisCount = v.getUint16(list), regions = v.getUint16(list + 2);
  if (axisCount !== plan.length) fail("GDEF and fvar disagree on the number of axes");
  for (let r = 0; r < regions; r++) {
    for (let k = 0; k < axisCount; k++) {
      const at = list + 4 + (r * axisCount + k) * 6;
      const [s, p, e] = remap(v.getInt16(at), v.getInt16(at + 2), v.getInt16(at + 4), plan[k]!);
      v.setInt16(at, s); v.setInt16(at + 2, p); v.setInt16(at + 4, e);
    }
  }
  return out;
}

