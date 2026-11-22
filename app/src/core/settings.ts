/**
 * Everything the user chose for one font. History and share links (phase 8) will store it as
 * text, so the text carries a version: a link made today must still open after the model grows.
 */
import { ID, TAG } from "./catalog";
import { SUBSETS, type Subset } from "./subsets";

export type AxisSetting = number | readonly [min: number, max: number];

export type FontSettings = {
  readonly schemaVersion: 1;
  /** A catalog font by id, or the user's own file by the SHA-256 of its bytes. */
  readonly source: { readonly kind: "catalog"; readonly id: string } | { readonly kind: "local"; readonly sha256: string };
  /** Axes left out keep the font's default. A range keeps the axis variable. */
  readonly axes: Readonly<Record<string, AxisSetting>>;
  readonly subset: Subset;
  readonly formats: readonly ("ttf" | "woff2")[];
};

export type Decoded = { readonly ok: true; readonly settings: FontSettings } | { readonly ok: false; readonly error: string };

const NUMBER = "-?\\d+(?:\\.\\d+)?";
const VALUE = new RegExp(`^(${NUMBER})(?:\\.\\.(${NUMBER}))?$`);
export const FORMATS = ["ttf", "woff2"] as const;
const RESERVED = new Set(["v", "f", "sub", "out"]);

/** Short, readable text for a link, keys sorted: v=1&f=fraunces&wdth=75..120&wght=640&sub=western&out=ttf%2Cwoff2 */
export function encodeSettings(s: FontSettings): string {
  const p = new URLSearchParams();
  p.set("v", String(s.schemaVersion));
  p.set("f", s.source.kind === "catalog" ? s.source.id : `local:${s.source.sha256}`);
  for (const tag of Object.keys(s.axes).sort()) {
    const v = s.axes[tag]!;
    p.set(tag, typeof v === "number" ? String(v) : `${v[0]}..${v[1]}`);
  }
  p.set("sub", s.subset);
  p.set("out", s.formats.join(","));
  return p.toString();
}

/** Reads text from a link or from history. Anything it does not understand is an error, never a guess. */
export function decodeSettings(text: string): Decoded {
  const p = new URLSearchParams(text);
  const err = (error: string): Decoded => ({ ok: false, error });
  if (p.get("v") !== "1") return err(`unsupported version ${p.get("v") ?? "(none)"}`);

  const f = p.get("f") ?? "";
  const local = /^local:([0-9a-f]{64})$/.exec(f);
  const source = local ? { kind: "local" as const, sha256: local[1]! }
    : ID.test(f) ? { kind: "catalog" as const, id: f } : undefined;
  if (!source) return err(`bad font ${JSON.stringify(f)}`);

  const axes: Record<string, AxisSetting> = {};
  for (const [key, raw] of p) {
    if (RESERVED.has(key)) continue;
    const m = VALUE.exec(raw);
    if (!TAG.test(key) || !m) return err(`bad axis ${key}=${raw}`);
    if (key in axes) return err(`axis ${key} given twice`);
    const lo = Number(m[1]), hi = m[2] === undefined ? undefined : Number(m[2]);
    if (hi !== undefined && hi < lo) return err(`axis ${key} range runs backwards`);
    axes[key] = hi === undefined ? lo : [lo, hi];
  }

  const subset = p.get("sub");
  if (!SUBSETS.includes(subset as Subset)) return err(`bad subset ${subset ?? "(none)"}`);
  const formats = (p.get("out") ?? "").split(",");
  if (!formats.every((x): x is (typeof FORMATS)[number] => (FORMATS as readonly string[]).includes(x)) || new Set(formats).size !== formats.length) {
    return err(`bad formats ${p.get("out") ?? "(none)"}`);
  }
  return { ok: true, settings: { schemaVersion: 1, source, axes, subset: subset as Subset, formats } };
}
