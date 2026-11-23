/** The sentence above the sample that says, in two numbers, what the changes did to the font. */
import { capitalize, num, t, withUnit } from "../i18n";
import { segments, type Glyph } from "./glyf";

/**
 * Width of the glyph's first stroke from the left, a quarter of the way up its height: the
 * left stem of an H. The scan line sits a hair off whole units so it never runs through a point.
 */
export function stemWidth(glyph: Glyph): number | null {
  const tops = glyph.points.filter((p) => p.on).map((p) => p.y);
  if (tops.length === 0) return null;
  const y = Math.max(...tops) * 0.25 + 0.37;
  const crossings: { x: number; dir: number }[] = [];
  for (const contour of segments(glyph)) {
    for (const s of contour) {
      if (s.cx === null || s.cy === null) {
        if ((s.y0 <= y && y < s.y1) || (s.y1 <= y && y < s.y0)) crossings.push({ x: s.x0 + ((y - s.y0) * (s.x1 - s.x0)) / (s.y1 - s.y0), dir: Math.sign(s.y1 - s.y0) });
        continue;
      }
      // y(t) = a t² + b t + c on t in [0, 1)
      const a = s.y0 - 2 * s.cy + s.y1, b = 2 * (s.cy - s.y0), c = s.y0 - y;
      const ts = Math.abs(a) < 1e-9 ? (b === 0 ? [] : [-c / b]) : (() => {
        const disc = b * b - 4 * a * c;
        return disc < 0 ? [] : [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)];
      })();
      for (const t of ts) {
        const slope = 2 * a * t + b;
        if (t < 0 || t >= 1 || slope === 0) continue;
        crossings.push({ x: (1 - t) ** 2 * s.x0 + 2 * t * (1 - t) * s.cx + t * t * s.x1, dir: Math.sign(slope) });
      }
    }
  }
  crossings.sort((p, q) => p.x - q.x);
  let winding = 0, start: number | null = null;
  for (const { x, dir } of crossings) {
    const was = winding;
    winding += dir;
    if (was === 0 && winding !== 0) start = x;
    else if (was !== 0 && winding === 0 && start !== null) return x - start;
  }
  return null;
}

/**
 * "Overall 5% narrower, strokes 1.7× thicker than the original." Width is the whole sample line
 * at one size, not one letter; strokes are the stem of H. A part too small to see is left out.
 */
export function resultSentence(widthRatio: number, strokeRatio: number | null): string {
  const pct = (n: number) => withUnit(num(n), "%");
  const percent = Math.round((widthRatio - 1) * 100);
  const width = percent === 0 ? null : t(percent < 0 ? "summary.narrower" : "summary.wider", { percent: pct(Math.abs(percent)) });
  const stroke = strokeRatio === null ? null
    : strokeRatio >= 1.05 ? t("summary.thicker", { ratio: num(Number(strokeRatio.toFixed(1)), 1) })
    : strokeRatio <= 0.95 ? t("summary.thinner", { percent: pct(Math.min(99, Math.round((1 - strokeRatio) * 100))) }) // a stroke still drawn is never 100% thinner
    : null;
  if (width && stroke) return t("summary.both", { width, stroke });
  if (width) return t("summary.width", { width });
  if (stroke) return capitalize(t("summary.stroke", { stroke }));
  // Unknown strokes (H not measured yet, or past a break point) are not called the same.
  return t(strokeRatio === null ? "summary.sameWidth" : "summary.same");
}
