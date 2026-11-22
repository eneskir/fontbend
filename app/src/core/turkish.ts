/**
 * Turkish text and the fi ligature. Turkish tells i from ı by the dot, so a ligature that draws
 * f and i as one shape must keep i's dot. Where a font's ligature loses the dot, or we cannot
 * tell, the font gets Turkish, Azerbaijani and Crimean Tatar language systems whose ligature
 * features leave those ligatures out; every other language shapes as before.
 */
import { glyphMap } from "./cmap";
import { outline, segments, type Glyph } from "./glyf";
import { readGsub, writeGsub, type Feature, type Gsub, type LangSys, type Lookup, type Script } from "./gsub";
import { view } from "./sfnt";

/** The languages that write a dotted and a dotless i (OpenType tags). */
const LANGUAGES = ["TRK ", "AZE ", "CRT "];
const LIGATURE_FEATURES = new Set(["liga", "clig", "rlig"]);
const SINGLE = 1, LIGATURE = 4;

export type Dot = "kept" | "lost" | "unsure";
export type TurkishLigature = { readonly glyph: number; readonly parts: readonly number[]; readonly dot: Dot };
export type TurkishFix = {
  /** The GSUB table with the fix, or null when the font needs none. */
  readonly gsub: Uint8Array | null;
  /** Every ligature with i that forms in Turkish, and whether it keeps the dot. */
  readonly ligatures: readonly TurkishLigature[];
};

function coverage(v: DataView, at: number): number[] {
  const format = v.getUint16(at), n = v.getUint16(at + 2), out: number[] = [];
  if (format === 1) for (let i = 0; i < n; i++) out.push(v.getUint16(at + 4 + i * 2));
  else if (format === 2) for (let i = 0; i < n; i++) {
    const r = at + 4 + i * 6;
    for (let g = v.getUint16(r); g <= v.getUint16(r + 2); g++) out.push(g);
  }
  return out;
}

/** What a single substitution lookup turns the glyph into. */
function single(v: DataView, lookup: Lookup, gid: number): number {
  if (!("at" in lookup)) return gid;
  for (const at of lookup.at) {
    const k = coverage(v, at + v.getUint16(at + 2)).indexOf(gid);
    if (k < 0) continue;
    return v.getUint16(at) === 1 ? (gid + v.getInt16(at + 4)) & 0xffff : v.getUint16(at + 6 + k * 2);
  }
  return gid;
}

/** The features that feature variations swap, each with the lookups of one alternate. */
function alternates(v: DataView, at: number): { feature: number; lookups: number[] }[] {
  if (!at) return [];
  const out: { feature: number; lookups: number[] }[] = [];
  for (let r = 0; r < v.getUint32(at + 4); r++) {
    const fts = at + v.getUint32(at + 8 + r * 8 + 4);
    for (let k = 0; k < v.getUint16(fts + 4); k++) {
      const ft = fts + v.getUint32(fts + 6 + k * 6 + 2);
      out.push({ feature: v.getUint16(fts + 6 + k * 6), lookups: Array.from({ length: v.getUint16(ft + 2) }, (_, j) => v.getUint16(ft + 4 + j * 2)) });
    }
  }
  return out;
}

export type Lig = { readonly glyph: number; readonly parts: readonly number[] };

/** The ligatures of one ligature substitution subtable, in the order the shaper tries them. */
function ligatures(v: DataView, at: number): Lig[] {
  const firsts = coverage(v, at + v.getUint16(at + 2)), out: Lig[] = [];
  firsts.forEach((first, i) => {
    const set = at + v.getUint16(at + 6 + i * 2);
    for (let k = 0; k < v.getUint16(set); k++) {
      const lig = set + v.getUint16(set + 2 + k * 2), count = v.getUint16(lig + 2);
      out.push({ glyph: v.getUint16(lig), parts: [first, ...Array.from({ length: count - 1 }, (_, c) => v.getUint16(lig + 4 + c * 2))] });
    }
  });
  return out;
}

function writeLigatures(ligs: readonly Lig[]): Uint8Array {
  const sets = new Map<number, Lig[]>();
  for (const l of ligs) sets.set(l.parts[0]!, [...(sets.get(l.parts[0]!) ?? []), l]);
  const firsts = [...sets.keys()].sort((a, b) => a - b);
  const out: number[] = [];
  const u16 = (n: number) => { if (n < 0 || n > 0xffff) throw new RangeError(`${n} does not fit 16 bits`); out.push(n >> 8, n & 0xff); };
  const fill = (at: number, n: number) => { if (n > 0xffff) throw new RangeError(`offset ${n} does not fit 16 bits`); out[at] = n >> 8; out[at + 1] = n & 0xff; };
  u16(1); const coverageSlot = out.length; u16(0); u16(firsts.length);
  const setSlots = firsts.map(() => { const s = out.length; u16(0); return s; });
  firsts.forEach((first, i) => {
    const set = out.length, list = sets.get(first)!;
    fill(setSlots[i]!, set);
    u16(list.length);
    const slots = list.map(() => { const s = out.length; u16(0); return s; });
    list.forEach((l, k) => { fill(slots[k]!, out.length - set); u16(l.glyph); u16(l.parts.length); for (const p of l.parts.slice(1)) u16(p); });
  });
  fill(coverageSlot, out.length);
  u16(1); u16(firsts.length); for (const f of firsts) u16(f);
  return Uint8Array.from(out);
}

type Ring = { x: number; y: number }[];
const flat = (g: Glyph, dx = 0): Ring[] => segments(g).map((contour) => contour.flatMap((s) => {
  if (s.cx === null || s.cy === null) return [{ x: s.x1 + dx, y: s.y1 }];
  return Array.from({ length: 8 }, (_, t) => {
    const u = (t + 1) / 8, a = (1 - u) ** 2, b = 2 * u * (1 - u), c = u * u;
    return { x: a * s.x0 + b * s.cx! + c * s.x1 + dx, y: a * s.y0 + b * s.cy! + c * s.y1 };
  });
}));
/** Nonzero winding: whether the outline inks this point. */
function inked(rings: readonly Ring[], px: number, py: number): boolean {
  let w = 0;
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const p = r[i]!, q = r[(i + 1) % r.length]!;
    if ((p.y <= py) !== (q.y <= py) && p.x + ((py - p.y) * (q.x - p.x)) / (q.y - p.y) > px) w += q.y > p.y ? 1 : -1;
  }
  return w !== 0;
}

const box = (r: Ring) => {
  const xs = r.map((p) => p.x), ys = r.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

/**
 * Whether the ligature draws i's dot as a dot of its own. i's dot is its contours that lie wholly
 * above the x-height. The dot is kept when the ligature has a contour above the x-height of about
 * the dot's size that the other contours cover less than a fifth of; a dot melted into the f's
 * hook, or one drawn over it, is lost. Ink alone misleads both ways: a round f terminal looks like
 * a dot, and an f bar passing near a real dot looks like a lost one.
 */
export function dotOf(tables: Map<string, Uint8Array>, lig: Lig, i: number, x: number): Dot {
  const xHeight = outline(tables, x), iGlyph = outline(tables, i), ligGlyph = outline(tables, lig.glyph);
  if (!xHeight || !iGlyph || !ligGlyph || xHeight.points.length === 0) return "unsure";
  const top = Math.max(...xHeight.points.map((p) => p.y));
  const dot = flat(iGlyph).filter((r) => r.length > 0 && box(r).y0 > top);
  if (dot.length === 0) return "unsure";
  const d = box(dot.flat()), w = d.x1 - d.x0, h = d.y1 - d.y0, near = (a: number, b: number) => a > b * 0.6 && a < b * 1.6;
  const rings = flat(ligGlyph).filter((r) => r.length > 0), N = 12;
  const kept = rings.some((r) => {
    const b = box(r);
    if (b.y0 <= top || !near(b.x1 - b.x0, w) || !near(b.y1 - b.y0, h)) return false;
    const others = rings.filter((o) => o !== r);
    let ink = 0, covered = 0;
    for (let a = 0; a < N; a++) for (let c = 0; c < N; c++) {
      const px = b.x0 + ((a + 0.5) / N) * (b.x1 - b.x0), py = b.y0 + ((c + 0.5) / N) * (b.y1 - b.y0);
      if (!inked([r], px, py)) continue;
      ink++;
      if (inked(others, px, py)) covered++;
    }
    return ink > 0 && covered / ink < 0.2;
  });
  return kept ? "kept" : "lost";
}

/** The script a shaper picks for Latin text. */
function latin(g: Gsub): number {
  const at = g.scripts.findIndex((s) => s.tag === "latn");
  return at >= 0 ? at : g.scripts.findIndex((s) => s.tag === "DFLT");
}

export function fixTurkish(tables: Map<string, Uint8Array>): TurkishFix {
  const none = { gsub: null, ligatures: [] };
  const table = tables.get("GSUB"), cmap = tables.get("cmap");
  if (!table || !cmap) return none;
  const chars = glyphMap(cmap), i = chars.get(0x69), x = chars.get(0x78);
  if (i === undefined || x === undefined) return none;
  const g = readGsub(table), v = view(table), si = latin(g);
  if (si < 0) return none;
  const script = g.scripts[si]!;

  const lookups = [...g.lookups], features = [...g.features], found = new Map<number, TurkishLigature>();
  const lookupCopies = new Map<string, number>(), featureCopies = new Map<string, number>();
  const verdict = (lig: Lig, iGid: number) => {
    if (!found.has(lig.glyph)) found.set(lig.glyph, { ...lig, dot: dotOf(tables, lig, iGid, x) });
    return found.get(lig.glyph)!.dot;
  };
  // A copy of a ligature lookup without the ligatures that lose i's dot; the lookup itself when none does.
  const filtered = (index: number, iGid: number): number => {
    const key = `${index} ${iGid}`, l = lookups[index]!;
    if (lookupCopies.has(key)) return lookupCopies.get(key)!;
    let out = index;
    if (l.type === LIGATURE && "at" in l) {
      const subs = l.at.map((at) => v.getUint16(at) === 1 ? ligatures(v, at) : null);
      const bad = (lig: Lig) => lig.parts.includes(iGid) && verdict(lig, iGid) !== "kept";
      if (subs.some((s) => s?.some(bad))) {
        if (subs.some((s) => s === null)) throw new Error("a ligature subtable has an unknown format");
        out = lookups.push({ type: LIGATURE, flag: l.flag, markSet: l.markSet, data: subs.map((s) => writeLigatures(s!.filter((lig) => !bad(lig)))) }) - 1;
      }
    }
    lookupCopies.set(key, out);
    return out;
  };
  const fixFeature = (index: number, iGid: number): number => {
    const f = features[index]!, key = `${index} ${iGid}`;
    if (!LIGATURE_FEATURES.has(f.tag)) return index;
    if (featureCopies.has(key)) return featureCopies.get(key)!;
    const next = f.lookups.map((l) => filtered(l, iGid));
    const out = next.every((l, k) => l === f.lookups[k]) ? index : features.push({ ...f, lookups: next } satisfies Feature) - 1;
    featureCopies.set(key, out);
    return out;
  };

  const langs = [...script.langs], iGids = new Set<number>();
  for (const tag of LANGUAGES) {
    const k = langs.findIndex((l) => l.tag === tag), sys = k >= 0 ? langs[k]!.sys : script.base;
    if (!sys) continue;
    // The locl feature runs first and may give Turkish its own i.
    const all = sys.required === 0xffff ? sys.features : [sys.required, ...sys.features];
    let iGid = i;
    for (const f of all.map((n) => features[n]!).filter((f) => f.tag === "locl")) for (const l of f.lookups) if (lookups[l]!.type === SINGLE) iGid = single(v, lookups[l]!, iGid);
    iGids.add(iGid);
    const fixed: LangSys = { required: sys.required === 0xffff ? sys.required : fixFeature(sys.required, iGid), features: sys.features.map((n) => fixFeature(n, iGid)) };
    if (fixed.required === sys.required && fixed.features.every((n, j) => n === sys.features[j])) continue;
    if (k >= 0) langs[k] = { tag, sys: fixed };
    else langs.push({ tag, sys: fixed });
  }
  // Feature variations swap a feature's lookups by index at some axis values; a copy made here would
  // miss those swaps, so a font whose varied ligature features would need the fix is left as it is.
  for (const alt of alternates(v, g.variations)) {
    if (!LIGATURE_FEATURES.has(features[alt.feature]!.tag)) continue;
    for (const [key, copy] of featureCopies) if (key.startsWith(`${alt.feature} `) && copy !== alt.feature) throw new Error("feature variations change a ligature feature that needs the fix");
    for (const iGid of iGids) if (alt.lookups.some((l) => filtered(l, iGid) !== l)) throw new Error("feature variations bring in ligatures that need the fix");
  }
  const ligs = [...found.values()];
  if (lookups.length === g.lookups.length) return { gsub: null, ligatures: ligs };
  const scripts: Script[] = g.scripts.map((s, n) => (n === si ? { ...s, langs } : s));
  return { gsub: writeGsub({ ...g, scripts, features, lookups }), ligatures: ligs };
}
