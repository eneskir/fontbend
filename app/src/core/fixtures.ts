/// <reference types="vite/client" />
/** Shared by the tests: Fraunces, Inter and Recursive from the catalog, every catalog font file, HarfBuzz shaping, and the whole-file checksum check. */
import { view } from "./sfnt";

const files = import.meta.glob<string>(["../../public/catalog/fraunces/fraunces.*.ttf", "../../public/catalog/inter/inter.*.ttf", "../../public/catalog/recursive/recursive.*.ttf"], { query: "?inline", import: "default", eager: true });
const bytes = (id: string) => {
  const file = Object.entries(files).find(([path]) => path.includes(`/${id}.`))![1];
  return Uint8Array.from(atob(file.slice(file.indexOf(",") + 1)), (c) => c.charCodeAt(0));
};
/** Fraunces's character map is format 4 only; Inter's also has format 12. */
export const fraunces = bytes("fraunces");
export const inter = bytes("inter");
/** Recursive's .notdef has curves. */
export const recursive = bytes("recursive");

/** OpenType's rule: the 32-bit sum of a whole font file, padded to 4 bytes, is 0xB1B0AFBA. */
export function checksumOk(font: Uint8Array): boolean {
  const v = view(font);
  let sum = 0;
  for (let i = 0; i + 3 < font.length; i += 4) sum = (sum + v.getUint32(i)) >>> 0;
  return font.length % 4 === 0 && sum === 0xb1b0afba;
}

const all = import.meta.glob<string>("../../public/catalog/*/*.ttf", { query: "?inline", import: "default", eager: true });
/** Every font file of the catalog, by file name. */
export const catalogFiles: readonly [string, Uint8Array][] = Object.entries(all).map(([path, file]) =>
  [path.slice(path.lastIndexOf("/") + 1), Uint8Array.from(atob(file.slice(file.indexOf(",") + 1)), (c) => c.charCodeAt(0))]);

type Hb = typeof import("harfbuzzjs");
let hb: Hb | null = null;
/** HarfBuzz's shaper (the full build, tests only): glyphs and positions of a text in a language, with features such as "-liga". */
export async function shaper(font: Uint8Array): Promise<(text: string, lang: string, features?: string[]) => string> {
  hb ??= await import("harfbuzzjs");
  const h = hb, f = new h.Font(new h.Face(new h.Blob(font)));
  const buf = new h.Buffer();
  return (text, lang, features = []) => {
    buf.reset();
    buf.addText(text); buf.setLanguage(lang); buf.guessSegmentProperties();
    h.shape(f, buf, features.map((x) => h.Feature.fromString(x)!));
    const out = buf.getGlyphInfos().map((g, i) => { const p = buf.getGlyphPositions()[i]!; return `${g.codepoint}@${p.xAdvance},${p.xOffset},${p.yOffset}`; }).join(" ");
    return out;
  };
}
