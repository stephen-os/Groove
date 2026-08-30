import { describe, expect, it } from 'vitest';
import {
  areaPath,
  labelIndices,
  niceDomain,
  plot,
  smoothPath,
  ticksFor,
  yFor,
  type PlotBox,
} from '@/lib/chart';

const box: PlotBox = {
  width: 300,
  height: 100,
  padLeft: 0,
  padRight: 0,
  padTop: 0,
  padBottom: 0,
};

describe('plot', () => {
  it('spreads points evenly across the width', () => {
    expect(plot([0, 0, 0], box).map((point) => point.x)).toEqual([0, 150, 300]);
  });

  it('inverts y, because SVG counts down and a chart counts up', () => {
    const [zero, half, full] = plot([0, 50, 100], box);
    expect(zero.y).toBe(100);
    expect(half.y).toBe(50);
    expect(full.y).toBe(0);
  });

  it('respects padding on every side', () => {
    const padded = plot([0, 100], { ...box, padLeft: 20, padRight: 10, padTop: 5, padBottom: 15 });
    expect(padded[0].x).toBe(20);
    expect(padded[1].x).toBe(290);
    expect(padded[1].y).toBe(5);
    expect(padded[0].y).toBe(85);
  });

  it('clamps values outside 0–100 rather than drawing outside the box', () => {
    const [low, high] = plot([-40, 180], box);
    expect(low.y).toBe(100);
    expect(high.y).toBe(0);
  });

  it('places a lone point at the left edge instead of dividing by zero', () => {
    const [only] = plot([50], box);
    expect(Number.isFinite(only.x)).toBe(true);
    expect(only.x).toBe(0);
  });

  it('is empty for an empty series', () => {
    expect(plot([], box)).toEqual([]);
  });
});

describe('yFor', () => {
  it('agrees with plot about where a percentage sits', () => {
    for (const percent of [0, 25, 50, 75, 100]) {
      expect(yFor(percent, box)).toBe(plot([percent], box)[0].y);
    }
  });
});

describe('smoothPath', () => {
  it('is empty for no points', () => {
    expect(smoothPath([])).toBe('');
  });

  it('is a bare move for one point', () => {
    expect(smoothPath([{ x: 5, y: 6 }])).toBe('M 5 6');
  });

  it('starts at the first point and ends exactly on the last', () => {
    const points = plot([10, 90, 30, 70], box);
    const path = smoothPath(points);
    expect(path.startsWith(`M ${points[0].x} ${points[0].y}`)).toBe(true);
    // The curve interpolates its points rather than approximating them, so the
    // final coordinate has to be the final measurement.
    expect(path.trimEnd().endsWith(`${points[3].x} ${points[3].y}`)).toBe(true);
  });

  it('emits one curve segment per gap', () => {
    const path = smoothPath(plot([0, 50, 100, 50, 0], box));
    expect((path.match(/C /g) ?? []).length).toBe(4);
  });

  it('stays flat for a flat series', () => {
    const path = smoothPath(plot([50, 50, 50, 50], box));
    // Every y in the path — points and controls alike — is the same line.
    const ys = [...path.matchAll(/[\d.]+ ([\d.]+)/g)].map((match) => Number(match[1]));
    expect(new Set(ys)).toEqual(new Set([50]));
  });
});

describe('areaPath', () => {
  it('closes the curve down to the baseline', () => {
    const points = plot([20, 80], box);
    const path = areaPath(points, 100);
    expect(path.endsWith('Z')).toBe(true);
    expect(path).toContain('L 300 100');
    expect(path).toContain('L 0 100');
  });

  it('is empty for no points', () => {
    expect(areaPath([], 100)).toBe('');
  });
});

describe('labelIndices', () => {
  it('includes both ends', () => {
    const indices = labelIndices(90, 4);
    expect(indices[0]).toBe(0);
    expect(indices[indices.length - 1]).toBe(89);
  });

  it('returns the count asked for', () => {
    expect(labelIndices(90, 4)).toHaveLength(4);
    expect(labelIndices(90, 6)).toHaveLength(6);
  });

  it('gives every point when there are fewer than the labels asked for', () => {
    expect(labelIndices(3, 5)).toEqual([0, 1, 2]);
  });

  it('is empty for an empty series', () => {
    expect(labelIndices(0, 4)).toEqual([]);
  });
});


describe('niceDomain', () => {
  it('fits a band of data instead of spanning the whole range', () => {
    const domain = niceDomain([72, 88, 79, 91]);
    expect(domain.max).toBeLessThanOrEqual(100);
    expect(domain.min).toBeGreaterThan(0);
    expect(domain.max - domain.min).toBeLessThan(100);
  });

  it('snaps its bounds outwards to round numbers', () => {
    const domain = niceDomain([72, 91]);
    expect(domain.min % 10).toBe(0);
    expect(domain.max % 10).toBe(0);
    expect(domain.min).toBeLessThanOrEqual(72);
    expect(domain.max).toBeGreaterThanOrEqual(91);
  });

  it('never leaves the percentage range', () => {
    expect(niceDomain([0, 3]).min).toBe(0);
    expect(niceDomain([98, 100]).max).toBe(100);
  });

  it('keeps a minimum span, so a steady run is not magnified into drama', () => {
    const domain = niceDomain([80, 81, 80, 82]);
    expect(domain.max - domain.min).toBeGreaterThanOrEqual(30);
  });

  it('spans everything when there is no data', () => {
    expect(niceDomain([])).toEqual({ min: 0, max: 100 });
  });

  it('handles a perfectly flat series', () => {
    const domain = niceDomain([100, 100, 100]);
    expect(domain.max).toBe(100);
    expect(domain.max - domain.min).toBeGreaterThanOrEqual(30);
  });
});

describe('ticksFor', () => {
  it('spans the domain end to end', () => {
    const ticks = ticksFor({ min: 40, max: 100 });
    expect(ticks[0]).toBe(40);
    expect(ticks[ticks.length - 1]).toBe(100);
  });

  it('returns whole numbers', () => {
    for (const tick of ticksFor({ min: 30, max: 100 })) {
      expect(Number.isInteger(tick)).toBe(true);
    }
  });

  it('never repeats a grid line', () => {
    const ticks = ticksFor({ min: 99, max: 100 });
    expect(new Set(ticks).size).toBe(ticks.length);
  });
});

describe('plot with a domain', () => {
  const tall: PlotBox = { width: 100, height: 100, padLeft: 0, padRight: 0, padTop: 0, padBottom: 0 };

  it('uses the whole height for the fitted range', () => {
    const domain = { min: 60, max: 100 };
    const [low, high] = plot([60, 100], tall, domain);
    expect(low.y).toBe(100);
    expect(high.y).toBe(0);
  });

  it('clamps to the domain rather than drawing outside the box', () => {
    const domain = { min: 60, max: 100 };
    expect(plot([10], tall, domain)[0].y).toBe(100);
  });
});
