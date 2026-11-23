/**
 * The language menu at the foot of the drawer (design: language menu). A new language reloads the
 * page, which then comes back as it was: the font and its settings, the sample text and size.
 */
import type { Catalog } from "../core/catalog";
import { linkText, openLink } from "../core/link";
import { LANG_SAMPLE, SAMPLE_IDS, SIZES, type SampleId } from "../core/samples";
import { currentLang, LANGS, saveLang, t, type Lang } from "../i18n";
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
  const options = LANGS.map(({ code, name }) =>
    h("label", { class: "menu-option", lang: code },
      h("input", { type: "radio", name: "language", value: code, checked: code === currentLang(), onchange: () => choose(code) }),
      h("span", { class: "menu-name" }, name), h("span", { class: "menu-code" }, code.toUpperCase())));
  return footMenu("language-menu", t("language.title"), [h("span", { class: "foot-code", "aria-hidden": "true" }, currentLang().toUpperCase()), h("span", { class: "visually-hidden" }, t("language.title"))], [
    h("fieldset", { class: "menu-options" }, h("legend", { class: "meta" }, t("language.checked")), ...options),
    h("hr", { class: "rule menu-rule" }),
    h("a", { class: "menu-link", href: TRANSLATE, target: "_blank", rel: "noopener" }, t("language.suggest")),
  ]);
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
