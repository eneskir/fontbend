import { describe, expect, it } from "vitest";
import { clampToAxis, type Axis } from "./axis";

// Roboto Flex's weight and slant axes; slant's range ends at its default.
const weight: Axis = { tag: "wght", min: 100, default: 400, max: 1000 };
const slant: Axis = { tag: "slnt", min: -10, default: 0, max: 0 };

describe("clampToAxis", () => {
  it("keeps a value inside the range", () => {
    expect(clampToAxis(weight, 640)).toBe(640);
  });

  it("pulls values outside the range to the nearest end", () => {
    expect(clampToAxis(weight, 20)).toBe(100);
    expect(clampToAxis(weight, 1200)).toBe(1000);
    expect(clampToAxis(slant, 4)).toBe(0);
  });
});
