/** Reading and writing the table directory of a TrueType (sfnt) font file. */

export const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
export const tagAt = (b: Uint8Array, at: number) => String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!);

/** Every table of the font by tag, as views into the file. */
export function readTables(font: Uint8Array): Map<string, Uint8Array> {
  const v = view(font);
  const count = v.getUint16(4);
  const tables = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    const offset = v.getUint32(at + 8), length = v.getUint32(at + 12);
    if (offset + length > font.length) throw new Error(`table ${tagAt(font, at)} runs past the end of the file`);
    tables.set(tagAt(font, at), font.subarray(offset, offset + length));
  }
  return tables;
}

function checksum(data: Uint8Array): number {
  let sum = 0;
  const v = view(data);
  const whole = data.length & ~3;
  for (let i = 0; i < whole; i += 4) sum = (sum + v.getUint32(i)) >>> 0;
  if (whole < data.length) {
    let last = 0;
    for (let i = whole; i < whole + 4; i++) last = (last << 8) | (data[i] ?? 0);
    sum = (sum + (last >>> 0)) >>> 0;
  }
  return sum;
}

/** Lays the tables out again (sorted, 4-byte aligned) with fresh checksums and head.checkSumAdjustment. */
export function writeFont(original: Uint8Array, tables: Map<string, Uint8Array>): Uint8Array {
  const tags = [...tables.keys()].sort();
  const n = tags.length;
  let size = 12 + n * 16;
  const placed = tags.map((tag) => { const at = size; size += (tables.get(tag)!.length + 3) & ~3; return at; });
  const out = new Uint8Array(size);
  const w = view(out);
  w.setUint32(0, view(original).getUint32(0));
  const pow = 2 ** Math.floor(Math.log2(n));
  w.setUint16(4, n); w.setUint16(6, pow * 16); w.setUint16(8, Math.log2(pow)); w.setUint16(10, n * 16 - pow * 16);
  tags.forEach((tag, i) => {
    let data = tables.get(tag)!;
    if (tag === "head") { data = data.slice(); view(data).setUint32(8, 0); }
    out.set(data, placed[i]);
    const r = 12 + i * 16;
    for (let c = 0; c < 4; c++) out[r + c] = tag.charCodeAt(c);
    w.setUint32(r + 4, checksum(data)); w.setUint32(r + 8, placed[i]!); w.setUint32(r + 12, data.length);
  });
  const head = tags.indexOf("head");
  if (head >= 0) w.setUint32(placed[head]! + 8, (0xb1b0afba - checksum(out)) >>> 0);
  return out;
}
