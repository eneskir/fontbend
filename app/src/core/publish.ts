/**
 * The catalog as the app publishes it at its root, for people and AI agents: catalog.json (schema
 * in README) and llms.txt. Both are made from catalog.json at build time, never written by hand.
 */
import { reach } from "./axis";
import { MESSAGES } from "../i18n";
import type { Catalog, CatalogFont, Category } from "./catalog";

/** What each kind of font usually serves, by its catalog category. */
const USES: Record<Category, string> = {
  sans: "interfaces, signs and body text",
  serif: "long reading, books and editorial text",
  slab: "headlines, posters and sturdy body text",
  display: "headlines, posters and large sizes",
  mono: "code, tables and aligned numbers",
  handwriting: "notes, cards and informal headings",
};

/** Plain axis names, the interface's English ones; an axis without one is named by its tag. */
const name = (tag: string) => MESSAGES.en[`axis.${tag}`] ?? tag;

const round = (n: number) => Math.round(n * 100) / 100;

/** The settings link of a font at some values, all characters and both files, relative to the app's address. */
export const settingsLink = (font: CatalogFont, values: Readonly<Record<string, number>> = {}) =>
  `#v=1&f=${font.id}${Object.entries(values).map(([tag, v]) => `&${tag}=${v}`).join("")}&sub=all&out=ttf,woff2`;

/** catalog.json: each font with its axes, how far Fontbend moves them, and where the font comes from. */
export function publicCatalog(catalog: Catalog) {
  return {
    schemaVersion: 1,
    source: catalog.source,
    link: "#v=1&f={id}&{tag}={value}&sub={all|western|basic}&out={ttf,woff2}",
    fonts: catalog.fonts.map((f) => ({
      id: f.id,
      family: f.family,
      category: f.category,
      version: f.version,
      license: "OFL-1.1",
      copyright: f.copyright,
      glyphs: f.glyphs,
      // catalog.ts admits only fonts with every Turkish letter.
      turkish: true,
      source: `https://github.com/${catalog.source.repository}/blob/${catalog.source.commit}/${f.files.upright.source}`,
      axes: f.axes.map((a) => {
        const r = reach(a);
        return { tag: a.tag, name: name(a.tag), min: a.min, default: a.default, max: a.max, reach: { min: round(r.min), max: round(r.max) }, ...(a.synthetic ? { addedByFontbend: true } : {}) };
      }),
    })),
  };
}

/** llms.txt: what Fontbend is, then each font, what it suits, its axes and a settings link to try. */
export function llmsText(catalog: Catalog): string {
  const font = (f: CatalogFont) => {
    const wght = f.axes.find((a) => a.tag === "wght")!;
    const bolder = Math.round(Math.min(reach(wght).max, wght.default + 200));
    const axes = f.axes.map((a) => `${name(a.tag) === a.tag ? a.tag : `${name(a.tag)} (${a.tag}`} ${name(a.tag) === a.tag ? "(" : ""}${a.min} to ${a.max}${a.synthetic ? ", added by Fontbend" : ""})`).join(", ");
    return [
      `### ${f.family}`,
      `- Category: ${f.category}. Suits ${USES[f.category!]}.`,
      `- Axes: ${axes}.`,
      `- ${f.glyphs} glyphs, all Turkish letters, SIL Open Font License 1.1.`,
      `- Try it: [${f.family} at weight ${bolder}](/${settingsLink(f, { wght: bolder })})`,
    ].join("\n");
  };
  return [
    "# Fontbend",
    "",
    "> A free, open-source font maker in the browser. Pick an open-source variable font, move its weight, width and slant (also past the font's own range), check its Turkish and Latin letters, and download the result as a font of your own (TTF and WOFF2). Fonts stay on the user's device: no server, no accounts.",
    "",
    "## Settings links",
    "",
    "A link opens a font with its settings: the app's address, then `#v=1&f=<font id>`, one `&<axis tag>=<value>` per changed axis, `&sub=` with the characters kept (`all`, `western` or `basic`) and `&out=` with the files (`ttf`, `woff2` or both, comma-separated). For example `/#v=1&f=fraunces&wdth=90&wght=820&sub=all&out=ttf,woff2`. A value outside an axis's reach is moved to its end.",
    "",
    "- [Catalog as JSON](/catalog.json): every font with its axes and their reach.",
    `- Fonts come from ${catalog.source.repository} at commit ${catalog.source.commit}.`,
    "",
    "## Fonts",
    "",
    catalog.fonts.map(font).join("\n\n"),
    "",
  ].join("\n");
}
