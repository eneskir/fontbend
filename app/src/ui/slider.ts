import { breakPast, isBeyond, reach, type Axis } from "../core/axis";
import { formatDelta, formatValue, stepFor } from "../core/sliders";
import { t, withUnit } from "../i18n";
import { h } from "./dom";

export type Slider = { readonly el: HTMLElement; set(value: number): void };

let next = 0;

/**
 * A ruler with a triangle handle, as in the design. A native range input sits on top, unseen,
 * so the keyboard (arrows, Page Up/Down, Home/End) and screen readers work as for any slider.
 * The ruler is solid over the font's own range and dashed past it, where Fontbend goes on
 * further than the font was drawn. The hollow marker shows the original value once the value
 * moves away from it. A short red mark crosses the ruler where some letters start to break.
 * `unit` follows every number shown ("%", "°"); a big slider is one of the three at the top.
 */
export function slider(opts: { label: string; tag?: string; axis: Axis; unit?: string; big?: boolean; showRange?: boolean; onInput: (value: number) => void }): Slider {
  const { axis } = opts;
  const unit = opts.unit ?? "";
  const step = stepFor(axis);
  // The ends sit on the step grid, inside the reach, so the default stays a value the input can hold.
  const r = reach(axis);
  const lo = Math.ceil(r.min / step - 1e-9) * step, hi = Math.floor(r.max / step + 1e-9) * step;
  const id = `slider-${next++}`;
  const at = (v: number) => String((v - lo) / (hi - lo));

  const delta = h("span", { class: "slider-delta" });
  const zone = h("span", { class: "slider-zone" }, t("slider.experiment"));
  const value = h("span", { class: "slider-value" });
  const input = h("input", {
    id, type: "range", "aria-labelledby": `${id}-name`, min: lo, max: hi, step, value: axis.default,
    oninput: () => opts.onInput(input.valueAsNumber),
  });
  const track = h("div", { class: "slider-track" },
    input,
    h("span", { class: "slider-beyond" }),
    h("span", { class: "slider-base" }),
    h("span", { class: "slider-tick", style: "--at: var(--own-min)" }),
    h("span", { class: "slider-tick", style: "--at: var(--own-max)" }),
    ...[axis.breaksBelow, axis.breaksAbove].flatMap((b) => (b === undefined ? [] : [h("span", { class: "slider-break", style: `--at: ${at(b)}` })])),
    h("span", { class: "slider-original", "aria-hidden": "true" }),
    h("span", { class: "slider-handle", "aria-hidden": "true" }),
  );
  track.style.setProperty("--original", at(axis.default));
  track.style.setProperty("--own-min", at(axis.min));
  track.style.setProperty("--own-max", at(axis.max));

  const head = h("label", { class: "slider-head", for: id },
    h("span", { class: "slider-label", id: `${id}-name` }, opts.label, ...(opts.tag ? [" ", h("span", { class: "slider-tag" }, opts.tag)] : [])),
    delta, zone, value);
  const el = h("div", { class: opts.big ? "slider is-big" : "slider" }, head, track,
    ...(opts.showRange ? [h("div", { class: "slider-range", "aria-hidden": "true" }, h("span", {}, withUnit(formatValue(lo, step), unit)), h("span", {}, withUnit(formatValue(hi, step), unit)))] : []));

  function set(v: number) {
    const changed = v !== axis.default, beyond = isBeyond(axis, v);
    if (input.valueAsNumber !== v) input.value = String(v);
    track.style.setProperty("--at", at(v));
    el.classList.toggle("is-changed", changed);
    el.classList.toggle("is-beyond", beyond);
    value.textContent = withUnit(formatValue(v, step), unit);
    delta.textContent = changed ? withUnit(formatDelta(v, axis.default, step), unit) : "";
    const where = changed ? t("slider.changed", { value: value.textContent, delta: delta.textContent }) : t("slider.original", { value: value.textContent });
    input.setAttribute("aria-valuetext", breakPast(axis, v) !== null ? t("slider.pastBreaks", { where }) : beyond ? t("slider.past", { where }) : where);
  }
  set(axis.default);
  return { el, set };
}
