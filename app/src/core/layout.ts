/**
 * GPOS and GDEF under transform.ts's map. Anchors and ligature carets are points
 * (x' = a·x + b·y + c); value records are moves (x' = a·x + b·y), so a slant gives a move that
 * had only y an x too. Their variations map the same way, through new items of GDEF's variation
 * store; y keeps its old items.
 *
 * Each positioning subtable (lookup types 1-6) is written anew at the back of GPOS and reached
 * through an Extension lookup, so it may grow without moving anything else: the old subtable's
 * first 8 bytes become the Extension subtable, and the lookup's own offsets stay. The old
 * bytes left behind are unreachable; HarfBuzz drops them when it makes a download.
 * Device tables for hinting (none in the catalog) are dropped with the rest of hinting.
 *
 * Measured on the catalog (29 files, 12° and 80%, 3 instances each): shaped marks and kerning
 * land within 2.4 units of the mapped original (unmapped, a slant moved marks by 31-116); the
 * file grows 5-69% by the unreachable bytes, a download 0-6%.
 */
import type { Shear } from "./transform";
import { view } from "./sfnt";
import { VarStore, varRef, type VarRef } from "./varstore";

const EXTENSION = 9, VARIATION_INDEX = 0x8000;
// Value record fields, in their order in the record.
const X_PLA = 1, Y_PLA = 2, X_ADV = 4, Y_ADV = 8, X_PLA_DEV = 0x10, Y_PLA_DEV = 0x20, X_ADV_DEV = 0x40, Y_ADV_DEV = 0x80;

function fail(why: string): never {
  throw new Error(`layout: ${why}`);
}

/** A table being written: bytes, and offsets to other tables that `pack` fills in. */
class Node {
  readonly data: number[] = [];
  readonly links: { at: number; to: Node }[] = [];
  id = -1;
  u16(...xs: number[]): this {
    for (const x of xs) this.data.push((x >> 8) & 0xff, x & 0xff);
    return this;
  }
  i16(x: number): this {
    if (x < -32768 || x > 32767) fail(`${x} does not fit 16 bits`);
    return this.u16(x);
  }
  off(to: Node | null): this {
    if (to) this.links.push({ at: this.data.length, to });
    return this.u16(0);
  }
}

/**
 * Lays out a table and everything it points to, each shared table once and after every table
 * that points to it (offsets are unsigned). Offsets are 16 bits, so orders are tried until one
 * keeps them all short: breadth first; breadth first with small tables first (a table whose
 * many small children come before its few large ones, as class kerning's devices before its
 * class definitions); depth first.
 */
function pack(root: Node): Uint8Array {
  for (const order of ORDERS) {
    const out = place(root, order);
    if (out) return out;
  }
  fail("a subtable no longer fits 16-bit offsets");
}

type Order = { readonly lifo: boolean; readonly small: boolean };
const ORDERS: readonly Order[] = [{ lifo: false, small: false }, { lifo: false, small: true }, { lifo: true, small: false }];

function place(root: Node, how: Order): Uint8Array | null {
  const waiting = new Map<Node, number>(), seen = new Set([root]), stack = [root];
  while (stack.length) {
    for (const l of stack.pop()!.links) {
      waiting.set(l.to, (waiting.get(l.to) ?? 0) + 1);
      if (!seen.has(l.to)) { seen.add(l.to); stack.push(l.to); }
    }
  }
  const order: Node[] = [], ready = [root];
  let head = 0;
  while (head < ready.length) {
    const n = how.lifo ? ready.pop()! : ready[head++]!;
    order.push(n);
    const children = how.small ? [...n.links].sort((x, y) => x.to.data.length - y.to.data.length) : how.lifo ? [...n.links].reverse() : n.links;
    for (const l of children) {
      const left = waiting.get(l.to)! - 1;
      waiting.set(l.to, left);
      if (left === 0) ready.push(l.to);
    }
  }
  const at = new Map<Node, number>();
  let size = 0;
  for (const n of order) { at.set(n, size); size += n.data.length; }
  const out = new Uint8Array(size);
  for (const n of order) {
    const base = at.get(n)!;
    out.set(n.data, base);
    for (const l of n.links) {
      const off = at.get(l.to)! - base;
      if (off > 0xffff) return null;
      out[base + l.at] = off >> 8; out[base + l.at + 1] = off & 0xff;
    }
  }
  return out;
}

type Value = { xPla: number; yPla: number; xAdv: number; yAdv: number; xPlaDev: VarRef | null; yPlaDev: VarRef | null; xAdvDev: VarRef | null; yAdvDev: VarRef | null };

/** GPOS and GDEF mapped by `t`; only the tables that changed. */
export function mapLayout(tables: ReadonlyMap<string, Uint8Array>, t: Shear): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const gdef = tables.get("GDEF"), gpos = tables.get("GPOS");
  const g = gdef ? view(gdef) : null;
  const storeAt = g && gdef!.length >= 18 && g.getUint16(0) === 1 && g.getUint16(2) >= 3 ? g.getUint32(14) : 0;
  const store = storeAt ? new VarStore(gdef!.subarray(storeAt)) : null;
  const combine = (terms: readonly (readonly [VarRef | null, number])[]) => {
    if (terms.every(([r, k]) => !r || k === 0)) return null;
    return (store ?? fail("a variation device with no variation store")).combine(terms);
  };

  if (gpos) out.set("GPOS", mapGpos(gpos, t, combine));
  if (gdef) {
    const carets = mapCarets(gdef, t, combine);
    if (store?.changed) {
      const s = store.write(), at = carets.length + (carets.length & 1);
      const next = new Uint8Array(at + s.length);
      next.set(carets); next.set(s, at);
      view(next).setUint32(14, at);
      out.set("GDEF", next);
    } else out.set("GDEF", carets);
  }
  return out;
}

type Combine = (terms: readonly (readonly [VarRef | null, number])[]) => VarRef | null;

/** Ligature carets, in place: a caret is where its line meets the baseline, so it maps as the point (x, 0). */
function mapCarets(gdef: Uint8Array, t: Shear, combine: Combine): Uint8Array {
  const out = gdef.slice(), v = view(out);
  const list = v.getUint16(8);
  if (!list) return out;
  const done = new Set<number>();
  for (let i = 0; i < v.getUint16(list + 2); i++) {
    const lig = list + v.getUint16(list + 4 + i * 2);
    for (let k = 0; k < v.getUint16(lig); k++) {
      const cv = lig + v.getUint16(lig + 2 + k * 2);
      if (done.has(cv)) continue;
      done.add(cv);
      const format = v.getUint16(cv);
      if (format === 2) continue; // a contour point, which moves with its glyph
      if (format !== 1 && format !== 3) fail(`unknown caret format ${format}`);
      v.setInt16(cv + 2, Math.round(t.a * v.getInt16(cv + 2) + t.c));
      const dev = format === 3 ? cv + v.getUint16(cv + 4) : cv;
      if (dev === cv || done.has(dev)) continue;
      done.add(dev);
      // Only carets point at caret devices, and all of them map by a, so a device is rewritten in place once.
      const ref = v.getUint16(dev + 4) === VARIATION_INDEX ? combine([[varRef(v.getUint16(dev), v.getUint16(dev + 2)), t.a]]) : null;
      if (ref) { v.setUint16(dev, ref.outer); v.setUint16(dev + 2, ref.inner); }
      else v.setUint16(cv + 4, 0);
    }
  }
  return out;
}

function mapGpos(gpos: Uint8Array, t: Shear, combine: Combine): Uint8Array {
  const v = view(gpos), u16 = (at: number) => v.getUint16(at), i16 = (at: number) => v.getInt16(at);
  const memo = new Map<string, Node>();
  const intern = (n: Node): Node => {
    const key = n.data.join() + "|" + n.links.map((l) => `${l.at}:${l.to.id}`).join();
    const had = memo.get(key);
    if (had) return had;
    n.id = memo.size;
    memo.set(key, n);
    return n;
  };
  const raw = (at: number, size: number) => { const n = new Node(); n.data.push(...gpos.subarray(at, at + size)); return intern(n); };
  const coverage = (at: number) => raw(at, 4 + u16(at + 2) * (u16(at) === 1 ? 2 : 6));
  const classDef = (at: number) => raw(at, u16(at) === 1 ? 6 + u16(at + 4) * 2 : 4 + u16(at + 2) * 6);
  const deviceAt = (base: number, off: number): VarRef | null =>
    off && u16(base + off + 4) === VARIATION_INDEX ? varRef(u16(base + off), u16(base + off + 2)) : null;
  const device = (r: VarRef | null) => (r ? intern(new Node().u16(r.outer, r.inner, VARIATION_INDEX)) : null);
  const x = (px: number, py: number) => Math.round(t.a * px + t.b * py + t.c);
  const move = (dx: number, dy: number) => Math.round(t.a * dx + t.b * dy);

  const anchor = (at: number | null): Node | null => {
    if (at === null) return null;
    const format = u16(at), ax = i16(at + 2), ay = i16(at + 4);
    if (format < 1 || format > 3) fail(`unknown anchor format ${format}`);
    const xr = format === 3 ? deviceAt(at, u16(at + 6)) : null, yr = format === 3 ? deviceAt(at, u16(at + 8)) : null;
    const nxr = combine([[xr, t.a], [yr, t.b]]);
    const n = new Node();
    if (nxr || yr) n.u16(3).i16(x(ax, ay)).i16(ay).off(device(nxr)).off(device(yr));
    else if (format === 2) n.u16(2).i16(x(ax, ay)).i16(ay).u16(u16(at + 6));
    else n.u16(1).i16(x(ax, ay)).i16(ay);
    return intern(n);
  };
  const anchorAt = (base: number, off: number) => (off ? anchor(base + off) : null);

  // A slant gives every y field an x field.
  const format = (f: number) => (t.b !== 0 ? f | ((f & (Y_PLA | Y_ADV | Y_PLA_DEV | Y_ADV_DEV)) >> 1) : f);
  const recordSize = (f: number) => popcount(f) * 2;
  const readValue = (at: number, f: number, base: number): Value => {
    const val: Value = { xPla: 0, yPla: 0, xAdv: 0, yAdv: 0, xPlaDev: null, yPlaDev: null, xAdvDev: null, yAdvDev: null };
    let p = at;
    const next = (bit: number) => { if (!(f & bit)) return null; p += 2; return p - 2; };
    let q: number | null;
    if ((q = next(X_PLA)) !== null) val.xPla = i16(q);
    if ((q = next(Y_PLA)) !== null) val.yPla = i16(q);
    if ((q = next(X_ADV)) !== null) val.xAdv = i16(q);
    if ((q = next(Y_ADV)) !== null) val.yAdv = i16(q);
    if ((q = next(X_PLA_DEV)) !== null) val.xPlaDev = deviceAt(base, u16(q));
    if ((q = next(Y_PLA_DEV)) !== null) val.yPlaDev = deviceAt(base, u16(q));
    if ((q = next(X_ADV_DEV)) !== null) val.xAdvDev = deviceAt(base, u16(q));
    if ((q = next(Y_ADV_DEV)) !== null) val.yAdvDev = deviceAt(base, u16(q));
    return val;
  };
  const putValue = (n: Node, val: Value, f: number) => {
    if (f & X_PLA) n.i16(move(val.xPla, val.yPla));
    if (f & Y_PLA) n.i16(val.yPla);
    if (f & X_ADV) n.i16(move(val.xAdv, val.yAdv));
    if (f & Y_ADV) n.i16(val.yAdv);
    if (f & X_PLA_DEV) n.off(device(combine([[val.xPlaDev, t.a], [val.yPlaDev, t.b]])));
    if (f & Y_PLA_DEV) n.off(device(val.yPlaDev));
    if (f & X_ADV_DEV) n.off(device(combine([[val.xAdvDev, t.a], [val.yAdvDev, t.b]])));
    if (f & Y_ADV_DEV) n.off(device(val.yAdvDev));
  };
  /** Copies `count` value records (or pairs of them) starting at `at`, devices measured from `base`. */
  const values = (n: Node, at: number, count: number, formats: readonly number[], base: number, glyph: boolean) => {
    let p = at;
    for (let i = 0; i < count; i++) {
      if (glyph) { n.u16(u16(p)); p += 2; }
      for (const f of formats) { putValue(n, readValue(p, f, base), format(f)); p += recordSize(f); }
    }
  };
  /** A mark or base array: each record a class (marks) or an anchor per class (bases), measured from the array. */
  const marks = (at: number) => {
    const n = new Node().u16(u16(at));
    for (let i = 0; i < u16(at); i++) n.u16(u16(at + 2 + i * 4)).off(anchorAt(at, u16(at + 4 + i * 4)));
    return intern(n);
  };
  const anchors = (at: number, classes: number) => {
    const n = new Node().u16(u16(at));
    for (let i = 0; i < u16(at) * classes; i++) n.off(anchorAt(at, u16(at + 2 + i * 2)));
    return intern(n);
  };

  const subtable = (type: number, at: number): Node => {
    const f = u16(at), n = new Node().u16(f);
    const bad = () => fail(`unknown format ${f} of lookup type ${type}`);
    switch (type) {
      case 1: {
        const vf = u16(at + 4);
        n.off(coverage(at + u16(at + 2))).u16(format(vf));
        if (f === 1) values(n, at + 6, 1, [vf], at, false);
        else if (f === 2) { n.u16(u16(at + 6)); values(n, at + 8, u16(at + 6), [vf], at, false); }
        else bad();
        break;
      }
      case 2: {
        const vf1 = u16(at + 4), vf2 = u16(at + 6);
        n.off(coverage(at + u16(at + 2))).u16(format(vf1), format(vf2));
        if (f === 1) {
          n.u16(u16(at + 8));
          for (let i = 0; i < u16(at + 8); i++) {
            const set = at + u16(at + 10 + i * 2), s = new Node().u16(u16(set));
            values(s, set + 2, u16(set), [vf1, vf2], set, true);
            n.off(intern(s));
          }
        } else if (f === 2) {
          const c1 = u16(at + 12), c2 = u16(at + 14);
          n.off(classDef(at + u16(at + 8))).off(classDef(at + u16(at + 10))).u16(c1, c2);
          values(n, at + 16, c1 * c2, [vf1, vf2], at, false);
        } else bad();
        break;
      }
      case 3: {
        if (f !== 1) bad();
        n.off(coverage(at + u16(at + 2))).u16(u16(at + 4));
        for (let i = 0; i < u16(at + 4) * 2; i++) n.off(anchorAt(at, u16(at + 6 + i * 2)));
        break;
      }
      case 4: case 5: case 6: {
        if (f !== 1) bad();
        const classes = u16(at + 6);
        n.off(coverage(at + u16(at + 2))).off(coverage(at + u16(at + 4))).u16(classes).off(marks(at + u16(at + 8)));
        const second = at + u16(at + 10);
        if (type !== 5) n.off(anchors(second, classes));
        else {
          const ligs = new Node().u16(u16(second));
          for (let i = 0; i < u16(second); i++) ligs.off(anchors(second + u16(second + 2 + i * 2), classes));
          n.off(intern(ligs));
        }
        break;
      }
      default: fail(`lookup type ${type}`);
    }
    return n;
  };

  const out = gpos.slice(), w = view(out);
  const tail: Uint8Array[] = [];
  let size = out.length + (out.length & 1);
  const append = (stub: number, type: number, at: number) => {
    const bytes = pack(subtable(type, at));
    w.setUint16(stub, 1); w.setUint16(stub + 2, type); w.setUint32(stub + 4, size - stub);
    tail.push(bytes);
    size += bytes.length + (bytes.length & 1);
  };
  const list = u16(8);
  for (let i = 0; i < u16(list); i++) {
    const lookup = list + u16(list + 2 + i * 2), type = u16(lookup);
    for (let k = 0; k < u16(lookup + 4); k++) {
      const at = lookup + u16(lookup + 6 + k * 2);
      if (type === EXTENSION) {
        const inner = u16(at + 2);
        if (inner >= 1 && inner <= 6) append(at, inner, at + v.getUint32(at + 4));
      } else if (type >= 1 && type <= 6) {
        if (headerSize(v, type, at) < 8) fail("a subtable too small to become an Extension");
        append(at, type, at);
      }
    }
    if (type >= 1 && type <= 6) w.setUint16(lookup, EXTENSION);
  }
  const full = new Uint8Array(size);
  full.set(out);
  let at = out.length + (out.length & 1);
  for (const b of tail) { full.set(b, at); at += b.length + (b.length & 1); }
  return full;
}

/** Bytes a subtable's own header takes, which its Extension stub overwrites. */
function headerSize(v: DataView, type: number, at: number): number {
  const f = v.getUint16(at);
  if (type === 1) return f === 1 ? 6 + 2 * popcount(v.getUint16(at + 4)) : 8;
  if (type === 3) return 6 + 4 * v.getUint16(at + 4);
  return 10;
}

function popcount(x: number): number {
  let n = 0;
  for (let b = x & 0xff; b; b >>= 1) n += b & 1;
  return n;
}
