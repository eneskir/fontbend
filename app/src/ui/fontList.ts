import type { Catalog, CatalogFont, Category } from "../core/catalog";
import { selectFont } from "../core/editor";
import type { Store } from "../store";
import { h } from "./dom";
import { loadName, nameFamily } from "./faces";
import { onOpened, openedFonts } from "./opened";

const CATEGORY_NAMES: Record<Category, string> = {
  sans: "Sans serif", serif: "Serif", slab: "Slab serif", display: "Display", mono: "Monospace", handwriting: "Handwriting",
};

/**
 * The left drawer: font files the user opened, then every catalog font by category, each name drawn
 * in its own font. `open` asks for a font file, offered when a search finds nothing.
 */
export function fontList(store: Store, catalog: Catalog, open: () => void): HTMLElement {
  const search = h("input", { class: "field", type: "search", placeholder: `Search ${catalog.fonts.length} fonts`, "aria-label": "Search fonts" });
  const list = h("div", { class: "font-groups" });
  const emptyText = h("p", { class: "label" });
  const empty = h("div", { class: "empty", hidden: true }, emptyText, h("button", { class: "text-button", type: "button", onclick: open }, "Open a font file"));

  const buttons = new Map<string, HTMLButtonElement>();
  const item = (font: CatalogFont) => {
    const button = h("button", { class: "font-item", type: "button", "data-family": font.family.toLowerCase(), onclick: () => store.update((s) => selectFont(s, font)) }, font.family);
    buttons.set(font.id, button);
    // The name shows in the interface font until its own few kilobytes arrive.
    loadName(font).then(() => { button.style.fontFamily = `"${nameFamily(font)}", "Recursive Text", sans-serif`; }, () => {});
    return h("li", {}, button);
  };
  for (const category of Object.keys(CATEGORY_NAMES) as Category[]) {
    const fonts = catalog.fonts.filter((f) => f.category === category);
    if (fonts.length === 0) continue;
    list.append(h("section", { class: "font-group" }, h("h3", { class: "meta" }, CATEGORY_NAMES[category]), h("ul", {}, ...fonts.map(item))));
  }
  // Opened files come first, in a section of their own that appears with the first one.
  const openedList = h("ul", {});
  const openedGroup = h("section", { class: "font-group", hidden: true }, h("h3", { class: "meta" }, "Opened files"), openedList);
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
    emptyText.textContent = `No base font named “${search.value.trim()}”`;
  });

  const mark = () => {
    for (const [id, button] of buttons) {
      if (id === store.get().font.id) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  };
  mark();
  store.subscribe((now, before) => { if (now.font !== before.font) mark(); });

  return h("nav", { class: "drawer", id: "drawer-fonts", role: "tabpanel", "aria-label": "Fonts" }, search, list, empty);
}
