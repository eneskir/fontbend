import { FAMILY_MAX, defaultFamily, downloadFiles, fileStem, madeNames, type MadeNames } from "../core/download";
import { setFormat, setSubset, type Format } from "../core/editor";
import { drawnSettings } from "./drawn";
import { SUBSETS, type Subset } from "../core/subsets";
import { makeZip } from "../core/zip";
import type { Store } from "../store";
import { h } from "./dom";
import { characterCheck, subsetLabel } from "./charcheck";
import { fetchBytes, previewFamily, stretchedFamily } from "./faces";
import { MakeError, makeFont, makeWoff2, stopWoff2 } from "./maker";

const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);

type Made = { ttf: Uint8Array; license: Uint8Array; woff2?: Uint8Array };

/** The Download button in the app bar and the panel it opens: name, files, license, then the ZIP. */
export function download(store: Store): { button: HTMLElement; panel: HTMLElement } {
  const button = h("button", { class: "primary-button has-caret", type: "button", popovertarget: "download", "aria-haspopup": "dialog" }, "Download");

  const preview = h("p", { class: "download-name" });
  const nameInput = h("input", { class: "input", id: "font-name", type: "text", maxlength: FAMILY_MAX, autocomplete: "off", spellcheck: "false" });
  nameInput.addEventListener("input", () => store.update((s) => ({ ...s, name: nameInput.value })));
  nameInput.addEventListener("change", () => store.update((s) => ({ ...s, name: madeNames(s.font, nameInput.value, s.font.axes, s.settings.axes).family })));

  const row = (format: Format) => {
    const box = h("input", { type: "checkbox", class: "check", onchange: () => store.update((s) => setFormat(s, format, box.checked)) });
    const name = h("span", { class: "file-name" });
    const meta = h("span", { class: "file-size" });
    return { box, name, meta, el: h("li", {}, h("label", { class: "file" }, box, name, meta)) };
  };
  const ttfRow = row("ttf"), woff2Row = row("woff2");
  // Details swaps the panel for the Character check view; Back and closing the panel swap it back.
  const showCheck = (on: boolean) => {
    main.hidden = on;
    check.panel.hidden = !on;
    (on ? check.backButton : check.details).focus();
  };
  const check = characterCheck(store, () => showCheck(false));
  check.details.addEventListener("click", () => showCheck(true));
  const subsetOptions = SUBSETS.map((s) => h("option", { value: s }));
  const subsetSelect = h("select", { class: "input", id: "characters", onchange: () => store.update((s) => setSubset(s, subsetSelect.value as Subset)) }, ...subsetOptions);
  const licenseSize = h("span", { class: "file-size" });
  const progressText = h("p", { class: "meta" });
  const progress = h("div", { class: "download-progress", hidden: true }, h("div", { class: "progress-bar" }), progressText);
  const errorTitle = h("p", { class: "label notice-title" });
  const errorBody = h("p", { class: "meta" });
  const errorCode = h("p", { class: "meta notice-code" });
  const ttfOnly = h("button", { class: "primary-button", type: "button", onclick: () => void saveTtfOnly() }, "Download TTF only");
  const retry = h("button", { class: "text-button", type: "button", onclick: () => void make() }, "Try again");
  const notice = h("div", { class: "notice", role: "alert", hidden: true }, errorTitle, errorBody, errorCode, h("div", { class: "notice-actions" }, ttfOnly, retry));
  const zipSize = h("span", { class: "button-meta" });
  const save = h("button", { class: "primary-button is-wide", type: "button", disabled: true, onclick: () => saveZip() }, "Download ZIP", zipSize);

  const main = h("div", { class: "download-main" },
    h("div", { class: "download-head" }, h("h2", { id: "download-title", class: "title" }, "Download"), preview),
    h("div", { class: "download-field" }, h("label", { class: "meta", for: "font-name" }, "Font name"), nameInput),
    h("div", { class: "download-field" },
      h("p", { class: "meta" }, "Files"),
      h("ul", { class: "files" },
        ttfRow.el, woff2Row.el,
        h("li", { class: "file is-locked" }, h("span", { class: "lock", "aria-hidden": "true" }), h("span", { class: "file-name" }, "OFL.txt"), h("span", { class: "meta" }, "Required by the license"), licenseSize)),
      h("p", { class: "meta" }, "Install the TTF on your computer. Use the WOFF2 on websites.")),
    h("div", { class: "download-field" }, h("label", { class: "meta", for: "characters" }, "Characters"), h("span", { class: "select-field" }, subsetSelect)),
    check.row,
    h("details", { class: "license" },
      h("summary", { class: "label" }, "Free for commercial work (SIL OFL 1.1)"),
      h("p", {}, "You can use and change this font in any project, logos and games included. Keep the copyright lines in the font, and don't sell the font file on its own."),
      h("p", { class: "meta" }, "Fontbend writes “Made with Fontbend” into the font's description field.")),
    progress, notice, save);
  const panel = h("section", { class: "download", id: "download", popover: "auto", role: "dialog", "aria-labelledby": "download-title" }, main, check.panel);

  let names: MadeNames | null = null;
  let made: Made | null = null;
  let zip: Blob | null = null;
  let job = 0;
  let timer = 0;

  const formats = () => store.get().settings.formats;

  const show = () => {
    const s = store.get();
    names = madeNames(s.font, s.name ?? "", s.font.axes, s.settings.axes);
    if (document.activeElement !== nameInput) nameInput.value = s.name ?? defaultFamily(s.font);
    nameInput.placeholder = defaultFamily(s.font);
    preview.textContent = names.family;
    preview.style.fontFamily = `"${stretchedFamily(s.font)}", "${previewFamily(s.font)}", sans-serif`;
    preview.style.fontVariationSettings = drawnSettings(s);
    const stem = fileStem(names);
    ttfRow.name.textContent = `${stem}.ttf`;
    woff2Row.name.textContent = `${stem}.woff2`;
    subsetOptions.forEach((o, i) => { o.textContent = subsetLabel(SUBSETS[i]!, s.font.glyphs); });
    subsetSelect.value = s.settings.subset;
    for (const [r, f] of [[ttfRow, "ttf"], [woff2Row, "woff2"]] as const) {
      r.box.checked = s.settings.formats.includes(f);
      // The last format left can't be turned off: a ZIP with only the license is no download.
      r.box.disabled = r.box.checked && s.settings.formats.length === 1;
    }
  };

  type Now = "making" | "woff2" | "ready" | "failed" | "woff2-failed";
  const state = (now: Now) => {
    progress.hidden = now !== "making" && now !== "woff2";
    progressText.textContent = now === "woff2" ? "Making the WOFF2 file" : "Making the font file";
    notice.hidden = now !== "failed" && now !== "woff2-failed";
    ttfOnly.hidden = now !== "woff2-failed";
    save.hidden = now === "woff2-failed";
    save.disabled = now !== "ready";
    woff2Row.meta.classList.toggle("is-failed", now === "woff2-failed");
    if (now !== "ready") zipSize.textContent = "";
    if (now === "making") { ttfRow.meta.textContent = woff2Row.meta.textContent = licenseSize.textContent = ""; check.update(null, "", false); }
    if (now === "woff2") woff2Row.meta.textContent = "";
    if (now === "woff2-failed") woff2Row.meta.textContent = "failed";
  };

  const fail = (now: "failed" | "woff2-failed", e: MakeError) => {
    errorTitle.textContent = now === "failed" ? "Couldn't make the font file" : "Couldn't make the WOFF2 file";
    errorBody.textContent = now === "failed" ? e.message
      : /memory|RangeError/i.test(e.message) ? "Not enough memory in this tab. Download only the TTF, or close other tabs and try again."
      : "Download only the TTF, or try again.";
    errorCode.textContent = `Code ${now === "failed" ? "FB-BUILD-01" : "FB-BUILD-02"} (${e.code})`;
    state(now);
  };

  /** Makes the TTF (and the license), then whatever the chosen formats still need. */
  async function make() {
    const id = ++job;
    const s = store.get();
    const n = names!;
    stopWoff2();
    made = zip = null;
    state("making");
    try {
      const [{ bytes: ttf, turkishFix }, license] = await Promise.all([
        makeFont(s.font, s.settings.axes, n, s.settings.subset),
        fetchBytes(s.font.licenseFile).catch(() => { throw new MakeError("LOAD_FAILED", "The license file didn't load. Check your connection and try again."); }),
      ]);
      if (id !== job) return;
      made = { ttf, license };
      ttfRow.meta.textContent = size(ttf.length);
      check.update(ttf, `${fileStem(n)}.ttf`, turkishFix);
      licenseSize.textContent = size(license.length);
    } catch (err) {
      if (id === job) fail("failed", err instanceof MakeError ? err : new MakeError("INSTANCE_FAILED", String(err)));
      return;
    }
    await pack(id);
  }

  /** Makes the WOFF2 when it is chosen and missing, then the ZIP of the chosen files. */
  async function pack(id = job) {
    if (!made || !names) return;
    const m = made, n = names;
    if (formats().includes("woff2") && !m.woff2) {
      state("woff2");
      try {
        m.woff2 = await makeWoff2(m.ttf);
      } catch (err) {
        const e = err instanceof MakeError ? err : new MakeError("WOFF2_FAILED", String(err));
        if (id === job && e.code !== "CANCELLED") fail("woff2-failed", e);
        return;
      }
      if (id !== job) return;
    }
    if (m.woff2) woff2Row.meta.textContent = size(m.woff2.length);
    const chosen = formats();
    const bytes = await makeZip(downloadFiles(n, { ...(chosen.includes("ttf") ? { ttf: m.ttf } : {}), ...(chosen.includes("woff2") ? { woff2: m.woff2! } : {}) }, m.license));
    if (id !== job) return;
    zip = new Blob([bytes as BlobPart], { type: "application/zip" });
    zipSize.textContent = size(bytes.length);
    state("ready");
  }

  const saveBlob = (blob: Blob, name: string) => {
    const a = h("a", { href: URL.createObjectURL(blob), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const saveZip = () => { if (zip && names) saveBlob(zip, `${fileStem(names)}.zip`); };
  async function saveTtfOnly() {
    if (!made || !names) return;
    const bytes = await makeZip(downloadFiles(names, { ttf: made.ttf }, made.license));
    saveBlob(new Blob([bytes as BlobPart], { type: "application/zip" }), `${fileStem(names)}.zip`);
  }

  // Typing a name or moving a slider remakes the file after a short pause, only while the panel is open.
  const later = () => { clearTimeout(timer); timer = window.setTimeout(make, 250); };
  panel.addEventListener("toggle", (e) => {
    const open = (e as ToggleEvent).newState === "open";
    button.setAttribute("aria-expanded", String(open));
    if (open) { show(); void make(); } else { clearTimeout(timer); job++; stopWoff2(); main.hidden = false; check.panel.hidden = true; }
  });
  button.setAttribute("aria-expanded", "false");

  store.subscribe((now, before) => {
    const remake = now.font !== before.font || now.settings.axes !== before.settings.axes || now.settings.subset !== before.settings.subset || now.name !== before.name;
    const repack = now.settings.formats !== before.settings.formats;
    if (!remake && !repack) return;
    show();
    if (!panel.matches(":popover-open")) return;
    if (remake) { stopWoff2(); job++; state("making"); later(); }
    else if (made) { zip = null; void pack(++job); }
  });
  show();
  return { button, panel };
}
