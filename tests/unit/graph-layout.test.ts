import { expect, it } from 'vitest';
import { layoutProjectMap } from '../../src/renderer/features/graph/layout';
import type { ProjectMap } from '../../src/shared/project-map';
const map: ProjectMap = {
  projectId: 'p',
  positions: [],
  collapsedDocumentIds: [],
  legendCollapsed: false,
  nodes: [
    { id: 'r', kind: 'root', origin: 'source', title: '루트' },
    ...Array.from({ length: 24 }, (_, i) => ({
      id: `d${i}`,
      kind: 'document' as const,
      origin: 'source' as const,
      title: `문서 ${i}`,
    })),
    ...Array.from({ length: 720 }, (_, i) => ({
      id: `s${i}`,
      kind: 'section' as const,
      documentId: `d${i % 24}`,
      origin: 'source' as const,
      title: '절',
    })),
  ],
  edges: [],
};
it('lays out document cards only in a balanced grid independent of section count', () => {
  const p = layoutProjectMap(map, {});
  expect(Object.keys(p)).toHaveLength(24);
  expect(p.r).toBeUndefined();
  expect(p.d1.x).toBeGreaterThan(p.d0.x);
  expect(Math.max(...Object.values(p).map((v) => v.y))).toBeLessThan(2200);
});
it('ignores legacy tree coordinates and preserves version 2 manual positions', () => {
  const positions = [
    { nodeId: 'd0', x: 234, y: 456 },
    { nodeId: 's0', x: 760, y: 99999 },
  ];
  expect(layoutProjectMap({ ...map, positions }, {}).d0).toEqual({ x: 0, y: 0 });
  expect(layoutProjectMap({ ...map, positions, layoutVersion: 2 }, {}).d0).toEqual({
    x: 234,
    y: 456,
  });
});
