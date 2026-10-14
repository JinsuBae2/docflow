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
    { id: 'a', kind: 'document', documentId: 'a', origin: 'source', title: '문서' },
    { id: 'b', kind: 'document', documentId: 'b', origin: 'source', title: '문서' },
    { id: 's1', kind: 'section', documentId: 'a', origin: 'source', title: '하나' },
    { id: 's2', kind: 'section', documentId: 'a', origin: 'source', title: '둘' },
  ],
  edges: [],
};
it('lays out three columns with measured, non-overlapping section groups', () => {
  const p = layoutProjectMap(map, { s1: { width: 230, height: 160 } });
  expect(p.r.x).toBe(0);
  expect(p.a.x).toBe(360);
  expect(p.s1.x).toBe(760);
  expect(p.s2.y).toBeGreaterThanOrEqual(p.s1.y + 160 + 24);
  expect(p.b.y).toBeGreaterThan(p.s2.y);
});
it('preserves user positions while inserting new nodes and filters collapsed sections', () => {
  const p = layoutProjectMap(
    { ...map, positions: [{ nodeId: 'a', x: 234, y: 456 }], collapsedDocumentIds: ['a'] },
    {},
  );
  expect(p.a).toEqual({ x: 234, y: 456 });
  expect(p.s1).toBeUndefined();
  expect(p.b.x).toBe(360);
});
