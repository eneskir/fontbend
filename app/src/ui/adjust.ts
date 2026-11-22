import { axisValue, resetAxes, setAxis } from "../core/editor";
import { SIMPLE_SLIDERS, axisLabel, slidersFor } from "../core/sliders";
import type { Store } from "../store";
import { h } from "./dom";
import { slider, type Slider } from "./slider";

/** The right panel: plain-word sliders for the axes people know, then every axis of the font. */
export function adjustPanel(store: Store): HTMLElement {
  const reset = h("button", { class: "text-button", type: "button", onclick: () => store.update(resetAxes) }, "Reset all");
  const simple = h("div", { class: "simple-grid" });
  const axesCount = h("span", { class: "count" });
  const expert = h("div", { class: "axis-list" });
  const panel = h("section", { class: "panel", "aria-labelledby": "adjust-title" },
    h("div", { class: "panel-head" }, h("h2", { id: "adjust-title", class: "title" }, "Adjust"), reset),
    simple,
    h("div", { class: "panel-head is-sub" }, h("h3", { class: "label" }, "Font axes", axesCount)),
    expert);

  let byTag = new Map<string, Slider[]>();
  const build = () => {
    const state = store.get();
    byTag = new Map();
    const make = (tag: string, el: (s: Slider) => void, opts: { label: string; tag?: string; showRange?: boolean }) => {
      const axis = state.font.axes.find((a) => a.tag === tag)!;
      const s = slider({ ...opts, axis, onInput: (v) => store.update((st) => setAxis(st, tag, v)) });
      byTag.set(tag, [...(byTag.get(tag) ?? []), s]);
      el(s);
    };
    simple.replaceChildren();
    for (const s of slidersFor(state.font)) make(s.tag, (sl) => simple.append(h("div", { class: "card" }, sl.el)), { label: s.label });
    simple.hidden = simple.childElementCount === 0;
    expert.replaceChildren();
    for (const a of state.font.axes) {
      const named = SIMPLE_SLIDERS.some((s) => s.tag === a.tag);
      make(a.tag, (sl) => expert.append(sl.el), { label: axisLabel(a.tag), showRange: true, ...(named ? { tag: a.tag } : {}) });
    }
  };
  const sync = () => {
    const state = store.get();
    for (const [tag, sliders] of byTag) for (const s of sliders) s.set(axisValue(state, tag));
    const changed = Object.keys(state.settings.axes).length;
    reset.disabled = changed === 0;
    axesCount.textContent = changed ? String(changed) : "";
  };

  build();
  sync();
  store.subscribe((now, before) => {
    if (now.font !== before.font) build();
    if (now.font !== before.font || now.settings !== before.settings) sync();
  });
  return panel;
}
