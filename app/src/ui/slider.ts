import type { Axis } from "../core/axis";
import { formatDelta, formatValue, stepFor } from "../core/sliders";
import { h } from "./dom";

export type Slider = { readonly el: HTMLElement; set(value: number): void };

let next = 0;

/**
 * A ruler with a triangle handle, as in the design. A native range input sits on top, unseen,
 * so the keyboard (arrows, Page Up/Down, Home/End) and screen readers work as for any slider.
 * The hollow marker shows the original value once the value moves away from it.
 */
export function slider(opts: { label: string; tag?: string; axis: Axis; showRange?: boolean; onInput: (value: number) => void }): Slider {
  const { axis } = opts;
  const step = stepFor(axis);
  const id = `slider-${next++}`;
  const span = axis.max - axis.min;
  const at = (v: number) => String(span > 0 ? (v - axis.min) / span : 0);

  const delta = h("span", { class: "slider-delta" });
  const value = h("span", { class: "slider-value" });
  const input = h("input", {
    id, type: "range", "aria-labelledby": `${id}-name`, min: axis.min, max: axis.max, step, value: axis.default,
    oninput: () => opts.onInput(input.valueAsNumber),
  });
  const track = h("div", { class: "slider-track" },
    input,
    h("span", { class: "slider-base" }),
    h("span", { class: "slider-tick", style: "--at: 0" }),
    h("span", { class: "slider-tick is-mid", style: "--at: 0.5" }),
    h("span", { class: "slider-tick", style: "--at: 1" }),
    h("span", { class: "slider-original", "aria-hidden": "true" }),
    h("span", { class: "slider-handle", "aria-hidden": "true" }),
  );
  track.style.setProperty("--original", at(axis.default));

  const head = h("label", { class: "slider-head", for: id },
    h("span", { class: "slider-label", id: `${id}-name` }, opts.label, ...(opts.tag ? [" ", h("span", { class: "slider-tag" }, opts.tag)] : [])),
    delta, value);
  const el = h("div", { class: "slider" }, head, track,
    ...(opts.showRange ? [h("div", { class: "slider-range", "aria-hidden": "true" }, h("span", {}, formatValue(axis.min, step)), h("span", {}, formatValue(axis.max, step)))] : []));

  function set(v: number) {
    const changed = v !== axis.default;
    if (input.valueAsNumber !== v) input.value = String(v);
    track.style.setProperty("--at", at(v));
    el.classList.toggle("is-changed", changed);
    value.textContent = formatValue(v, step);
    delta.textContent = changed ? formatDelta(v, axis.default, step) : "";
    input.setAttribute("aria-valuetext", changed ? `${value.textContent}, ${delta.textContent} from the original` : `${value.textContent}, the original`);
  }
  set(axis.default);
  return { el, set };
}
