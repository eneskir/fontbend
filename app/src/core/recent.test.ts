import { describe, expect, it } from "vitest";
import { byDay, mergeRecent, parseRecent, RECENT_LIMIT, serializeRecent, type RecentEntry } from "./recent";

const entry = (id: string, at: number, name: string | null = null): RecentEntry => ({ id, at, link: `v=1&f=inter&wght=${at % 900 + 100}&sub=all&out=ttf`, name });

describe("recent fonts", () => {
  it("reads back what it wrote", () => {
    const list = [entry("a", 3, "My Headline"), entry("b", 2)];
    expect(parseRecent(serializeRecent(list))).toEqual(list);
  });

  it("starts empty from nothing or from text it can't read, and drops entries of the wrong shape", () => {
    for (const text of [null, "", "{", "[]", "42", '{"v":1}', '{"entries":[]}']) expect(parseRecent(text), String(text)).toEqual([]);
    const mixed = JSON.stringify({ v: 1, entries: [entry("a", 1), { id: "", at: 1, link: "x", name: null }, { id: "c", at: "1", link: "x", name: null }, { id: "d", at: 1, link: "x" }] });
    expect(parseRecent(mixed)).toEqual([entry("a", 1)]);
  });

  it("leaves a later version's list alone", () => {
    expect(parseRecent('{"v":2,"entries":[]}')).toBeNull();
  });

  it("merges two tabs' lists: each font once at its latest, newest first, at most the limit", () => {
    const mine = [entry("a", 10), entry("b", 5)], theirs = [entry("b", 7, "Renamed"), entry("c", 1)];
    expect(mergeRecent(mine, theirs)).toEqual([entry("a", 10), entry("b", 7, "Renamed"), entry("c", 1)]);
    const many = Array.from({ length: RECENT_LIMIT + 5 }, (_, i) => entry(`e${i}`, i));
    const kept = mergeRecent(many, []);
    expect(kept).toHaveLength(RECENT_LIMIT);
    expect(kept[0]!.at).toBe(RECENT_LIMIT + 4);
  });

  it("groups by day in the computer's time zone", () => {
    const now = new Date(2026, 10, 23, 9, 30);
    const at = (d: number, h: number) => new Date(2026, 10, d, h).getTime();
    const groups = byDay([entry("y", at(22, 23)), entry("t1", at(23, 0)), entry("old", at(20, 12)), entry("t2", at(23, 9))], now, (d) => `day ${d.getDate()}`);
    expect(groups.map((g) => [g.label, g.entries.map((e) => e.id)])).toEqual([["Today", ["t2", "t1"]], ["Yesterday", ["y"]], ["day 20", ["old"]]]);
  });
});
