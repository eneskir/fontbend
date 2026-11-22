/** The character sets a made font can be cut down to. */

export const SUBSETS = ["all", "western", "basic"] as const;
export type Subset = (typeof SUBSETS)[number];

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const isControl = (c: number) => c < 0x20 || (c >= 0x7f && c < 0xa0);

/** Basic Latin: the printable ASCII characters. */
const BASIC = range(0x20, 0x7e);

/**
 * Western European: what the Windows-1252 code page draws. Latin-1 plus œ, Ÿ, š, ž, the euro,
 * curly quotes and dashes, which French, Finnish and Estonian text and ordinary typography need.
 */
const WESTERN = [...new TextDecoder("windows-1252").decode(Uint8Array.from(range(0x20, 0xff)))]
  .map((ch) => ch.codePointAt(0)!)
  .filter((c) => !isControl(c));

/** The code points to keep; null keeps every glyph of the font. */
export function subsetCodePoints(subset: Subset): readonly number[] | null {
  return subset === "basic" ? BASIC : subset === "western" ? WESTERN : null;
}
