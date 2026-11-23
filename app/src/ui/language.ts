/**
 * The language menu at the foot of the drawer (design: language menu). A new language reloads the
 * page, which then comes back as it was: the font and its settings, the sample text and size.
 */
import type { Catalog } from "../core/catalog";
import { linkText, openLink } from "../core/link";
import { LANG_SAMPLE, SAMPLE_IDS, SIZES, type SampleId } from "../core/samples";
import { currentLang, LANGS, saveLang, SOON, t, type Lang } from "../i18n";
import type { Store } from "../store";
import { h } from "./dom";
import { footMenu } from "./menu";
import { allFonts } from "./opened";
import type { Recent } from "./recent";

const CARRY = "fontbend.carry";
/** The repository, written once; the Help menu links to its bug form. */
export const REPOSITORY = "https://github.com/eneskir/fontbend";
/** The repository's translation form: a fix to these strings, or a language to add. */
const TRANSLATE = `${REPOSITORY}/issues/new?template=2-translation.yml`;

type Carry = { readonly link: string; readonly entry: string | null; readonly sample: SampleId; readonly size: number; readonly text: string | null };

/** The language button and its menu. */
export function languageMenu(store: Store, recent: Pick<Recent, "currentId">): HTMLElement {
  const choose = (next: Lang) => {
    if (next === currentLang()) return;
    const s = store.get();
    try { sessionStorage.setItem(CARRY, JSON.stringify({ link: linkText(s), entry: recent.currentId(), sample: s.sample, size: s.size, text: s.text } satisfies Carry)); } catch { /* the page opens as on a first visit */ }
    const url = new URL(location.href);
    // Where the browser keeps nothing, the address carries the choice.
    if (saveLang(next)) url.searchParams.delete("lang"); else url.searchParams.set("lang", next);
    location.replace(url);
  };
  const option = ({ code, name, beta }: (typeof LANGS)[number]) =>
    h("label", { class: "menu-option", lang: code },
      h("input", { type: "radio", name: "language", value: code, checked: code === currentLang(), onchange: () => choose(code) }),
      h("span", { class: "menu-name" }, name),
      ...(beta ? [h("span", { class: "menu-tag" }, t("language.beta"))] : []),
      h("span", { class: "menu-code" }, code.toUpperCase()));
  // Named so people see they are coming; not a choice yet, so not focusable either.
  const soon = SOON.map(({ code, name, dir }) =>
    h("div", { class: "menu-option is-soon" },
      h("span", { class: "menu-name", lang: code, ...(dir ? { dir } : {}) }, name), h("span", { class: "menu-tag" }, t("language.soon"))));
  const group = (legend: string, langs: typeof LANGS) =>
    h("fieldset", { class: "menu-options" }, h("legend", { class: "meta" }, legend), ...langs.map(option));
  const item = footMenu("language-menu", t("language.title"), [h("span", { class: "foot-code", "aria-hidden": "true" }, currentLang().toUpperCase()), h("span", { class: "visually-hidden" }, t("language.title"))], [
    group(t("language.checked"), LANGS.filter((l) => l.checked)),
    group(t("language.unchecked"), LANGS.filter((l) => !l.checked)),
    ...soon,
    h("hr", { class: "rule menu-rule" }),
    h("a", { class: "menu-link", href: TRANSLATE, target: "_blank", rel: "noopener" }, t("language.suggest")),
  ]);
  // An arrow key would check the next radio at once, and a check reloads the page: arrows only move the
  // focus, Space or Enter picks.
  item.addEventListener("keydown", (e) => {
    const radios = [...item.querySelectorAll<HTMLInputElement>('input[name="language"]')];
    const i = radios.indexOf(document.activeElement as HTMLInputElement);
    if (i < 0) return;
    if (e.key === "Enter") { e.preventDefault(); choose(radios[i]!.value as Lang); return; }
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    radios[(i + step + radios.length) % radios.length]!.focus();
  });
  return item;
}

/**
 * Brings the page back as it was before a language change, once; false when there is nothing to
 * bring back or its font isn't here (an opened file is gone after a reload).
 */
export function carryOver(store: Store, catalog: Catalog, recent: Pick<Recent, "openId">): boolean {
  let carry: Carry;
  try {
    const raw = sessionStorage.getItem(CARRY);
    sessionStorage.removeItem(CARRY);
    if (!raw) return false;
    carry = JSON.parse(raw) as Carry;
  } catch { return false; }
  if (typeof carry?.link !== "string") return false;
  if (!(carry.entry && recent.openId(carry.entry))) {
    const { state, opened } = openLink(allFonts(catalog), carry.link);
    if (opened.kind === "damaged") return false;
    store.update((s) => ({ ...s, font: state.font, settings: state.settings }));
  }
  store.update((s) => ({
    ...s,
    // A language's own opening sample gives way to the next language's; one the user picked stays.
    sample: !SAMPLE_IDS.includes(carry.sample) ? s.sample : Object.values(LANG_SAMPLE).includes(carry.sample) ? LANG_SAMPLE[currentLang()] : carry.sample,
    size: (SIZES as readonly number[]).includes(carry.size) ? carry.size : s.size,
    text: typeof carry.text === "string" ? carry.text : null,
  }));
  return true;
}
