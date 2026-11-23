import { reach, type Axis } from "../core/axis";
import { stretchFont } from "../core/stretch";
import { addAxes } from "../core/synth";

// Stretching takes up to about 0.7 s on the largest catalog fonts (measured 22.11), and adding
// Width and Slant up to about 5 s in Node (Recursive, 23.11), so it runs here instead of the
// page's main thread. The added axes cover their sliders' whole reach.
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (e: MessageEvent<{ id: number; bytes: Uint8Array; synthetic: readonly Axis[] }>) => {
  const { id, bytes, synthetic } = e.data;
  try {
    const add = synthetic.map((a) => ({ tag: a.tag as "wdth" | "slnt", default: a.default, ...reach(a) }));
    const out = addAxes(stretchFont(bytes).bytes, add);
    scope.postMessage({ id, bytes: out }, [out.buffer]);
  } catch (err) {
    scope.postMessage({ id, error: String(err) });
  }
};
