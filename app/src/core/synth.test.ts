/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import initWasm from "harfbuzzjs/dist/harfbuzz-subset.wasm?init";
import { glyphMap } from "./cmap";
import { catalogFiles, checksumOk, shaper } from "./fixtures";
import { outline, type Glyph } from "./glyf";
import { loadInstancer } from "./harfbuzz";
import { readTables, tagAt, view } from "./sfnt";
import { stretchFont } from "./stretch";
import { addAxes, type SyntheticAxis } from "./synth";
import { slant, transformFont, type Shear } from "./transform";

const hb = await loadInstancer(await initWasm({}));
const WDTH: SyntheticAxis = { tag: "wdth", min: 62.5, default: 100, max: 137.5 };
const SLNT: SyntheticAxis = { tag: "slnt", min: -18, default: 0, max: 6 };
// Letters and figures of Latin-1 and Turkish, and arrows (JetBrains Mono draws some mirrored).
const CHARS = [...new TextDecoder("windows-1252").decode(Uint8Array.from({ length: 224 }, (_, i) => i + 32)), ..."ĞğİıŞş"]
  .filter((c) => /[\p{L}\p{N}]/u.test(c)).concat([..."←↑→↓↔↕↖↗↘↙⇐⇒"]);
const SHAPED = "AVATAR Tôy fiyatı WAVE Ty, x́ q̈ ṇ̂ g̃́ Şırnak";

const file = (prefix: string) => catalogFiles.find(([name]) => name.startsWith(prefix))![1];
const em = (font: Uint8Array) => view(readTables(font).get("head")!).getUint16(18);

function axes(font: Uint8Array) {
  const fvar = readTables(font).get("fvar")!;
  const v = view(fvar), at = v.getUint16(4), size = v.getUint16(10);
  return Array.from({ length: v.getUint16(8) }, (_, k) => {
    const r = at + k * size;
    return { tag: tagAt(fvar, r), min: v.getInt32(r + 4) / 65536, def: v.getInt32(r + 8) / 65536, max: v.getInt32(r + 12) / 65536 };
  });
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

const parse = (s: string) => s.split(" ").map((g) => {
  const [gid, p] = g.split("@");
  const [adv, x, y] = p!.split(",").map(Number);
  return { gid, adv: adv!, x: x!, y: y! };
});

/** Largest distance, in points and in shaped glyphs, between an instance of the font with added axes and the same instance mapped. */
async function worst(synth: Uint8Array, plain: Uint8Array, loc: Record<string, number>, added: Record<string, number>, t: Shear) {
  const got = hb.instance(synth, { ...loc, ...added }), want = hb.instance(transformFont(plain, t), loc);
  let gap = 0, where = "";
  const a = glyphs(got), b = glyphs(want);
  expect([...a.keys()]).toEqual([...b.keys()]);
  for (const [c, g] of a) g.points.forEach((p, i) => {
    const q = b.get(c)!.points[i]!, d = Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));
    if (d > gap) { gap = d; where = `${c} point ${i}`; }
  });
  const sa = parse((await shaper(got))(SHAPED, "tr")), sb = parse((await shaper(want))(SHAPED, "tr"));
  expect(sa.map((g) => g.gid)).toEqual(sb.map((g) => g.gid));
  sa.forEach((g, i) => {
    const q = sb[i]!, d = Math.max(Math.abs(g.adv - q.adv), Math.abs(g.x - q.x), Math.abs(g.y - q.y));
    if (d > gap) { gap = d; where = `shaped glyph ${i}`; }
  });
  return { gap, where: `${where} at ${JSON.stringify({ ...loc, ...added })}` };
}

describe("added axes", () => {
  // Fraunces flattens its squashed accents, JetBrains Mono its mirrored arrows; Instrument Sans has its own wdth.
  for (const prefix of ["fraunces.", "jetbrains-mono.", "instrument-sans."]) {
    it(`give ${prefix.slice(0, -1)} every instance of the mapped font, within em/250`, async () => {
      const plain = stretchFont(file(prefix)).bytes;
      const add = [WDTH, SLNT].filter((a) => !axes(plain).some((x) => x.tag === a.tag));
      const synth = addAxes(plain, add);
      expect(checksumOk(synth)).toBe(true);
      expect(axes(synth).slice(-add.length).map((a) => [a.tag, a.min, a.def, a.max])).toEqual(add.map((a) => [a.tag, a.min, a.default, a.max]));
      const own = axes(file(prefix));
      const at = (pick: (x: (typeof own)[number]) => number) => Object.fromEntries(own.map((x) => [x.tag, pick(x)]));
      const cases: [Record<string, number>, Shear][] = [];
      if (add.includes(WDTH)) cases.push([{ wdth: 62.5 }, { a: 0.625, b: 0, c: 0 }], [{ wdth: 137.5 }, { a: 1.375, b: 0, c: 0 }]);
      if (add.includes(SLNT)) cases.push([{ slnt: -18 }, slant(plain, 18)], [{ slnt: 6 }, slant(plain, -6)], [{ slnt: -7 }, slant(plain, 7)]);
      // Both at once add up to one map (core/build drawnMap).
      if (add.length === 2) cases.push([{ wdth: 80, slnt: -10 }, { ...slant(plain, 10), a: 0.8 }]);
      for (const loc of [at((x) => x.def), at((x) => x.min), at((x) => x.max)]) {
        for (const [added, t] of cases) {
          const r = await worst(synth, plain, loc, added, t);
          expect(r.gap, r.where).toBeLessThanOrEqual(em(plain) / 250);
        }
      }
    }, 60000);
  }

  it("refuse an axis the font has, or one with no range", () => {
    const font = file("roboto-flex.");
    expect(() => addAxes(font, [WDTH])).toThrow(/already has wdth/);
    expect(() => addAxes(file("inter."), [{ tag: "wdth", min: 100, default: 100, max: 100 }])).toThrow(/no range/);
  });
});
