import { describe, expect, it } from "vitest";
import type { CatalogFont } from "./catalog";
import { defaultFamily, downloadFiles, fileStem, madeNames } from "./download";
import { styleName } from "./styleName";
import { crc32, makeZip } from "./zip";

const roboto = [
  { tag: "wght", min: 100, default: 400, max: 1000 },
  { tag: "wdth", min: 25, default: 100, max: 151 },
  { tag: "slnt", min: -10, default: 0, max: 0 },
];
const font = { family: "Roboto Flex" } as CatalogFont;

describe("styleName", () => {
  it("names width, weight and slope in that order", () => {
    expect(styleName(roboto, { wdth: 75, wght: 700, slnt: -10 })).toBe("CondensedBoldOblique");
    expect(styleName(roboto, { wght: 640 })).toBe("SemiBold");
  });
  it("calls the default instance Regular and an upright italic axis Italic", () => {
    expect(styleName(roboto, {})).toBe("Regular");
    expect(styleName([{ tag: "ital", min: 0, default: 0, max: 1 }], { ital: 1 })).toBe("Italic");
  });
  it("names values past the font's range by the nearest step", () => {
    expect(styleName(roboto, { wght: 1400, wdth: 0 })).toBe("UltraCondensedBlack");
  });
  it("names nothing for an axis left as a range", () => {
    expect(styleName(roboto, { wght: [300, 700] })).toBe("Regular");
    expect(styleName(roboto, { wght: [300, 700], wdth: 125 })).toBe("Expanded");
  });
  it("reads the default of a font that does not start at 400", () => {
    expect(styleName([{ tag: "wght", min: 100, default: 900, max: 900 }], {})).toBe("Black");
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
    expect(fileStem(n)).toBe("MyRobotoFlex-CondensedBoldOblique");
    expect(downloadFiles(n, new Uint8Array(1), new Uint8Array(1)).map((f) => f.name)).toEqual(["MyRobotoFlex-CondensedBoldOblique.ttf", "OFL.txt"]);
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
