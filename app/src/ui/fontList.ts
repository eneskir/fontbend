import type { Catalog, Category } from "../core/catalog";
import { selectFont } from "../core/editor";
import type { Store } from "../store";
import { h } from "./dom";
import { loadName, nameFamily } from "./faces";

const CATEGORY_NAMES: Record<Category, string> = {
  sans: "Sans serif", serif: "Serif", slab: "Slab serif", display: "Display", mono: "Monospace", handwriting: "Handwriting",
};

/** The left drawer: every catalog font by category, each name drawn in its own font. */
export function fontList(store: Store, catalog: Catalog): HTMLElement {
  const search = h("input", { class: "field", type: "search", placeholder: `Search ${catalog.fonts.length} fonts`, "aria-label": "Search fonts" });
  const list = h("div", { class: "font-groups" });
  const empty = h("p", { class: "empty", hidden: true });

  const buttons = new Map<string, HTMLButtonElement>();
  for (const category of Object.keys(CATEGORY_NAMES) as Category[]) {
    const fonts = catalog.fonts.filter((f) => f.category === category);
    if (fonts.length === 0) continue;
    const items = fonts.map((font) => {
      const button = h("button", { class: "font-item", type: "button", "data-family": font.family.toLowerCase(), onclick: () => store.update((s) => selectFont(s, font)) }, font.family);
      buttons.set(font.id, button);
      // The name shows in the interface font until its own few kilobytes arrive.
      loadName(font).then(() => { button.style.fontFamily = `"${nameFamily(font)}", "Recursive Text", sans-serif`; }, () => {});
      return h("li", {}, button);
    });
    list.append(h("section", { class: "font-group" }, h("h3", { class: "meta" }, CATEGORY_NAMES[category]), h("ul", {}, ...items)));
  }

  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
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
    empty.textContent = `No font named “${search.value.trim()}” in the catalog.`;
  });

  const mark = () => {
    for (const [id, button] of buttons) {
      if (id === store.get().font.id) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  };
  mark();
  store.subscribe((now, before) => { if (now.font !== before.font) mark(); });

  return h("nav", { class: "drawer", "aria-label": "Fonts" }, h("h2", { class: "drawer-title label" }, "Fonts"), search, list, empty);
}
