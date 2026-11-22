/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import initWasm from "harfbuzzjs/dist/harfbuzz-subset.wasm?init";
import { buildFont } from "./build";
import { checkCharacters } from "./charcheck";
import { codePoints } from "./cmap";
import { fraunces, inter, recursive } from "./fixtures";
import { loadInstancer } from "./harfbuzz";
import { readNotdef } from "./notdef";
import { readTables } from "./sfnt";
import type { Subset } from "./subsets";

const hb = await loadInstancer(await initWasm({}));
const axes = [{ tag: "wght", min: 100, default: 900, max: 900 }];
const made = (subset: Subset) => buildFont(hb, { original: fraunces, stretched: null, axes }, { wght: 500 }, { family: "Fraunces Fontbend", style: "Regular" }, subset).bytes;
const counts = (font: Uint8Array) => checkCharacters(codePoints(readTables(font).get("cmap")!)).map((g) => `${g.name} ${g.have}/${g.total}`);

describe("character check", () => {
  // Expected counts from fontTools: Fraunces's cmap against each group, and against Windows-1252.
  it("finds every group complete in Fraunces with all glyphs", () => {
    expect(counts(made("all"))).toEqual(["Czech 30/30", "French 32/32", "German 8/8", "Nordic 14/14", "Polish 18/18", "Turkish 12/12"]);
  });

  it("counts what Western European keeps and names the missing Turkish letters", () => {
    expect(counts(made("western"))).toEqual(["Czech 16/30", "French 32/32", "German 7/8", "Nordic 14/14", "Polish 2/18", "Turkish 6/12"]);
    const turkish = checkCharacters(codePoints(readTables(made("western")).get("cmap")!)).find((g) => g.name === "Turkish")!;
    expect(turkish.missing).toEqual(["Ğ", "ğ", "İ", "ı", "Ş", "ş"]);
  });

  it("finds none of the letters in Basic Latin", () => {
    expect(counts(made("basic")).every((c) => c.includes(" 0/"))).toBe(true);
  });
});

describe(".notdef", () => {
  // Paths from fontTools SVGPathPen: Fraunces "M100 -490V1510H900V-490ZM200 -390H800V1410H200Z", Inter 10 contours.
  it("draws the font's own box", () => {
    const f = readNotdef(fraunces)!;
    expect(f.path).toBe("M100 -490L100 1510L900 1510L900 -490ZM200 -390L800 -390L800 1410L200 1410Z");
    expect([f.advance, f.unitsPerEm, f.ascender, f.descender]).toEqual([1000, 2000, 1956, -510]);
    expect(readNotdef(inter)!.path.match(/M/g)).toHaveLength(10);
  });

  it("follows TrueType curves, with the points TrueType implies between two off-curve points", () => {
    // fontTools glyf draw of Recursive's .notdef, written in the same commands.
    expect(readNotdef(recursive)!.path).toBe(
      "M0 -250L600 -250L600 820L0 820ZM525 699L525 -11L86 -11Q83 -11 80.5 -9.5Q78 -8 76.5 -5.5Q75 -3 75 0L75 710L514 710Q518 710 520 708.5Q522 707 523.5 705Q525 703 525 699Z" +
      "M169 169Q205 231 241 292.5Q277 354 313 416Q349 478 385 540Q421 602 457 663L447 663L125 663L125 84L138 84Q140 98 143.5 111Q147 124 153.5 138.5Q160 153 169 169Z" +
      "M436 525Q400 464 364.5 403Q329 342 293.5 281Q258 220 222.5 158.5Q187 97 151 36L161 36L475 36L475 622L463 622Q462 596 454.5 570Q447 544 436 525Z",
    );
  });
});
