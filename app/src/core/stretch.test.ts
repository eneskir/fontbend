/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { checksumOk, fraunces } from "./fixtures";
import { readTables, view } from "./sfnt";
import { axisPieces, decodeDeltas, encodeDeltas, planAxis, pointsLength, stretchFont, type AxisPlan, type Piece } from "./stretch";

const ONE = 16384;

/** OpenType's per-axis tuple scalar at normalized coordinate x (F2Dot14 supports). */
function scalar(p: Piece, x: number): number {
  const [s, k, e] = [p.start / ONE, p.peak / ONE, p.end / ONE];
  if (k === 0 || x === k) return 1;
  if (x <= s || x >= e) return 0;
  return x < k ? (x - s) / (k - s) : (e - x) / (e - k);
}

const norm = (u: number, lo: number, def: number, hi: number) => (u < def ? (u - def) / (def - lo) : u > def ? (u - def) / (hi - def) : 0);

/** What a tuple with this support must weigh at user value u once the axis is stretched. */
function expected(a: AxisPlan, support: Piece, u: number): number {
  const old = (x: number) => scalar(support, x);
  if (u >= a.lo && u <= a.hi) return old(norm(u, a.lo, a.def, a.hi));
  // Past an end: the line from the default through that end, or through the other end
  // when this side had no range.
  let end = u > a.def ? a.hi : a.lo;
  if (end === a.def) end = u > a.def ? a.lo : a.hi;
  return old(norm(end, a.lo, a.def, a.hi)) * ((u - a.def) / (end - a.def));
}

function stretched(a: AxisPlan, support: Piece, u: number): number {
  const x = norm(u, a.newLo, a.def, a.newHi);
  return axisPieces(support.start, support.peak, support.end, a).reduce((sum, p) => sum + p.factor * scalar(p, x), 0);
}

const support = (s: number, p: number, e: number): Piece => ({ start: s * ONE, peak: p * ONE, end: e * ONE, factor: 1 });

describe("axis pieces", () => {
  const axes = [
    planAxis("wght", 100, 400, 900, 0.5), // a range on both sides
    planAxis("wght", 100, 900, 900, 0.5), // default at the max (Fraunces)
    planAxis("wght", 300, 300, 1000, 0.5), // default at the min (Recursive)
  ];
  const supports = [
    support(0, 1, 1), support(0.5, 1, 1), support(0.25, 0.5, 1), support(0, 0.5, 1), // positive side
    support(-1, -1, 0), support(-1, -1, -0.5), support(-1, -0.5, 0), support(-1, -0.25, -0.1), // negative side
  ];

  it("keep every old value and go on along the line through the default", () => {
    for (const a of axes) {
      for (const sup of supports) {
        if ((sup.peak > 0 && a.hi === a.def) || (sup.peak < 0 && a.lo === a.def)) continue; // no such tuples
        for (let i = 0; i <= 40; i++) {
          const u = a.newLo + ((a.newHi - a.newLo) * i) / 40;
          expect(stretched(a, sup, u), `${a.lo}/${a.def}/${a.hi} ${JSON.stringify(sup)} at ${u}`).toBeCloseTo(expected(a, sup, u), 3);
        }
      }
    }
  });

  it("grow each side by half its span, borrowing the other side's span when it has none", () => {
    expect(planAxis("wght", 100, 400, 900, 0.5)).toMatchObject({ newLo: -50, newHi: 1150 });
    expect(planAxis("wght", 100, 900, 900, 0.5)).toMatchObject({ newLo: -300, newHi: 1300, pos: { ne: null } });
  });
});

describe("packed numbers", () => {
  it("round-trip deltas through zero, byte and word runs longer than one run allows", () => {
    const values = [...Array(70).fill(0), 5, -128, 127, 300, -32768, 32767, ...Array(130).fill(7), 0, -1];
    expect(decodeDeltas(encodeDeltas(values))).toEqual(values);
  });

  it("refuse a delta that no longer fits in 16 bits", () => {
    expect(() => encodeDeltas([40000])).toThrow(/16 bits/);
  });

  it("measure point number lists", () => {
    expect(pointsLength(Uint8Array.of(0), 0)).toBe(1); // all points
    expect(pointsLength(Uint8Array.of(3, 0x02, 1, 2, 3), 0)).toBe(5); // three byte points
    expect(pointsLength(Uint8Array.of(0x80, 2, 0x81, 0, 1, 0, 2), 0)).toBe(7); // long count, word points
  });
});

describe("a real font", () => {
  const input = fraunces;
  const { bytes, axes } = stretchFont(input);
  const tables = readTables(bytes);

  it("reaches past every axis end and says how far", () => {
    const fvar = view(tables.get("fvar")!);
    const first = fvar.getUint16(4), size = fvar.getUint16(10);
    axes.forEach((a, i) => {
      expect(a.reachMin).toBeLessThan(a.min);
      expect(a.reachMax).toBeGreaterThan(a.max);
      expect(fvar.getInt32(first + i * size + 4) / 65536).toBeCloseTo(a.reachMin, 3);
      expect(fvar.getInt32(first + i * size + 12) / 65536).toBeCloseTo(a.reachMax, 3);
    });
    expect(axes.find((a) => a.tag === "wght")).toMatchObject({ min: 100, default: 900, max: 900, reachMin: -300, reachMax: 1300 });
  });

  it("drops the tables that would clamp advances and metrics", () => {
    for (const tag of ["HVAR", "MVAR", "VVAR"]) expect(tables.has(tag)).toBe(false);
    expect(tables.has("gvar")).toBe(true);
  });

  it("is a well-formed file: checksums add up and the same input gives the same bytes", () => {
    expect(checksumOk(bytes)).toBe(true);
    expect(stretchFont(input).bytes).toEqual(bytes);
  });
});
