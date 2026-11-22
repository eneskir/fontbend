import { describe, expect, it } from "vitest";
import { parseCatalog } from "./catalog";
import data from "../catalog.json";

const first = data.fonts[0]!;
const withFont = (change: Record<string, unknown>) => ({ ...data, fonts: [{ ...first, ...change }] });

describe("catalog.json", () => {
  it("passes every rule", () => {
    expect(parseCatalog(data).fonts).toHaveLength(20);
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

  it("keeps the measured break points, and refuses one inside the font's own range or past the slider's reach", () => {
    const fraunces = parseCatalog(data).fonts.find((f) => f.id === "fraunces")!.axes.find((a) => a.tag === "wght")!;
    expect([fraunces.breaksBelow, fraunces.breaksAbove]).toEqual([-66.18, 1247.08]);
    const wght = (extra: Record<string, unknown>) => withFont({ axes: [{ tag: "wght", min: 100, default: 400, max: 1000, ...extra }] });
    expect(() => parseCatalog(wght({ breaksBelow: 300 }))).toThrow(/axis/);
    expect(() => parseCatalog(wght({ breaksAbove: 1400 }))).toThrow(/axis/);
    expect(() => parseCatalog(wght({ breaksAbove: "1200" }))).toThrow(/axis/);
  });
});
