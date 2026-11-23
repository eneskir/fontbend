import { describe, expect, it } from "vitest";
import { parseCatalog } from "./catalog";
import { axisValue, resetAxes, selectFont, setAxis, setFormat, startEditing, variationSettings } from "./editor";
import { decodeSettings, encodeSettings } from "./settings";
import data from "../catalog.json";

const fonts = parseCatalog(data).fonts;
const fraunces = fonts.find((f) => f.id === "fraunces")!;
const inter = fonts.find((f) => f.id === "inter")!;

describe("editor state", () => {
  // Fraunces's own default instance is Black at 9 pt: the original is what the file says.
  it("starts at the font's defaults with nothing changed", () => {
    const s = startEditing(fraunces);
    expect(s.settings.axes).toEqual({});
    expect(axisValue(s, "wght")).toBe(900);
    expect(s.settings.source).toEqual({ kind: "catalog", id: "fraunces" });
  });

  it("records a changed axis and drops it again at the default", () => {
    const heavy = setAxis(startEditing(fraunces), "wght", 640);
    expect(heavy.settings.axes).toEqual({ wght: 640 });
    expect(axisValue(heavy, "wght")).toBe(640);
    expect(setAxis(heavy, "wght", 900).settings.axes).toEqual({});
  });

  it("lets a value go past the font's own range, up to the reach", () => {
    expect(setAxis(startEditing(fraunces), "wght", 1200).settings.axes).toEqual({ wght: 1200 });
    expect(setAxis(startEditing(fraunces), "wght", 5000).settings.axes).toEqual({ wght: 1300 });
    expect(setAxis(startEditing(fraunces), "wght", -5000).settings.axes).toEqual({ wght: -300 });
    expect(setAxis(startEditing(fraunces), "SOFT", -10).settings.axes).toEqual({ SOFT: -10 });
  });

  it("ignores an axis the font does not have", () => {
    const s = startEditing(inter);
    expect(setAxis(s, "SOFT", 50)).toBe(s);
  });

  it("does not change the state it was given", () => {
    const s = startEditing(fraunces);
    setAxis(s, "wght", 640);
    expect(s.settings.axes).toEqual({});
  });

  it("starts the new font from its defaults and name, and keeps text and size", () => {
    const s = { ...setAxis(startEditing(fraunces), "wght", 640), text: "Merhaba", size: 48, name: "Big Sign" };
    const next = selectFont(s, inter);
    expect(next.settings.axes).toEqual({});
    expect(next.name).toBeNull();
    expect(next.settings.source).toEqual({ kind: "catalog", id: "inter" });
    expect([next.text, next.size]).toEqual(["Merhaba", 48]);
    expect(selectFont(s, fraunces)).toBe(s);
  });

  it("turns download formats on and off, keeping one and the TTF-first order", () => {
    const s = startEditing(fraunces);
    const ttfOnly = setFormat(s, "woff2", false);
    expect(ttfOnly.settings.formats).toEqual(["ttf"]);
    expect(setFormat(ttfOnly, "ttf", false)).toBe(ttfOnly);
    expect(setFormat(setFormat(s, "ttf", false), "ttf", true).settings.formats).toEqual(["ttf", "woff2"]);
    expect(setFormat(s, "ttf", true)).toBe(s);
  });

  it("resets every axis", () => {
    const s = setAxis(setAxis(startEditing(fraunces), "wght", 640), "SOFT", 50);
    expect(resetAxes(s).settings.axes).toEqual({});
  });

  it("names every axis in font-variation-settings, the added Width and Slant too", () => {
    const s = setAxis(startEditing(fraunces), "SOFT", 50);
    expect(variationSettings(s)).toBe('"opsz" 9, "wght" 900, "SOFT" 50, "WONK" 1, "wdth" 100, "slnt" 0');
  });

  it("writes settings a link can carry back", () => {
    const s = setAxis(setAxis(startEditing(fraunces), "wght", 640), "SOFT", 50.5);
    expect(decodeSettings(encodeSettings(s.settings))).toEqual({ ok: true, settings: s.settings });
  });
});
