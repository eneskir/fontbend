/**
 * The GSUB table: its scripts, language systems, features and lookups, read as lists, and written
 * again with language systems, features and lookups added. The old table is kept whole at the
 * back of the new one: every old lookup becomes a small Extension lookup that points into it,
 * so old subtables and feature variations are never rewritten and their lookup indices stay.
 */
import { tagAt, view } from "./sfnt";

export type LangSys = { readonly required: number; readonly features: readonly number[] };
export type Script = { readonly tag: string; readonly base: LangSys | null; readonly langs: readonly { readonly tag: string; readonly sys: LangSys }[] };
export type Feature = { readonly tag: string; readonly lookups: readonly number[]; readonly params: Uint8Array | null };
/** A lookup; `at` holds its subtables' offsets in the table (through any Extension), `data` the bytes of a new one's. */
export type Lookup = { readonly type: number; readonly flag: number; readonly markSet: number | null } & ({ readonly at: readonly number[] } | { readonly data: readonly Uint8Array[] });
export type Gsub = { readonly bytes: Uint8Array; readonly minor: number; readonly variations: number; readonly scripts: readonly Script[]; readonly features: readonly Feature[]; readonly lookups: readonly Lookup[] };

const NONE = 0xffff, EXTENSION = 7, USE_MARK_FILTERING_SET = 0x10;

/** Size of a feature's parameters, which only some features have; null when the format is unknown. */
function paramsSize(tag: string, v: DataView, at: number): number | null {
  if (tag === "size") return 10;
  if (/^ss\d\d$/.test(tag)) return 4;
  if (/^cv\d\d$/.test(tag)) return 14 + 3 * v.getUint16(at + 12);
  return null;
}

export function readGsub(bytes: Uint8Array): Gsub {
  const v = view(bytes), u16 = (at: number) => v.getUint16(at);
  const minor = u16(2), scriptList = u16(4), featureList = u16(6), lookupList = u16(8);
  const variations = minor >= 1 ? v.getUint32(10) : 0;
  const langSys = (at: number): LangSys => ({ required: u16(at + 2), features: Array.from({ length: u16(at + 4) }, (_, i) => u16(at + 6 + i * 2)) });
  const scripts = Array.from({ length: scriptList ? u16(scriptList) : 0 }, (_, i) => {
    const rec = scriptList + 2 + i * 6, at = scriptList + u16(rec + 4);
    return {
      tag: tagAt(bytes, rec),
      base: u16(at) ? langSys(at + u16(at)) : null,
      langs: Array.from({ length: u16(at + 2) }, (_, k) => ({ tag: tagAt(bytes, at + 4 + k * 6), sys: langSys(at + u16(at + 4 + k * 6 + 4)) })),
    };
  });
  const features = Array.from({ length: featureList ? u16(featureList) : 0 }, (_, i) => {
    const rec = featureList + 2 + i * 6, tag = tagAt(bytes, rec), at = featureList + u16(rec + 4);
    let params: Uint8Array | null = null;
    if (u16(at)) {
      const size = paramsSize(tag, v, at + u16(at));
      if (size === null) throw new Error(`feature ${tag} has parameters of an unknown format`);
      params = bytes.slice(at + u16(at), at + u16(at) + size);
    }
    return { tag, params, lookups: Array.from({ length: u16(at + 2) }, (_, k) => u16(at + 4 + k * 2)) };
  });
  const lookups = Array.from({ length: lookupList ? u16(lookupList) : 0 }, (_, i): Lookup => {
    const at = lookupList + u16(lookupList + 2 + i * 2);
    let type = u16(at);
    const flag = u16(at + 2), count = u16(at + 4);
    const subs = Array.from({ length: count }, (_, k) => at + u16(at + 6 + k * 2));
    const markSet = flag & USE_MARK_FILTERING_SET ? u16(at + 6 + count * 2) : null;
    if (type === EXTENSION) {
      type = count ? u16(subs[0]! + 2) : 0;
      return { type, flag, markSet, at: subs.map((s) => s + v.getUint32(s + 4)) };
    }
    return { type, flag, markSet, at: subs };
  });
  return { bytes, minor, variations, scripts, features, lookups };
}

class Writer {
  private parts: number[] = [];
  get length() { return this.parts.length; }
  u16(n: number) { if (n < 0 || n > 0xffff) throw new RangeError(`${n} does not fit 16 bits`); this.parts.push(n >> 8, n & 0xff); }
  u32(n: number) { this.u16(Math.floor(n / 0x10000)); this.u16(n % 0x10000); }
  tag(t: string) { for (let i = 0; i < 4; i++) this.parts.push(t.charCodeAt(i)); }
  bytes(b: Uint8Array) { for (const x of b) this.parts.push(x); }
  /** Reserves a 16-bit slot to fill once the place it points to is known. */
  slot() { const at = this.parts.length; this.u16(0); return at; }
  fill(at: number, n: number) { if (n < 0 || n > 0xffff) throw new RangeError(`offset ${n} does not fit 16 bits`); this.parts[at] = n >> 8; this.parts[at + 1] = n & 0xff; }
  fill32(at: number, n: number) { this.parts[at] = n >>> 24; this.parts[at + 1] = (n >>> 16) & 0xff; this.parts[at + 2] = (n >>> 8) & 0xff; this.parts[at + 3] = n & 0xff; }
  done() { return Uint8Array.from(this.parts); }
}

/** The table again, with whatever was added to its lists. Throws RangeError when an offset doesn't fit. */
export function writeGsub(g: Gsub): Uint8Array {
  const w = new Writer();
  w.u16(1); w.u16(g.variations ? 1 : 0);
  const scriptSlot = w.slot(), featureSlot = w.slot(), lookupSlot = w.slot();
  const variationsSlot = g.variations ? w.length : -1;
  if (g.variations) w.u32(0);

  // Scripts, each with its language systems sorted by tag (shapers search them).
  const scriptList = w.length;
  w.fill(scriptSlot, scriptList);
  w.u16(g.scripts.length);
  const scriptSlots = g.scripts.map((s) => { w.tag(s.tag); return w.slot(); });
  const langSys = (sys: LangSys) => { w.u16(0); w.u16(sys.required); w.u16(sys.features.length); for (const f of sys.features) w.u16(f); };
  g.scripts.forEach((s, i) => {
    const at = w.length;
    w.fill(scriptSlots[i]!, at - scriptList);
    const baseSlot = w.slot();
    const langs = [...s.langs].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
    w.u16(langs.length);
    const slots = langs.map((l) => { w.tag(l.tag); return w.slot(); });
    if (s.base) { w.fill(baseSlot, w.length - at); langSys(s.base); }
    langs.forEach((l, k) => { w.fill(slots[k]!, w.length - at); langSys(l.sys); });
  });

  // Features, in their old order (language systems and feature variations point to them by index).
  const featureList = w.length;
  w.fill(featureSlot, featureList);
  w.u16(g.features.length);
  const featureSlots = g.features.map((f) => { w.tag(f.tag); return w.slot(); });
  g.features.forEach((f, i) => {
    const at = w.length;
    w.fill(featureSlots[i]!, at - featureList);
    w.u16(f.params ? 4 + f.lookups.length * 2 : 0);
    w.u16(f.lookups.length);
    for (const l of f.lookups) w.u16(l);
    if (f.params) w.bytes(f.params);
  });

  // Lookups: every one an Extension lookup whose 32-bit offsets reach the old table or the new subtables behind it.
  const lookupList = w.length;
  w.fill(lookupSlot, lookupList);
  w.u16(g.lookups.length);
  const lookupSlots = g.lookups.map(() => w.slot());
  // Each extension record's 32-bit offset is filled once the old table and the new subtables have their places.
  const targets: { slot: number; ext: number; old?: number; fresh?: number }[] = [];
  const fresh: Uint8Array[] = [];
  g.lookups.forEach((l, i) => {
    const at = w.length;
    w.fill(lookupSlots[i]!, at - lookupList);
    const subs = "at" in l ? l.at.map((a) => ({ old: a })) : l.data.map((d) => ({ fresh: fresh.push(d) - 1 }));
    w.u16(EXTENSION); w.u16(l.flag); w.u16(subs.length);
    const subSlots = subs.map(() => w.slot());
    if (l.markSet !== null) w.u16(l.markSet);
    subs.forEach((s, k) => {
      const ext = w.length;
      w.fill(subSlots[k]!, ext - at);
      w.u16(1); w.u16(l.type);
      targets.push({ slot: w.length, ext, ...s });
      w.u16(0); w.u16(0);
    });
  });

  const old = w.length;
  w.bytes(g.bytes);
  const freshAt = fresh.map((d) => { const at = w.length; w.bytes(d); return at; });
  for (const t of targets) w.fill32(t.slot, (t.old !== undefined ? old + t.old : freshAt[t.fresh!]!) - t.ext);
  if (g.variations) w.fill32(variationsSlot, old + g.variations);
  return w.done();
}
