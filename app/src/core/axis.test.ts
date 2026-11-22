import { describe, expect, it } from "vitest";
import { breakPast, clampToReach, isBeyond, reach, type Axis } from "./axis";

// Roboto Flex's weight and slant axes; slant's range ends at its default.
const weight: Axis = { tag: "wght", min: 100, default: 400, max: 1000 };
const slant: Axis = { tag: "slnt", min: -10, default: 0, max: 0 };

describe("reach", () => {
  it("grows each side by half its own span", () => {
    expect(reach(weight)).toEqual({ min: -50, max: 1300 });
  });

  it("lets a side with no range borrow the other side's span", () => {
    expect(reach(slant)).toEqual({ min: -15, max: 5 });
  });
});

describe("clampToReach", () => {
  it("keeps values inside the reach, past the font's own range too", () => {
    expect(clampToReach(weight, 640)).toBe(640);
    expect(clampToReach(weight, 1200)).toBe(1200);
    expect(clampToReach(slant, 4)).toBe(4);
  });

  it("pulls values outside the reach to the nearest end", () => {
    expect(clampToReach(weight, -400)).toBe(-50);
    expect(clampToReach(weight, 5000)).toBe(1300);
  });
});

describe("isBeyond", () => {
  it("tells values past the font's own range", () => {
    expect([isBeyond(weight, 1000), isBeyond(weight, 1001), isBeyond(slant, 0.5), isBeyond(slant, -10)]).toEqual([false, true, true, false]);
  });
});

describe("breakPast", () => {
  // Fraunces's weight as the catalog measures it: the default is the heaviest, letters break below -66.18 and above 1247.08.
  const fraunces: Axis = { tag: "wght", min: 100, default: 900, max: 900, breaksBelow: -66.18, breaksAbove: 1247.08 };
  it("names the break point a value has passed", () => {
    expect([breakPast(fraunces, 0), breakPast(fraunces, -66.18), breakPast(fraunces, -67), breakPast(fraunces, 1247), breakPast(fraunces, 1248)]).toEqual([null, null, -66.18, null, 1247.08]);
  });
  it("finds none on an axis with no break point", () => {
    expect([breakPast(weight, -50), breakPast(weight, 1300)]).toEqual([null, null]);
  });
});
