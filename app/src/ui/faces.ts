import type { CatalogFont } from "../core/catalog";
import { jobWorker, once } from "./jobs";

const url = (path: string) => new URL(path, document.baseURI).href;

/** A file the app serves, as bytes. */
export const fetchBytes = (path: string) =>
  fetch(url(path)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status} ${path}`)))).then((b) => new Uint8Array(b));

const faces = new Map<string, Promise<void>>();

/** Loads a font once under a family name of its own; a failed load can be tried again. */
const load = (family: string, source: () => Promise<string | ArrayBuffer>) =>
  once(faces, family, () => source().then((s) => new FontFace(family, s).load()).then((f) => void document.fonts.add(f)));

/** The font arrived but could not be stretched; unlike a failed download, trying again won't help. */
export class StretchError extends Error {}

type StretchReply = { id: number; bytes: Uint8Array } | { id: number; error: string };
const stretchJob = jobWorker<StretchReply, ArrayBuffer>(
  () => new Worker(new URL("./stretch.worker.ts", import.meta.url), { type: "module" }),
  (r) => ("bytes" in r ? (r.bytes.buffer as ArrayBuffer) : new StretchError(r.error)),
  () => new StretchError("the stretching worker stopped"),
);

/** The whole variable font as it ships, for the preview while the stretched one is made. */
export const previewFamily = (font: CatalogFont) => `fb-${font.id}`;
export const loadPreview = (font: CatalogFont) => load(previewFamily(font), async () => `url("${url(font.files.upright.path)}")`);

const stretchedBytes = new Map<string, Promise<ArrayBuffer>>();

/** The stretched font's bytes, made once per font: the preview draws with them and downloads are built from them. */
export const stretchedFont = (font: CatalogFont) =>
  once(stretchedBytes, font.id, () => fetchBytes(font.files.upright.path).then((b) => stretchJob({ bytes: b }, [b.buffer])));

/** The same font rewritten so its axes reach past their own ends (core/stretch). */
export const stretchedFamily = (font: CatalogFont) => `fb-x-${font.id}`;
export const loadStretched = (font: CatalogFont) => load(stretchedFamily(font), () => stretchedFont(font));

/** A few kilobytes that draw only the letters of the family name, for the font list. */
export const nameFamily = (font: CatalogFont) => `fb-name-${font.id}`;
export const loadName = (font: CatalogFont) => load(nameFamily(font), async () => `url("${url(font.nameFile)}")`);
