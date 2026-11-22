/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import initWasm from "harfbuzzjs/dist/harfbuzz-subset.wasm?init";
import { buildFont } from "./build";
import { codePoints } from "./cmap";
import { checksumOk, fraunces, inter } from "./fixtures";
import { loadInstancer } from "./harfbuzz";
import { readTables, view } from "./sfnt";

const hb = await loadInstancer(await initWasm({}));
const axes = [
  { tag: "opsz", min: 9, default: 9, max: 144 },
  { tag: "wght", min: 100, default: 900, max: 900 },
  { tag: "SOFT", min: 0, default: 0, max: 100 },
  { tag: "WONK", min: 0, default: 1, max: 1 },
];
const names = { family: "Fraunces Fontbend", style: "Regular" as const };
const make = (subset: "all" | "western" | "basic") => buildFont(hb, { original: fraunces, stretched: null, axes }, { wght: 500 }, names, subset).bytes;
const chars = (font: Uint8Array) => codePoints(readTables(font).get("cmap")!);
const glyphCount = (font: Uint8Array) => view(readTables(font).get("maxp")!).getUint16(4);
const has = (font: Uint8Array, text: string) => [...text].map((ch) => chars(font).has(ch.codePointAt(0)!));

describe("character map", () => {
  it("lists the characters fontTools finds, from a format 4 and a format 12 table", () => {
    // Counted with fontTools getBestCmap().
    expect(chars(fraunces).size).toBe(624);
    expect(chars(inter).size).toBe(2849);
  });
});

describe("Characters", () => {
  const all = make("all"), western = make("western"), basic = make("basic");

  it("keeps every character of the font with all glyphs", () => {
    expect(chars(all)).toEqual(chars(fraunces));
  });

  it("keeps only printable ASCII in Basic Latin", () => {
    expect([...chars(basic)].every((c) => c >= 0x20 && c <= 0x7e)).toBe(true);
    expect(has(basic, "Aa0 !~")).toEqual([true, true, true, true, true, true]);
    expect(has(basic, "éç")).toEqual([false, false]);
  });

  it("keeps French and German letters, the euro and curly quotes in Western European, but not Turkish ğ or ı", () => {
    expect(has(western, "éçœŸßü€“”–")).toEqual(Array(10).fill(true));
    expect(has(western, "ğıŞ")).toEqual([false, false, false]);
  });

  it("makes smaller, valid files", () => {
    expect(glyphCount(basic)).toBeLessThan(glyphCount(western));
    expect(glyphCount(western)).toBeLessThan(glyphCount(all));
    expect(basic.length).toBeLessThan(western.length);
    for (const f of [all, western, basic]) expect(checksumOk(f)).toBe(true);
  });
});
