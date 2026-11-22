/// <reference types="vite/client" />
import wasmUrl from "harfbuzzjs/dist/harfbuzz-subset.wasm?url";
import type { Axis } from "../core/axis";
import { BuildError, buildFont } from "../core/build";
import { loadInstancer, type Instancer } from "../core/harfbuzz";
import type { MadeNames } from "../core/download";
import type { AxisSetting } from "../core/settings";

export type BuildRequest = {
  id: number;
  original: Uint8Array;
  stretched: Uint8Array | null;
  axes: readonly Axis[];
  settings: Record<string, AxisSetting>;
  names: MadeNames;
};
export type BuildReply = { id: number; bytes: Uint8Array } | { id: number; error: string; message: string };

// HarfBuzz (0.7 MB) loads with the first build, so only people who open Download fetch it.
let hb: Promise<Instancer> | null = null;
const instancer = () => {
  hb ??= fetch(wasmUrl).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HarfBuzz did not load (${r.status})`)))).then(loadInstancer);
  hb.catch(() => { hb = null; });
  return hb;
};

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (e: MessageEvent<BuildRequest>) => {
  const { id, original, stretched, axes, settings, names } = e.data;
  let maker: Instancer;
  try {
    maker = await instancer();
  } catch {
    scope.postMessage({ id, error: "LOAD_FAILED", message: "The part of Fontbend that makes font files didn't load. Check your connection and try again." } satisfies BuildReply);
    return;
  }
  try {
    const bytes = buildFont(maker, { original, stretched, axes }, settings, names);
    scope.postMessage({ id, bytes } satisfies BuildReply, [bytes.buffer]);
  } catch (err) {
    const reply: BuildReply = err instanceof BuildError
      ? { id, error: err.code, message: err.message }
      : { id, error: "INSTANCE_FAILED", message: err instanceof Error ? err.message : String(err) };
    scope.postMessage(reply);
  }
};
