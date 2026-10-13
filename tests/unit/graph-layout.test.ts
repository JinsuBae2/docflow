import { describe, it, expect } from 'vitest';
import { detourLanes, layoutDocuments, nodeWidth } from '../../src/renderer/features/graph/layout';

describe('relationship layout', () => {
  it('orders dependencies by depth and keeps branches apart', () => {
    const layout = layoutDocuments(
      ['a', 'b', 'c', 'd'],
      [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
        { from: 'b', to: 'd' },
      ],
    );
    expect(layout.b.y).toBeGreaterThan(layout.a.y);
    expect(layout.d.y).toBeGreaterThan(layout.b.y);
    expect(layout.b.x).not.toBe(layout.c.x);
  });
  it('places cyclic and disconnected nodes once without overlapping', () => {
    const layout = layoutDocuments(
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
        { from: 'missing', to: 'c' },
      ],
    );
    expect(Object.keys(layout)).toHaveLength(3);
    expect(new Set(Object.values(layout).map((p) => `${p.x},${p.y}`)).size).toBe(3);
  });
});

describe('detour lanes', () => {
  it('routes a relation that skips a row around the cards, leaving adjacent ones alone', () => {
    const links = [
      { id: 'ab', from: 'a', to: 'b' },
      { id: 'bc', from: 'b', to: 'c' },
      { id: 'ac', from: 'a', to: 'c' },
    ];
    const layout = layoutDocuments(['a', 'b', 'c'], links);
    const lanes = detourLanes(layout, links);
    expect(Object.keys(lanes)).toEqual(['ac']);
    expect(lanes.ac).toBeGreaterThan(layout.b.x + nodeWidth);
  });
  it('routes upward and same-row relations past cards in between, stacking lanes apart', () => {
    const lanes = detourLanes(
      {
        a: { x: 0, y: 0 },
        b: { x: 0, y: 200 },
        c: { x: 0, y: 400 },
        d: { x: 280, y: 400 },
        e: { x: 560, y: 400 },
      },
      [
        { id: 'ca', from: 'c', to: 'a' },
        { id: 'ba', from: 'b', to: 'a' },
        { id: 'ce', from: 'c', to: 'e' },
        { id: 'cd', from: 'c', to: 'd' },
      ],
    );
    expect(Object.keys(lanes)).toEqual(['ca', 'ce']);
    expect(lanes.ca).toBeGreaterThan(560 + nodeWidth);
    expect(Math.abs(lanes.ce - lanes.ca)).toBeGreaterThanOrEqual(30);
  });
});
