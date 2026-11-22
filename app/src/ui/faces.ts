import type { CatalogFont } from "../core/catalog";

const faces = new Map<string, Promise<void>>();

/** Loads a font once under a family name of its own; a failed load can be tried again. */
function load(family: string, source: () => Promise<string | ArrayBuffer>): Promise<void> {
  let loading = faces.get(family);
  if (!loading) {
    loading = source().then((s) => new FontFace(family, s).load()).then((f) => void document.fonts.add(f));
    loading.catch(() => faces.delete(family));
    faces.set(family, loading);
  }
  return loading;
}

const url = (path: string) => new URL(path, document.baseURI).href;

let worker: Worker | null = null;
let nextJob = 0;
const jobs = new Map<number, { ok: (b: ArrayBuffer) => void; no: (e: Error) => void }>();

function stretch(path: string): Promise<ArrayBuffer> {
  if (!worker) {
    worker = new Worker(new URL("./stretch.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; bytes?: Uint8Array; error?: string }>) => {
      const job = jobs.get(e.data.id);
      jobs.delete(e.data.id);
      if (e.data.bytes) job?.ok(e.data.bytes.buffer as ArrayBuffer);
      else job?.no(new Error(e.data.error ?? "stretch failed"));
    };
  }
  const w = worker;
  return fetch(url(path))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status} ${path}`))))
    .then((buf) => new Promise<ArrayBuffer>((ok, no) => {
      const id = nextJob++;
      jobs.set(id, { ok, no });
      w.postMessage({ id, bytes: new Uint8Array(buf) }, [buf]);
    }));
}

/** The whole variable font as it ships, for the preview while the stretched one is made. */
export const previewFamily = (font: CatalogFont) => `fb-${font.id}`;
export const loadPreview = (font: CatalogFont) => load(previewFamily(font), async () => `url("${url(font.files.upright.path)}")`);

const stretchedBytes = new Map<string, Promise<ArrayBuffer>>();

/** The stretched font's bytes, made once per font: the preview draws with them and downloads are built from them. */
export function stretchedFont(font: CatalogFont): Promise<ArrayBuffer> {
  let made = stretchedBytes.get(font.id);
  if (!made) {
    made = stretch(font.files.upright.path);
    made.catch(() => stretchedBytes.delete(font.id));
    stretchedBytes.set(font.id, made);
  }
  return made;
}

/** The same font rewritten so its axes reach past their own ends (core/stretch). */
export const stretchedFamily = (font: CatalogFont) => `fb-x-${font.id}`;
export const loadStretched = (font: CatalogFont) => load(stretchedFamily(font), () => stretchedFont(font));

/** A file the app serves, as bytes. */
export const fetchBytes = (path: string) =>
  fetch(url(path)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status} ${path}`)))).then((b) => new Uint8Array(b));

/** A few kilobytes that draw only the letters of the family name, for the font list. */
export const nameFamily = (font: CatalogFont) => `fb-name-${font.id}`;
export const loadName = (font: CatalogFont) => load(nameFamily(font), async () => `url("${url(font.nameFile)}")`);
