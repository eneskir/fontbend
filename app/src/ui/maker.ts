import { needsStretched } from "../core/build";
import type { CatalogFont } from "../core/catalog";
import type { MadeNames } from "../core/download";
import type { AxisSetting } from "../core/settings";
import type { BuildReply, BuildRequest } from "./build.worker";
import { fetchBytes, stretchedFont } from "./faces";

export class MakeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

let worker: Worker | null = null;
let nextJob = 0;
const jobs = new Map<number, { ok: (b: Uint8Array) => void; no: (e: MakeError) => void }>();

function start(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./build.worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<BuildReply>) => {
    const job = jobs.get(e.data.id);
    jobs.delete(e.data.id);
    if ("bytes" in e.data) job?.ok(e.data.bytes);
    else job?.no(new MakeError(e.data.error, e.data.message));
  };
  w.onerror = () => {
    for (const job of jobs.values()) job.no(new MakeError("LOAD_FAILED", "The part of Fontbend that makes font files stopped. Try again."));
    jobs.clear();
    w.terminate();
    worker = null;
  };
  worker = w;
  return w;
}

/** Makes the font file in a worker; the stretched font is waited for only when a value needs it. */
export async function makeFont(font: CatalogFont, settings: Readonly<Record<string, AxisSetting>>, names: MadeNames): Promise<Uint8Array> {
  const stretch = needsStretched(font.axes, settings);
  let original: Uint8Array, stretched: Uint8Array | null;
  try {
    [original, stretched] = await Promise.all([
      fetchBytes(font.files.upright.path),
      stretch ? stretchedFont(font).then((b) => new Uint8Array(b)) : Promise.resolve(null),
    ]);
  } catch {
    throw new MakeError("LOAD_FAILED", `${font.family} didn't load. Check your connection and try again.`);
  }
  const w = start();
  return new Promise((ok, no) => {
    const id = nextJob++;
    jobs.set(id, { ok, no });
    w.postMessage({ id, original, stretched, axes: font.axes, settings: { ...settings }, names } satisfies BuildRequest);
  });
}
