import { describe, expect, it } from "vitest";
import { catalogFiles, shaper } from "./fixtures";
import { readGsub, writeGsub } from "./gsub";
import { readTables, writeFont } from "./sfnt";

// Text that reaches most lookups: both cases, digits, punctuation, Turkish and other accented letters.
const LINES = [
  "Sphinx of black quartz, judge my vow. The five boxing wizards jump quickly; fluffy affix office!",
  "Pijamalı hasta yağız şoföre çabucak güvendi. İstanbul’da ılık bir öğle, ÇĞİÖŞÜ çğıöşü",
  `0123456789 ½ ¼ 10:30 #1 (a) [b] {c} “q” ‘s’ ${String.fromCharCode(0x2014)} – … @ & % ‰ € $ £ ¥ fi fl ff ffi ffl ft st Th`,
  "Åçðßłøžő ÆŒæœ Ñ ñ Ã õ Ā ā Ė ė Ę ę Ő ű Ž ź ż Ț ț Ș ș",
];

describe("GSUB written again unchanged", () => {
  it.each(catalogFiles)("%s shapes exactly as before, with every feature on its own", async (_, font) => {
    const tables = new Map(readTables(font));
    const gsub = tables.get("GSUB")!;
    const again = readGsub(writeGsub(readGsub(gsub)));
    tables.set("GSUB", writeGsub(readGsub(gsub)));
    const before = await shaper(font), after = await shaper(writeFont(font, tables));
    const features = [...new Set(readGsub(gsub).features.map((f) => f.tag))];
    expect(again.lookups.length).toBe(readGsub(gsub).lookups.length);
    for (const lang of ["en", "tr"]) for (const line of LINES) for (const f of [null, ...features]) {
      const on = f ? [f] : [];
      expect(after(line, lang, on), `${lang} ${f ?? "default"}`).toBe(before(line, lang, on));
    }
  });
});
