import { FAMILY_MAX, defaultFamily, downloadFiles, fileStem, madeNames, type MadeNames } from "../core/download";
import { variationSettings } from "../core/editor";
import { makeZip } from "../core/zip";
import type { Store } from "../store";
import { h } from "./dom";
import { fetchBytes, previewFamily, stretchedFamily } from "./faces";
import { MakeError, makeFont } from "./maker";

const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);

/** The Download button in the app bar and the panel it opens: name, files, license, then the ZIP. */
export function download(store: Store): { button: HTMLElement; panel: HTMLElement } {
  const button = h("button", { class: "primary-button has-caret", type: "button", popovertarget: "download", "aria-haspopup": "dialog" }, "Download");

  const preview = h("p", { class: "download-name" });
  const nameInput = h("input", { class: "input", id: "font-name", type: "text", maxlength: FAMILY_MAX, autocomplete: "off", spellcheck: "false" });
  nameInput.addEventListener("input", () => store.update((s) => ({ ...s, name: nameInput.value })));
  nameInput.addEventListener("change", () => store.update((s) => ({ ...s, name: madeNames(s.font, nameInput.value, s.font.axes, s.settings.axes).family })));

  const fontFile = h("span", { class: "file-name" });
  const fontSize = h("span", { class: "file-size" });
  const licenseSize = h("span", { class: "file-size" });
  const progress = h("div", { class: "download-progress", hidden: true }, h("div", { class: "progress-bar" }), h("p", { class: "meta" }, "Making the font file"));
  const errorTitle = h("p", { class: "label notice-title" }, "Couldn't make the font file");
  const errorBody = h("p", { class: "meta" });
  const errorCode = h("p", { class: "meta notice-code" });
  const retry = h("button", { class: "text-button", type: "button", onclick: () => make() }, "Try again");
  const notice = h("div", { class: "notice", role: "alert", hidden: true }, errorTitle, errorBody, errorCode, retry);
  const zipSize = h("span", { class: "button-meta" });
  const save = h("button", { class: "primary-button is-wide", type: "button", disabled: true, onclick: () => saveZip() }, "Download ZIP", zipSize);

  const panel = h("section", { class: "download", id: "download", popover: "auto", role: "dialog", "aria-labelledby": "download-title" },
    h("div", { class: "download-head" }, h("h2", { id: "download-title", class: "title" }, "Download"), preview),
    h("div", { class: "download-field" }, h("label", { class: "meta", for: "font-name" }, "Font name"), nameInput),
    h("div", { class: "download-field" },
      h("p", { class: "meta" }, "Files"),
      h("ul", { class: "files" },
        h("li", { class: "file" }, fontFile, fontSize),
        h("li", { class: "file is-locked" }, h("span", { class: "lock", "aria-hidden": "true" }), h("span", { class: "file-name" }, "OFL.txt"), h("span", { class: "meta" }, "Required by the license"), licenseSize)),
      h("p", { class: "meta" }, "Install the TTF on your computer.")),
    h("details", { class: "license" },
      h("summary", { class: "label" }, "Free for commercial work (SIL OFL 1.1)"),
      h("p", {}, "You can use and change this font in any project, logos and games included. Keep the copyright lines in the font, and don't sell the font file on its own."),
      h("p", { class: "meta" }, "Fontbend writes “Made with Fontbend” into the font's description field.")),
    progress, notice, save);

  let names: MadeNames | null = null;
  let zip: Blob | null = null;
  let job = 0;
  let timer = 0;

  const show = () => {
    const s = store.get();
    names = madeNames(s.font, s.name ?? "", s.font.axes, s.settings.axes);
    if (document.activeElement !== nameInput) nameInput.value = s.name ?? defaultFamily(s.font);
    nameInput.placeholder = defaultFamily(s.font);
    preview.textContent = names.family;
    preview.style.fontFamily = `"${stretchedFamily(s.font)}", "${previewFamily(s.font)}", sans-serif`;
    preview.style.fontVariationSettings = variationSettings(s);
    fontFile.textContent = `${fileStem(names)}.ttf`;
  };

  const state = (now: "making" | "ready" | "failed") => {
    progress.hidden = now !== "making";
    notice.hidden = now !== "failed";
    save.disabled = now !== "ready";
    if (now !== "ready") zipSize.textContent = "";
    if (now === "making") fontSize.textContent = licenseSize.textContent = "";
  };

  async function make() {
    const id = ++job;
    const s = store.get();
    const n = names!;
    zip = null;
    state("making");
    try {
      const [ttf, license] = await Promise.all([
        makeFont(s.font, s.settings.axes, n),
        fetchBytes(s.font.licenseFile).catch(() => { throw new MakeError("LOAD_FAILED", "The license file didn't load. Check your connection and try again."); }),
      ]);
      const bytes = await makeZip(downloadFiles(n, ttf, license));
      if (id !== job) return;
      zip = new Blob([bytes as BlobPart], { type: "application/zip" });
      fontSize.textContent = size(ttf.length);
      licenseSize.textContent = size(license.length);
      zipSize.textContent = size(bytes.length);
      state("ready");
    } catch (err) {
      if (id !== job) return;
      const e = err instanceof MakeError ? err : new MakeError("INSTANCE_FAILED", String(err));
      errorBody.textContent = e.message;
      errorCode.textContent = `Code FB-BUILD-01 (${e.code})`;
      state("failed");
    }
  }

  function saveZip() {
    if (!zip || !names) return;
    const a = h("a", { href: URL.createObjectURL(zip), download: `${fileStem(names)}.zip` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Typing a name or moving a slider remakes the file after a short pause, only while the panel is open.
  const later = () => { clearTimeout(timer); timer = window.setTimeout(make, 250); };
  panel.addEventListener("toggle", (e) => {
    const open = (e as ToggleEvent).newState === "open";
    button.setAttribute("aria-expanded", String(open));
    if (open) { show(); void make(); } else { clearTimeout(timer); job++; }
  });
  button.setAttribute("aria-expanded", "false");

  store.subscribe((now, before) => {
    if (now.font === before.font && now.settings === before.settings && now.name === before.name) return;
    show();
    if (panel.matches(":popover-open")) { state("making"); later(); }
  });
  show();
  return { button, panel };
}
