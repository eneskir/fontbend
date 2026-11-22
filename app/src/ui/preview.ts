import { breakPast } from "../core/axis";
import { axisValue, variationSettings } from "../core/editor";
import { formatValue, stepFor } from "../core/sliders";
import { resultSentence, stemWidth } from "../core/summary";
import { variableGlyph } from "../core/variation";
import type { Glyph } from "../core/glyf";
import type { CatalogFont } from "../core/catalog";
import { SAMPLES, SAMPLE_IDS, SIZES, WATERFALL, type SampleId } from "../core/samples";
import type { Store } from "../store";
import { h } from "./dom";
import { loadPreview, loadStretched, previewFamily, stretchedFamily, stretchedFont } from "./faces";

/** The centre: the sample at the chosen size, smaller sizes under it, then a paragraph. */
export function preview(store: Store): HTMLElement {
  const sampleSelect = h("select", { class: "select", "aria-label": "Sample text", onchange: () => store.update((s) => ({ ...s, sample: sampleSelect.value as SampleId, text: null })) },
    ...SAMPLE_IDS.map((id) => h("option", { value: id }, SAMPLES[id].label)));
  const sizeSelect = h("select", { class: "select", "aria-label": "Size", onchange: () => store.update((s) => ({ ...s, size: Number(sizeSelect.value) })) },
    ...SIZES.map((px) => h("option", { value: px }, `${px} px`)));

  const main = h("p", { class: "line is-main", contenteditable: "true", spellcheck: "false", "aria-label": "Preview text, editable" });
  main.addEventListener("input", () => store.update((s) => ({ ...s, text: main.textContent ?? "" })));
  const mainSize = h("span", { class: "size meta" });
  const waterfall = WATERFALL.map((px) => h("p", { class: "line", style: `font-size: ${px}px` }));
  const paragraph = h("p", { class: "paragraph" });
  const source = h("p", { class: "source meta" });
  const status = h("p", { class: "status", role: "status" });
  const result = h("span", { class: "status-result" });
  const breaks = h("span", {});
  // The sample line once more at 64 px, in the user's values and the original's, to compare their widths.
  const yours = h("span", {}), original = h("span", {});
  const measure = h("div", { class: "measure", "aria-hidden": "true" }, yours, original);
  // H as the stretched font draws it, read once per font: its stem says how thick the strokes got.
  let stems: { font: CatalogFont; at: (values: Readonly<Record<string, number>>) => Glyph } | null = null;
  const strokeRatio = (s: ReturnType<Store["get"]>) => {
    if (stems?.font !== s.font) return null;
    const before = stemWidth(stems.at({})), after = stemWidth(stems.at(Object.fromEntries(s.font.axes.map((a) => [a.tag, axisValue(s, a.tag)]))));
    return before && after && after > 0 ? after / before : null;
  };

  // A loading message wins. Otherwise: what the changes did (or a hint while there are none), then
  // where letters start to break if a value has passed that point.
  let loadMessage = "";
  const setStatus = (message = loadMessage) => {
    loadMessage = message;
    if (loadMessage) { status.textContent = loadMessage; return; }
    const s = store.get();
    const broken = s.font.axes.map((a) => [a, breakPast(a, axisValue(s, a.tag))] as const).find(([, p]) => p !== null);
    if (Object.keys(s.settings.axes).length === 0) result.textContent = `${s.font.family} as designed. Move a slider on the right, or pick another font.`;
    else {
      original.style.fontVariationSettings = s.font.axes.map((a) => `"${a.tag}" ${a.default}`).join(", ");
      const base = original.getBoundingClientRect().width;
      const ratio = base > 0 ? yours.getBoundingClientRect().width / base : 1;
      // Past a break point the stem of H may be one of the strokes that turned inside out.
      result.textContent = resultSentence(ratio, broken ? null : strokeRatio(s));
    }
    breaks.textContent = "";
    if (broken) {
      // Named on the slider's grid, rounded toward the original, so the value named still holds and the next one breaks.
      const [axis, point] = broken, step = stepFor(axis);
      const named = point! < axis.default ? Math.ceil(point! / step - 1e-9) * step : Math.floor(point! / step + 1e-9) * step;
      breaks.textContent = ` Some letters break past ${formatValue(named, step)}.`;
    }
    status.replaceChildren(result, breaks);
  };
  const retry = h("button", { class: "text-button", type: "button", hidden: true, onclick: () => show() }, "Try again");

  const sample = h("div", { class: "sample" },
    h("div", { class: "row" }, mainSize, main),
    ...waterfall.map((line, i) => h("div", { class: "row" }, h("span", { class: "size meta" }, String(WATERFALL[i])), line)),
    h("div", { class: "row" }, h("span", { class: "size meta" }, "16"), h("div", {}, paragraph, source)),
    measure);

  const canvas = h("main", { class: "canvas" },
    h("div", { class: "toolbar" },
      h("label", { class: "field-group" }, h("span", { class: "meta" }, "Sample"), sampleSelect),
      h("label", { class: "field-group" }, h("span", { class: "meta" }, "Size"), sizeSelect)),
    h("div", { class: "status-row" }, status, retry),
    sample);

  const lineText = () => store.get().text ?? SAMPLES[store.get().sample].line;
  const fillText = () => {
    const s = store.get();
    const text = lineText();
    if (document.activeElement !== main && main.textContent !== text) main.textContent = text;
    for (const line of waterfall) line.textContent = text;
    yours.textContent = original.textContent = text;
    paragraph.textContent = SAMPLES[s.sample].paragraph;
    source.textContent = SAMPLES[s.sample].source;
    source.hidden = !SAMPLES[s.sample].source;
    // The language picks the font's own Turkish rules (dotted i, fi without the ligature).
    sample.lang = SAMPLES[s.sample].lang;
    sampleSelect.value = s.sample;
  };
  const fillSize = () => {
    const { size } = store.get();
    main.style.setProperty("--size", `${size}px`);
    mainSize.textContent = String(size);
    sizeSelect.value = String(size);
  };
  // Each new axis value makes the browser lay out every line again, once per size: about 13 ms
  // for the whole sample against 5 ms for the main line (measured 22.11 on Roboto Flex and Fraunces).
  // While a slider moves, the main line follows every value and the smaller lines catch up
  // once it rests, so a drag stays inside one 60 fps frame.
  let rest = 0;
  const fillAxes = (now: boolean) => {
    const axes = variationSettings(store.get());
    clearTimeout(rest);
    if (now) {
      main.style.removeProperty("--axes-moving");
      sample.style.setProperty("--axes", axes);
      setStatus();
    } else {
      main.style.setProperty("--axes-moving", axes);
      rest = window.setTimeout(() => fillAxes(true), 150);
    }
  };

  // The sample stays hidden until its font has arrived, so a fallback font is never shown as the user's font.
  function show() {
    const font = store.get().font;
    canvas.classList.add("is-loading");
    canvas.classList.remove("is-failed");
    setStatus(`Loading ${font.family}…`);
    retry.hidden = true;
    loadPreview(font).then(() => {
      if (store.get().font !== font) return;
      sample.style.setProperty("--family", `"${previewFamily(font)}"`);
      canvas.classList.remove("is-loading");
      setStatus("");
      // The shipped font shows at once; the stretched one, which can also draw values past the
      // font's own range, takes its place when ready (up to about 0.7 s).
      loadStretched(font).then(async () => {
        const at = variableGlyph(new Uint8Array(await stretchedFont(font)), 0x48);
        if (store.get().font !== font) return;
        stems = at ? { font, at } : null;
        sample.style.setProperty("--family", `"${stretchedFamily(font)}"`);
        setStatus();
      }, () => {
        if (store.get().font === font) setStatus(`Fontbend couldn't stretch ${font.family}, so values past its own range show at the range's end.`);
      });
    }, () => {
      if (store.get().font !== font) return;
      canvas.classList.replace("is-loading", "is-failed");
      setStatus(`${font.family} didn't load. Check your connection and try again.`);
      retry.hidden = false;
    });
  }

  fillText(); fillSize(); fillAxes(true); show();
  store.subscribe((now, before) => {
    if (now.font !== before.font) show();
    if (now.sample !== before.sample || now.text !== before.text) { fillText(); setStatus(); }
    if (now.size !== before.size) fillSize();
    if (now.font !== before.font) fillAxes(true);
    else if (now.settings !== before.settings) fillAxes(false);
  });
  return canvas;
}
