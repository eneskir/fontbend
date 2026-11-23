/**
 * Fontbend opens dark. The Theme menu at the foot of the drawer picks Match system, Light or Dark;
 * the pick is remembered on this device only.
 */
import { t, type Key } from "../i18n";
import { h } from "./dom";
import { footMenu } from "./menu";

export type Theme = "dark" | "light" | "system";
const THEMES: readonly [Theme, Key][] = [["system", "theme.system"], ["light", "theme.light"], ["dark", "theme.dark"]];
const KEY = "fontbend.theme";
const lightSystem = window.matchMedia("(prefers-color-scheme: light)");

/** The saved pick; dark when there is none or storage is blocked. */
export function savedTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
}

/** Sets the page to the colours a pick resolves to; System follows the computer, also when it changes. */
export function applyTheme(theme: Theme): void {
  const light = theme === "light" || (theme === "system" && lightSystem.matches);
  document.documentElement.dataset.theme = light ? "light" : "dark";
}

/** The Theme button and its menu of three choices. */
export function themeMenu(): HTMLElement {
  let theme = savedTheme();
  applyTheme(theme);
  lightSystem.addEventListener("change", () => applyTheme(theme));

  const choose = (next: Theme) => {
    theme = next;
    applyTheme(theme);
    try { localStorage.setItem(KEY, theme); } catch { /* not remembered; the choice still holds until the page closes */ }
  };
  const options = THEMES.map(([value, label]) =>
    h("label", { class: "menu-option" },
      h("input", { type: "radio", name: "theme", value, checked: value === theme, onchange: () => choose(value) }),
      t(label)));
  return footMenu("theme-menu", t("theme.title"), [h("span", { class: "icon icon-theme", "aria-hidden": "true" }), t("theme.title")],
    [h("fieldset", { class: "menu-options" }, h("legend", { class: "meta" }, t("theme.title")), ...options)]);
}
