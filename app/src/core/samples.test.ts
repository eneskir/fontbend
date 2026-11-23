import { describe, expect, it } from "vitest";
import { LANGS } from "../i18n";
import { LANG_SAMPLE, SAMPLES } from "./samples";

describe("the opening sample", () => {
  it("is written in each interface language", () => {
    for (const { code } of LANGS) expect(SAMPLES[LANG_SAMPLE[code]].lang).toBe(code);
  });
});
