import { expect, it } from 'vitest';
import {
  planningPositions,
  adjacentDetailPosition,
} from '../../src/renderer/features/graph/planning-layout';
it('preserves root and document coordinates as items are expanded and paged', () => {
  const closed = planningPositions(['a', 'b', 'c'], []),
    expanded = planningPositions(['a', 'b', 'c'], ['one', 'two']);
  for (const key of ['project', 'a', 'b', 'c']) expect(expanded[key]).toEqual(closed[key]);
  expect(expanded.one.x).toBeGreaterThan(expanded.b.x);
  expect(expanded.one.y).toBeLessThan(expanded.two.y);
});
it('places details alongside the card, flips left and clamps narrow screens', () => {
  expect(
    adjacentDetailPosition({ x: 100, y: 50, width: 200, height: 90 }, 1000, 600, 280, 350),
  ).toEqual({ x: 312, y: 50 });
  expect(
    adjacentDetailPosition({ x: 700, y: 550, width: 200, height: 90 }, 1000, 600, 280, 350),
  ).toEqual({ x: 408, y: 238 });
  const mobile = adjacentDetailPosition(
    { x: 200, y: 100, width: 180, height: 90 },
    300,
    600,
    276,
    350,
  );
  expect(mobile.x).toBe(12);
});
it('places expanded items beside a later document without moving earlier cards', () => {
  const ids = Array.from({ length: 24 }, (_, i) => `doc-${i}`);
  const layout = planningPositions(ids, ['a', 'b'], 'doc-23');
  expect((layout.a.y + layout.b.y) / 2).toBe(layout['doc-23'].y);
  expect(layout['doc-0']).toEqual(planningPositions(ids, [])['doc-0']);
});
