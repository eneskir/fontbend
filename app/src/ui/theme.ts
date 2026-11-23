/**
 * Fontbend opens dark. The Theme menu at the foot of the drawer picks the interface's colours (Match system,
 * Light or Dark) and, apart from them, the canvas's (Same as interface, Light or Dark), so a sample can be
 * read on either ground. Both picks are remembered on this device only.
 */
import { t, type Key } from "../i18n";
import { h } from "./dom";
import { footMenu } from "./menu";

export type Theme = "dark" | "light" | "system";
export type CanvasTheme = "same" | "light" | "dark";
const THEMES: readonly [Theme, Key][] = [["system", "theme.system"], ["light", "theme.light"], ["dark", "theme.dark"]];
const CANVAS_THEMES: readonly [CanvasTheme, Key][] = [["same", "theme.same"], ["light", "theme.light"], ["dark", "theme.dark"]];
const KEY = "fontbend.theme";
const CANVAS_KEY = "fontbend.canvas";
const lightSystem = window.matchMedia("(prefers-color-scheme: light)");

const saved = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const remember = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* not remembered; the choice still holds until the page closes */ }
};

/** The saved interface pick; dark when there is none or storage is blocked. */
export function savedTheme(): Theme {
  const v = saved(KEY);
  return v === "light" || v === "system" ? v : "dark";
}

/** The saved canvas pick; the interface's colours when there is none. */
export function savedCanvasTheme(): CanvasTheme {
  const v = saved(CANVAS_KEY);
  return v === "light" || v === "dark" ? v : "same";
}

/** Sets the page to the colours a pick resolves to; System follows the computer, also when it changes. */
export function applyTheme(theme: Theme): void {
  const light = theme === "light" || (theme === "system" && lightSystem.matches);
  document.documentElement.dataset.theme = light ? "light" : "dark";
}

/** Gives the canvas its own colours, or hands it back to the interface's. */
export function applyCanvasTheme(canvas: CanvasTheme): void {
  if (canvas === "same") delete document.documentElement.dataset.canvas;
  else document.documentElement.dataset.canvas = canvas;
}

function group<T extends string>(name: string, legend: Key, choices: readonly [T, Key][], current: T, choose: (value: T) => void): HTMLElement {
  return h("fieldset", { class: "menu-options" },
    h("legend", { class: "meta" }, t(legend)),
    ...choices.map(([value, label]) =>
      h("label", { class: "menu-option" },
        h("input", { type: "radio", name, value, checked: value === current, onchange: () => choose(value) }),
        t(label))));
}

/** The Theme button and its menu: the interface's three choices, then the canvas's. */
export function themeMenu(): HTMLElement {
  let theme = savedTheme();
  const canvas = savedCanvasTheme();
  applyTheme(theme);
  applyCanvasTheme(canvas);
  lightSystem.addEventListener("change", () => applyTheme(theme));

  const interfaceGroup = group("theme", "theme.interface", THEMES, theme, (next) => {
    theme = next;
    applyTheme(theme);
    remember(KEY, theme);
  });
  const canvasGroup = group("canvas-theme", "theme.canvas", CANVAS_THEMES, canvas, (next) => {
    applyCanvasTheme(next);
    remember(CANVAS_KEY, next);
  });
  return footMenu("theme-menu", t("theme.title"), [h("span", { class: "icon icon-theme", "aria-hidden": "true" }), t("theme.title")],
    [interfaceGroup, h("hr", { class: "rule menu-rule" }), canvasGroup]);
}
