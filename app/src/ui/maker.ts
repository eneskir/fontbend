import { needsStretched } from "../core/build";
import type { CatalogFont } from "../core/catalog";
import type { MadeNames } from "../core/download";
import type { AxisSetting } from "../core/settings";
import type { Subset } from "../core/subsets";
import type { BuildReply, BuildRequest } from "./build.worker";
import type { Woff2Reply, Woff2Request } from "./woff2.worker";
import { StretchError, fetchBytes, stretchedFont } from "./faces";
import { jobWorker } from "./jobs";

export class MakeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const build = jobWorker<BuildReply, Uint8Array>(
  () => new Worker(new URL("./build.worker.ts", import.meta.url), { type: "module" }),
  (r) => ("bytes" in r ? r.bytes : new MakeError(r.error, r.message)),
  () => new MakeError("WORKER_STOPPED", "The font builder stopped. Try again."),
);

/** Makes the font file in a worker; the stretched font is waited for only when a value needs it. */
export async function makeFont(font: CatalogFont, settings: Readonly<Record<string, AxisSetting>>, names: MadeNames, subset: Subset): Promise<Uint8Array> {
  const [original, stretched] = await Promise.all([
    fetchBytes(font.files.upright.path),
    needsStretched(font.axes, settings) ? stretchedFont(font).then((b) => new Uint8Array(b)) : Promise.resolve(null),
  ]).catch((err: unknown) => {
    throw err instanceof StretchError
      ? new MakeError("STRETCH_FAILED", `Fontbend couldn't stretch ${font.family} past its own range. Bring the values back inside it to download.`)
      : new MakeError("LOAD_FAILED", `${font.family} didn't load. Check your connection and try again.`);
  });
  return build({ original, stretched, axes: font.axes, settings: { ...settings }, names, subset } satisfies Omit<BuildRequest, "id">);
}

let woff2: { worker: Worker; id: number; no: (e: MakeError) => void } | null = null;
let nextWoff2 = 0;

/** The WOFF2 file of a made TTF. A new call stops the one still running, whose result is stale. */
export function makeWoff2(ttf: Uint8Array): Promise<Uint8Array> {
  stopWoff2();
  const worker = new Worker(new URL("./woff2.worker.ts", import.meta.url), { type: "module" });
  const id = nextWoff2++;
  return new Promise<Uint8Array>((ok, no) => {
    woff2 = { worker, id, no };
    const done = () => { worker.terminate(); if (woff2?.id === id) woff2 = null; };
    worker.onmessage = (e: MessageEvent<Woff2Reply>) => {
      done();
      if ("bytes" in e.data) ok(e.data.bytes);
      else no(new MakeError("WOFF2_FAILED", e.data.error));
    };
    worker.onerror = (e) => { done(); no(new MakeError("WOFF2_FAILED", e.message || "the WOFF2 maker stopped")); };
    worker.postMessage({ id, ttf } satisfies Woff2Request);
  });
}

export function stopWoff2(): void {
  if (!woff2) return;
  woff2.worker.terminate();
  woff2.no(new MakeError("CANCELLED", "replaced by a newer file"));
  woff2 = null;
}
