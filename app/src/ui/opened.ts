/**
 * Font files the user opened on this page (core/open). Their bytes stay in this tab, served to the
 * page's own font loader and workers by a blob: URL; nothing is stored or sent.
 */
import type { Catalog, CatalogFont } from "../core/catalog";
import { OPEN_MAX, openedFont, readFontFile, type OpenedFile, type OpenProblem } from "../core/open";
import type { Woff2Reply, Woff2Request } from "./woff2.worker";

const fonts: CatalogFont[] = [];
const listeners: ((font: CatalogFont) => void)[] = [];

/** The catalog's fonts, then the files opened on this page. */
export const allFonts = (catalog: Catalog): readonly CatalogFont[] => [...catalog.fonts, ...fonts];
export const openedFonts = (): readonly CatalogFont[] => fonts;
/** Called with each newly opened font. */
export const onOpened = (listener: (font: CatalogFont) => void) => void listeners.push(listener);

export type ReadFile =
  | { readonly ok: true; readonly file: OpenedFile; readonly sha256: string; readonly fileName: string }
  | { readonly ok: false; readonly problem: OpenProblem; readonly fileName: string };

/** A WOFF2 file unpacked to TTF in a worker of its own, which loads only for such a file. */
const unpackWoff2 = (bytes: Uint8Array) => new Promise<Uint8Array>((ok, no) => {
  const worker = new Worker(new URL("./unwoff2.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<Woff2Reply>) => {
    worker.terminate();
    if ("bytes" in e.data) ok(e.data.bytes);
    else no(new Error(e.data.error));
  };
  worker.onerror = (e) => { worker.terminate(); no(new Error(e.message || "the WOFF2 reader stopped")); };
  worker.postMessage({ id: 0, bytes } satisfies Woff2Request);
});

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

/** Reads and checks a file the user chose or dropped; a file over the limit is turned down unread. */
export async function readFile(file: File): Promise<ReadFile> {
  const fileName = file.name;
  if (file.size > OPEN_MAX) return { ok: false, problem: { kind: "too-big", bytes: file.size }, fileName };
  let input: Uint8Array<ArrayBuffer>;
  try { input = new Uint8Array(await file.arrayBuffer()); } catch { return { ok: false, problem: { kind: "broken", why: "the file couldn't be read" }, fileName }; }
  const opened = await readFontFile(input, unpackWoff2);
  if (!opened.ok) return { ok: false, problem: opened.problem, fileName };
  return { ok: true, file: opened.file, sha256: hex(await crypto.subtle.digest("SHA-256", input)), fileName };
}

/** Adds a read file as a font, once per file: opening the same file again gives the font already open. */
export function addFont(read: Extract<ReadFile, { ok: true }>, catalog: Catalog): CatalogFont {
  const known = fonts.find((f) => f.local?.sha256 === read.sha256);
  if (known) return known;
  const url = URL.createObjectURL(new Blob([read.file.bytes as BlobPart], { type: "font/ttf" }));
  const font = openedFont(read.file, { sha256: read.sha256, fileName: read.fileName, url, oflTemplate: catalog.fonts[0]!.licenseFile });
  fonts.push(font);
  for (const l of listeners) l(font);
  return font;
}
