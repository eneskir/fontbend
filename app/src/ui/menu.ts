/** A button at the foot of the drawer and the menu it opens above itself (design: Theme, language). */
import { h } from "./dom";

export function footMenu(id: string, label: string, buttonContent: readonly (Node | string)[], content: readonly Node[]): HTMLElement {
  const menu = h("div", { class: "menu", id, popover: "auto", role: "dialog", "aria-label": label }, ...content);
  const button = h("button", { class: "foot-button", type: "button", popovertarget: id, "aria-haspopup": "dialog", "aria-expanded": "false" }, ...buttonContent);
  // The menu opens above the button, its left edge on the button's. On a phone the foot sits mid-screen and
  // a long menu (eight languages) ran off the top, out of reach: it opens on the side with more room and
  // scrolls inside it.
  menu.addEventListener("beforetoggle", (e) => {
    if ((e as ToggleEvent).newState !== "open") return;
    const r = button.getBoundingClientRect();
    const gap = 4, edge = 8;
    const above = r.top - gap - edge, below = window.innerHeight - r.bottom - gap - edge;
    const up = above >= below;
    menu.style.left = `${r.left}px`;
    menu.style.top = up ? "auto" : `${r.bottom + gap}px`;
    menu.style.bottom = up ? `${window.innerHeight - r.top + gap}px` : "auto";
    menu.style.maxHeight = `${Math.max(0, up ? above : below)}px`;
  });
  menu.addEventListener("toggle", (e) => button.setAttribute("aria-expanded", String((e as ToggleEvent).newState === "open")));
  return h("div", { class: "foot-item" }, button, menu);
}
