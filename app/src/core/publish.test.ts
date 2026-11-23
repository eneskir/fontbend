import { describe, expect, it } from "vitest";
import data from "../catalog.json";
import { reach } from "./axis";
import { parseCatalog } from "./catalog";
import { openLink } from "./link";
import { llmsText, publicCatalog } from "./publish";

const catalog = parseCatalog(data);

describe("published catalog", () => {
  it("lists every font with its axes, their reach and its source file at the recorded commit", () => {
    const pub = publicCatalog(catalog);
    expect(pub.fonts.map((f) => f.id)).toEqual(catalog.fonts.map((f) => f.id));
    for (const [i, f] of pub.fonts.entries()) {
      const font = catalog.fonts[i]!;
      expect(f.axes.map((a) => a.tag), f.id).toEqual(font.axes.map((a) => a.tag));
      for (const a of f.axes) {
        const axis = font.axes.find((x) => x.tag === a.tag)!;
        expect(a.reach.min, `${f.id} ${a.tag}`).toBeCloseTo(reach(axis).min, 2);
        expect(a.reach.max, `${f.id} ${a.tag}`).toBeCloseTo(reach(axis).max, 2);
      }
      expect(f.source).toBe(`https://github.com/google/fonts/blob/${catalog.source.commit}/${font.files.upright.source}`);
    }
    // Width and Slant reach every font, as the app's big sliders do.
    for (const f of pub.fonts) expect(f.axes.filter((a) => a.tag === "wdth" || a.tag === "slnt"), f.id).toHaveLength(2);
    expect(JSON.parse(JSON.stringify(pub))).toEqual(pub);
  });

  it("writes llms.txt from the catalog, each font's example link opening that font at that weight", () => {
    const text = llmsText(catalog);
    for (const f of catalog.fonts) expect(text, f.id).toContain(`### ${f.family}`);
    const links = [...text.matchAll(/\]\(\/(#[^)]+)\)/g)].map((m) => m[1]!);
    expect(links).toHaveLength(catalog.fonts.length);
    // The example in the text opens too.
    expect(text).toContain("`/#v=1&f=fraunces&wdth=90&wght=820&sub=all&out=ttf,woff2`");
    expect(openLink(catalog.fonts, "v=1&f=fraunces&wdth=90&wght=820&sub=all&out=ttf,woff2").opened).toEqual({ kind: "shared", changes: 2 });
    expect(text).toContain("XOPQ (27 to 175)");
    for (const [i, link] of links.entries()) {
      const { state, opened } = openLink(catalog.fonts, link.slice(1));
      expect(opened.kind, link).toBe("shared");
      expect(state.font.id).toBe(catalog.fonts[i]!.id);
      expect(Object.keys(state.settings.axes), link).toEqual(["wght"]);
    }
  });
});
