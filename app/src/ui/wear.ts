import { wearSettings } from "../core/wear";
import type { Store } from "../store";
import { drawnSettings, loadStems } from "./drawn";
import { loadPreview, loadStretched, previewFamily, stretchedFamily } from "./faces";

/**
 * Sets the interface (`root`) in the font being made, within core/wear's readable band, and the
 * font's name (`name`) with its exact settings. Until the font has arrived, or if it fails, the
 * interface keeps its own font; the stretched font, which also draws Width and Slant, takes over
 * when ready.
 */
export function wear(store: Store, root: HTMLElement, name: HTMLElement) {
  // Setting the whole interface again takes about 12 ms per value (measured 23.11 on Fraunces), so
  // while a slider moves only the name follows; the interface catches up once the value rests,
  // as the sample's smaller lines do (ui/preview.ts).
  let rest = 0;
  const axes = (now: boolean) => {
    const s = store.get();
    name.style.setProperty("--name-axes", drawnSettings(s));
    clearTimeout(rest);
    const ui = () => root.style.setProperty("--wear-axes", wearSettings(s.font.axes, s.settings.axes));
    if (now) ui();
    else rest = window.setTimeout(ui, 150);
  };
  const family = (f: string | null) => {
    if (f) root.style.setProperty("--wear", `"${f}"`);
    else root.style.removeProperty("--wear");
  };
  const load = () => {
    const font = store.get().font;
    family(null);
    const current = () => store.get().font === font;
    loadPreview(font).then(() => {
      if (current()) family(previewFamily(font));
      return Promise.all([loadStretched(font), loadStems(font)]).then(() => { if (current()) { family(stretchedFamily(font)); axes(true); } });
    }).catch(() => undefined); // the preview says what failed; the interface keeps its own font
  };

  axes(true);
  load();
  store.subscribe((now, before) => {
    if (now.font !== before.font) { load(); axes(true); }
    else if (now.settings !== before.settings) axes(false);
  });
}
