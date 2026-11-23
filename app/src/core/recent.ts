/**
 * Recent: the fonts the user changed, kept in this browser only. Each entry holds its settings as
 * share-link text (core/link), so one reader checks both, and a font file is never stored.
 */

/** Enough for a few days' work; the list stays short enough to scan. */
export const RECENT_LIMIT = 20;

export type RecentEntry = {
  readonly id: string;
  /** When it last changed, in milliseconds since 1970. */
  readonly at: number;
  /** The settings as a share link's text. */
  readonly link: string;
  /** The name the user gave the font; null keeps the suggestion. */
  readonly name: string | null;
  /** For a font file the user opened, its file name, to ask for it again: the file itself isn't kept. */
  readonly file?: string;
};

const isEntry = (x: unknown): x is RecentEntry => {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Record<string, unknown>;
  return typeof e.id === "string" && e.id !== "" && typeof e.at === "number" && Number.isFinite(e.at)
    && typeof e.link === "string" && (e.name === null || typeof e.name === "string") && (e.file === undefined || typeof e.file === "string");
};

/**
 * Reads stored text. Missing or unreadable text is an empty list; text a later version wrote is
 * null, so this version leaves it alone instead of writing over it.
 */
export function parseRecent(text: string | null): readonly RecentEntry[] | null {
  if (text === null) return [];
  let data: unknown;
  try { data = JSON.parse(text); } catch { return []; }
  if (typeof data !== "object" || data === null) return [];
  const { v, entries } = data as { v?: unknown; entries?: unknown };
  if (typeof v === "number" && v > 1) return null;
  return v === 1 && Array.isArray(entries) ? entries.filter(isEntry) : [];
}

export const serializeRecent = (entries: readonly RecentEntry[]): string => JSON.stringify({ v: 1, entries });

/** One list from two, as another tab may have written meanwhile: each id once at its latest, newest first, at most RECENT_LIMIT. */
export function mergeRecent(a: readonly RecentEntry[], b: readonly RecentEntry[]): RecentEntry[] {
  const byId = new Map<string, RecentEntry>();
  for (const e of [...a, ...b]) {
    const known = byId.get(e.id);
    if (!known || e.at >= known.at) byId.set(e.id, e);
  }
  return [...byId.values()].sort((x, y) => y.at - x.at).slice(0, RECENT_LIMIT);
}

/** Entries under "Today", "Yesterday" or `date(day)` for older days, newest first; days in the computer's time zone. */
export function byDay(entries: readonly RecentEntry[], now: Date, date: (day: Date) => string): { readonly label: string; readonly entries: readonly RecentEntry[] }[] {
  const dayOf = (t: Date) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const today = dayOf(now), yesterday = dayOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const groups: { label: string; day: number; entries: RecentEntry[] }[] = [];
  for (const e of [...entries].sort((x, y) => y.at - x.at)) {
    const day = dayOf(new Date(e.at));
    let group = groups.at(-1);
    if (group?.day !== day) {
      group = { label: day === today ? "Today" : day === yesterday ? "Yesterday" : date(new Date(day)), day, entries: [] };
      groups.push(group);
    }
    group.entries.push(e);
  }
  return groups.map(({ label, entries }) => ({ label, entries }));
}
