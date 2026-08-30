// Turning a series of percentages into the geometry of a line chart.
//
// Pure: it takes numbers and a box, and returns points and SVG path strings.
// No components, no measurement, no colours — which means the awkward parts
// (an empty series, a single point, a flat line) are testable in plain Node
// rather than by squinting at a phone.

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface PlotBox {
  readonly width: number;
  readonly height: number;
  /** Space kept inside the box for axis labels and the stroke's own width. */
  readonly padLeft: number;
  readonly padRight: number;
  readonly padTop: number;
  readonly padBottom: number;
}

/**
 * Two decimals is finer than any screen can draw and coarse enough to keep the
 * arithmetic clean. Without it a plotted 30 arrives as 30.000000000000004, and
 * every coordinate downstream inherits the dust.
 */
const round = (value: number): number => Math.round(value * 100) / 100;

/** The percentage marks the horizontal grid lines are drawn at. */
export const Y_TICKS: readonly number[] = [0, 25, 50, 75, 100];

/**
 * Maps a series of 0–100 values onto the box, in SVG coordinates.
 *
 * Y is inverted because SVG counts downwards from the top and a chart counts
 * upwards from the bottom — the single most common way a chart comes out
 * mirrored.
 *
 * A single value is placed at the left edge rather than divided by zero.
 */
export function plot(values: readonly number[], box: PlotBox): Point[] {
  const innerWidth = box.width - box.padLeft - box.padRight;
  const innerHeight = box.height - box.padTop - box.padBottom;
  const steps = Math.max(values.length - 1, 1);

  return values.map((value, index) => {
    const clamped = Math.min(Math.max(value, 0), 100);
    return {
      x: round(box.padLeft + (innerWidth * index) / steps),
      y: round(box.padTop + innerHeight * (1 - clamped / 100)),
    };
  });
}

/** The y coordinate a given percentage sits at — for grid lines and labels. */
export function yFor(percent: number, box: PlotBox): number {
  const innerHeight = box.height - box.padTop - box.padBottom;
  const clamped = Math.min(Math.max(percent, 0), 100);
  return round(box.padTop + innerHeight * (1 - clamped / 100));
}

/**
 * A smooth path through the points, as SVG.
 *
 * Catmull-Rom converted to cubic Béziers: the curve passes exactly through
 * every point, which matters when the points are real measurements rather than
 * a decorative squiggle. The control points are each neighbour-difference over
 * six, which is the standard conversion — a larger divisor flattens the curve
 * towards straight segments, a smaller one makes it overshoot and invent
 * values that were never recorded.
 */
export function smoothPath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${round(points[0].x)} ${round(points[0].y)}`;

  let path = `M ${round(points[0].x)} ${round(points[0].y)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const after = points[index + 2] ?? next;

    const c1 = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6,
    };
    const c2 = {
      x: next.x - (after.x - current.x) / 6,
      y: next.y - (after.y - current.y) / 6,
    };

    path += ` C ${round(c1.x)} ${round(c1.y)}, ${round(c2.x)} ${round(c2.y)}, ${round(next.x)} ${round(next.y)}`;
  }

  return path;
}

/**
 * The same curve, closed down to the baseline, for the fill under the line.
 *
 * A separate path rather than one closed shape used for both: stroking a closed
 * path would draw a line along the bottom and up both sides, boxing the chart in.
 */
export function areaPath(points: readonly Point[], baselineY: number): string {
  if (points.length === 0) return '';
  const line = smoothPath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${round(last.x)} ${round(baselineY)} L ${round(first.x)} ${round(baselineY)} Z`;
}

/**
 * Evenly spaced indices into a series, for labelling an axis.
 *
 * Ninety points cannot all carry a date, so this picks `count` of them
 * including both ends. Fewer points than labels asks for gives every point.
 */
export function labelIndices(length: number, count: number): number[] {
  if (length <= 0) return [];
  if (length <= count) return Array.from({ length }, (_, index) => index);
  const steps = count - 1;
  return Array.from({ length: count }, (_, index) =>
    Math.round((index * (length - 1)) / steps)
  );
}
