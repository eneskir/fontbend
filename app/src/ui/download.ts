import { FAMILY_MAX, defaultFamily, downloadFiles, fileStem, madeNames, type MadeNames } from "../core/download";
import type { CatalogFont } from "../core/catalog";
import { setFormat, setSubset, type Format } from "../core/editor";
import { oflText } from "../core/open";
import { drawnSettings } from "./drawn";
import { SUBSETS, type Subset } from "../core/subsets";
import { makeZip } from "../core/zip";
import type { Store } from "../store";
import { num, t } from "../i18n";
import { h } from "./dom";
import { characterCheck, subsetLabel } from "./charcheck";
import { fetchBytes, previewFamily, stretchedFamily } from "./faces";
import { MakeError, makeFont, makeWoff2, stopWoff2 } from "./maker";

const size = (n: number) => (n < 1024 * 1024 ? t("unit.kb", { n: Math.max(1, Math.round(n / 1024)) }) : t("unit.mb", { n: num(Number((n / 1024 / 1024).toFixed(2))) }));

/** What a failed build says, by its code; the code itself is shown under it. */
function failText(e: MakeError, family: string): string {
  if (e.code === "FONT_FAILED") return t("build.fontFailed", { family });
  if (e.code === "LICENSE_FAILED") return t("build.licenseFailed");
  if (e.code === "STRETCH_FAILED") return t("build.stretchFailed");
  if (e.code === "WORKER_STOPPED") return t("build.stopped");
  if (e.code === "NETWORK" || e.code === "WASM_FAILED" || e.code === "LOAD_FAILED" || e.code.startsWith("HTTP_")) return t("build.builderFailed");
  return t("build.other");
}

type Made = { ttf: Uint8Array; license: Uint8Array | null; woff2?: Uint8Array };

/**
 * The OFL.txt that goes with the font: the catalog's own, or for an opened OFL file its copyright
 * over the same license text; none for a file whose license Fontbend can't tell.
 */
async function licenseFor(font: CatalogFont): Promise<Uint8Array | null> {
  if (font.local?.license === "unknown") return null;
  const bytes = await fetchBytes(font.licenseFile);
  return font.local ? new TextEncoder().encode(oflText(font.copyright, new TextDecoder().decode(bytes))) : bytes;
}

/** The Download button in the app bar and the panel it opens: name, files, license, then the ZIP. */
export function download(store: Store): { button: HTMLElement; panel: HTMLElement } {
  const button = h("button", { class: "primary-button has-caret", type: "button", popovertarget: "download", "aria-haspopup": "dialog" }, t("app.download"));

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
  const licenseRow = h("li", { class: "file is-locked" }, h("span", { class: "lock", "aria-hidden": "true" }), h("span", { class: "file-name" }, "OFL.txt"), h("span", { class: "meta" }, t("download.required")), licenseSize);
  const licenseTitle = h("summary", { class: "label" });
  const licenseText = h("p", {});
  const signature = h("p", { class: "meta" }, t("download.signature"));
  const progressText = h("p", { class: "meta" });
  const progress = h("div", { class: "download-progress", hidden: true }, h("div", { class: "progress-bar" }), progressText);
  const errorTitle = h("p", { class: "label notice-title" });
  const errorBody = h("p", { class: "meta" });
  const errorCode = h("p", { class: "meta notice-code" });
  const ttfOnly = h("button", { class: "primary-button", type: "button", onclick: () => void saveTtfOnly() }, t("download.ttfOnly"));
  const retry = h("button", { class: "text-button", type: "button", onclick: () => void make() }, t("common.tryAgain"));
  const notice = h("div", { class: "notice", role: "alert", hidden: true }, errorTitle, errorBody, errorCode, h("div", { class: "notice-actions" }, ttfOnly, retry));
  const zipSize = h("span", { class: "button-meta" });
  const save = h("button", { class: "primary-button is-wide", type: "button", disabled: true, onclick: () => saveZip() }, t("download.zip"), zipSize);

  const main = h("div", { class: "download-main" },
    h("div", { class: "download-head" }, h("h2", { id: "download-title", class: "title" }, t("download.title")), preview),
    h("div", { class: "download-field" }, h("label", { class: "meta", for: "font-name" }, t("download.fontName")), nameInput),
    h("div", { class: "download-field" },
      h("p", { class: "meta" }, t("download.files")),
      h("ul", { class: "files" },
        ttfRow.el, woff2Row.el,
        licenseRow),
      h("p", { class: "meta" }, t("download.filesHint"))),
    h("div", { class: "download-field" }, h("label", { class: "meta", for: "characters" }, t("download.characters")), h("span", { class: "select-field" }, subsetSelect)),
    check.row,
    h("details", { class: "license" }, licenseTitle, licenseText, signature),
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
    const license = s.font.local?.license ?? "ofl";
    licenseRow.hidden = license === "unknown";
    signature.hidden = license === "unknown";
    licenseTitle.textContent = t(license === "unknown" ? "download.licenseUnknown" : "download.licenseOfl");
    licenseText.textContent = license === "unknown" ? t("download.unknownText")
      : license === "reserved" ? `${t("download.oflText")} ${t("download.reservedText")}` : t("download.oflText");
    for (const [r, f] of [[ttfRow, "ttf"], [woff2Row, "woff2"]] as const) {
      r.box.checked = s.settings.formats.includes(f);
      // The last format left can't be turned off: a ZIP with only the license is no download.
      r.box.disabled = r.box.checked && s.settings.formats.length === 1;
    }
  };

  type Now = "making" | "woff2" | "ready" | "failed" | "woff2-failed";
  const state = (now: Now) => {
    progress.hidden = now !== "making" && now !== "woff2";
    progressText.textContent = t(now === "woff2" ? "download.makingWoff2" : "download.making");
    notice.hidden = now !== "failed" && now !== "woff2-failed";
    ttfOnly.hidden = now !== "woff2-failed";
    save.hidden = now === "woff2-failed";
    save.disabled = now !== "ready";
    woff2Row.meta.classList.toggle("is-failed", now === "woff2-failed");
    if (now !== "ready") zipSize.textContent = "";
    if (now === "making") { ttfRow.meta.textContent = woff2Row.meta.textContent = licenseSize.textContent = ""; check.update(null, "", false); }
    if (now === "woff2") woff2Row.meta.textContent = "";
    if (now === "woff2-failed") woff2Row.meta.textContent = t("download.fileFailed");
  };

  const fail = (now: "failed" | "woff2-failed", e: MakeError) => {
    errorTitle.textContent = t(now === "failed" ? "download.failed" : "download.woff2Failed");
    errorBody.textContent = now === "failed" ? failText(e, store.get().font.family)
      : /memory|RangeError/i.test(e.message) ? t("download.noMemory")
      : t("download.woff2Retry");
    errorCode.textContent = t("download.code", { code: now === "failed" ? "FB-BUILD-01" : "FB-BUILD-02", detail: e.code });
    if (now === "failed") console.warn(`Fontbend couldn't make the font: ${e.code} ${e.message}`);
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
        licenseFor(s.font).catch(() => { throw new MakeError("LICENSE_FAILED", "the license file didn't load"); }),
      ]);
      if (id !== job) return;
      made = { ttf, license };
      ttfRow.meta.textContent = size(ttf.length);
      check.update(ttf, `${fileStem(n)}.ttf`, turkishFix);
      licenseSize.textContent = license ? size(license.length) : "";
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
