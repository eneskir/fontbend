/**
 * Recent in the drawer: the fonts the user changed in this browser, each "Ag" drawn in its own
 * settings. Clicking one brings it back; the latest opens again when Fontbend does.
 */
import type { Catalog } from "../core/catalog";
import { axisValue, variationSettings, type EditorState } from "../core/editor";
import { linkText, openLink } from "../core/link";
import { byDay, mergeRecent, parseRecent, serializeRecent, type RecentEntry } from "../core/recent";
import { decodeSettings } from "../core/settings";
import type { Store } from "../store";
import { h } from "./dom";
import { loadPreview, previewFamily } from "./faces";
import { allFonts } from "./opened";

const KEY = "fontbend.recent";
// A slider sends dozens of values a second; the list is written once it rests.
const SAVE_AFTER = 400;

type Kept = { read(): string | null; write(text: string): void };

/** This browser's storage, or null when it keeps nothing (a private window, blocked site data). */
function kept(): Kept | null {
  try {
    localStorage.setItem(`${KEY}.probe`, "1");
    localStorage.removeItem(`${KEY}.probe`);
    return { read: () => localStorage.getItem(KEY), write: (text) => localStorage.setItem(KEY, text) };
  } catch {
    return null;
  }
}

export type Recent = {
  readonly view: HTMLElement;
  /** Draws the list; called when the Recent tab opens, so fonts load only for a user who looks. */
  render(): void;
  /** Opens the latest font; false when Recent is empty. */
  openLatest(): boolean;
  /** Opens the latest entry of an opened font file, chosen again; false when it has none. */
  openFor(sha256: string): boolean;
  /** The next change starts a new entry instead of updating the one being edited. */
  detach(): void;
  count(): number;
};

/** `browse` shows the catalog; `choose` asks for a font file, for an entry whose file isn't open. */
export function recent(store: Store, catalog: Catalog, browse: () => void, choose: () => void): Recent {
  let storage = kept();
  const stored = parseRecent(storage?.read() ?? null);
  // A later version's list stays as it is: this one neither shows nor writes it.
  if (stored === null) storage = null;
  let entries: readonly RecentEntry[] = stored ?? [];
  let current: string | null = null, opening = false, saving = 0, shown = false;

  const view = h("div", { class: "drawer recent", id: "drawer-recent", role: "tabpanel", "aria-label": "Recent", hidden: true });

  const stateOf = (e: RecentEntry): EditorState | null => {
    const { state, opened } = openLink(allFonts(catalog), e.link);
    return opened.kind === "damaged" ? null : { ...state, name: e.name };
  };

  const open = (e: RecentEntry) => {
    const s = stateOf(e);
    if (!s) return;
    opening = true;
    current = e.id;
    // The sample text and size stay as the user left them.
    store.update((now) => ({ ...now, font: s.font, settings: s.settings, name: s.name }));
    opening = false;
    render();
  };

  const save = () => {
    clearTimeout(saving);
    if (!storage) return;
    try {
      const theirs = parseRecent(storage.read());
      if (theirs === null) { storage = null; render(); return; }
      entries = mergeRecent(entries, theirs);
      storage.write(serializeRecent(entries));
    } catch { /* full or blocked: the list still holds until the page closes */ }
    render();
  };

  store.subscribe((now, before) => {
    if (opening) return;
    if (now.font !== before.font) current = null;
    if (now.settings === before.settings && now.name === before.name) return;
    // Fonts as designed aren't listed; Reset all keeps the entry as it was.
    if (Object.keys(now.settings.axes).length === 0) return;
    current ??= crypto.randomUUID();
    const file = now.font.local?.fileName;
    entries = mergeRecent(entries, [{ id: current, at: Date.now(), link: linkText(now), name: now.name, ...(file ? { file } : {}) }]);
    clearTimeout(saving);
    saving = window.setTimeout(save, SAVE_AFTER);
  });
  window.addEventListener("pagehide", save);
  // Another tab wrote its list.
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY || !storage) return;
    const theirs = parseRecent(e.newValue);
    if (theirs) { entries = mergeRecent(entries, theirs); render(); }
  });

  const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
  const date = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

  const item = (e: RecentEntry, s: EditorState) => {
    const sample = h("span", { class: "recent-sample", "aria-hidden": "true" }, "Ag");
    sample.style.fontFamily = `"${previewFamily(s.font)}"`;
    sample.style.fontVariationSettings = variationSettings(s);
    // Width and Slant Fontbend adds scale and slant the outlines; the shipped font draws them the same way.
    const synthetic = (tag: string) => s.font.axes.some((a) => a.tag === tag && a.synthetic);
    const scale = synthetic("wdth") ? axisValue(s, "wdth") / 100 : 1, slant = synthetic("slnt") ? axisValue(s, "slnt") : 0;
    if (scale !== 1 || slant !== 0) sample.style.transform = `scaleX(${scale}) skewX(${slant}deg)`;
    // Hidden until its font arrives, so a fallback is never shown as the user's font.
    loadPreview(s.font).then(() => sample.classList.add("is-ready"), () => {});
    return h("button", { class: "recent-item", type: "button", "aria-current": e.id === current ? "true" : undefined, onclick: () => open(e) },
      sample,
      h("span", { class: "recent-meta" }, h("span", {}, e.name ?? s.font.family), h("span", { class: "recent-time" }, e.id === current ? "now" : time.format(e.at))));
  };

  // A font file's entry whose file isn't open: the file was never kept, so the user chooses it again.
  const fileOf = (e: RecentEntry) => { const d = decodeSettings(e.link); return d.ok && d.settings.source.kind === "local" ? d.settings.source.sha256 : null; };
  const missing = (e: RecentEntry) => {
    const file = e.file ?? "the font file";
    return h("div", { class: "recent-missing" },
      h("p", { class: "label" }, e.name ?? file.replace(/\.[^.]+$/, "")),
      h("p", { class: "recent-meta" }, h("span", {}, "File not found"), h("span", { class: "recent-time" }, time.format(e.at))),
      h("p", { class: "meta" }, `Choose ${file} again to keep working on it.`),
      h("button", { class: "text-button", type: "button", onclick: choose }, "Choose file"));
  };

  function render() {
    if (!shown) return;
    if (!storage) {
      view.replaceChildren(h("div", { class: "notice" }, h("p", { class: "label" }, "Recent is off"),
        h("p", { class: "banner-body" }, "This browser doesn't let Fontbend keep anything, for example in a private window. The Copy link button still saves your settings in the link.")));
      return;
    }
    const listed = entries.flatMap((e): { e: RecentEntry; s: EditorState | null }[] => { const s = stateOf(e); return s || fileOf(e) ? [{ e, s }] : []; });
    if (listed.length === 0) {
      view.replaceChildren(h("div", { class: "recent-empty" }, h("p", { class: "label" }, "No recent fonts yet"),
        h("p", { class: "banner-body" }, "Fonts you change are listed here. Font files you open aren't copied, so choose them again to continue."),
        h("button", { class: "text-button", type: "button", onclick: browse }, "Browse base fonts")));
      return;
    }
    const states = new Map(listed.map(({ e, s }) => [e.id, s]));
    view.replaceChildren(
      ...byDay(listed.map(({ e }) => e), new Date(), (d) => date.format(d)).map((g) =>
        h("section", { class: "recent-day" }, h("h3", { class: "meta" }, g.label), ...g.entries.map((e) => { const s = states.get(e.id); return s ? item(e, s) : missing(e); }))),
      h("p", { class: "meta recent-note" }, "Recent fonts are kept in this browser's storage. Clearing the site's data removes them."));
  }

  return {
    view,
    render() { shown = true; render(); },
    openLatest() { const e = entries.find((x) => stateOf(x)); if (e) open(e); return e !== undefined; },
    openFor(sha256) { const e = entries.find((x) => fileOf(x) === sha256 && stateOf(x)); if (e) open(e); return e !== undefined; },
    detach() { current = null; },
    count: () => entries.length,
  };
}
