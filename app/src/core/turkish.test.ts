/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import initWasm from "harfbuzzjs/dist/harfbuzz-subset.wasm?init";
import { buildFont } from "./build";
import { catalogFiles, shaper } from "./fixtures";
import { loadInstancer } from "./harfbuzz";
import { readTables, writeFont } from "./sfnt";
import { dotOf, fixTurkish } from "./turkish";

const LINES = [
  "Sphinx of black quartz, judge my vow. The five boxing wizards jump quickly; fluffy affix office!",
  "Pijamalı hasta yağız şoföre çabucak güvendi. İstanbul’da ılık bir öğle, ÇĞİÖŞÜ çğıöşü",
  "fi ffi fl ff ffl fj fı ffı Tıfıl, fikir, ifşa, saffi, Efişli, firkete, Fİ FFİ",
];
const fixed = (font: Uint8Array) => {
  const tables = new Map(readTables(font)), fix = fixTurkish(tables);
  if (fix.gsub) tables.set("GSUB", fix.gsub);
  return { fix, font: fix.gsub ? writeFont(font, tables) : font };
};
const name = (file: string) => file.slice(0, file.indexOf("."));

describe("Turkish ligatures", () => {
  it.each(catalogFiles)("%s: ligatures that lose i's dot are off in Turkish, and nothing else changes", async (file, font) => {
    const { fix, font: after } = fixed(font);
    const bad = new Set(fix.ligatures.filter((l) => l.dot !== "kept").map((l) => String(l.glyph)));
    const was = await shaper(font), is = await shaper(after);
    const glyphs = (s: string) => s.split(" ").map((g) => g.slice(0, g.indexOf("@")));
    for (const line of LINES) {
      expect(is(line, "en"), "en").toBe(was(line, "en"));
      for (const lang of ["tr", "az", "crh"]) {
        const before = was(line, lang), now = is(line, lang);
        if (glyphs(before).some((g) => bad.has(g))) expect(glyphs(now).filter((g) => bad.has(g)), `${lang} ${line}`).toEqual([]);
        else expect(now, `${lang} ${line}`).toBe(before);
      }
    }
    expect(fix.gsub !== null, name(file)).toBe(bad.size > 0);
    // Checked by eye on the drawn glyphs (22.11): only these lose the dot.
    expect(fix.gsub !== null, name(file)).toBe(["newsreader", "newsreader-italic", "playfair-italic"].includes(name(file)));
  });

  it("keeps the dot of Fraunces, which draws it apart from the f", () => {
    const fraunces = catalogFiles.find(([f]) => f.startsWith("fraunces."))![1];
    const { fix } = fixed(fraunces);
    expect(fix.ligatures.length).toBeGreaterThan(0);
    expect(fix.ligatures.every((l) => l.dot === "kept")).toBe(true);
    expect(fix.gsub).toBeNull();
  });

  it("tells a dot of its own from one drawn into the f's hook, or none", () => {
    // Glyphs of rectangles: 0 x, 1 i, then ligatures of an f stem and an i whose dot is 2 apart, 3 over the hook, 4 missing.
    type Rect = [number, number, number, number];
    const glyph = (rects: Rect[]) => {
      const out: number[] = [], u16 = (n: number) => out.push((n >> 8) & 0xff, n & 0xff);
      u16(rects.length); for (let k = 0; k < 4; k++) u16(0);
      rects.forEach((_, k) => u16(k * 4 + 3));
      u16(0);
      for (let k = 0; k < rects.length * 4; k++) out.push(1);
      const pts = rects.flatMap(([x0, y0, x1, y1]) => [[x0, y0], [x0, y1], [x1, y1], [x1, y0]]);
      for (const axis of [0, 1]) pts.forEach((p, k) => u16(p[axis]! - (k ? pts[k - 1]![axis]! : 0)));
      return out;
    };
    const stem: Rect = [0, 0, 100, 800], iStem: Rect = [200, 0, 300, 500];
    const glyphs = [glyph([[0, 0, 100, 500]]), glyph([[0, 0, 100, 500], [0, 600, 100, 700]]),
      glyph([stem, iStem, [200, 600, 300, 700]]), glyph([stem, [100, 640, 260, 800], iStem, [200, 620, 300, 720]]), glyph([stem, [100, 640, 300, 800], iStem])];
    const glyf = Uint8Array.from(glyphs.flat()), loca = new Uint8Array((glyphs.length + 1) * 4), head = new Uint8Array(54);
    let at = 0;
    glyphs.forEach((g, k) => { new DataView(loca.buffer).setUint32(k * 4, at); at += g.length; });
    new DataView(loca.buffer).setUint32(glyphs.length * 4, at);
    new DataView(head.buffer).setInt16(50, 1);
    const tables = new Map([["head", head], ["loca", loca], ["glyf", glyf]]);
    expect([2, 3, 4].map((g) => dotOf(tables, { glyph: g, parts: [5, 1] }, 1, 0))).toEqual(["kept", "lost", "lost"]);
  });

  it("comes with every made font: static and variable, at the ends of the axes", async () => {
    const hb = await loadInstancer(await initWasm({}));
    const file = (start: string) => catalogFiles.find(([f]) => f.startsWith(start))![1];
    const cases: [string, Record<string, number | [number, number]>, boolean][] = [
      ["newsreader.", { wght: 800, opsz: 72 }, true], ["newsreader.", { wght: 200, opsz: 6 }, true], ["newsreader.", { wght: [200, 800] }, true],
      ["playfair-italic.", { wght: 900, opsz: 1200, wdth: 87.5 }, true], ["playfair-italic.", { wght: [300, 900] }, true],
      ["fraunces.", { wght: 900, opsz: 144 }, false], ["fraunces.", { wght: 100, opsz: 9 }, false],
    ];
    for (const [start, settings, fixes] of cases) {
      const made = buildFont(hb, { original: file(start), stretched: null, axes: [{ tag: "wght", min: 100, default: 400, max: 900 }] }, settings, { family: "Test Fontbend", style: "Regular" });
      expect(made.turkishFix, `${start} ${JSON.stringify(settings)}`).toBe(fixes);
      const shape = await shaper(made.bytes);
      if (fixes) expect(shape("fi", "tr").split(" ")).toHaveLength(2);
      expect(shape("fi", "en").split(" ")).toHaveLength(1);
    }
  });

  it("splits fi and ffi in Newsreader for Turkish only", async () => {
    const newsreader = catalogFiles.find(([f]) => f.startsWith("newsreader."))![1];
    const was = await shaper(newsreader), is = await shaper(fixed(newsreader).font);
    const count = (s: string) => s.split(" ").length;
    expect([count(was("fi", "tr")), count(was("ffi", "tr"))]).toEqual([1, 1]);
    expect([count(is("fi", "tr")), count(is("ffi", "tr"))]).toEqual([2, 2]); // f + i, and the ff ligature + i
    expect(is("fi ffi", "en")).toBe(was("fi ffi", "en"));
  });
});
