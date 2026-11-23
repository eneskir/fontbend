import { afterEach, describe, expect, it } from "vitest";
import { capitalize, fold, LANGS, listText, MESSAGES, num, pickLang, t, tn, useLang, withUnit } from "./i18n";

const placeholders = (text: string) => new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));

afterEach(() => useLang("en"));

describe("interface languages", () => {
  it("has every English key in every language, and no other", () => {
    const keys = Object.keys(MESSAGES.en).sort();
    for (const { code } of LANGS) expect(Object.keys(MESSAGES[code]).sort(), code).toEqual(keys);
  });

  it("fills only values the English text has, and leaves no text empty", () => {
    for (const { code } of LANGS) {
      for (const [key, text] of Object.entries(MESSAGES[code])) {
        expect(text.trim(), `${code} ${key}`).not.toBe("");
        for (const p of placeholders(text)) expect(placeholders(MESSAGES.en[key]!), `${code} ${key} {${p}}`).toContain(p);
      }
    }
  });

  it("gives every counted text both forms", () => {
    const bases = Object.keys(MESSAGES.en).filter((k) => k.endsWith(".one")).map((k) => k.slice(0, -4));
    for (const b of bases) expect(MESSAGES.en, b).toHaveProperty(`${b}.other`);
  });

  it("picks the saved language, else the browser's first known one, else English", () => {
    expect(pickLang("tr", ["en-US"])).toBe("tr");
    expect(pickLang(null, ["de-DE", "tr-TR", "en"])).toBe("tr");
    expect(pickLang("xx", ["TR"])).toBe("tr");
    expect(pickLang(null, ["de", "fr"])).toBe("en");
    expect(pickLang(null, [])).toBe("en");
  });

  it("fills values and writes numbers, counts, units and lists as each language does", () => {
    expect(t("fonts.search", { n: 20 })).toBe("Search 20 fonts");
    expect(tn("share.changes", 1, { family: "Inter" })).toBe("Inter with 1 change.");
    expect(tn("share.changes", 3, { family: "Inter" })).toBe("Inter with 3 changes.");
    expect([num(1.5), withUnit("75", "%"), withUnit("+5", "%"), withUnit("12", "°")]).toEqual(["1.5", "75%", "+5%", "12°"]);
    expect(listText(["Grade", "Wonky", "Flare"])).toBe("Grade, Wonky, and Flare");
    useLang("tr");
    expect(t("fonts.search", { n: 20 })).toBe("20 fontta ara");
    expect([num(1.5), withUnit("75", "%"), withUnit("+5", "%"), withUnit("-3", "%"), withUnit("12", "°")]).toEqual(["1,5", "%75", "+%5", "-%3", "12°"]);
    expect(listText(["Derece", "Oynaklık"])).toBe("Derece ve Oynaklık");
  });

  it("capitalizes and folds Turkish letters right", () => {
    useLang("tr");
    expect(capitalize("işte")).toBe("İşte");
    useLang("en");
    expect(capitalize("strokes")).toBe("Strokes");
    expect(["İnter", "ınter", "INTER", "Ínter"].map(fold)).toEqual(["inter", "inter", "inter", "inter"]);
  });
});
