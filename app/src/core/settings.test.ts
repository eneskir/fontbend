import { describe, expect, it } from "vitest";
import { decodeSettings, encodeSettings, type FontSettings } from "./settings";

const fraunces: FontSettings = {
  schemaVersion: 1,
  source: { kind: "catalog", id: "fraunces" },
  axes: { wght: 640, opsz: [9, 72], SOFT: 50.5 },
  subset: "western",
  formats: ["ttf", "woff2"],
};

describe("settings text", () => {
  it("comes back unchanged after encoding and decoding", () => {
    const own: FontSettings = { ...fraunces, source: { kind: "local", sha256: "ab".repeat(32) }, axes: { YTDE: -203 }, formats: ["woff2"] };
    for (const s of [fraunces, own]) expect(decodeSettings(encodeSettings(s))).toEqual({ ok: true, settings: s });
  });

  it("stays short and readable in a link", () => {
    expect(encodeSettings(fraunces)).toBe("v=1&f=fraunces&SOFT=50.5&opsz=9..72&wght=640&sub=western&out=ttf%2Cwoff2");
  });

  it("refuses text it does not understand", () => {
    for (const bad of [
      "f=fraunces&sub=all&out=ttf", // no version
      "v=2&f=fraunces&sub=all&out=ttf", // a later version
      "v=1&f=Fraunces!&sub=all&out=ttf",
      "v=1&f=fraunces&wght=heavy&sub=all&out=ttf",
      "v=1&f=fraunces&wght=700..400&sub=all&out=ttf",
      "v=1&f=fraunces&wght=400&wght=500&sub=all&out=ttf",
      "v=1&f=fraunces&sub=cyrillic&out=ttf",
      "v=1&f=fraunces&sub=all&out=otf",
    ]) expect(decodeSettings(bad).ok, bad).toBe(false);
  });
});
