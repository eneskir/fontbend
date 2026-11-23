import { describe, expect, it } from "vitest";
import { balanceSettings, balancedWeight } from "./balance";
import { parseCatalog } from "./catalog";
import { fraunces as bytes } from "./fixtures";
import { stretchFont } from "./stretch";
import { stemWidth } from "./summary";
import { variableGlyph } from "./variation";
import data from "../catalog.json";

const fonts = parseCatalog(data).fonts;
const fraunces = fonts.find((f) => f.id === "fraunces")!;
const H = variableGlyph(stretchFont(bytes).bytes, 0x48)!;
const stem = (v: Readonly<Record<string, number>>) => stemWidth(H(v));
const defaults = Object.fromEntries(fraunces.axes.map((a) => [a.tag, a.default]));

describe("width balance", () => {
  it("draws a narrower Fraunces heavier and a wider one lighter, so H's stem keeps its thickness", () => {
    for (const [wdth, wght] of [[80, 400], [90, 600], [120, 400], [125, 700]] as const) {
      const values = { ...defaults, wght, wdth };
      const w = balancedWeight(fraunces.axes, values, stem)!;
      expect(w > wght, `${wdth}% ${wght}`).toBe(wdth < 100);
      // The stem as drawn (scaled by the width) against the stem at the original width.
      expect((stem({ ...values, wdth: 100, wght: w })! * wdth) / 100).toBeCloseTo(stem({ ...values, wdth: 100 })!, 0);
    }
  });

  it("stops at the weight's break point or reach", () => {
    const w = balancedWeight(fraunces.axes, { ...defaults, wght: 900, wdth: 63 }, stem)!;
    const axis = fraunces.axes.find((a) => a.tag === "wght")!;
    expect(w).toBe(axis.breaksAbove ?? 1300);
  });

  it("gives a download the weight the preview draws, and leaves a weight range alone", () => {
    const stretched = () => stretchFont(bytes).bytes;
    const made = balanceSettings(fraunces.axes, { wdth: 80, wght: 400 }, stretched);
    expect(made.wght).toBe(balancedWeight(fraunces.axes, { ...defaults, wdth: 80, wght: 400 }, stem));
    expect(balanceSettings(fraunces.axes, { wdth: 80, wght: [300, 500] }, stretched)).toEqual({ wdth: 80, wght: [300, 500] });
    let read = 0;
    expect(balanceSettings(fraunces.axes, { wght: 500 }, () => { read++; return stretched(); })).toEqual({ wght: 500 });
    expect(read).toBe(0);
  });

  it("leaves the font's own width alone, and 100%", () => {
    const flex = fonts.find((f) => f.id === "roboto-flex")!;
    expect(balancedWeight(flex.axes, { wght: 400, wdth: 80 }, stem)).toBeNull();
    expect(balancedWeight(fraunces.axes, { ...defaults, wdth: 100 }, stem)).toBeNull();
    expect(balancedWeight(fraunces.axes, { ...defaults, wdth: 80 }, () => null)).toBeNull();
  });
});
