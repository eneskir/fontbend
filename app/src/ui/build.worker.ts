/// <reference types="vite/client" />
import wasmUrl from "harfbuzzjs/dist/harfbuzz-subset.wasm?url";
import type { Axis } from "../core/axis";
import { BuildError, buildFont } from "../core/build";
import { loadInstancer, type Instancer } from "../core/harfbuzz";
import type { MadeNames } from "../core/download";
import type { AxisSetting } from "../core/settings";
import type { Subset } from "../core/subsets";

export type BuildRequest = {
  id: number;
  original: Uint8Array;
  stretched: Uint8Array | null;
  axes: readonly Axis[];
  settings: Record<string, AxisSetting>;
  names: MadeNames;
  subset: Subset;
};
export type BuildReply = { id: number; bytes: Uint8Array; turkishFix: boolean } | { id: number; error: string; message: string };

/** Why HarfBuzz did not load, for the code the panel shows: the user's sentence stays the same. */
class LoadError extends Error {
  constructor(readonly code: string) { super(code); }
}

// HarfBuzz (0.7 MB) loads with the first build, so only people who open Download fetch it.
let hb: Promise<Instancer> | null = null;
const instancer = () => {
  hb ??= fetch(wasmUrl)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new LoadError(`HTTP_${r.status}`))), () => Promise.reject(new LoadError("NETWORK")))
    .then((b) => loadInstancer(b).catch(() => Promise.reject(new LoadError("WASM_FAILED"))));
  hb.catch(() => { hb = null; });
  return hb;
};

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (e: MessageEvent<BuildRequest>) => {
  const { id, original, stretched, axes, settings, names, subset } = e.data;
  let maker: Instancer;
  try {
    maker = await instancer();
  } catch (err) {
    const code = err instanceof LoadError ? err.code : "LOAD_FAILED";
    scope.postMessage({ id, error: code, message: "The font builder didn't load. Check your connection and try again." } satisfies BuildReply);
    return;
  }
  try {
    const { bytes, turkishFix } = buildFont(maker, { original, stretched, axes }, settings, names, subset);
    scope.postMessage({ id, bytes, turkishFix } satisfies BuildReply, [bytes.buffer]);
  } catch (err) {
    const reply: BuildReply = err instanceof BuildError
      ? { id, error: err.code, message: err.message }
      : { id, error: "INSTANCE_FAILED", message: err instanceof Error ? err.message : String(err) };
    scope.postMessage(reply);
  }
};
