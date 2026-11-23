/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import initWasm from "harfbuzzjs/dist/harfbuzz-subset.wasm?init";
import { glyphMap } from "./cmap";
import { catalogFiles, checksumOk, shaper } from "./fixtures";
import { outline, type Glyph } from "./glyf";
import { loadInstancer } from "./harfbuzz";
import { readTables, tagAt, view } from "./sfnt";
import { slant, transformFont, widen, type Shear } from "./transform";

const hb = await loadInstancer(await initWasm({}));

/** Latin-1 letters and digits and Turkish's own, as the phase 7a measurement checked. */
const CHARS = [...new TextDecoder("windows-1252").decode(Uint8Array.from({ length: 224 }, (_, i) => i + 32)), ..."ĞğİıŞş"].filter((c) => /[\p{L}\p{N}]/u.test(c));

function axes(font: Uint8Array): { tag: string; min: number; def: number; max: number }[] {
  const fvar = readTables(font).get("fvar");
  if (!fvar) return [];
  const v = view(fvar), at = v.getUint16(4), size = v.getUint16(10);
  return Array.from({ length: v.getUint16(8) }, (_, k) => {
    const r = at + k * size;
    return { tag: tagAt(fvar, r), min: v.getInt32(r + 4) / 65536, def: v.getInt32(r + 8) / 65536, max: v.getInt32(r + 12) / 65536 };
  });
}

/** Default, every axis at its min, every axis at its max, and weight's two ends. */
function locations(font: Uint8Array): Record<string, number>[] {
  const a = axes(font);
  const at = (pick: (x: (typeof a)[number]) => number) => Object.fromEntries(a.map((x) => [x.tag, pick(x)]));
  const out = [at((x) => x.def), at((x) => x.min), at((x) => x.max)];
  const w = a.find((x) => x.tag === "wght");
  if (w) out.push({ ...out[0], wght: w.min }, { ...out[0], wght: w.max });
  return out;
}

function glyphs(font: Uint8Array): Map<string, Glyph> {
  const t = readTables(font), map = glyphMap(t.get("cmap")!);
  const out = new Map<string, Glyph>();
  for (const c of CHARS) {
    const gid = map.get(c.codePointAt(0)!);
    const g = gid === undefined ? null : outline(t, gid);
    if (g) out.set(c, g);
  }
  return out;
}

const advance = (font: Uint8Array, char: string) => {
  const t = readTables(font), gid = glyphMap(t.get("cmap")!).get(char.codePointAt(0)!)!;
  const n = view(t.get("hhea")!).getUint16(34);
  return view(t.get("hmtx")!).getUint16(Math.min(gid, n - 1) * 4);
};

/** Largest and mean distance, in font units, between an instance of the mapped font and the mapped instance. */
function worstGap(original: Uint8Array, mapped: Uint8Array, t: Shear): { gap: number; mean: number; where: string } {
  let worst = { gap: 0, where: "" }, sum = 0, count = 0;
  for (const loc of locations(original)) {
    const a = glyphs(hb.instance(mapped, loc)), b = glyphs(hb.instance(original, loc));
    expect(a.size, JSON.stringify(loc)).toBe(b.size);
    for (const [c, ga] of a) {
      const gb = b.get(c)!;
      expect(ga.points.length, `${c} at ${JSON.stringify(loc)}`).toBe(gb.points.length);
      ga.points.forEach((p, i) => {
        const q = gb.points[i]!;
        const gap = Math.max(Math.abs(p.x - (t.a * q.x + t.b * q.y + t.c)), Math.abs(p.y - q.y));
        if (gap > worst.gap) worst = { gap, where: `${c} point ${i} at ${JSON.stringify(loc)}` };
        sum += gap; count++;
      });
    }
  }
  return { ...worst, mean: sum / count };
}

const em = (font: Uint8Array) => view(readTables(font).get("head")!).getUint16(18);

/** Kerning, marks on bases and on marks (decomposed, so HarfBuzz positions them), and Turkish. */
const SHAPED = "AVATAR Tôy fiyatı WAVE Ty, x\u0301 q\u0308 n\u0323\u0302 g\u0303\u0301 Şırnak";

/**
 * Largest distance between the shaped glyphs of an instance of the mapped font and those of the
 * original instance, mapped: each glyph's offset is a move (a·x + b·y), its advance scales.
 */
async function worstShaped(original: Uint8Array, mapped: Uint8Array, t: Shear): Promise<{ gap: number; where: string }> {
  const parse = (s: string) => s.split(" ").map((g) => { const [gid, p] = g.split("@"); const [adv, x, y] = p!.split(",").map(Number); return { gid, adv: adv!, x: x!, y: y! }; });
  let worst = { gap: 0, where: "" };
  for (const loc of locations(original)) {
    const a = parse((await shaper(hb.instance(mapped, loc)))(SHAPED, "tr")), b = parse((await shaper(hb.instance(original, loc)))(SHAPED, "tr"));
    expect(a.map((g) => g.gid), JSON.stringify(loc)).toEqual(b.map((g) => g.gid));
    a.forEach((g, i) => {
      const q = b[i]!;
      const gap = Math.max(Math.abs(g.x - (t.a * q.x + t.b * q.y)), Math.abs(g.y - q.y), Math.abs(g.adv - t.a * q.adv));
      if (gap > worst.gap) worst = { gap, where: `glyph ${i} at ${JSON.stringify(loc)}` };
    });
  }
  return worst;
}

/** GDEF's ligature carets that are coordinates (formats 1 and 3), in table order. */
function carets(tables: ReadonlyMap<string, Uint8Array>): number[] {
  const gdef = tables.get("GDEF");
  if (!gdef) return [];
  const v = view(gdef), list = v.getUint16(8), out: number[] = [];
  if (!list) return out;
  for (let i = 0; i < v.getUint16(list + 2); i++) {
    const lig = list + v.getUint16(list + 4 + i * 2);
    for (let k = 0; k < v.getUint16(lig); k++) {
      const cv = lig + v.getUint16(lig + 2 + k * 2);
      if (v.getUint16(cv) !== 2) out.push(v.getInt16(cv + 2));
    }
  }
  return out;
}

describe("transformFont", () => {
  // Each tuple's delta is rounded on its own, so where many tuples meet the instance drifts by a
  // few units (measured: mean 0.32, worst 4.2, 0.05% of points past 2); the mapping mistakes the
  // phase 7a measurement caught were 52-269 units.
  const close = (font: Uint8Array, r: { gap: number; mean: number; where: string }) => {
    expect(r.gap, r.where).toBeLessThanOrEqual(em(font) / 200);
    expect(r.mean).toBeLessThanOrEqual(0.5);
  };

  it.each(catalogFiles)("slants %s 12° the same at every instance", (_, font) => {
    const t = slant(font, 12), mapped = transformFont(font, t);
    expect(checksumOk(mapped)).toBe(true);
    close(font, worstGap(font, mapped, t));
  });

  it.each(catalogFiles)("narrows %s to 80% the same at every instance, advances too", (_, font) => {
    const t = widen(0.8), mapped = transformFont(font, t);
    close(font, worstGap(font, mapped, t));
    for (const loc of locations(font)) {
      const a = hb.instance(mapped, loc), b = hb.instance(font, loc);
      // Rounded twice (each tuple, then the instance), like the outlines.
      for (const c of "nHo0") expect(Math.abs(advance(a, c) - 0.8 * advance(b, c)), `${c} at ${JSON.stringify(loc)}`).toBeLessThanOrEqual(2);
    }
  });

  // Unmapped, the slant moved marks by 31-116 units in every font whose marks this text reaches;
  // mapped, the worst was 2.4 (rounding of anchors and of their variations).
  it.each(catalogFiles)("positions %s's marks and kerning with the letters, slanted and narrowed", async (_, font) => {
    for (const t of [slant(font, 12), widen(0.8)]) {
      const r = await worstShaped(font, transformFont(font, t), t);
      expect(r.gap, r.where).toBeLessThanOrEqual(em(font) / 200);
    }
  });

  it("moves ligature carets and MVAR's caret slope and script offsets with the letters, at every instance", () => {
    // Recursive has the most carets, and MVAR varies its caret slope and sub- and superscript offsets.
    const font = catalogFiles.find(([name]) => name.startsWith("recursive."))![1];
    const t = slant(font, 12), mapped = transformFont(font, t);
    for (const loc of locations(font)) {
      const at = JSON.stringify(loc);
      const a = readTables(hb.instance(mapped, loc)), b = readTables(hb.instance(font, loc));
      const ca = carets(a), cb = carets(b);
      expect(ca.length).toBe(cb.length);
      expect(ca.length).toBeGreaterThan(0);
      ca.forEach((x, i) => expect(Math.abs(x - (cb[i]! + t.c)), `caret ${i} at ${at}`).toBeLessThanOrEqual(1));
      // The vector is whole numbers, and Recursive's MVAR takes its rise from 1 to 1000, so the
      // mapped vector can only be scaled to rise 30 at the default: within a unit of its run.
      const ha = view(a.get("hhea")!), hb0 = view(b.get("hhea")!);
      const lean = (h: DataView) => h.getInt16(20) / h.getInt16(18);
      expect(Math.abs(lean(ha) - (lean(hb0) + t.b)), at).toBeLessThanOrEqual(1 / ha.getInt16(18));
      const oa = view(a.get("OS/2")!), ob = view(b.get("OS/2")!);
      expect(Math.abs(oa.getInt16(14) - (ob.getInt16(14) - t.b * ob.getInt16(16))), at).toBeLessThanOrEqual(1);
      expect(Math.abs(oa.getInt16(22) - (ob.getInt16(22) + t.b * ob.getInt16(24))), at).toBeLessThanOrEqual(1);
    }
  });

  it("leans the caret and the italic angle with the letters, and keeps the left side bearing at xMin", () => {
    const font = catalogFiles.find(([name]) => name.startsWith("inter."))![1];
    const t = readTables(transformFont(font, slant(font, 12)));
    expect(view(t.get("post")!).getInt32(4) / 65536).toBeCloseTo(-12, 3);
    const hhea = view(t.get("hhea")!);
    expect(hhea.getInt16(20) / hhea.getInt16(18)).toBeCloseTo(Math.tan((12 * Math.PI) / 180), 3);
    const n = hhea.getUint16(34), hmtx = view(t.get("hmtx")!);
    const gid = glyphMap(t.get("cmap")!).get("Á".codePointAt(0)!)!;
    expect(hmtx.getInt16(Math.min(gid, n - 1) * 4 + 2)).toBe(outline(t, gid)!.points.reduce((m, p) => Math.min(m, p.x), Infinity));
  });

  it("shapes text with the same glyphs, advances scaled", async () => {
    const font = catalogFiles.find(([name]) => name.startsWith("fraunces."))![1];
    const before = (await shaper(font))("Şırnak fiyatı", "tr"), after = (await shaper(transformFont(font, widen(1.2))))("Şırnak fiyatı", "tr");
    const parse = (s: string) => s.split(" ").map((g) => { const [gid, pos] = g.split("@"); return { gid, adv: Number(pos!.split(",")[0]) }; });
    const a = parse(after), b = parse(before);
    expect(a.map((g) => g.gid)).toEqual(b.map((g) => g.gid));
    a.forEach((g, i) => expect(Math.abs(g.adv - 1.2 * b[i]!.adv)).toBeLessThanOrEqual(1));
  });
});
