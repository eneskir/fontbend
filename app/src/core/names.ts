/**
 * Gives a built font its own name and Fontbend's signature. HarfBuzz keeps the variable font's
 * names (an instance of Fraunces would still call itself "Fraunces 9pt Black"), so the name
 * table is written here, together with the style bits Windows and macOS group families by.
 */
import { view } from "./sfnt";

export type Style = "Regular" | "Italic";
export type NameRecord = { platform: number; encoding: number; language: number; id: number; text: string };

export const SIGNATURE = "Made with Fontbend (fontbend.com)";
const COPYRIGHT_LINE = "Modified with Fontbend (fontbend.com).";

// Name IDs: 0 copyright, 1 family, 2 subfamily, 3 unique ID, 4 full name, 6 PostScript name,
// 10 description, 16/17 typographic family and subfamily, 21/22 WWS family and subfamily,
// 25 variations PostScript prefix.
const REWRITTEN = new Set([0, 1, 2, 3, 4, 6, 10, 16, 17, 21, 22, 25]);
const WINDOWS = { platform: 3, encoding: 1, language: 0x409 };

/** The name records of a name table that can be read as text (Windows Unicode and Mac Roman). */
export function readNames(name: Uint8Array): NameRecord[] {
  const v = view(name);
  const count = v.getUint16(2), storage = v.getUint16(4);
  const out: NameRecord[] = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12;
    const [platform, encoding, language, id, length, offset] = [0, 2, 4, 6, 8, 10].map((o) => v.getUint16(at + o)) as [number, number, number, number, number, number];
    const bytes = name.subarray(storage + offset, storage + offset + length);
    if (platform === 3 || platform === 0) {
      let text = "";
      for (let k = 0; k + 1 < bytes.length; k += 2) text += String.fromCharCode((bytes[k]! << 8) | bytes[k + 1]!);
      out.push({ platform, encoding, language, id, text });
    } else if (platform === 1 && encoding === 0) {
      out.push({ platform, encoding, language, id, text: String.fromCharCode(...bytes) });
    }
  }
  return out;
}

/** Windows' font menus and GDI read at most 31 characters of a family name. */
const MENU_MAX = 31;

/** Four hex digits standing for a settings code too long to spell out. */
const digest = (code: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < code.length; i++) h = Math.imul(h ^ code.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0").slice(-4).toUpperCase();
};

/**
 * A PostScript name, also the downloaded file's name: the family's ASCII letters and digits, a
 * hyphen, then the settings code without spaces (or the style when nothing moved); at most 63
 * characters, so a code that does not fit becomes its digest and the name stays its own.
 */
export function postScriptName(family: string, style: string, code = ""): string {
  const fam = family.replace(/[^A-Za-z0-9]/g, "") || "Fontbend";
  const tail = code.replace(/ /g, "") || style;
  const full = `${fam}-${tail}`;
  return full.length <= 63 ? full : `${fam.slice(0, 63 - 5)}-${digest(tail)}`;
}

/** The family as Windows' menus show it: the family and the code, or the code's digest when that is too long. */
export function menuFamily(family: string, code: string): string {
  if (!code) return family;
  const full = `${family} ${code}`;
  return full.length <= MENU_MAX ? full : `${family.slice(0, MENU_MAX - 5).trimEnd()} ${digest(code)}`;
}

/**
 * The name table of a built font: the family the user chose with the settings code, one style,
 * the original copyright with a line added, and the signature. Windows' menus list the family
 * with the code ("My Fraunces wght1100 opsz72"); apps that read typographic names (16, 17) group
 * every download of one family and show the code as the style. Records it does not name (license,
 * designer, the names STAT and fvar point to) stay as they were, on every platform.
 */
export function writeNames(name: Uint8Array, opts: { family: string; style: Style; code?: string; variable: boolean }): Uint8Array {
  const old = readNames(name);
  const winText = (id: number) => old.find((r) => r.platform === 3 && r.id === id)?.text;
  const kept = keptRecords(name);
  const code = opts.code ?? "";
  const ps = postScriptName(opts.family, opts.style, code);
  const full = code ? `${opts.family} ${code}` : opts.family;
  const fresh = new Map<number, string>([
    [0, [winText(0), COPYRIGHT_LINE].filter(Boolean).join("\n")],
    [1, menuFamily(opts.family, code)],
    [2, opts.style],
    [3, `${ps};Fontbend`],
    [4, opts.style === "Regular" ? full : `${full} ${opts.style}`],
    [6, ps],
    [10, SIGNATURE],
  ]);
  if (code) {
    fresh.set(16, opts.family);
    fresh.set(17, opts.style === "Regular" ? code : `${code} ${opts.style}`);
  }
  if (opts.variable) fresh.set(25, ps.replace(/-.*$/, ""));
  const records = [
    ...kept,
    ...[...fresh].map(([id, text]) => ({ ...WINDOWS, id, bytes: utf16(text) })),
  ].sort((a, b) => a.platform - b.platform || a.encoding - b.encoding || a.language - b.language || a.id - b.id);
  return pack(records);
}

type RawRecord = { platform: number; encoding: number; language: number; id: number; bytes: Uint8Array };

function keptRecords(name: Uint8Array): RawRecord[] {
  const v = view(name);
  const count = v.getUint16(2), storage = v.getUint16(4);
  const out: RawRecord[] = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12;
    const id = v.getUint16(at + 6);
    if (REWRITTEN.has(id)) continue;
    const length = v.getUint16(at + 8), offset = v.getUint16(at + 10);
    out.push({ platform: v.getUint16(at), encoding: v.getUint16(at + 2), language: v.getUint16(at + 4), id, bytes: name.slice(storage + offset, storage + offset + length) });
  }
  return out;
}

function utf16(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) { out[i * 2] = text.charCodeAt(i) >> 8; out[i * 2 + 1] = text.charCodeAt(i) & 0xff; }
  return out;
}

function pack(records: RawRecord[]): Uint8Array {
  const storage = 6 + records.length * 12;
  const size = storage + records.reduce((n, r) => n + r.bytes.length, 0);
  if (size - storage > 0xffff) throw new Error("name table too large");
  const out = new Uint8Array(size);
  const w = view(out);
  w.setUint16(0, 0); w.setUint16(2, records.length); w.setUint16(4, storage);
  let offset = 0;
  records.forEach((r, i) => {
    const at = 6 + i * 12;
    [r.platform, r.encoding, r.language, r.id, r.bytes.length, offset].forEach((x, k) => w.setUint16(at + k * 2, x));
    out.set(r.bytes, storage + offset);
    offset += r.bytes.length;
  });
  return out;
}

/**
 * STAT for a made font, or null when it needs none. Windows adds the name of every STAT value
 * that is not elidable to the family ("My Fraunces 72pt"), so the values of axes the font no
 * longer varies go; a static font keeps no STAT at all.
 */
export function pruneStat(stat: Uint8Array, fvar: Uint8Array | undefined): Uint8Array | null {
  if (!fvar) return null;
  const f = view(fvar);
  const variable = new Set(Array.from({ length: f.getUint16(8) }, (_, i) => tag(fvar, f.getUint16(4) + i * f.getUint16(10))));
  const out = stat.slice();
  const v = view(out), axisSize = v.getUint16(4), axesAt = v.getUint32(8), count = v.getUint16(12), valuesAt = v.getUint32(14);
  const axisTag = (i: number) => tag(out, axesAt + i * axisSize);
  const kept = Array.from({ length: count }, (_, i) => v.getUint16(valuesAt + i * 2)).filter((offset) => {
    const at = valuesAt + offset;
    const axes = v.getUint16(at) === 4 ? Array.from({ length: v.getUint16(at + 2) }, (_, k) => v.getUint16(at + 4 + k * 6)) : [v.getUint16(at + 2)];
    return axes.every((a) => variable.has(axisTag(a)));
  });
  // The offsets list shrinks in place; the values it no longer points to stay as unused bytes.
  kept.forEach((offset, i) => v.setUint16(valuesAt + i * 2, offset));
  v.setUint16(12, kept.length);
  return out;
}

const tag = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));

/** OS/2 fsSelection and head macStyle for one style: italic or regular, never bold. */
export function writeStyleBits(os2: Uint8Array, head: Uint8Array, style: Style): { os2: Uint8Array; head: Uint8Array } {
  const ITALIC = 0x01, BOLD = 0x20, REGULAR = 0x40, OBLIQUE = 0x200;
  const o = os2.slice(), h = head.slice();
  const fs = view(o).getUint16(62) & ~(ITALIC | BOLD | REGULAR | OBLIQUE);
  view(o).setUint16(62, fs | (style === "Italic" ? ITALIC : REGULAR));
  const mac = view(h).getUint16(44) & ~0x3;
  view(h).setUint16(44, mac | (style === "Italic" ? 0x2 : 0));
  return { os2: o, head: h };
}
