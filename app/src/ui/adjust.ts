import { axisValue, resetAxes, setAxis } from "../core/editor";
import { axisLabel, bigSliders, flipped, fontAxes } from "../core/sliders";
import { t } from "../i18n";
import type { Store } from "../store";
import { h } from "./dom";
import { slider, type Slider } from "./slider";

/** The right panel: Weight, Width and Slant stacked, then the font's other axes. */
export function adjustPanel(store: Store): HTMLElement {
  const reset = h("button", { class: "text-button", type: "button", onclick: () => store.update(resetAxes) }, t("adjust.reset"));
  const big = h("div", { class: "big-sliders" });
  const axesCount = h("span", { class: "count" });
  const axesOwner = h("span", { class: "owner" });
  const axesHead = h("div", { class: "panel-head is-sub" }, h("h3", { class: "label" }, t("adjust.fontAxes"), axesCount), axesOwner);
  const expert = h("div", { class: "axis-list" });
  const panel = h("section", { class: "panel", "aria-labelledby": "adjust-title" },
    h("div", { class: "panel-head" }, h("h2", { id: "adjust-title", class: "title" }, t("adjust.title")), reset),
    big, axesHead, expert);

  // Each slider with the sign it shows the axis value in (Slant shows lean to the right as positive).
  let sliders: { tag: string; sign: 1 | -1; s: Slider }[] = [];
  const build = () => {
    const state = store.get();
    sliders = [];
    big.replaceChildren();
    for (const b of bigSliders(state.font)) {
      const sign = b.flip ? -1 : 1;
      const s = slider({ label: axisLabel(b.tag), axis: b.flip ? flipped(b.axis) : b.axis, unit: b.unit, big: true, showRange: true,
        onInput: (v) => store.update((st) => setAxis(st, b.tag, sign * v)) });
      sliders.push({ tag: b.tag, sign, s });
      big.append(h("div", { class: "card" }, s.el));
    }
    expert.replaceChildren();
    const own = fontAxes(state.font);
    for (const a of own) {
      const s = slider({ label: axisLabel(a.tag), tag: a.tag, axis: a, showRange: true, onInput: (v) => store.update((st) => setAxis(st, a.tag, v)) });
      sliders.push({ tag: a.tag, sign: 1, s });
      expert.append(s.el);
    }
    axesHead.hidden = expert.hidden = own.length === 0;
    axesCount.textContent = String(own.length);
    axesOwner.textContent = t("adjust.own", { family: state.font.family });
  };
  const sync = () => {
    const state = store.get();
    for (const { tag, sign, s } of sliders) s.set(sign * axisValue(state, tag) + 0); // + 0: no −0 on the Slant ruler
    reset.disabled = Object.keys(state.settings.axes).length === 0;
  };

  build();
  // Where the big sliders sit fixed at the foot of the screen (a phone), the page keeps their height free.
  new ResizeObserver(() => {
    const fixed = getComputedStyle(big).position === "fixed";
    document.documentElement.style.setProperty("--strip", fixed ? `${big.offsetHeight}px` : "0px");
  }).observe(big);
  sync();
  store.subscribe((now, before) => {
    if (now.font !== before.font) build();
    if (now.font !== before.font || now.settings !== before.settings) sync();
  });
  return panel;
}
