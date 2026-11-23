import { describe, expect, it } from "vitest";
import { useLang } from "../i18n";
import { fraunces, inter, recursive } from "./fixtures";
import { stretchFont } from "./stretch";
import { resultSentence, stemWidth } from "./summary";
import { variableGlyph } from "./variation";

const H = 0x48;
const stem = (font: Uint8Array, values: Record<string, number>) => stemWidth(variableGlyph(font, H)!(values))!;

describe("stem of H", () => {
  // Expected widths: fontTools instancer at the same location, scanned the same way (a quarter up the glyph).
  it("follows the font's variations as fontTools instances them", () => {
    expect(stem(fraunces, { opsz: 144, WONK: 1 })).toBeCloseTo(428, 0);
    expect(stem(fraunces, { wght: 100 })).toBeCloseTo(80, 0);
    expect(stem(fraunces, { wght: 500, opsz: 72, SOFT: 50 })).toBeCloseTo(258.47, 0);
    expect(stem(inter, { wght: 700, opsz: 32 })).toBeCloseTo(307.43, 0);
    expect(stem(recursive, { wght: 1000, CASL: 1, MONO: 1 })).toBeCloseTo(225, 0);
  });

  it("goes on past the range in the stretched font, on the line from the default through the end", () => {
    // fontTools: default + 1.1875 × (wght 100 − default), the line at wght -50, opsz 144.
    expect(Math.abs(stem(stretchFont(fraunces).bytes, { wght: -50, opsz: 144 }) - 11.38)).toBeLessThan(1.5);
  });
});

describe("result sentence", () => {
  it("says both numbers the way the design does", () => {
    expect(resultSentence(0.95, 1.7)).toBe("Overall 5% narrower, strokes 1.7× thicker than the original.");
  });

  it("leaves out a part too small to see", () => {
    expect(resultSentence(1.12, 1.02)).toBe("Overall 12% wider than the original.");
    expect(resultSentence(1.004, 0.6)).toBe("Strokes 40% thinner than the original.");
    expect(resultSentence(1, 1.02)).toBe("Same width and strokes as the original.");
    expect(resultSentence(0.82, 0.003)).toBe("Overall 18% narrower, strokes 99% thinner than the original.");
  });

  it("never calls strokes the same before they are measured", () => {
    expect(resultSentence(1, null)).toBe("Same width as the original.");
    expect(resultSentence(0.9, null)).toBe("Overall 10% narrower than the original.");
  });

  it("says it in Turkish as the Turkish design does: decimal comma, percent sign first", () => {
    useLang("tr");
    try {
      expect(resultSentence(0.95, 1.7)).toBe("Asıl fonttan toplamda %5 dar, çizgileri 1,7 kat kalın.");
      expect(resultSentence(1.004, 0.6)).toBe("Asıl fonttan çizgileri %40 ince.");
    } finally { useLang("en"); }
  });
});
