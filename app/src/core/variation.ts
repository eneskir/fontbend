/**
 * One glyph of a variable font at any point of its design space, read straight from glyf, gvar,
 * fvar and avar: what the browser draws, without HarfBuzz (which loads only for downloads).
 */
import { glyphMap } from "./cmap";
import { glyphData, parseGlyph, type Glyph } from "./glyf";
import { decodeDeltas } from "./stretch";
import { readTables, tagAt, view } from "./sfnt";

const ONE = 16384; // 1.0 in F2Dot14
const EMBEDDED_PEAK = 0x8000, INTERMEDIATE = 0x4000, PRIVATE_POINTS = 0x2000, TUPLE_INDEX = 0x0fff;
const SHARED_POINTS = 0x8000, TUPLE_COUNT = 0x0fff;

type FvarAxis = { tag: string; min: number; def: number; max: number };
type Tuple = { peak: number[]; start: number[] | null; end: number[] | null; points: number[] | null; dx: number[]; dy: number[] };

/** The glyph of a character as a function of axis values (user units, by tag); null when missing or a composite. */
export function variableGlyph(font: Uint8Array, char: number): ((values: Readonly<Record<string, number>>) => Glyph) | null {
  const t = readTables(font);
  const cmap = t.get("cmap"), fvar = t.get("fvar");
  const gid = cmap ? glyphMap(cmap).get(char) : undefined;
  if (gid === undefined || !fvar) return null;
  const data = glyphData(t, gid);
  const glyph = data && parseGlyph(data);
  if (!glyph) return null;
  const axes = readFvar(fvar);
  const avar = t.get("avar") ? readAvar(t.get("avar")!) : null;
  const gvar = t.get("gvar");
  const tuples = gvar ? readTuples(gvar, gid, glyph.points.length + 4) : [];
  return (values) => {
    const coords = axes.map((a, k) => {
      const v = values[a.tag] ?? a.def;
      let n = v < a.def ? (v - a.def) / (a.def - a.min) : v > a.def ? (v - a.def) / (a.max - a.def) : 0;
      n = Math.max(-1, Math.min(1, n));
      if (avar?.[k]) n = mapAvar(avar[k]!, n);
      return Math.round(n * ONE);
    });
    const xs = glyph.points.map((p) => p.x), ys = glyph.points.map((p) => p.y);
    for (const tuple of tuples) {
      const s = scalar(tuple, coords);
      if (s === 0) continue;
      const [dx, dy] = deltasFor(tuple, glyph);
      for (let i = 0; i < xs.length; i++) { xs[i]! += s * dx[i]!; ys[i]! += s * dy[i]!; }
    }
    return { points: glyph.points.map((p, i) => ({ x: xs[i]!, y: ys[i]!, on: p.on })), ends: glyph.ends };
  };
}

function readFvar(fvar: Uint8Array): FvarAxis[] {
  const v = view(fvar);
  const at = v.getUint16(4), count = v.getUint16(8), size = v.getUint16(10);
  return Array.from({ length: count }, (_, k) => {
    const r = at + k * size;
    return { tag: tagAt(fvar, r), min: v.getInt32(r + 4) / 65536, def: v.getInt32(r + 8) / 65536, max: v.getInt32(r + 12) / 65536 };
  });
}

/** avar version 1: per axis, pairs of normalized values (from, to). */
function readAvar(avar: Uint8Array): [number, number][][] {
  const v = view(avar);
  const out: [number, number][][] = [];
  let at = 8;
  for (let k = 0, n = v.getUint16(6); k < n; k++) {
    const pairs: [number, number][] = [];
    for (let i = 0, m = v.getUint16(at); i < m; i++) pairs.push([v.getInt16(at + 2 + i * 4) / ONE, v.getInt16(at + 4 + i * 4) / ONE]);
    at += 2 + pairs.length * 4;
    out.push(pairs);
  }
  return out;
}

function mapAvar(pairs: [number, number][], n: number): number {
  if (pairs.length < 3) return n;
  for (let i = 1; i < pairs.length; i++) {
    const [f0, t0] = pairs[i - 1]!, [f1, t1] = pairs[i]!;
    if (n <= f1) return f1 === f0 ? t1 : t0 + ((n - f0) * (t1 - t0)) / (f1 - f0);
  }
  return pairs.at(-1)![1];
}

/** The tuples of one glyph, each with the points it moves (null: all of them) and their deltas. */
function readTuples(gvar: Uint8Array, gid: number, pointCount: number): Tuple[] {
  const v = view(gvar);
  const axisCount = v.getUint16(4), sharedAt = v.getUint32(8);
  const long = (v.getUint16(14) & 1) === 1, dataAt = v.getUint32(16);
  const offset = (i: number) => (long ? v.getUint32(20 + i * 4) : v.getUint16(20 + i * 2) * 2);
  const from = dataAt + offset(gid), to = dataAt + offset(gid + 1);
  if (to <= from) return [];
  const data = gvar.subarray(from, to), d = view(data);
  const countWord = d.getUint16(0);
  let serial = d.getUint16(2);
  let shared: number[] | null = null;
  if (countWord & SHARED_POINTS) [shared, serial] = readPoints(data, serial);
  const tuples: Tuple[] = [];
  let at = 4;
  for (let n = 0; n < (countWord & TUPLE_COUNT); n++) {
    const size = d.getUint16(at), index = d.getUint16(at + 2);
    at += 4;
    const read = () => { const xs: number[] = []; for (let k = 0; k < axisCount; k++, at += 2) xs.push(d.getInt16(at)); return xs; };
    const peak = index & EMBEDDED_PEAK ? read() : Array.from({ length: axisCount }, (_, k) => v.getInt16(sharedAt + ((index & TUPLE_INDEX) * axisCount + k) * 2));
    const [start, end] = index & INTERMEDIATE ? [read(), read()] : [null, null];
    let body = serial, points = shared;
    if (index & PRIVATE_POINTS) [points, body] = readPoints(data, serial);
    const values = decodeDeltas(data.subarray(body, serial + size));
    serial += size;
    const count = points ? points.length : pointCount;
    tuples.push({ peak, start, end, points, dx: values.slice(0, count), dy: values.slice(count, count * 2) });
  }
  return tuples;
}

/** Packed point numbers: null means every point of the glyph. Returns the list and where its data ends. */
function readPoints(data: Uint8Array, at: number): [number[] | null, number] {
  let count = data[at++]!;
  if (count & 0x80) count = ((count & 0x7f) << 8) | data[at++]!;
  if (count === 0) return [null, at];
  const out: number[] = [];
  let last = 0;
  while (out.length < count) {
    const control = data[at++]!, run = (control & 0x7f) + 1, words = (control & 0x80) !== 0;
    for (let k = 0; k < run; k++) {
      last += words ? (data[at]! << 8) | data[at + 1]! : data[at]!;
      at += words ? 2 : 1;
      out.push(last);
    }
  }
  return [out, at];
}

/** How much of a tuple applies at these normalized coordinates (F2Dot14 units). */
function scalar(t: Tuple, coords: number[]): number {
  let s = 1;
  for (let k = 0; k < t.peak.length; k++) {
    const p = t.peak[k]!, c = coords[k] ?? 0;
    if (p === 0) continue;
    const lo = t.start ? t.start[k]! : Math.min(p, 0), hi = t.end ? t.end[k]! : Math.max(p, 0);
    if (lo > p || p > hi || (lo < 0 && hi > 0)) continue; // an invalid region ignores this axis
    if (c === p) continue;
    if (c <= lo || c >= hi) return 0;
    s *= c < p ? (c - lo) / (p - lo) : (hi - c) / (hi - p);
  }
  return s;
}

/** A tuple's deltas for every outline point, interpolating the points it leaves out (IUP). */
function deltasFor(t: Tuple, glyph: Glyph): [number[], number[]] {
  const n = glyph.points.length;
  if (!t.points) return [t.dx.slice(0, n), t.dy.slice(0, n)];
  const dx = new Array<number>(n).fill(0), dy = new Array<number>(n).fill(0), touched = new Array<boolean>(n).fill(false);
  t.points.forEach((p, i) => { if (p < n) { dx[p] = t.dx[i]!; dy[p] = t.dy[i]!; touched[p] = true; } });
  let first = 0;
  for (const last of glyph.ends) {
    const ring = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    const set = ring.filter((i) => touched[i]);
    const next = (i: number) => (i === last ? first : i + 1);
    if (set.length === 1) for (const i of ring) { dx[i] = dx[set[0]!]!; dy[i] = dy[set[0]!]!; }
    else if (set.length > 1) {
      set.forEach((a, j) => {
        const b = set[(j + 1) % set.length]!;
        for (let i = next(a); i !== b; i = next(i)) {
          dx[i] = between(glyph.points[i]!.x, glyph.points[a]!.x, glyph.points[b]!.x, dx[a]!, dx[b]!);
          dy[i] = between(glyph.points[i]!.y, glyph.points[a]!.y, glyph.points[b]!.y, dy[a]!, dy[b]!);
        }
      });
    }
    first = last + 1;
  }
  return [dx, dy];
}

function between(x: number, x1: number, x2: number, d1: number, d2: number): number {
  if (x1 === x2) return d1 === d2 ? d1 : 0;
  const [lo, hi, dlo, dhi] = x1 < x2 ? [x1, x2, d1, d2] : [x2, x1, d2, d1];
  if (x <= lo) return dlo;
  if (x >= hi) return dhi;
  return dlo + ((x - lo) * (dhi - dlo)) / (hi - lo);
}
