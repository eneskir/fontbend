import { compress } from "woff2-encoder";

export type Woff2Request = { id: number; ttf: Uint8Array };
export type Woff2Reply = { id: number; bytes: Uint8Array } | { id: number; error: string };

// Brotli takes up to about 2 s on the largest catalog font (measured 22.11), so it gets a worker
// of its own: the TTF can be remade meanwhile, and a stale run is stopped by ending the worker.
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (e: MessageEvent<Woff2Request>) => {
  const { id, ttf } = e.data;
  try {
    // A copy, so handing it over can never take the encoder's own memory with it.
    const bytes = (await compress(ttf)).slice();
    scope.postMessage({ id, bytes } satisfies Woff2Reply, [bytes.buffer]);
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) } satisfies Woff2Reply);
  }
};
