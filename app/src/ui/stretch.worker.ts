import { stretchFont } from "../core/stretch";

// Stretching takes up to about 0.7 s on the largest catalog fonts (measured 22.11), so it runs
// here instead of the page's main thread.
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (e: MessageEvent<{ id: number; bytes: Uint8Array }>) => {
  const { id, bytes } = e.data;
  try {
    const out = stretchFont(bytes).bytes;
    scope.postMessage({ id, bytes: out }, [out.buffer]);
  } catch (err) {
    scope.postMessage({ id, error: String(err) });
  }
};
