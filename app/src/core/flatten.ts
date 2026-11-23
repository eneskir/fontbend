/**
 * A composite glyph as one simple glyph with the same variations. A variation can move a part
 * but not change its matrix, so synth.ts flattens a composite whose part has a matrix its map
 * would change (a squashed or mirrored accent); then every point follows the map.
 */
import { glyphData, type Glyph, type Point } from "./glyf";
import { fullDeltas, plainOffset, pointCount, readSource } from "./transform";
import { readTuples, type Tuple } from "./variation";

const XY_VALUES = 2, MY_METRICS = 0x200;
const MAX_DEPTH = 8;

/** Points before rounding, and tuples listing every point and the 4 phantoms. */
type Flat = { points: Point[]; ends: number[]; tuples: Tuple[] };

/** The glyph flattened, coordinates and deltas rounded; null when a part is placed by matching points. */
export function flatten(tables: Map<string, Uint8Array>, gvar: Uint8Array, gid: number): { glyph: Glyph; tuples: Tuple[] } | null {
  const f = flat(tables, gvar, gid, 0);
  if (!f) return null;
  return {
    glyph: { points: f.points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), on: p.on })), ends: f.ends },
    tuples: f.tuples.map((t) => ({ ...t, dx: t.dx.map(Math.round), dy: t.dy.map(Math.round) })),
  };
}

const listing = (t: Tuple, dx: number[], dy: number[]): Tuple => ({ peak: t.peak, start: t.start, end: t.end, points: null, dx, dy });

function flat(tables: Map<string, Uint8Array>, gvar: Uint8Array, gid: number, depth: number): Flat | null {
  if (depth > MAX_DEPTH) return null;
  const source = readSource(glyphData(tables, gid));
  const n = pointCount(source);
  const own = readTuples(gvar, gid, n + 4);
  if (source.kind !== "composite") {
    const points = source.kind === "simple" ? source.glyph.points.map((p) => ({ ...p })) : [];
    const ends = source.kind === "simple" ? [...source.glyph.ends] : [];
    return { points, ends, tuples: own.map((t) => listing(t, ...fullDeltas(t, source))) };
  }

  const points: Point[] = [], ends: number[] = [];
  const parts: { m: readonly number[]; flat: Flat; start: number; metrics: boolean }[] = [];
  for (const part of source.parts) {
    if (!(part.flags & XY_VALUES)) return null;
    const f = flat(tables, gvar, part.gid, depth + 1);
    if (!f) return null;
    const [a, b, c, d] = part.m;
    const [ox, oy] = plainOffset(part, part.dx, part.dy);
    const start = points.length;
    for (const e of f.ends) ends.push(start + e);
    for (const q of f.points) points.push({ x: a * q.x + c * q.y + ox, y: b * q.x + d * q.y + oy, on: q.on });
    parts.push({ m: part.m, flat: f, start, metrics: (part.flags & MY_METRICS) !== 0 });
  }
  const total = points.length;
  // A part marked to give its metrics gives its phantom points, as renderers take them.
  const metricsPart = parts.find((p) => p.metrics);
  const blank = () => new Array<number>(total + 4).fill(0);
  const tuples: Tuple[] = [];

  // Each part's own variations, through its matrix.
  for (const p of parts) {
    const [a, b, c, d] = p.m as [number, number, number, number];
    const count = p.flat.points.length;
    for (const t of p.flat.tuples) {
      const dx = blank(), dy = blank();
      for (let i = 0; i < count; i++) {
        const x = t.dx[i]!, y = t.dy[i]!;
        dx[p.start + i] = a * x + c * y;
        dy[p.start + i] = b * x + d * y;
      }
      if (p === metricsPart) for (let j = 0; j < 4; j++) { dx[total + j] = t.dx[count + j]!; dy[total + j] = t.dy[count + j]!; }
      tuples.push(listing(t, dx, dy));
    }
  }
  // The composite's own: a part's offset delta moves all its points.
  for (const t of own) {
    const [fx, fy] = fullDeltas(t, source);
    const dx = blank(), dy = blank();
    source.parts.forEach((part, k) => {
      const [mx, my] = plainOffset(part, fx[k]!, fy[k]!);
      const p = parts[k]!;
      for (let i = 0; i < p.flat.points.length; i++) { dx[p.start + i] = mx; dy[p.start + i] = my; }
    });
    if (!metricsPart) for (let j = 0; j < 4; j++) { dx[total + j] = fx[n + j]!; dy[total + j] = fy[n + j]!; }
    tuples.push(listing(t, dx, dy));
  }
  return { points, ends, tuples };
}
