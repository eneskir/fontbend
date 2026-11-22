import { describe, expect, it } from "vitest";
import { parseCatalog } from "./catalog";
import data from "../catalog.json";

const first = data.fonts[0]!;
const withFont = (change: Record<string, unknown>) => ({ ...data, fonts: [{ ...first, ...change }] });

describe("catalog.json", () => {
  it("passes every rule", () => {
    expect(parseCatalog(data).fonts).toHaveLength(20);
  });

  it("marks only the fonts whose fi ligature has no Turkish rule", () => {
    const flagged = parseCatalog(data).fonts.filter((f) => f.fiLigatureNoTurkishRule).map((f) => f.id);
    expect(flagged.sort()).toEqual(["caveat", "fraunces", "newsreader"]);
  });

  it("refuses a font with a Reserved Font Name", () => {
    const rfn = withFont({ licenseCopyright: `${first.licenseCopyright}, with Reserved Font Name "Roboto".` });
    expect(() => parseCatalog(rfn)).toThrow(/Reserved Font Name/);
  });

  it("refuses missing Turkish letters, a license other than OFL, a bad axis and a reused id", () => {
    expect(() => parseCatalog(withFont({ missingTurkish: ["ı"] }))).toThrow(/Turkish/);
    expect(() => parseCatalog(withFont({ licenseDescription: "Apache License, Version 2.0" }))).toThrow(/OFL/);
    expect(() => parseCatalog(withFont({ axes: [{ tag: "wght", min: 700, default: 400, max: 900 }] }))).toThrow(/axis/);
    expect(() => parseCatalog({ ...data, fonts: [first, first] })).toThrow(/twice/);
  });
});
