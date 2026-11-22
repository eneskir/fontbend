/**
 * A worker that answers numbered jobs. It starts with the first job; if it stops, every job still
 * waiting fails and the next job starts a new one, so a crash never leaves a promise unsettled.
 */
export function jobWorker<Reply extends { id: number }, Out>(
  start: () => Worker,
  settle: (reply: Reply) => Out | Error,
  stopped: () => Error,
): (message: object, transfer?: Transferable[]) => Promise<Out> {
  let worker: Worker | null = null;
  let next = 0;
  const waiting = new Map<number, { ok: (out: Out) => void; no: (e: Error) => void }>();
  const begin = () => {
    const w = start();
    w.onmessage = (e: MessageEvent<Reply>) => {
      const job = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      const out = settle(e.data);
      if (out instanceof Error) job?.no(out);
      else job?.ok(out);
    };
    w.onerror = () => {
      for (const job of waiting.values()) job.no(stopped());
      waiting.clear();
      w.terminate();
      worker = null;
    };
    return w;
  };
  return (message, transfer = []) => new Promise<Out>((ok, no) => {
    worker ??= begin();
    const id = next++;
    waiting.set(id, { ok, no });
    worker.postMessage({ ...message, id }, transfer);
  });
}

/** Keeps one promise per key; a rejected one is forgotten so the next call tries again. */
export function once<T>(cache: Map<string, Promise<T>>, key: string, make: () => Promise<T>): Promise<T> {
  let p = cache.get(key);
  if (!p) {
    p = make();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}
