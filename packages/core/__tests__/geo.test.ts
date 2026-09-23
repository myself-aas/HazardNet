/**
 * Unit tests for geospatial helpers.
 */

import {
  pointInPolygon,
  pointInMultiPolygon,
  pointInBoundingBox,
  haversineDistanceMeters,
  coarseLocationKey,
  findContainingPolygon,
} from '../src/geo';

// A simple square representing Kurigram-ish area (not a real polygon, just a sanity box).
const SQUARE: [number, number][] = [
  [88.0, 25.5],
  [89.5, 25.5],
  [89.5, 26.5],
  [88.0, 26.5],
];

describe('pointInBoundingBox', () => {
  it('returns true for points inside the box', () => {
    expect(pointInBoundingBox([88.75, 26.0], SQUARE)).toBe(true);
  });
  it('returns false for outside points', () => {
    expect(pointInBoundingBox([90.0, 26.0], SQUARE)).toBe(false);
    expect(pointInBoundingBox([88.75, 24.0], SQUARE)).toBe(false);
  });
  it('handles empty polygon', () => {
    expect(pointInBoundingBox([88.75, 26.0], [])).toBe(false);
  });
});

describe('pointInPolygon', () => {
  it('finds interior points', () => {
    expect(pointInPolygon([88.75, 26.0], SQUARE)).toBe(true);
    expect(pointInPolygon([89.49, 26.49], SQUARE)).toBe(true);
  });
  it('rejects exterior points', () => {
    expect(pointInPolygon([89.6, 26.0], SQUARE)).toBe(false);
    expect(pointInPolygon([88.75, 27.0], SQUARE)).toBe(false);
  });
  it('treats points exactly on a vertex as inside', () => {
    expect(pointInPolygon([88.0, 25.5], SQUARE)).toBe(true);
    expect(pointInPolygon([89.5, 26.5], SQUARE)).toBe(true);
  });
});

describe('pointInMultiPolygon', () => {
  it('returns true if point is in any polygon', () => {
    const otherSquare: [number, number][] = [
      [90.0, 20.0],
      [91.0, 20.0],
      [91.0, 21.0],
      [90.0, 21.0],
    ];
    expect(pointInMultiPolygon([90.5, 20.5], [SQUARE, otherSquare])).toBe(true);
    expect(pointInMultiPolygon([88.75, 26.0], [SQUARE, otherSquare])).toBe(true);
    expect(pointInMultiPolygon([92.0, 26.0], [SQUARE, otherSquare])).toBe(false);
  });
});

describe('haversineDistanceMeters', () => {
  it('is zero for identical points', () => {
    expect(haversineDistanceMeters([88.5, 26.3], [88.5, 26.3])).toBeLessThan(1);
  });
  it('is ~111km per degree latitude', () => {
    const d = haversineDistanceMeters([88.5, 26.0], [88.5, 27.0]);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe('coarseLocationKey', () => {
  it('rounds to a precision', () => {
    const key = coarseLocationKey([88.5577, 26.3494], 2);
    expect(key).toBe('88.56,26.35');
  });
  it('co-locates nearby points that round to the same coarse bucket', () => {
    // Two points within the same 0.1° (~11km) bucket should share a key.
    const a = coarseLocationKey([88.53, 26.32], 1);
    const b = coarseLocationKey([88.52, 26.34], 1);
    expect(a).toBe(b);
    expect(a).toBe('88.5,26.3');
    // Points on opposite sides of a 0.1° grid line are split.
    const c = coarseLocationKey([88.56, 26.36], 1);
    expect(a).not.toBe(c);
  });
});

describe('findContainingPolygon', () => {
  it('returns the first matching polygon', () => {
    const nowhere: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const polygons = {
      nowhere,
      kurigram: SQUARE,
    };
    expect(findContainingPolygon([88.75, 26.0], polygons)).toBe('kurigram');
    expect(findContainingPolygon([0.5, 0.5], polygons)).toBe('nowhere');
    expect(findContainingPolygon([-74, 40], polygons)).toBeNull();
  });

  it('handles MultiPolygon (array of rings)', () => {
    // Two-square multipolygon
    const multi = [
      [[0, 0], [1, 0], [1, 1], [0, 1]],
      [[10, 10], [11, 10], [11, 11], [10, 11]],
    ] as [number, number][][];
    const polygons = {
      twin: multi,
    };
    expect(findContainingPolygon([0.5, 0.5], polygons)).toBe('twin');
    expect(findContainingPolygon([10.5, 10.5], polygons)).toBe('twin');
    expect(findContainingPolygon([5, 5], polygons)).toBeNull();
  });
});
