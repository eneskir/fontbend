import type { Catalog, CatalogFont, Category } from "../core/catalog";
import { selectFont } from "../core/editor";
import { fold, t, type Key } from "../i18n";
import type { Store } from "../store";
import { h } from "./dom";
import { loadName, nameFamily } from "./faces";
import { onOpened, openedFonts } from "./opened";

const CATEGORIES: readonly Category[] = ["sans", "serif", "slab", "display", "mono", "handwriting"];

/**
 * The left drawer: font files the user opened, then every catalog font by category, each name drawn
 * in its own font. `open` asks for a font file, offered when a search finds nothing.
 */
export function fontList(store: Store, catalog: Catalog, open: () => void): HTMLElement {
  const search = h("input", { class: "field", type: "search", placeholder: t("fonts.search", { n: catalog.fonts.length }), "aria-label": t("fonts.searchLabel") });
  const list = h("div", { class: "font-groups" });
  const emptyText = h("p", { class: "label" });
  const empty = h("div", { class: "empty", hidden: true }, emptyText, h("button", { class: "text-button", type: "button", onclick: open }, t("fonts.openFile")));

  const buttons = new Map<string, HTMLButtonElement>();
  const item = (font: CatalogFont) => {
    const button = h("button", { class: "font-item", type: "button", "data-family": fold(font.family), onclick: () => store.update((s) => selectFont(s, font)) }, font.family);
    buttons.set(font.id, button);
    // The name shows in the interface font until its own few kilobytes arrive.
    loadName(font).then(() => { button.style.fontFamily = `"${nameFamily(font)}", "Recursive Text", sans-serif`; }, () => {});
    return h("li", {}, button);
  };
  for (const category of CATEGORIES) {
    const fonts = catalog.fonts.filter((f) => f.category === category);
    if (fonts.length === 0) continue;
    list.append(h("section", { class: "font-group" }, h("h3", { class: "meta" }, t(`category.${category}` as Key)), h("ul", {}, ...fonts.map(item))));
  }
  // Opened files come first, in a section of their own that appears with the first one.
  const openedList = h("ul", {});
  const openedGroup = h("section", { class: "font-group", hidden: true }, h("h3", { class: "meta" }, t("fonts.opened")), openedList);
  list.prepend(openedGroup);
  onOpened((font) => {
    openedList.append(item(font));
    openedGroup.hidden = false;
    // Opened files of one family are told apart by their file names.
    const same = openedFonts().filter((f) => f.family === font.family);
    if (same.length > 1) for (const f of same) {
      const button = buttons.get(f.id)!;
      if (!button.querySelector(".font-file")) button.append(h("span", { class: "meta font-file" }, f.local!.fileName));
    }
    mark();
  });

  search.addEventListener("input", () => {
    const q = fold(search.value.trim());
    let shown = 0;
    for (const group of list.children as HTMLCollectionOf<HTMLElement>) {
      let inGroup = 0;
      for (const button of group.querySelectorAll<HTMLButtonElement>(".font-item")) {
        const match = button.dataset.family!.includes(q);
        button.parentElement!.hidden = !match;
        inGroup += Number(match);
      }
      group.hidden = inGroup === 0;
      shown += inGroup;
    }
    empty.hidden = shown > 0;
    emptyText.textContent = t("fonts.noMatch", { query: search.value.trim() });
  });

  const mark = () => {
    for (const [id, button] of buttons) {
      if (id === store.get().font.id) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  };
  mark();
  store.subscribe((now, before) => { if (now.font !== before.font) mark(); });

  return h("nav", { class: "drawer", id: "drawer-fonts", role: "tabpanel", "aria-label": t("drawer.fonts") }, search, list, empty);
}
