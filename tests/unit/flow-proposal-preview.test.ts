import { expect, it } from 'vitest';
import { flowProposalPreview } from '../../src/shared/flow-proposal-preview';
import type { UserFlow } from '../../src/shared/user-flow';
it('keeps removed items visible and describes semantic modifications without persisting diff flags', () => {
  const base: UserFlow = {
    schemaVersion: 1,
    id: 'f',
    projectId: 'p',
    title: 'flow',
    revision: 'r',
    nodes: [
      { id: 'a', type: 'action', data: { label: 'old' }, origin: 'inferred', evidence: [] },
      { id: 'b', type: 'action', data: { label: 'deleted' }, origin: 'inferred', evidence: [] },
    ],
    edges: [{ id: 'ab', source: 'a', target: 'b', origin: 'inferred', evidence: [] }],
  };
  const next: UserFlow = {
    ...base,
    nodes: [
      { ...base.nodes[0], data: { label: 'new' } },
      { ...base.nodes[1], id: 'c' },
    ],
    edges: [],
  };
  const preview = flowProposalPreview(base, next, next);
  expect(preview.flow.nodes.map((n) => n.id)).toEqual(['a', 'c', 'b']);
  expect(preview.changes.nodes.a.status).toBe('modified');
  expect(preview.changes.nodes.a.summary).toContain('label');
  expect(preview.changes.nodes.b.status).toBe('deleted');
  expect(preview.changes.nodes.c.status).toBe('added');
  expect(preview.changes.edges.ab.status).toBe('deleted');
  expect(next.nodes).toHaveLength(2);
  expect(JSON.stringify(next)).not.toContain('modified');
});

it('reserves removed node space while placing added nodes and returns only proposed content for acceptance', async () => {
  const { layoutFlowProposal } =
    await import('../../src/renderer/features/user-flow/proposal-layout');
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const base: UserFlow = {
    schemaVersion: 1,
    id: 'f',
    projectId: 'p',
    title: 'f',
    revision: 'r',
    nodes: [
      {
        id: 'old',
        type: 'action',
        position: { x: 0, y: 0 },
        width: 250,
        height: 140,
        data: { label: 'old' },
        origin: 'inferred',
        evidence: [],
      },
    ],
    edges: [],
  };
  const proposed: UserFlow = {
    ...base,
    nodes: [{ ...base.nodes[0], id: 'new', position: undefined }],
  };
  const result = await layoutFlowProposal(base, proposed, new ELK());
  expect(result.flow.nodes).toHaveLength(1);
  const point = result.flow.nodes[0].position!;
  expect(point.x >= 274 || point.y >= 164).toBe(true);
  expect(result.flow.nodes[0].data).toEqual(proposed.nodes[0].data);
});
it('lays out ghosts when their original group becomes a page', async () => {
  const { layoutFlowProposal } =
    await import('../../src/renderer/features/user-flow/proposal-layout');
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const base: UserFlow = {
    schemaVersion: 1,
    id: 'f',
    projectId: 'p',
    title: 'f',
    revision: 'r',
    nodes: [
      {
        id: 'g',
        type: 'group',
        position: { x: 100, y: 100 },
        data: { label: 'group' },
        origin: 'inferred',
        evidence: [],
      },
      {
        id: 'child',
        type: 'action',
        parentId: 'g',
        position: { x: 30, y: 80 },
        data: { label: 'old' },
        origin: 'inferred',
        evidence: [],
      },
    ],
    edges: [],
  };
  const proposed: UserFlow = { ...base, nodes: [{ ...base.nodes[0], type: 'page' }] };
  const result = await layoutFlowProposal(base, proposed, new ELK());
  expect(result.flow.nodes).toHaveLength(1);
  const ghost = flowProposalPreview(base, proposed, result.flow).flow.nodes.find(
    (node) => node.id === 'child',
  )!;
  expect(ghost.parentId).toBeUndefined();
  expect(ghost.position).toEqual({ x: 130, y: 180 });
});
it('reserves deleted child space inside a retained group', async () => {
  const { layoutFlowProposal } =
    await import('../../src/renderer/features/user-flow/proposal-layout');
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const base: UserFlow = {
    schemaVersion: 1,
    id: 'f',
    projectId: 'p',
    title: 'f',
    revision: 'r',
    nodes: [
      {
        id: 'g',
        type: 'group',
        position: { x: 0, y: 0 },
        width: 500,
        height: 400,
        data: { label: 'group' },
        origin: 'inferred',
        evidence: [],
      },
      {
        id: 'old',
        type: 'action',
        parentId: 'g',
        position: { x: 32, y: 70 },
        width: 250,
        height: 140,
        data: { label: 'old' },
        origin: 'inferred',
        evidence: [],
      },
    ],
    edges: [],
  };
  const proposed: UserFlow = {
    ...base,
    nodes: [base.nodes[0], { ...base.nodes[1], id: 'new', position: undefined }],
  };
  const result = await layoutFlowProposal(base, proposed, new ELK());
  const preview = flowProposalPreview(base, proposed, result.flow);
  const ghost = preview.flow.nodes.find((node) => node.id === 'old')!;
  const added = result.flow.nodes.find((node) => node.id === 'new')!;
  expect(ghost.parentId).toBe('g');
  expect(added.position!.x >= 306 || added.position!.y >= 234).toBe(true);
});
