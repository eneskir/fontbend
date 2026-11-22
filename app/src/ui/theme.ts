/**
 * Fontbend opens dark. The Theme menu at the foot of the drawer picks Match system, Light or Dark;
 * the pick is remembered on this device only.
 */
import { h } from "./dom";

export type Theme = "dark" | "light" | "system";
const THEMES: readonly [Theme, string][] = [["system", "Match system"], ["light", "Light"], ["dark", "Dark"]];
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
      label));
  const menu = h("div", { class: "menu", id: "theme-menu", popover: "auto", role: "dialog", "aria-label": "Theme" },
    h("fieldset", { class: "menu-options" }, h("legend", { class: "meta" }, "Theme"), ...options));
  const button = h("button", { class: "foot-button", type: "button", popovertarget: "theme-menu", "aria-haspopup": "dialog", "aria-expanded": "false" },
    h("span", { class: "icon icon-theme", "aria-hidden": "true" }), "Theme");

  // The menu opens above the button, its left edge on the button's.
  menu.addEventListener("beforetoggle", (e) => {
    if ((e as ToggleEvent).newState !== "open") return;
    const r = button.getBoundingClientRect();
    menu.style.left = `${r.left}px`;
    menu.style.bottom = `${window.innerHeight - r.top + 4}px`;
  });
  menu.addEventListener("toggle", (e) => button.setAttribute("aria-expanded", String((e as ToggleEvent).newState === "open")));

  return h("div", { class: "drawer-foot" }, button, menu);
}
