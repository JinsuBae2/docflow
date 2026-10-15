import { expect, it } from 'vitest';
import {
  routeEdges,
  retargetRoute,
  segmentIntersectsRect,
} from '../../src/renderer/features/graph/routing';
const nodes = [
  { id: 'a', x: 0, y: 0, width: 230, height: 82 },
  { id: 'b', x: 350, y: 0, width: 230, height: 160 },
  { id: 'c', x: 760, y: 0, width: 230, height: 82 },
];
it('allows both endpoint ports on a single straight segment', () => {
  const aligned = [nodes[0], nodes[2]].map((node) => ({ ...node, y: 7 }));
  const route = routeEdges({
    version: 1,
    nodes: aligned,
    edges: [{ id: 'ac', fromId: 'a', toId: 'c' }],
  }).routes[0];
  expect(route.status).toBe('ready');
  expect(route.points).toEqual([
    { x: 230, y: 48 },
    { x: 760, y: 48 },
  ]);
  expect(retargetRoute(route, 'a', 'c', aligned)?.status).toBe('ready');
});
it('routes orthogonally around measured cards with a 16px clearance', () => {
  const result = routeEdges({
    version: 7,
    nodes,
    edges: [{ id: 'ac', fromId: 'a', toId: 'c', label: '설계 근거' }],
  });
  expect(result.version).toBe(7);
  const route = result.routes[0];
  expect(route.status).toBe('ready');
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1],
      b = route.points[i];
    expect(a.x === b.x || a.y === b.y).toBe(true);
    expect(segmentIntersectsRect(a, b, { x: 334, y: -16, width: 262, height: 192 })).toBe(false);
  }
  expect(route.labelPosition).toBeDefined();
});
it('handles reverse and self edges and refuses blocked ports without drawing a shortcut', () => {
  for (const edge of [
    { id: 'reverse', fromId: 'c', toId: 'a' },
    { id: 'self', fromId: 'a', toId: 'a' },
  ])
    expect(routeEdges({ version: 1, nodes, edges: [edge] }).routes[0].status).toBe('ready');
  const blocked = routeEdges({
    version: 1,
    nodes: [...nodes, { id: 'overlap', x: 220, y: 0, width: 230, height: 82 }],
    edges: [{ id: 'ac', fromId: 'a', toId: 'c' }],
  }).routes[0];
  expect(blocked.status).toBe('blocked');
  expect(blocked.points).toEqual([]);
});
it('returns explicit missing endpoint and bounded-search failures', () => {
  expect(
    routeEdges({ version: 1, nodes, edges: [{ id: 'bad', fromId: 'missing', toId: 'a' }] })
      .routes[0].status,
  ).toBe('blocked');
  const failed = routeEdges({
    version: 1,
    nodes,
    edges: [{ id: 'ac', fromId: 'a', toId: 'c' }],
    maxStates: 1,
  }).routes[0];
  expect(failed.status).toBe('budget');
  expect(failed.points).toEqual([]);
});
it('keeps endpoints following a moving card and hides cached paths blocked by new obstacles', () => {
  const simple = [nodes[0], nodes[2]];
  const original = routeEdges({
    version: 1,
    nodes: simple,
    edges: [{ id: 'ac', fromId: 'a', toId: 'c' }],
  }).routes[0];
  const moved = simple.map((node) => (node.id === 'a' ? { ...node, y: 12 } : node));
  const updated = retargetRoute(original, 'a', 'c', moved)!;
  expect(updated.points[0].y).toBe(53);
  expect(updated.status).toBe('ready');
  expect(retargetRoute(original, 'a', 'c', nodes)).toBeUndefined();
});
it('keeps labels visible on routes around document cards and uses section row anchors', () => {
  const cards = [
    { id: 'a', x: 0, y: 0, width: 320, height: 148 },
    { id: 'b', x: 440, y: 0, width: 320, height: 148 },
    { id: 'c', x: 0, y: 244, width: 320, height: 148 },
  ];
  const start = { x: 320, y: 292 },
    end = { x: 0, y: 48 };
  const route = routeEdges({
    version: 1,
    nodes: cards,
    edges: [
      { id: 'cb', fromId: 'c', toId: 'b', start, end: { x: 440, y: 48 }, label: '구체화' },
      { id: 'ba', fromId: 'b', toId: 'a', start: { x: 760, y: 48 }, end, label: '사용자 흐름' },
      { id: 'ca', fromId: 'c', toId: 'a', start, end, label: '드래그 연결' },
    ],
  }).routes[2];
  expect(route.points[0]).toEqual(start);
  expect(route.points.at(-1)).toEqual(end);
  expect(route.labelPosition).toBeDefined();
  expect(retargetRoute(route, 'c', 'a', cards, { start, end })?.labelPosition).toBeDefined();
});
