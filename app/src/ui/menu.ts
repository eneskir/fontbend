/** A button at the foot of the drawer and the menu it opens above itself (design: Theme, language). */
import { h } from "./dom";

export function footMenu(id: string, label: string, buttonContent: readonly (Node | string)[], content: readonly Node[]): HTMLElement {
  const menu = h("div", { class: "menu", id, popover: "auto", role: "dialog", "aria-label": label }, ...content);
  const button = h("button", { class: "foot-button", type: "button", popovertarget: id, "aria-haspopup": "dialog", "aria-expanded": "false" }, ...buttonContent);
  // The menu opens above the button, its left edge on the button's.
  menu.addEventListener("beforetoggle", (e) => {
    if ((e as ToggleEvent).newState !== "open") return;
    const r = button.getBoundingClientRect();
    menu.style.left = `${r.left}px`;
    menu.style.bottom = `${window.innerHeight - r.top + 4}px`;
  });
  menu.addEventListener("toggle", (e) => button.setAttribute("aria-expanded", String((e as ToggleEvent).newState === "open")));
  return h("div", { class: "foot-item" }, button, menu);
}
