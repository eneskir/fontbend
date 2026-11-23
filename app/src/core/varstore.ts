/**
 * An ItemVariationStore (GDEF's, MVAR's) that keeps every item it has and adds items made of
 * old ones: under transform.ts's map a variable x move becomes a·dx + b·dy, region by region.
 * Old items keep their indices, so whatever still points at them stays right.
 */
import { view } from "./sfnt";

export type VarRef = { readonly outer: number; readonly inner: number };
/** An item's index as tables store it; 0xFFFF twice means none. */
export const varRef = (outer: number, inner: number): VarRef | null => (outer === 0xffff && inner === 0xffff ? null : { outer, inner });
/** A sum of items, each times a factor; null items count as nothing. */
export type Terms = readonly (readonly [ref: VarRef | null, factor: number])[];

type Data = { readonly regions: readonly number[]; readonly rows: readonly (readonly number[])[]; readonly bytes: Uint8Array };
type Group = { readonly regions: readonly number[]; readonly rows: number[][]; readonly outer: number; readonly index: Map<string, number> };

const LONG_WORDS = 0x8000, MAX_ITEMS = 0xffff;

function fail(why: string): never {
  throw new Error(`variation store: ${why}`);
}

export class VarStore {
  private readonly regionList: Uint8Array;
  private readonly data: readonly Data[];
  private readonly groups: Group[] = [];
  private readonly open = new Map<string, Group>();
  private readonly made = new Map<string, VarRef | null>();

  /** `store` starts at the store and may run past its end. */
  constructor(store: Uint8Array) {
    const v = view(store);
    if (v.getUint16(0) !== 1) fail("unknown format");
    const regionAt = v.getUint32(2);
    this.regionList = store.subarray(regionAt, regionAt + 4 + v.getUint16(regionAt) * v.getUint16(regionAt + 2) * 6);
    this.data = Array.from({ length: v.getUint16(6) }, (_, i) => readData(store, v.getUint32(8 + i * 4)));
  }

  /** Whether any item was added. */
  get changed(): boolean {
    return this.groups.length > 0;
  }

  /** The item that is the sum of `terms`, rounded region by region; null when it varies nothing. */
  combine(terms: Terms): VarRef | null {
    const live = terms.filter((x): x is readonly [VarRef, number] => x[0] !== null && x[1] !== 0);
    if (live.length === 0) return null;
    if (live.length === 1 && live[0]![1] === 1) return live[0]![0];
    const key = live.map(([r, k]) => `${r.outer}.${r.inner}*${k}`).join("+");
    if (this.made.has(key)) return this.made.get(key)!;

    const sum = new Map<number, number>();
    for (const [r, k] of live) {
      const d = this.data[r.outer] ?? fail(`no item data ${r.outer}`);
      const row = d.rows[r.inner] ?? fail(`no item ${r.outer}.${r.inner}`);
      d.regions.forEach((region, j) => sum.set(region, (sum.get(region) ?? 0) + k * row[j]!));
    }
    const regions = [...sum.keys()].sort((x, y) => x - y);
    const row = regions.map((r) => Math.round(sum.get(r)!));
    const ref = row.some((x) => x !== 0) ? this.add(regions, row) : null;
    this.made.set(key, ref);
    return ref;
  }

  /** How far the sum of `terms` can move a value: its deltas' sizes added up. */
  reach(terms: Terms): number {
    const sum = new Map<number, number>();
    for (const [r, k] of terms) {
      if (!r) continue;
      const d = this.data[r.outer] ?? fail(`no item data ${r.outer}`);
      const row = d.rows[r.inner] ?? fail(`no item ${r.outer}.${r.inner}`);
      d.regions.forEach((region, j) => sum.set(region, (sum.get(region) ?? 0) + k * row[j]!));
    }
    return [...sum.values()].reduce((n, x) => n + Math.abs(x), 0);
  }

  private add(regions: readonly number[], row: number[]): VarRef {
    const key = regions.join();
    let g = this.open.get(key);
    if (!g || g.rows.length === MAX_ITEMS) {
      const outer = this.data.length + this.groups.length;
      if (outer > 0xffff) fail("too many item data");
      g = { regions, rows: [], outer, index: new Map() };
      this.groups.push(g);
      this.open.set(key, g);
    }
    const rowKey = row.join();
    let inner = g.index.get(rowKey);
    if (inner === undefined) { inner = g.rows.push(row) - 1; g.index.set(rowKey, inner); }
    return { outer: g.outer, inner };
  }

  /** The store with its old item data first, unchanged, and the new after. */
  write(): Uint8Array {
    const parts = [...this.data.map((d) => d.bytes), ...this.groups.map(encodeGroup)];
    const header = 8 + parts.length * 4;
    const size = parts.reduce((n, p) => n + p.length, header + this.regionList.length);
    const out = new Uint8Array(size + (size & 1));
    const w = view(out);
    w.setUint16(0, 1); w.setUint32(2, header); w.setUint16(6, parts.length);
    out.set(this.regionList, header);
    let at = header + this.regionList.length;
    parts.forEach((p, i) => { w.setUint32(8 + i * 4, at); out.set(p, at); at += p.length; });
    return out;
  }
}

function readData(store: Uint8Array, at: number): Data {
  const v = view(store);
  const items = v.getUint16(at), words = v.getUint16(at + 2), count = v.getUint16(at + 4);
  const long = (words & LONG_WORDS) !== 0, wide = words & ~LONG_WORDS;
  const regions = Array.from({ length: count }, (_, k) => v.getUint16(at + 6 + k * 2));
  const rowSize = long ? wide * 4 + (count - wide) * 2 : wide * 2 + (count - wide);
  const start = at + 6 + count * 2;
  const rows = Array.from({ length: items }, (_, i) => {
    let p = start + i * rowSize;
    return regions.map((_, k) => {
      const big = k < wide;
      const x = long ? (big ? v.getInt32(p) : v.getInt16(p)) : big ? v.getInt16(p) : v.getInt8(p);
      p += long ? (big ? 4 : 2) : big ? 2 : 1;
      return x;
    });
  });
  return { regions, rows, bytes: store.subarray(at, start + items * rowSize) };
}

/** Item data with its wide columns first, as the format asks; 32-bit only when a delta needs it. */
function encodeGroup(g: Group): Uint8Array {
  const long = g.rows.some((r) => r.some((x) => x < -32768 || x > 32767));
  const narrow = (k: number) => g.rows.every((r) => (long ? r[k]! >= -32768 && r[k]! <= 32767 : r[k]! >= -128 && r[k]! <= 127));
  const order = g.regions.map((_, k) => k).sort((x, y) => Number(narrow(x)) - Number(narrow(y)) || x - y);
  const wide = order.filter((k) => !narrow(k)).length;
  const big = long ? 4 : 2, small = long ? 2 : 1;
  const rowSize = wide * big + (order.length - wide) * small;
  const size = 6 + order.length * 2 + g.rows.length * rowSize;
  const out = new Uint8Array(size + (size & 1));
  const w = view(out);
  w.setUint16(0, g.rows.length); w.setUint16(2, wide | (long ? LONG_WORDS : 0)); w.setUint16(4, order.length);
  order.forEach((k, j) => w.setUint16(6 + j * 2, g.regions[k]!));
  let at = 6 + order.length * 2;
  for (const r of g.rows) {
    order.forEach((k, j) => {
      const x = r[k]!;
      if (j < wide) { if (long) w.setInt32(at, x); else w.setInt16(at, x); at += big; }
      else { if (long) w.setInt16(at, x); else w.setInt8(at, x); at += small; }
    });
  }
  return out;
}
