import { describe, expect, it } from "vitest";
import { reach } from "./axis";
import { parseCatalog } from "./catalog";
import { BIG_SLIDERS, axisLabel, bigSliders, flipped, fontAxes, formatDelta, formatValue, stepFor } from "./sliders";
import data from "../catalog.json";

const fonts = parseCatalog(data).fonts;
const font = (id: string) => fonts.find((f) => f.id === id)!;

describe("big sliders", () => {
  it("are Weight, Width and Slant on every catalog font", () => {
    for (const f of fonts) expect(bigSliders(f).map((s) => axisLabel(s.tag)), f.id).toEqual(["Weight", "Width", "Slant"]);
  });

  it("use the font's own Width and Slant where it has them, and added ones elsewhere", () => {
    const own = (id: string) => bigSliders(font(id)).filter((s) => !s.axis.synthetic).map((s) => s.tag);
    expect(own("roboto-flex")).toEqual(["wght", "wdth", "slnt"]);
    expect(own("recursive")).toEqual(["wght", "slnt"]);
    expect(own("inter")).toEqual(["wght"]);
    expect(fonts.filter((f) => f.axes.some((a) => a.tag === "wdth" && !a.synthetic)).length).toBe(6);
  });

  it("carry the font's own range", () => {
    expect(bigSliders(font("fraunces"))[0]!.axis).toEqual(font("fraunces").axes.find((a) => a.tag === "wght"));
  });

  it("have unique keys and tags", () => {
    expect(new Set(BIG_SLIDERS.map((s) => s.key)).size).toBe(BIG_SLIDERS.length);
    expect(new Set(BIG_SLIDERS.map((s) => s.tag)).size).toBe(BIG_SLIDERS.length);
  });

  it("show Slant as lean to the right: slnt turned around, reach and break points too", () => {
    const axis = { tag: "slnt", min: -15, default: 0, max: 0, breaksBelow: -20 };
    const f = flipped(axis);
    expect(f).toEqual({ tag: "slnt", min: 0, default: 0, max: 15, breaksAbove: 20 });
    expect(reach(f)).toEqual({ min: -reach(axis).max, max: -reach(axis).min });
  });
});

describe("font axes", () => {
  it("list the font's own axes the big sliders don't show", () => {
    expect(fontAxes(font("fraunces")).map((a) => a.tag)).toEqual(["opsz", "SOFT", "WONK"]);
    expect(fontAxes(font("caveat"))).toEqual([]);
  });

  it("name the axes people know and leave Roboto Flex's parametric ones to their tags", () => {
    expect(fontAxes(font("fraunces")).map((a) => axisLabel(a.tag))).toEqual(["Optical size", "Softness", "Wonky"]);
    expect(axisLabel("XOPQ")).toBe("XOPQ");
  });
});

describe("slider numbers", () => {
  it("step finely on short ranges and in whole numbers on long ones", () => {
    expect(stepFor({ tag: "MONO", min: 0, default: 0, max: 1 })).toBe(0.01);
    expect(stepFor({ tag: "slnt", min: -15, default: 0, max: 0 })).toBe(0.1);
    expect(stepFor({ tag: "wght", min: 100, default: 400, max: 900 })).toBe(1);
  });

  it("print values and differences without float noise", () => {
    expect(formatValue(700, 1)).toBe("700");
    expect(formatValue(0.30000000000000004, 0.01)).toBe("0.3");
    expect(formatValue(-7.5, 0.1)).toBe("-7.5");
    expect(formatDelta(700, 400, 1)).toBe("+300");
    expect(formatDelta(75, 100, 1)).toBe("-25");
    expect(formatDelta(0.7, 0.4, 0.01)).toBe("+0.3");
  });
});
