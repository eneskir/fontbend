import { describe, expect, it } from "vitest";
import { LANGS } from "../i18n";
import { LANG_SAMPLE, missingLetters, SAMPLES } from "./samples";

describe("the opening sample", () => {
  it("is written in each interface language", () => {
    for (const { code } of LANGS) expect(SAMPLES[LANG_SAMPLE[code]].lang).toBe(code);
  });
});

describe("letters a font lacks for a sample", () => {
  // Printable ASCII and Latin-1: what a Latin font without Cyrillic holds, near enough.
  const latin = new Set(Array.from({ length: 0x24f - 0x20 }, (_, i) => i + 0x20).concat([0x2019, 0x201c, 0x201d, 0x2018, 0xab, 0xbb]));

  it("finds none in the English sample and only the Cyrillic ones in the Russian", () => {
    expect(missingLetters("pangram", latin)).toEqual([]);
    const ru = missingLetters("russian", latin);
    expect(ru).toContain("ж");
    expect(ru.every((c) => /[Ѐ-ӿ]/.test(c))).toBe(true);
  });

  it("counts no space as a letter", () => {
    const noSpace = new Set([...latin].filter((c) => c !== 0x20));
    expect(missingLetters("pangram", noSpace)).toEqual([]);
  });
});
