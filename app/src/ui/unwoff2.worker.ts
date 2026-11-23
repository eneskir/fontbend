import decompress from "woff2-encoder/decompress";
import type { Woff2Reply, Woff2Request } from "./woff2.worker";

// The WOFF2 decoder builds functions from strings, which the page's Content-Security-Policy
// forbids; a worker of its own runs under the looser policy _headers gives the woff2 folder.
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (e: MessageEvent<Woff2Request>) => {
  const { id, bytes: woff2 } = e.data;
  try {
    // A copy: the decoder hands back a view of its own memory.
    const bytes = (await decompress(woff2)).slice();
    scope.postMessage({ id, bytes } satisfies Woff2Reply, [bytes.buffer]);
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) } satisfies Woff2Reply);
  }
};
