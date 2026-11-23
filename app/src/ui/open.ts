/**
 * The drawer's Open view (design E5): choose a font file, or drop one on the canvas. The file is
 * read on this computer (core/open); a font whose license Fontbend can't tell opens only after the
 * user says they may change it.
 */
import type { Catalog, CatalogFont } from "../core/catalog";
import { OPEN_MAX, type OpenProblem } from "../core/open";
import { num, t } from "../i18n";
import { h } from "./dom";
import { addFont, readFile, type ReadFile } from "./opened";

const MB = (n: number) => t("unit.mb", { n: Math.round(n / 1024 / 1024) });

/** What the notice says for each file Fontbend can't open, and its code where it is an error. */
function explain(problem: OpenProblem, name: string): { title: string; body: string; code: string | null } {
  switch (problem.kind) {
    case "too-big": return { title: t("open.tooBig", { file: name, size: MB(problem.bytes) }), body: t("open.tooBigBody", { max: MB(OPEN_MAX) }), code: "FB-OPEN-03" };
    case "broken": return { title: t("open.broken", { file: name }), body: t("open.brokenBody"), code: "FB-OPEN-02" };
    case "not-variable": return { title: t("open.noAxes", { file: name }), body: t("open.noAxesBody"), code: null };
    case "outlines": return { title: t("open.outlines", { file: name }), body: t("open.outlinesBody"), code: "FB-OPEN-04" };
  }
}

/**
 * `opened` gets each font once it is open and allowed. `show` brings the Open view forward, for a
 * file dropped on the canvas while another view is showing.
 */
export function openView(catalog: Catalog, opened: (font: CatalogFont) => void, show: () => void) {
  const input = h("input", { type: "file", accept: ".ttf,.otf,.woff,.woff2", hidden: true });
  const view = h("div", { class: "drawer open-view", id: "drawer-open", role: "tabpanel", "aria-label": t("drawer.open"), hidden: true });
  const choose = () => { input.value = ""; input.click(); };
  const chooseButton = (label: string, primary: boolean) =>
    h("button", { class: primary ? "primary-button is-wide" : "text-button", type: "button", onclick: choose }, label);
  const fileRow = (name: string, ...rest: Node[]) => h("p", { class: "open-file" }, h("span", { class: "file-name" }, name), ...rest);

  const idle = () => view.replaceChildren(
    h("p", {}, t("open.formats", { size: MB(OPEN_MAX) })),
    chooseButton(t("open.choose"), true),
    h("p", { class: "meta" }, t("open.orDrop")),
    h("hr", { class: "rule" }),
    h("p", { class: "meta" }, t("open.allowedOnly")));

  const failed = (problem: OpenProblem, name: string) => {
    const { title, body, code } = explain(problem, name);
    view.replaceChildren(fileRow(name),
      h("div", { class: "notice", role: "alert" }, h("p", { class: code ? "label notice-title" : "label" }, title), h("p", { class: "meta" }, body),
        ...(code ? [h("p", { class: "meta notice-code" }, t("common.code", { code }))] : [])),
      chooseButton(t("open.chooseAnother"), true));
  };

  // Fontbend can't tell the license: the user says they may change the font before it opens.
  const ask = (read: Extract<ReadFile, { ok: true }>) => {
    const allowed = h("input", { type: "checkbox", class: "check", onchange: () => { open.disabled = !allowed.checked; } });
    const open = h("button", { class: "primary-button is-wide", type: "button", disabled: true, onclick: () => finish(read) }, t("open.open"));
    view.replaceChildren(fileRow(read.fileName),
      h("div", { class: "open-question" }, h("p", { class: "label" }, t("open.question")),
        h("p", { class: "meta" }, t("open.questionBody", { file: read.fileName }))),
      h("label", { class: "open-allowed" }, allowed, t("open.allowed")),
      open, chooseButton(t("open.chooseAnother"), false));
  };

  const finish = (read: Extract<ReadFile, { ok: true }>) => {
    idle();
    opened(addFont(read, catalog));
  };

  let job = 0;
  const openFile = async (file: File) => {
    const id = ++job;
    show();
    view.replaceChildren(fileRow(file.name), h("p", { class: "meta", role: "status" }, t("open.reading")));
    const read = await readFile(file);
    if (id !== job) return;
    if (!read.ok) failed(read.problem, read.fileName);
    else if (read.file.license === "unknown") ask(read);
    else finish(read);
  };
  input.addEventListener("change", () => { const f = input.files?.[0]; if (f) void openFile(f); });

  idle();
  // Some browsers open the file picker only for an input in the page.
  document.body.append(input);
  return { view, choose, openFile };
}

/** Lets a font file be dropped on `target`, which shows "Drop to open" while one is over it. */
export function dropFiles(target: HTMLElement, onFile: (file: File) => void): void {
  const hasFile = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;
  let depth = 0;
  target.dataset.drop = t("open.drop");
  target.addEventListener("dragenter", (e) => { if (!hasFile(e)) return; e.preventDefault(); depth++; target.classList.add("is-dropping"); });
  target.addEventListener("dragover", (e) => { if (hasFile(e)) { e.preventDefault(); e.dataTransfer!.dropEffect = "copy"; } });
  target.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; target.classList.remove("is-dropping"); } });
  target.addEventListener("drop", (e) => {
    e.preventDefault();
    depth = 0;
    target.classList.remove("is-dropping");
    const file = e.dataTransfer?.files[0];
    if (file) onFile(file);
  });
  // A file dropped anywhere else would make the browser leave the page to show it.
  window.addEventListener("dragover", (e) => { if (hasFile(e)) e.preventDefault(); });
  window.addEventListener("drop", (e) => { if (hasFile(e)) e.preventDefault(); });
}
