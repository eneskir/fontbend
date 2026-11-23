/** The drawer's views, picked by tabs on its top bar (design: Fonts, Recent, Open). */
import { t } from "../i18n";
import { h } from "./dom";

export type DrawerView = {
  readonly id: string;
  readonly label: string;
  readonly icon: HTMLElement;
  readonly panel: HTMLElement;
  /** Called each time the view opens. */
  readonly shown?: () => void;
};

/** The tab bar; the first view starts open. `select` opens a view by id. */
export function drawerTabs(views: readonly DrawerView[]): { readonly bar: HTMLElement; readonly select: (id: string) => void } {
  const tabs = views.map((v) => h("button", { class: "foot-button drawer-tab", type: "button", role: "tab", id: `tab-${v.id}`, "aria-controls": v.panel.id, onclick: () => select(v.id) }, v.icon, v.label));
  const select = (id: string) => views.forEach((v, i) => {
    const on = v.id === id;
    tabs[i]!.setAttribute("aria-selected", String(on));
    tabs[i]!.tabIndex = on ? 0 : -1;
    v.panel.hidden = !on;
    if (on) v.shown?.();
  });
  // Arrow keys move between tabs, as in any tab list.
  const bar = h("div", { class: "drawer-tabs", role: "tablist", "aria-label": t("drawer.tabs"), onkeydown: (e) => {
    const key = (e as KeyboardEvent).key, i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0 || (key !== "ArrowRight" && key !== "ArrowLeft")) return;
    const next = (i + (key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
    select(views[next]!.id);
    tabs[next]!.focus();
  } }, ...tabs);
  select(views[0]!.id);
  return { bar, select };
}
