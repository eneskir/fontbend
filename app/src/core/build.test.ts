/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import initWasm from "harfbuzzjs/dist/harfbuzz-subset.wasm?init";
import { SYNTHETIC_AXES } from "./axis";
import { BuildError, buildFont, needsStretched } from "./build";
import { loadInstancer } from "./harfbuzz";
import { SIGNATURE, menuFamily, postScriptName, readNames } from "./names";
import { checksumOk, fraunces as original } from "./fixtures";
import { readTables, view } from "./sfnt";
import { stretchFont } from "./stretch";
import { slant, transformFont } from "./transform";

const stretched = stretchFont(original).bytes;
const axes = [
  { tag: "opsz", min: 9, default: 9, max: 144 },
  { tag: "wght", min: 100, default: 900, max: 900 },
  { tag: "SOFT", min: 0, default: 0, max: 100 },
  { tag: "WONK", min: 0, default: 1, max: 1 },
];
const hb = await loadInstancer(await initWasm({}));
const names = { family: "Fraunces Fontbend", style: "Regular" as const };

const winName = (font: Uint8Array, id: number) => readNames(readTables(font).get("name")!).find((r) => r.platform === 3 && r.id === id)?.text;

describe("buildFont", () => {
  const regular = buildFont(hb, { original, stretched: null, axes }, { wght: 500 }, names).bytes;

  it("makes a static font from values inside the range without the stretched font", () => {
    const t = readTables(regular);
    expect(t.has("fvar")).toBe(false);
    expect(t.has("gvar")).toBe(false);
    expect(view(t.get("OS/2")!).getUint16(4)).toBe(500); // usWeightClass
    expect(checksumOk(regular)).toBe(true);
  });

  it("names it as the user chose and signs it", () => {
    expect(winName(regular, 1)).toBe("Fraunces Fontbend");
    expect(winName(regular, 2)).toBe("Regular");
    expect(winName(regular, 4)).toBe("Fraunces Fontbend");
    expect(winName(regular, 6)).toBe("FrauncesFontbend-Regular");
    expect(winName(regular, 3)).toBe("FrauncesFontbend-Regular;Fontbend");
    expect(winName(regular, 10)).toBe(SIGNATURE);
    expect(winName(regular, 0)).toMatch(/Copyright[\s\S]*\nModified with Fontbend/);
    // The base font's typographic and WWS names would group the new font with the original family.
    expect(readNames(readTables(regular).get("name")!).filter((r) => [16, 17, 21, 22].includes(r.id))).toEqual([]);
    expect(winName(regular, 13)).toMatch(/SIL Open Font License/);
    // No Mac record keeps the old family name.
    expect(readNames(readTables(regular).get("name")!).filter((r) => r.id === 1).map((r) => r.text)).toEqual(["Fraunces Fontbend"]);
  });

  it("leaves a font of unknown license unsigned, its own description kept", () => {
    const unsigned = buildFont(hb, { original, stretched: null, axes }, { wght: 500 }, { ...names, signed: false }).bytes;
    expect(winName(unsigned, 10)).not.toBe(SIGNATURE);
    expect(winName(unsigned, 10)).toBe(winName(original, 10));
  });

  it("sets one style: regular, not bold, no signature table left", () => {
    const t = readTables(regular);
    expect(view(t.get("OS/2")!).getUint16(62) & 0x61).toBe(0x40);
    expect(view(t.get("head")!).getUint16(44) & 0x3).toBe(0);
    expect(t.has("DSIG")).toBe(false);
  });

  it("names and marks an italic as italic, in every place a system reads it", () => {
    const italic = buildFont(hb, { original, stretched: null, axes }, { wght: 500 }, { family: "Fraunces Fontbend", style: "Italic" }).bytes;
    expect(winName(italic, 1)).toBe("Fraunces Fontbend");
    expect(winName(italic, 2)).toBe("Italic");
    expect(winName(italic, 4)).toBe("Fraunces Fontbend Italic");
    expect(winName(italic, 6)).toBe("FrauncesFontbend-Italic");
    const t = readTables(italic);
    expect(view(t.get("OS/2")!).getUint16(62) & 0x261).toBe(0x01); // fsSelection: ITALIC, not BOLD, REGULAR or OBLIQUE
    expect(view(t.get("head")!).getUint16(44) & 0x3).toBe(0x2); // macStyle: italic, not bold
  });

  it("names a moved font by its settings, so Windows keeps each download apart", () => {
    const black = buildFont(hb, { original, stretched, axes }, { wght: 1100, opsz: 72 }, { family: "My Fraunces", style: "Regular", code: "wght1100 opsz72" }).bytes;
    expect(winName(black, 1)).toBe("My Fraunces wght1100 opsz72");
    expect(winName(black, 2)).toBe("Regular");
    expect(winName(black, 4)).toBe("My Fraunces wght1100 opsz72");
    expect(winName(black, 6)).toBe("MyFraunces-wght1100opsz72");
    // Apps that read typographic names group every download of the family and show the settings as the style.
    expect(winName(black, 16)).toBe("My Fraunces");
    expect(winName(black, 17)).toBe("wght1100 opsz72");
    const italic = buildFont(hb, { original, stretched: null, axes }, { wght: 500 }, { family: "My Fraunces", style: "Italic", code: "wght500" }).bytes;
    expect([1, 2, 4, 6, 16, 17].map((id) => winName(italic, id))).toEqual(["My Fraunces wght500", "Italic", "My Fraunces wght500 Italic", "MyFraunces-wght500", "My Fraunces", "wght500 Italic"]);
  });

  it("stops a damaged font file with a sentence the user can act on", () => {
    for (const bytes of [new Uint8Array(0), new Uint8Array(1000).fill(7), original.slice(0, original.length / 2)]) {
      let error: unknown;
      try { buildFont(hb, { original: bytes, stretched: null, axes }, { wght: 500 }, names); } catch (e) { error = e; }
      expect(error).toBeInstanceOf(BuildError);
      expect((error as BuildError).code).toBe("FONT_DAMAGED");
      expect((error as BuildError).message).toBe("The font file arrived damaged. Reload the page and try again.");
    }
  });

  it("needs the stretched font past the range, and makes the value with it", () => {
    expect(needsStretched(axes, { wght: 1300 })).toBe(true);
    expect(needsStretched(axes, { wght: [500, 900] })).toBe(false);
    expect(() => buildFont(hb, { original, stretched: null, axes }, { wght: 1300 }, names)).toThrow(BuildError);
    const heavy = buildFont(hb, { original, stretched, axes }, { wght: 1300 }, names).bytes;
    const black = buildFont(hb, { original, stretched, axes }, { wght: 900 }, names).bytes;
    expect(readTables(heavy).has("fvar")).toBe(false);
    expect(view(readTables(heavy).get("OS/2")!).getUint16(4)).toBe(1000); // usWeightClass stops at 1000
    expect(readTables(heavy).get("glyf")).not.toEqual(readTables(black).get("glyf"));
    expect(checksumOk(heavy)).toBe(true);
  });

  it("draws Width and Slant of added axes into the letters: the mapped instance, as transformFont makes it", () => {
    const withAdded = [...axes, ...SYNTHETIC_AXES];
    const pins = { wght: 500, wdth: 80, slnt: -10 };
    const made = buildFont(hb, { original, stretched: null, axes: withAdded }, pins, names).bytes;
    const t = { ...slant(original, 10), a: 0.8 };
    const want = hb.instance(transformFont(original, t), { wght: 500 });
    expect(readTables(made).has("fvar")).toBe(false);
    expect(readTables(made).get("glyf")).toEqual(readTables(want).get("glyf"));
    expect(readTables(made).get("hmtx")).toEqual(readTables(want).get("hmtx"));
    expect(needsStretched(withAdded, { wdth: 50 })).toBe(false);
    expect(() => buildFont(hb, { original, stretched: null, axes: withAdded }, { wdth: [80, 120] }, names)).toThrow(/only be set to one value/);
  });

  it("keeps an axis variable when a range is chosen", () => {
    const font = buildFont(hb, { original, stretched: null, axes }, { wght: [400, 700] }, names).bytes;
    const fvar = readTables(font).get("fvar")!;
    const v = view(fvar);
    const first = v.getUint16(4), size = v.getUint16(10);
    const ranges = Array.from({ length: v.getUint16(8) }, (_, i) => String.fromCharCode(...fvar.subarray(first + i * size, first + i * size + 4)) + " " + v.getInt32(first + i * size + 4) / 65536 + "-" + v.getInt32(first + i * size + 12) / 65536);
    expect(ranges).toEqual(["wght 400-700"]);
    expect(winName(font, 25)).toBe("FrauncesFontbend");
  });

  it("leaves Windows only the typed family to name the font by", () => {
    // DirectWrite and GDI add a STAT value's name to the family ("My Fraunces 72pt") unless it is elidable.
    const pinnedNames = (font: Uint8Array) => {
      const t = readTables(font), stat = t.get("STAT");
      if (!stat) return [];
      const fvar = t.get("fvar");
      const v = view(stat), axisSize = v.getUint16(4), axesAt = v.getUint32(8), valuesAt = v.getUint32(14);
      const tags = Array.from({ length: v.getUint16(6) }, (_, i) => String.fromCharCode(...stat.subarray(axesAt + i * axisSize, axesAt + i * axisSize + 4)));
      const variable = new Set(fvar ? Array.from({ length: view(fvar).getUint16(8) }, (_, i) => String.fromCharCode(...fvar.subarray(view(fvar).getUint16(4) + i * view(fvar).getUint16(10)).subarray(0, 4))) : []);
      return Array.from({ length: v.getUint16(12) }, (_, i) => valuesAt + v.getUint16(valuesAt + i * 2)).flatMap((at) => {
        const format = v.getUint16(at);
        const axes = format === 4 ? Array.from({ length: v.getUint16(at + 2) }, (_, k) => v.getUint16(at + 4 + k * 6)) : [v.getUint16(at + 2)];
        const flags = v.getUint16(format === 4 ? at + 4 + axes.length * 6 : at + 4);
        return (flags & 0x2) === 0 && axes.some((a) => !variable.has(tags[a]!)) ? [axes.map((a) => tags[a]).join("+")] : [];
      });
    };
    expect(pinnedNames(regular)).toEqual([]);
    expect(pinnedNames(buildFont(hb, { original, stretched, axes }, { wght: 1300, opsz: 72 }, names).bytes)).toEqual([]);
    expect(pinnedNames(buildFont(hb, { original, stretched: null, axes }, { wght: [400, 700], opsz: 72 }, names).bytes)).toEqual([]);
  });

  it("reports HarfBuzz refusing a value in the user's words", () => {
    expect(() => buildFont(hb, { original, stretched: null, axes }, { wght: [700, 400] as unknown as [number, number] }, names)).toThrow(/could not be made/);
  });
});

describe("postScriptName", () => {
  it("keeps only letters and digits of the family, at most 63 characters", () => {
    expect(postScriptName("Fraunces Fontbend 2", "Italic")).toBe("FrauncesFontbend2-Italic");
    expect(postScriptName("Çok güzel", "Regular")).toBe("okgzel-Regular");
    expect(postScriptName("#$%", "Regular")).toBe("Fontbend-Regular");
    expect(postScriptName("x".repeat(80), "Regular")).toHaveLength(63);
  });
  it("spells the settings out, and gives a code too long for 63 characters a digest of its own", () => {
    expect(postScriptName("My Fraunces", "Regular", "wght1100 opsz72")).toBe("MyFraunces-wght1100opsz72");
    const long = (w: number) => `wght${w} wdth75 opsz72 GRAD-200 XOPQ27 YOPQ25 XTRA323 YTUC528 YTLC416`;
    const [a, b] = [postScriptName("My Roboto Flex", "Regular", long(700)), postScriptName("My Roboto Flex", "Regular", long(701))];
    expect(a.length).toBeLessThanOrEqual(63);
    expect(a).toMatch(/^MyRobotoFlex-[0-9A-F]{4}$/);
    expect(a).not.toBe(b);
  });
});

describe("menuFamily", () => {
  it("shows the family and the settings, within the 31 characters Windows' menus read", () => {
    expect(menuFamily("My Fraunces", "")).toBe("My Fraunces");
    expect(menuFamily("My Fraunces", "wght1100 opsz72")).toBe("My Fraunces wght1100 opsz72");
    const [a, b] = [menuFamily("My Roboto Flex", "wght700 wdth75 opsz72"), menuFamily("My Roboto Flex", "wght700 wdth75 opsz73")];
    expect(a).toMatch(/^My Roboto Flex [0-9A-F]{4}$/);
    expect(a).not.toBe(b);
    expect(menuFamily("x".repeat(31), "wght700")).toHaveLength(31);
  });
});
