import { describe, expect, it } from "vitest";
import type { CatalogFont } from "./catalog";
import { defaultFamily, downloadFiles, fileStem, madeNames } from "./download";
import { isSloped, settingsCode } from "./settingsCode";
import { crc32, makeZip } from "./zip";

const roboto = [
  { tag: "wght", min: 100, default: 400, max: 1000 },
  { tag: "wdth", min: 25, default: 100, max: 151 },
  { tag: "slnt", min: -10, default: 0, max: 0 },
];
const font = { family: "Roboto Flex" } as CatalogFont;

describe("settingsCode", () => {
  it("writes every moved axis by tag and value, common axes first", () => {
    expect(settingsCode(roboto, { wdth: 75, wght: 700, slnt: -10 })).toBe("wght700 wdth75 slnt-10");
    expect(settingsCode([{ tag: "opsz", min: 9, default: 9, max: 144 }, ...roboto], { opsz: 72, wght: 1100 })).toBe("wght1100 opsz72");
  });
  it("leaves out axes at their default, so an unmoved font has no code", () => {
    expect(settingsCode(roboto, {})).toBe("");
    expect(settingsCode(roboto, { wght: 400, wdth: 75 })).toBe("wdth75");
    expect(settingsCode([{ tag: "wght", min: 100, default: 900, max: 900 }], { wght: 900 })).toBe("");
  });
  it("keeps two decimals and writes a range from end to end", () => {
    expect(settingsCode([{ tag: "CASL", min: 0, default: 0, max: 1 }], { CASL: 0.333333 })).toBe("CASL0.33");
    expect(settingsCode(roboto, { wght: [300, 700] })).toBe("wght300-700");
  });
  it("gives two settings two codes, also when they differ by a fraction", () => {
    expect(settingsCode(roboto, { wght: 700.5 })).not.toBe(settingsCode(roboto, { wght: 700 }));
  });
});

describe("isSloped", () => {
  it("leans with any slant or an italic axis past its middle", () => {
    expect(isSloped(roboto, { slnt: -10 })).toBe(true);
    expect(isSloped(roboto, {})).toBe(false);
    expect(isSloped([{ tag: "ital", min: 0, default: 0, max: 1 }], { ital: 1 })).toBe(true);
  });
});

describe("madeNames", () => {
  it("suggests My <family> when the name is empty and tidies spaces", () => {
    expect(madeNames(font, "  ", roboto, {}).family).toBe(defaultFamily(font));
    expect(madeNames(font, "  Big   Sign ", roboto, {}).family).toBe("Big Sign");
    expect(madeNames(font, "x".repeat(40), roboto, {}).family).toHaveLength(31);
  });
  it("groups a leaning font as Italic and names its file in full", () => {
    const n = madeNames(font, "My Roboto Flex", roboto, { wdth: 75, wght: 700, slnt: -10 });
    expect(n.style).toBe("Italic");
    expect(fileStem(n)).toBe("MyRobotoFlex-wght700wdth75slnt-10");
    expect(fileStem(madeNames(font, "My Roboto Flex", roboto, {}))).toBe("MyRobotoFlex-Regular");
    const one = new Uint8Array(1);
    expect(downloadFiles(n, { ttf: one, woff2: one }, one).map((f) => f.name)).toEqual(["MyRobotoFlex-wght700wdth75slnt-10.ttf", "MyRobotoFlex-wght700wdth75slnt-10.woff2", "OFL.txt"]);
    expect(downloadFiles(n, { woff2: one }, one).map((f) => f.name)).toEqual(["MyRobotoFlex-wght700wdth75slnt-10.woff2", "OFL.txt"]);
  });
});

/** Reads back every entry of a ZIP through its central directory. */
async function unzip(zip: Uint8Array) {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50);
    const method = v.getUint16(at + 10, true), crc = v.getUint32(at + 16, true), packed = v.getUint32(at + 20, true), size = v.getUint32(at + 24, true);
    const nameLength = v.getUint16(at + 28, true), local = v.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = zip.subarray(start, start + packed);
    const bytes = method === 8 ? new Uint8Array(await new Response(new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()) : raw;
    out.push({ name, method, crc, size, bytes });
    at += 46 + nameLength;
  }
  return out;
}

describe("makeZip", () => {
  it("writes files that unzip back to the same bytes, deflated when that helps", async () => {
    const text = new TextEncoder().encode("Copyright line\n".repeat(200));
    const noise = Uint8Array.from({ length: 300 }, (_, i) => (i * 2654435761) >>> 24);
    const zip = await makeZip([{ name: "OFL.txt", bytes: text }, { name: "Çizgi.ttf", bytes: noise }], new Date(2026, 10, 22, 14, 30, 10));
    const [a, b] = await unzip(zip);
    expect(a!.name).toBe("OFL.txt");
    expect(a!.method).toBe(8);
    expect(a!.bytes).toEqual(text);
    expect(a!.crc).toBe(crc32(text));
    expect(b!.name).toBe("Çizgi.ttf");
    expect(b!.method).toBe(0);
    expect(b!.bytes).toEqual(noise);
  });
  it("matches the known CRC-32 check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});
