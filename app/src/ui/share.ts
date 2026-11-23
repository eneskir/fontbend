/**
 * Copy link puts the font's settings in a link; opening one shows a band over the canvas that says
 * what came through (core/link).
 */
import type { Catalog } from "../core/catalog";
import { resetAxes } from "../core/editor";
import { linkText, openLink, type Opened } from "../core/link";
import { axisLabel } from "../core/sliders";
import { listText, t, tn } from "../i18n";
import type { Store } from "../store";
import { h } from "./dom";
import { allFonts } from "./opened";
import type { Recent } from "./recent";

const COPIED_FOR = 2000;

/** The Copy link button: says what happened for two seconds, so a click never passes in silence. */
export function copyLinkButton(store: Store): HTMLButtonElement {
  const label = h("span", {}, t("app.copyLink"));
  const check = h("span", { class: "icon icon-check", "aria-hidden": "true", hidden: true });
  let rest = 0;
  const say = (text: string, copied: boolean) => {
    label.textContent = text;
    check.hidden = !copied;
    clearTimeout(rest);
    rest = window.setTimeout(() => { label.textContent = t("app.copyLink"); check.hidden = true; }, COPIED_FOR);
  };
  return h("button", { class: "text-button copy-link", type: "button", "aria-live": "polite", onclick: () => {
    const url = `${location.origin}${location.pathname}#${linkText(store.get())}`;
    // A browser may refuse the clipboard (a setting, an embedded view): the address bar then holds the link to copy by hand.
    navigator.clipboard.writeText(url).then(() => say(t("app.linkCopied"), true), () => { history.replaceState(null, "", url); say(t("app.linkInAddressBar"), false); });
  } }, check, label);
}

/**
 * Opens the link in the address bar, if there is one, and takes it out of the address so a reload
 * doesn't open it again. Returns the band, empty until a link opens; a link pasted into this tab
 * later opens too. A link starts a new Recent entry, so it never writes over the user's own.
 */
export function sharedLinks(store: Store, catalog: Catalog, recent: Pick<Recent, "detach" | "count">): { readonly banner: HTMLElement; readonly open: () => boolean } {
  const title = h("p", { class: "label" });
  const body = h("p", { class: "banner-body" });
  const code = h("span", { class: "meta notice-code" }, t("common.code", { code: "FB-LINK-01" }));
  const reset = h("button", { class: "text-button", type: "button", onclick: () => { store.update(resetAxes); hide(); } }, t("adjust.reset"));
  const close = h("button", { class: "icon-button", type: "button", "aria-label": t("common.close"), onclick: () => hide() }, h("span", { class: "icon icon-close", "aria-hidden": "true" }));
  const banner = h("section", { class: "banner", "aria-label": t("share.label"), hidden: true }, h("div", { class: "banner-texts" }, title, body), reset, close);
  const hide = () => { banner.hidden = true; };

  const show = (opened: Opened, hadRecent: boolean) => {
    const family = store.get().font.family, kept = hadRecent ? ` ${t("share.kept")}` : "";
    banner.classList.toggle("is-damaged", opened.kind === "damaged");
    reset.hidden = !(opened.kind === "shared" && opened.changes > 0);
    switch (opened.kind) {
      case "shared":
        title.textContent = t("share.opened");
        body.textContent = (opened.changes ? tn("share.changes", opened.changes, { family }) : t("share.asDesigned", { family })) + kept;
        break;
      case "older": {
        const names = opened.skipped.map(axisLabel);
        title.textContent = t("share.older");
        body.textContent = tn("share.gone", names.length, { axes: listText(names), family }) + kept;
        break;
      }
      case "newer":
        title.textContent = t("share.newer");
        body.textContent = t("share.newerBody", { family });
        break;
      case "noFile":
        title.textContent = t("share.noFile");
        body.textContent = t("share.noFileBody", { family });
        break;
      case "damaged":
        console.warn(`Fontbend couldn't read the shared link: ${opened.reason}`);
        title.textContent = t("share.damaged");
        body.replaceChildren(`${t("share.damagedBody", { family })} `, code);
        break;
    }
    banner.hidden = false;
  };

  const open = () => {
    const text = location.hash.slice(1);
    if (!text) return false;
    history.replaceState(null, "", location.pathname + location.search);
    const { state, opened } = openLink(allFonts(catalog), text);
    const hadRecent = recent.count() > 0;
    recent.detach();
    // The sample text and size stay as the user left them.
    store.update((s) => ({ ...s, font: state.font, settings: state.settings, name: null }));
    show(opened, hadRecent);
    return true;
  };
  window.addEventListener("hashchange", () => void open());
  // The band tells about the font the link opened; another font makes it old news.
  store.subscribe((now, before) => { if (now.font !== before.font) hide(); });
  return { banner, open };
}
