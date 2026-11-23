/**
 * Copy link puts the font's settings in a link; opening one shows a band over the canvas that says
 * what came through (core/link).
 */
import type { Catalog } from "../core/catalog";
import { resetAxes } from "../core/editor";
import { linkText, openLink, type Opened } from "../core/link";
import { axisLabel } from "../core/sliders";
import type { Store } from "../store";
import { h } from "./dom";

const COPIED_FOR = 2000;

/** The Copy link button: says what happened for two seconds, so a click never passes in silence. */
export function copyLinkButton(store: Store): HTMLButtonElement {
  const label = h("span", {}, "Copy link");
  const check = h("span", { class: "icon icon-check", "aria-hidden": "true", hidden: true });
  let rest = 0;
  const say = (text: string, copied: boolean) => {
    label.textContent = text;
    check.hidden = !copied;
    clearTimeout(rest);
    rest = window.setTimeout(() => { label.textContent = "Copy link"; check.hidden = true; }, COPIED_FOR);
  };
  return h("button", { class: "text-button copy-link", type: "button", "aria-live": "polite", onclick: () => {
    const url = `${location.origin}${location.pathname}#${linkText(store.get())}`;
    // A browser may refuse the clipboard (a setting, an embedded view): the address bar then holds the link to copy by hand.
    navigator.clipboard.writeText(url).then(() => say("Link copied", true), () => { history.replaceState(null, "", url); say("Link is in the address bar", false); });
  } }, check, label);
}

/** "A", "A and B", "A, B and C". */
const list = (names: readonly string[]) => names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/**
 * Opens the link in the address bar, if there is one, and takes it out of the address so a reload
 * doesn't open it again. Returns the band, empty until a link opens; a link pasted into this tab
 * later opens too.
 */
export function sharedLinks(store: Store, catalog: Catalog): { readonly banner: HTMLElement; readonly open: () => void } {
  const title = h("p", { class: "label" });
  const body = h("p", { class: "banner-body" });
  const code = h("span", { class: "meta notice-code" }, "Code FB-LINK-01");
  const reset = h("button", { class: "text-button", type: "button", onclick: () => { store.update(resetAxes); hide(); } }, "Reset all");
  const close = h("button", { class: "icon-button", type: "button", "aria-label": "Close", onclick: () => hide() }, h("span", { class: "icon icon-close", "aria-hidden": "true" }));
  const banner = h("section", { class: "banner", "aria-label": "Shared link", hidden: true }, h("div", { class: "banner-texts" }, title, body), reset, close);
  const hide = () => { banner.hidden = true; };

  const show = (opened: Opened) => {
    const family = store.get().font.family;
    banner.classList.toggle("is-damaged", opened.kind === "damaged");
    reset.hidden = !(opened.kind === "shared" && opened.changes > 0);
    switch (opened.kind) {
      case "shared":
        title.textContent = "Opened from a shared link";
        body.textContent = opened.changes ? `${family} with ${opened.changes} ${opened.changes === 1 ? "change" : "changes"}.` : `${family} as designed.`;
        break;
      case "older": {
        const names = opened.skipped.map(axisLabel);
        title.textContent = "This link is from an older version of Fontbend";
        body.textContent = `${list(names)} ${names.length === 1 ? "is" : "are"} no longer in ${family}. Everything else opened as shared.`;
        break;
      }
      case "damaged":
        console.warn(`Fontbend couldn't read the shared link: ${opened.reason}`);
        title.textContent = "This link is damaged";
        body.replaceChildren(`The original ${family} opened instead. `, code);
        break;
    }
    banner.hidden = false;
  };

  const open = () => {
    const text = location.hash.slice(1);
    if (!text) return;
    history.replaceState(null, "", location.pathname + location.search);
    const { state, opened } = openLink(catalog.fonts, text);
    // The sample text and size stay as the user left them.
    store.update((s) => ({ ...s, font: state.font, settings: state.settings, name: null }));
    show(opened);
  };
  window.addEventListener("hashchange", open);
  // The band tells about the font the link opened; another font makes it old news.
  store.subscribe((now, before) => { if (now.font !== before.font) hide(); });
  return { banner, open };
}
