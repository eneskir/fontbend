import { describe, expect, it } from "vitest";
import { compress, decompress } from "woff2-encoder";
import { inter } from "./fixtures";
import { licenseOf, oflText, OPEN_MAX, openedFont, readFontFile } from "./open";
import { readTables, view, writeFont } from "./sfnt";
import { variableGlyph } from "./variation";

const read = (bytes: Uint8Array) => readFontFile(bytes, decompress);

/** A WOFF 1.0 file of a font, its tables zlib-compressed, as font tools write them. */
async function woff(font: Uint8Array): Promise<Uint8Array> {
  const tables = [...readTables(font)];
  // As the format asks, a table that doesn't get smaller is stored as it is.
  const packed = await Promise.all(tables.map(async ([, data]) => {
    const z = new Uint8Array(await new Response(new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
    return z.length < data.length ? z : data;
  }));
  let at = 44 + tables.length * 20;
  const out = new Uint8Array(at + packed.reduce((n, p) => n + ((p.length + 3) & ~3), 0));
  const v = view(out);
  out.set([0x77, 0x4f, 0x46, 0x46]);
  v.setUint32(4, view(font).getUint32(0));
  v.setUint16(12, tables.length);
  tables.forEach(([tag, data], i) => {
    const d = 44 + i * 20;
    for (let k = 0; k < 4; k++) out[d + k] = tag.charCodeAt(k);
    v.setUint32(d + 4, at); v.setUint32(d + 8, packed[i]!.length); v.setUint32(d + 12, data.length);
    out.set(packed[i]!, at);
    at += (packed[i]!.length + 3) & ~3;
  });
  return out;
}

const without = (font: Uint8Array, ...tags: string[]) => {
  const tables = readTables(font);
  for (const t of tags) tables.delete(t);
  return writeFont(font, tables);
};

describe("opening a font file", () => {
  it("reads a variable TrueType font: names, glyphs, axes and its OFL license", async () => {
    const r = await read(inter);
    if (!r.ok) throw new Error(JSON.stringify(r.problem));
    expect(r.file.family).toBe("Inter");
    expect(r.file.license).toBe("ofl");
    expect(r.file.glyphs).toBe(view(readTables(inter).get("maxp")!).getUint16(4));
    expect(r.file.axes.map((a) => a.tag)).toEqual(["opsz", "wght"]);
    expect(r.file.bytes).toBe(inter);
  });

  it("unpacks WOFF and WOFF2 to the same tables", async () => {
    for (const packed of [await woff(inter), await compress(inter)]) {
      const r = await read(packed);
      if (!r.ok) throw new Error(JSON.stringify(r.problem));
      expect(r.file.family).toBe("Inter");
      const a = readTables(inter), b = readTables(r.file.bytes);
      expect([...b.keys()].sort()).toEqual([...a.keys()].sort());
      // WOFF2 stores glyf in its own form, so glyf and loca come back laid out anew, drawing the same letters.
      for (const [tag, data] of a) if (!["head", "glyf", "loca"].includes(tag)) expect(b.get(tag), tag).toEqual(data);
      for (const c of "HRxo") expect(variableGlyph(r.file.bytes, c.codePointAt(0)!)!({ wght: 700 }), `${String.fromCharCode(...packed.subarray(0, 4))} ${c}`).toEqual(variableGlyph(inter, c.codePointAt(0)!)!({ wght: 700 }));
    }
  }, 60_000); // Brotli takes seconds to pack the test's WOFF2

  it("names what it can't open", async () => {
    const problem = async (bytes: Uint8Array) => { const r = await read(bytes); return r.ok ? "opened" : r.problem.kind; };
    expect(await problem(new Uint8Array(OPEN_MAX + 1))).toBe("too-big");
    expect(await problem(inter.slice(0, inter.length / 2))).toBe("broken");
    expect(await problem(new TextEncoder().encode("this is not a font, only some text"))).toBe("broken");
    expect(await problem(without(inter, "fvar", "gvar"))).toBe("not-variable");
    const otto = without(inter, "glyf");
    otto.set([0x4f, 0x54, 0x54, 0x4f]);
    expect(await problem(otto)).toBe("outlines");
    const damagedWoff = await woff(inter);
    expect(await problem(damagedWoff.slice(0, 2000))).toBe("broken");
  });

  it("tells OFL, OFL with a Reserved Font Name and other licenses apart", () => {
    const ofl = "This Font Software is licensed under the SIL Open Font License, Version 1.1. https://openfontlicense.org";
    expect(licenseOf("Copyright 2020 The Inter Project Authors", ofl)).toBe("ofl");
    expect(licenseOf("Copyright 2010 Firstname Lastname, with Reserved Font Name \"Sample\"", ofl)).toBe("reserved");
    expect(licenseOf("Copyright 2010 Example Foundry", "Licensed under the Apache License, Version 2.0")).toBe("unknown");
    expect(licenseOf("", "")).toBe("unknown");
  });

  it("becomes a font beside the catalog's, and its OFL.txt carries its own copyright", async () => {
    const r = await read(inter);
    if (!r.ok) throw new Error();
    const font = openedFont(r.file, { sha256: "ab".repeat(32), fileName: "Inter.ttf", url: "blob:x", oflTemplate: "catalog/inter/OFL.txt" });
    expect(font.id).toBe(`local-${"ab".repeat(8)}`);
    expect(font.category).toBeNull();
    expect(font.axes.map((a) => a.tag)).toEqual(["opsz", "wght", "wdth", "slnt"]);
    expect(font.local).toEqual({ sha256: "ab".repeat(32), fileName: "Inter.ttf", license: "ofl" });
    const template = "Copyright 2014 Other Authors\n\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.\nPREAMBLE";
    expect(oflText("Copyright 2020 The Inter Project Authors", template)).toBe("Copyright 2020 The Inter Project Authors\n\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.\nPREAMBLE");
  });
});
