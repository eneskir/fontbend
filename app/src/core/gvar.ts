/** Writing gvar from tuples whose deltas are given point by point (transform.ts, synth.ts). */
import type { Glyph } from "./glyf";
import { view } from "./sfnt";
import { encodeDeltas } from "./stretch";
import { deltasFor } from "./variation";

/** A tuple to write: its region (F2Dot14), the points it lists (null: all, phantoms included) and their deltas. */
export type Written = {
  readonly peak: readonly number[];
  readonly start: readonly number[] | null;
  readonly end: readonly number[] | null;
  readonly points: readonly number[] | null;
  readonly dx: readonly number[];
  readonly dy: readonly number[];
};

const EMBEDDED_PEAK = 0x8000, INTERMEDIATE = 0x4000, PRIVATE_POINTS = 0x2000;

function fail(why: string): never {
  throw new Error(`gvar: ${why}`);
}

/** The shared peaks of a gvar table. */
export function sharedPeaks(gvar: Uint8Array): number[][] {
  const v = view(gvar), axisCount = v.getUint16(4), at = v.getUint32(8);
  return Array.from({ length: v.getUint16(6) }, (_, i) => Array.from({ length: axisCount }, (_, k) => v.getInt16(at + (i * axisCount + k) * 2)));
}

/** A whole gvar table: `shared` peaks are referenced by index wherever a tuple's peak equals one. */
export function writeGvar(axisCount: number, shared: readonly (readonly number[])[], glyphs: readonly (readonly Written[])[]): Uint8Array {
  const sharedIndex = new Map<string, number>();
  for (let i = shared.length - 1; i >= 0; i--) sharedIndex.set(shared[i]!.join(), i);
  const data = glyphs.map((list) => (list.length ? encodeGlyph(list, sharedIndex) : new Uint8Array(0)));
  const tuplesAt = 20 + (glyphs.length + 1) * 4;
  const header = tuplesAt + shared.length * axisCount * 2;
  const out = new Uint8Array(header + data.reduce((n, d) => n + d.length, 0));
  const w = view(out);
  w.setUint16(0, 1); w.setUint16(2, 0); w.setUint16(4, axisCount);
  w.setUint16(6, shared.length); w.setUint32(8, tuplesAt);
  w.setUint16(12, glyphs.length); w.setUint16(14, 1); w.setUint32(16, header);
  shared.forEach((peak, i) => peak.forEach((x, k) => w.setInt16(tuplesAt + (i * axisCount + k) * 2, x)));
  let at = 0;
  data.forEach((d, g) => { w.setUint32(20 + g * 4, at); out.set(d, header + at); at += d.length; });
  w.setUint32(20 + glyphs.length * 4, at);
  return out;
}

function encodeGlyph(list: readonly Written[], sharedIndex: ReadonlyMap<string, number>): Uint8Array {
  if (list.length > 0x0fff) fail("too many tuples in one glyph");
  const headers: number[] = [], bodies: number[] = [];
  const u16 = (out: number[], x: number) => out.push((x >> 8) & 0xff, x & 0xff);
  for (const w of list) {
    const body = [...encodePoints(w.points), ...encodeDeltas(w.dx), ...encodeDeltas(w.dy)];
    if (body.length > 0xffff) fail("tuple data too large");
    const shared = sharedIndex.get(w.peak.join());
    u16(headers, body.length);
    u16(headers, (shared ?? EMBEDDED_PEAK) | (w.start ? INTERMEDIATE : 0) | PRIVATE_POINTS);
    if (shared === undefined) for (const x of w.peak) u16(headers, x);
    if (w.start && w.end) for (const x of [...w.start, ...w.end]) u16(headers, x);
    for (const b of body) bodies.push(b);
  }
  const out: number[] = [];
  u16(out, list.length);
  u16(out, 4 + headers.length);
  for (const b of headers) out.push(b);
  for (const b of bodies) out.push(b);
  if (out.length & 1) out.push(0);
  return Uint8Array.from(out);
}

/** Packed point numbers; null (every point) is a count of 0. */
function encodePoints(points: readonly number[] | null): number[] {
  if (!points) return [0];
  const out: number[] = points.length < 128 ? [points.length] : [0x80 | (points.length >> 8), points.length & 0xff];
  let i = 0, last = 0;
  while (i < points.length) {
    const words = points[i]! - last > 255;
    let j = i;
    while (j < points.length && j - i < 128 && (points[j]! - (j ? points[j - 1]! : 0) > 255) === words) j++;
    out.push((words ? 0x80 : 0) | (j - i - 1));
    for (let k = i; k < j; k++) {
      const d = points[k]! - last;
      last = points[k]!;
      if (words) out.push((d >> 8) & 0xff, d & 0xff);
      else out.push(d);
    }
    i = j;
  }
  return out;
}

/**
 * The tuple listing only `points` when readers would infer every other point's delta within half
 * a unit, else listing every point. `glyph` is the outline readers infer from (null for a
 * composite, whose unlisted parts stay put); `n` counts its points, phantoms follow.
 */
export function sparseOrFull(
  region: Pick<Written, "peak" | "start" | "end">, points: readonly number[] | null,
  dx: readonly number[], dy: readonly number[], n: number, glyph: Glyph | null,
): Written {
  const full = { ...region, points: null, dx, dy };
  if (!points) return full;
  const listed = new Set(points);
  for (let i = 0; i < n + 4; i++) {
    if (listed.has(i)) continue;
    if (i >= n || !glyph) { if (dx[i] !== 0 || dy[i] !== 0) return full; }
  }
  const sparse = { ...region, points: [...points], dx: points.map((p) => dx[p] ?? 0), dy: points.map((p) => dy[p] ?? 0) };
  if (glyph) {
    const [ix, iy] = deltasFor({ peak: [], start: null, end: null, points: sparse.points, dx: sparse.dx, dy: sparse.dy }, glyph);
    for (let i = 0; i < n; i++) if (!listed.has(i) && (Math.abs(ix[i]! - dx[i]!) > 0.5 || Math.abs(iy[i]! - dy[i]!) > 0.5)) return full;
  }
  return sparse;
}
