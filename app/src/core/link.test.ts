import { describe, expect, it } from "vitest";
import { reach } from "./axis";
import { parseCatalog } from "./catalog";
import { setAxis, setFormat, setSubset, startEditing, type EditorState } from "./editor";
import { inter } from "./fixtures";
import { linkText, openLink } from "./link";
import { openedFont, readFontFile } from "./open";
import { SUBSETS } from "./subsets";
import data from "../catalog.json";

const fonts = parseCatalog(data).fonts;
const font = (id: string) => fonts.find((f) => f.id === id)!;

// A fixed seed, so a failure names the same settings every run.
function random(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe("share link", () => {
  it("opens the settings it was made from, for 100 random fonts and values", () => {
    const r = random(23);
    for (let i = 0; i < 100; i++) {
      let s: EditorState = startEditing(fonts[Math.floor(r() * fonts.length)]!);
      for (const axis of s.font.axes) {
        if (r() < 0.4) continue;
        const { min, max } = reach(axis);
        // Some whole, some with decimals, as sliders with steps of 1 and 0.01 give.
        const v = min + r() * (max - min);
        s = setAxis(s, axis.tag, r() < 0.5 ? Math.round(v) : Math.round(v * 100) / 100);
      }
      s = setSubset(s, SUBSETS[Math.floor(r() * SUBSETS.length)]!);
      if (r() < 0.3) s = setFormat(s, r() < 0.5 ? "ttf" : "woff2", false);
      const { state, opened } = openLink(fonts, linkText(s));
      expect(state.font.id, linkText(s)).toBe(s.font.id);
      expect(state.settings, linkText(s)).toEqual(s.settings);
      expect(opened).toEqual({ kind: "shared", changes: Object.keys(s.settings.axes).length });
    }
  });

  it("opens a font file's settings while that file is open, else says it's missing", async () => {
    const r = await readFontFile(inter, async () => { throw new Error("no WOFF2 here"); });
    if (!r.ok) throw new Error(JSON.stringify(r.problem));
    const own = openedFont(r.file, { sha256: "cd".repeat(32), fileName: "Inter.ttf", url: "blob:x", oflTemplate: "OFL.txt" });
    let s = startEditing(own);
    expect(s.settings.source).toEqual({ kind: "local", sha256: "cd".repeat(32) });
    s = setAxis(s, "wght", 700);
    const link = linkText(s);
    const back = openLink([...fonts, own], link);
    expect(back.state.font).toBe(own);
    expect(back.state.settings).toEqual(s.settings);
    expect(openLink(fonts, link).opened.kind).toBe("noFile");
    // A catalog font never stands in for an opened file with the same id.
    const { local: _, ...asCatalog } = own;
    expect(openLink([...fonts, asCatalog], link).opened.kind).toBe("noFile");
  });

  it("tells a link from a later version apart from a damaged one", () => {
    expect(openLink(fonts, "v=2&f=fraunces&wght=820").opened).toEqual({ kind: "newer" });
    expect(openLink(fonts, "v=12&f=fraunces").state.font).toBe(fonts[0]);
    for (const bad of ["v=0&f=fraunces", "v=1.5&f=fraunces", "v=x&f=fraunces", "f=fraunces"]) expect(openLink(fonts, bad).opened.kind, bad).toBe("damaged");
  });

  it("still opens a link made by this version", () => {
    // Kept as written on 23.11; a later version must open it the same way.
    const { state, opened } = openLink(fonts, "v=1&f=fraunces&slnt=-8&wdth=90&wght=820&sub=western&out=ttf%2Cwoff2");
    expect(state.font.id).toBe("fraunces");
    expect(state.settings.axes).toEqual({ slnt: -8, wdth: 90, wght: 820 });
    expect(state.settings.subset).toBe("western");
    expect(opened).toEqual({ kind: "shared", changes: 3 });
  });

  it("names the settings a font no longer has and opens the rest", () => {
    const { state, opened } = openLink(fonts, "v=1&f=inter&INKT=40&STNC=1&wght=700&sub=all&out=ttf");
    expect(state.font.id).toBe("inter");
    expect(state.settings.axes).toEqual({ wght: 700 });
    expect(state.settings.formats).toEqual(["ttf"]);
    expect(opened).toEqual({ kind: "older", skipped: ["INKT", "STNC"] });
  });

  it("leaves out a range on an axis Fontbend draws itself, and keeps one on the font's own", () => {
    const { state, opened } = openLink(fonts, "v=1&f=inter&wdth=80..120&wght=300..700&sub=all&out=ttf");
    expect(state.settings.axes).toEqual({ wght: [300, 700] });
    expect(opened).toEqual({ kind: "older", skipped: ["wdth"] });
  });

  it("brings a value past the reach back to its end, and drops one at the default", () => {
    const inter = font("inter"), wght = inter.axes.find((a) => a.tag === "wght")!;
    const { state, opened } = openLink(fonts, `v=1&f=inter&wght=99999&slnt=0&sub=all&out=ttf`);
    expect(state.settings.axes).toEqual({ wght: reach(wght).max });
    expect(opened).toEqual({ kind: "shared", changes: 1 });
  });

  it("opens the first font as designed when the link can't be read", () => {
    const bads = { "v=1&f=fraunces&wght=heavy&sub=all&out=ttf": "damaged", "garbage": "damaged", "v=1&f=no-such-font&sub=all&out=ttf": "damaged",
      "v=9&f=fraunces": "newer", [`v=1&f=local:${"ab".repeat(32)}&sub=all&out=ttf`]: "noFile" };
    for (const [bad, kind] of Object.entries(bads)) {
      const { state, opened } = openLink(fonts, bad);
      expect(state, bad).toEqual(startEditing(fonts[0]!));
      expect(opened.kind, bad).toBe(kind);
    }
  });
});
