import { describe, it, expect } from 'vitest';
import { layoutDocuments } from '../../src/renderer/features/graph/layout';
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
