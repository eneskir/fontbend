import { describe, expect, it } from "vitest";
import { parseCatalog } from "./catalog";
import { SIMPLE_SLIDERS, axisLabel, formatDelta, formatValue, slidersFor, stepFor } from "./sliders";
import data from "../catalog.json";

const fonts = parseCatalog(data).fonts;
const font = (id: string) => fonts.find((f) => f.id === id)!;

describe("simple sliders", () => {
  it("come in the table's order, only for axes the font has", () => {
    expect(slidersFor(font("roboto-flex")).map((s) => s.tag)).toEqual(["wght", "wdth", "slnt", "opsz", "GRAD"]);
    expect(slidersFor(font("inter")).map((s) => s.tag)).toEqual(["wght", "opsz"]);
  });

  it("show Fraunces its weight, optical size, softness and wonky axes", () => {
    expect(slidersFor(font("fraunces")).map((s) => s.label)).toEqual(["Weight", "Optical size", "Softness", "Wonky"]);
  });

  it("leave Roboto Flex's parametric axes to the font axes list", () => {
    const tags = slidersFor(font("roboto-flex")).map((s) => s.tag);
    expect(tags).toEqual(["wght", "wdth", "slnt", "opsz", "GRAD"]);
    expect(axisLabel("XOPQ")).toBe("XOPQ");
  });

  it("carry the font's own range", () => {
    const weight = slidersFor(font("fraunces"))[0]!;
    expect(weight.axis).toEqual(font("fraunces").axes.find((a) => a.tag === "wght"));
  });

  it("step finely on short ranges and in whole numbers on long ones", () => {
    expect(stepFor({ tag: "MONO", min: 0, default: 0, max: 1 })).toBe(0.01);
    expect(stepFor({ tag: "slnt", min: -15, default: 0, max: 0 })).toBe(0.1);
    expect(stepFor({ tag: "wght", min: 100, default: 400, max: 900 })).toBe(1);
  });

  it("have unique keys and tags", () => {
    expect(new Set(SIMPLE_SLIDERS.map((s) => s.key)).size).toBe(SIMPLE_SLIDERS.length);
    expect(new Set(SIMPLE_SLIDERS.map((s) => s.tag)).size).toBe(SIMPLE_SLIDERS.length);
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
