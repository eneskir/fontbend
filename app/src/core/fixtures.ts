/// <reference types="vite/client" />
/** Shared by the tests: Fraunces from the catalog, and the whole-file checksum check. */
import { view } from "./sfnt";

const file = Object.values(import.meta.glob<string>("../../public/catalog/fraunces/fraunces.*.ttf", { query: "?inline", import: "default", eager: true }))[0]!;
export const fraunces = Uint8Array.from(atob(file.slice(file.indexOf(",") + 1)), (c) => c.charCodeAt(0));

/** OpenType's rule: the 32-bit sum of a whole font file, padded to 4 bytes, is 0xB1B0AFBA. */
export function checksumOk(font: Uint8Array): boolean {
  const v = view(font);
  let sum = 0;
  for (let i = 0; i + 3 < font.length; i += 4) sum = (sum + v.getUint32(i)) >>> 0;
  return font.length % 4 === 0 && sum === 0xb1b0afba;
}
