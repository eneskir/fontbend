import type { CatalogFont } from "../core/catalog";

const faces = new Map<string, Promise<void>>();

/** Loads a font file once under a family name of its own; a failed load can be tried again. */
function load(family: string, path: string): Promise<void> {
  let loading = faces.get(family);
  if (!loading) {
    const face = new FontFace(family, `url("${new URL(path, document.baseURI).href}")`);
    loading = face.load().then((f) => void document.fonts.add(f));
    loading.catch(() => faces.delete(family));
    faces.set(family, loading);
  }
  return loading;
}

/** The whole variable font, for the preview. */
export const previewFamily = (font: CatalogFont) => `fb-${font.id}`;
export const loadPreview = (font: CatalogFont) => load(previewFamily(font), font.files.upright.path);

/** A few kilobytes that draw only the letters of the family name, for the font list. */
export const nameFamily = (font: CatalogFont) => `fb-name-${font.id}`;
export const loadName = (font: CatalogFont) => load(nameFamily(font), font.nameFile);
