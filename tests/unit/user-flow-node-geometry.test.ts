import { expect, it } from 'vitest';
import { flowNodeGeometry } from '../../src/renderer/features/user-flow/node-geometry';
import type { UserFlowNode } from '../../src/shared/user-flow';
it('provides dimensions and projected handle geometry before browser measurement', () => {
  const node: UserFlowNode = {
    id: 'g',
    type: 'group',
    collapsed: true,
    width: 900,
    height: 500,
    data: { label: 'group' },
    origin: 'inferred',
    evidence: [],
  };
  const collapsed = flowNodeGeometry(node, ['in-edge'], [{ id: 'out-a' }, { id: 'out-b' }]);
  expect(collapsed.width).toBe(250);
  expect(collapsed.height).toBe(110);
  expect(collapsed.handles.map((handle) => [handle.id, handle.x, handle.y])).toEqual([
    ['in-edge', 0, 55],
    ['out-a', 250, 110 / 3],
    ['out-b', 250, 220 / 3],
  ]);
  const expanded = flowNodeGeometry({ ...node, collapsed: false }, ['in'], [{ id: 'out' }]);
  expect(expanded.width).toBe(900);
  expect(expanded.handles.map((handle) => handle.y)).toEqual([70, 70]);
});
it('keeps condition outputs separate with matching render positions', () => {
  const node: UserFlowNode = {
    id: 'c',
    type: 'condition',
    width: 260,
    height: 180,
    data: { label: '조건' },
    origin: 'inferred',
    evidence: [],
  };
  const geometry = flowNodeGeometry(node, ['in'], [{ id: 'yes' }, { id: 'no' }]);
  expect(geometry.handles.map((handle) => [handle.type, handle.id, handle.y])).toEqual([
    ['target', 'in', 90],
    ['source', 'yes', 60],
    ['source', 'no', 120],
  ]);
});
