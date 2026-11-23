import { describe, expect, it } from "vitest";
import { parseCatalog } from "./catalog";
import { wearSettings } from "./wear";
import data from "../catalog.json";

const fraunces = parseCatalog(data).fonts.find((f) => f.id === "fraunces")!;

describe("the interface's settings", () => {
  it("follow the font's defaults, without weight", () => {
    expect(wearSettings(fraunces.axes, {})).toBe('"opsz" 9, "SOFT" 0, "WONK" 1, "wdth" 100, "slnt" 0');
  });

  it("keep Width within 75-125%, Slant within 5°, other axes within the font's own range", () => {
    const s = wearSettings(fraunces.axes, { wght: 1300, wdth: 62.5, slnt: -18, SOFT: 150, opsz: 72 });
    expect(s).toBe('"opsz" 72, "SOFT" 100, "WONK" 1, "wdth" 75, "slnt" -5');
    expect(wearSettings(fraunces.axes, { wdth: 137.5, slnt: 6 })).toContain('"wdth" 125, "slnt" 5');
  });

  it("take a range's low end, as the sliders show it", () => {
    expect(wearSettings(fraunces.axes, { SOFT: [20, 80] })).toContain('"SOFT" 20');
  });

  it("are normal when only weight is left", () => {
    expect(wearSettings([{ tag: "wght", min: 100, default: 400, max: 900 }], { wght: 700 })).toBe("normal");
  });
});
