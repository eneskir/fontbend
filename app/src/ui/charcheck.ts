import { GROUPS, SAMPLE, checkCharacters, type GroupResult } from "../core/charcheck";
import { codePoints } from "../core/cmap";
import { setSubset } from "../core/editor";
import { drawnSettings } from "./drawn";
import { readNotdef, type Notdef } from "../core/notdef";
import { readTables, view } from "../core/sfnt";
import type { Subset } from "../core/subsets";
import type { Store } from "../store";
import { t, type Key } from "../i18n";
import { h } from "./dom";
import { previewFamily, stretchedFamily } from "./faces";

export const subsetLabel = (subset: Subset, glyphs: number) =>
  subset === "all" ? t("check.all", { n: glyphs }) : t(subset === "western" ? "check.western" : "check.basic");
const groupName = (name: string) => t(`group.${name}` as Key);

type Result = { chars: Set<number>; groups: GroupResult[]; glyphs: number; notdef: Notdef | null } | { error: string };

/** What the made font holds, read from its own tables. */
function inspect(ttf: Uint8Array, fileName: string): Result {
  try {
    const tables = readTables(ttf);
    const cmap = tables.get("cmap");
    if (!cmap) throw new Error("no cmap");
    const chars = codePoints(cmap);
    return { chars, groups: checkCharacters(chars), glyphs: view(tables.get("maxp")!).getUint16(4), notdef: readNotdef(ttf) };
  } catch {
    return { error: t("check.noCmap", { file: fileName }) };
  }
}

const TURKISH = GROUPS.find((g) => g.name === "Turkish")!.letters;

const SVG = "http://www.w3.org/2000/svg";
/** The font's .notdef box, sized like a letter of the surrounding text. */
function box(n: Notdef | null): Element {
  if (!n) return h("span", { class: "notdef-fallback", "aria-hidden": "true" });
  const svg = document.createElementNS(SVG, "svg");
  const em = (u: number) => `${u / n.unitsPerEm}em`;
  svg.setAttribute("viewBox", `0 ${-n.ascender} ${n.advance} ${n.ascender - n.descender}`);
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("notdef");
  svg.style.width = em(n.advance);
  svg.style.height = em(n.ascender - n.descender);
  svg.style.verticalAlign = em(n.descender);
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", n.path);
  path.setAttribute("transform", "scale(1 -1)");
  svg.append(path);
  return svg;
}

/**
 * The Character check row of the Download panel and the view its Details button opens:
 * which Latin languages the made font can write, with the font's own .notdef for each letter it lacks.
 */
export function characterCheck(store: Store, back: () => void) {
  const sample = h("p", { class: "check-sample" });
  const count = h("p", { class: "meta" });
  const details = h("button", { class: "text-button", type: "button" }, t("check.details"));
  const row = h("div", { class: "download-field" },
    h("div", { class: "field-head" }, h("p", { class: "meta" }, t("check.title")), details),
    sample, count);

  const backButton = h("button", { class: "back-button", type: "button", onclick: back }, t("check.back"));
  const subtitle = h("p", { class: "meta" });
  const groups = h("ul", { class: "check-groups" });
  const turkish = h("p", { class: "check-sample" });
  const missing = h("p", { class: "meta" });
  const turkishPart = h("div", { class: "download-field" }, turkish, missing);
  const note = h("p", { class: "meta" }, t("check.note"));
  const errorCode = h("p", { class: "meta notice-code" }, t("common.code", { code: "FB-CHECK-01" }));
  const errorBody = h("p", { class: "meta" });
  const notice = h("div", { class: "notice", role: "alert" }, h("p", { class: "label notice-title" }, t("check.failed")), errorBody, errorCode);
  const useAll = h("button", { class: "primary-button is-wide", type: "button", onclick: () => store.update((s) => setSubset(s, "all")) });
  const panel = h("div", { class: "check-view", hidden: true },
    backButton,
    h("div", {}, h("h2", { class: "title" }, t("check.title")), subtitle),
    notice, groups, turkishPart, note, useAll);

  /** Letters in the preview's face, missing ones as this font's box. */
  const draw = (into: HTMLElement, letters: readonly string[], r: Extract<Result, { chars: Set<number> }>) => {
    const s = store.get();
    into.style.fontFamily = `"${stretchedFamily(s.font)}", "${previewFamily(s.font)}", sans-serif`;
    into.style.fontVariationSettings = drawnSettings(s);
    into.replaceChildren(...letters.map((l) => (r.chars.has(l.codePointAt(0)!) ? l : box(r.notdef))));
    into.setAttribute("aria-label", letters.filter((l) => r.chars.has(l.codePointAt(0)!)).join(" ") || t("check.noLetters"));
  };

  /** Called with the made TTF once it is ready, or null while it is being made; `turkishFix` from core/turkish. */
  const update = (ttf: Uint8Array | null, fileName: string, turkishFix: boolean) => {
    const s = store.get();
    subtitle.textContent = t("check.subtitle", { subset: subsetLabel(s.settings.subset, s.font.glyphs) });
    details.disabled = !ttf;
    if (!ttf) { sample.replaceChildren(); count.textContent = ""; return; }
    const r = inspect(ttf, fileName);
    const failed = "error" in r;
    notice.hidden = !failed;
    for (const el of [groups, turkishPart, note, useAll]) el.hidden = failed;
    if (failed) { errorBody.textContent = r.error; sample.replaceChildren(); count.textContent = t("check.failed"); return; }

    draw(sample, SAMPLE, r);
    count.textContent = t("check.count", { have: r.glyphs, total: s.font.glyphs });
    groups.replaceChildren(...r.groups.map((g) =>
      h("li", {}, h("span", { class: "label" }, groupName(g.name)), h("span", { class: g.have === g.total ? "check-count is-complete" : "check-count" }, t("check.groupCount", { have: g.have, total: g.total })),
        ...(g.name === "Turkish" && turkishFix ? [h("p", { class: "meta check-note" }, t("check.turkishFix"))] : []))));
    const tr = r.groups.find((g) => g.name === "Turkish")!;
    turkishPart.hidden = tr.have === tr.total;
    draw(turkish, TURKISH, r);
    missing.textContent = t("check.missing", { letters: tr.missing.join(" ") });
    const none = r.groups.every((g) => g.have === 0);
    note.hidden = !r.groups.some((g) => g.have === 0);
    useAll.hidden = s.settings.subset === "all" || r.groups.every((g) => g.have === g.total);
    useAll.textContent = none ? t("check.useAll", { n: s.font.glyphs }) : t("check.addMissing");
  };

  return { row, panel, details, backButton, update };
}
