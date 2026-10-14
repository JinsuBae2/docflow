import { expect, it } from 'vitest';
import ELK from 'elkjs/lib/elk.bundled.js';
import { layoutUserFlow } from '../../src/renderer/features/user-flow/layout';
import { parseUserFlow } from '../../src/shared/user-flow';
it('lays out nested groups left to right with distinct condition outputs without mutating saved coordinates', async () => {
  const node = (id: string, type: string, parentId?: string) => ({
    id,
    type,
    parentId,
    data: { label: id },
    origin: 'inferred',
    evidence: [],
  });
  const source = parseUserFlow({
    schemaVersion: 1,
    id: 'flow',
    title: '여정',
    projectId: 'p',
    revision: '',
    nodes: [
      node('g', 'group'),
      { ...node('start', 'startEnd', 'g'), position: { x: 999, y: 999 } },
      {
        ...node('choice', 'condition', 'g'),
        data: {
          label: '확인',
          outputs: [
            { id: 'yes', label: '승인' },
            { id: 'no', label: '보류' },
          ],
        },
      },
      node('page', 'page', 'g'),
      node('end', 'startEnd'),
    ],
    edges: [
      { id: 'a', source: 'start', target: 'choice', origin: 'inferred', evidence: [] },
      {
        id: 'b',
        source: 'choice',
        target: 'page',
        sourceHandle: 'yes',
        label: '승인',
        origin: 'inferred',
        evidence: [],
      },
      {
        id: 'c',
        source: 'choice',
        target: 'end',
        sourceHandle: 'no',
        label: '보류',
        origin: 'inferred',
        evidence: [],
      },
    ],
  });
  const { flow: result, paths } = await layoutUserFlow(source, new ELK());
  const nodes = new Map(result.nodes.map((node) => [node.id, node]));
  expect(nodes.get('choice')!.position!.x).toBeGreaterThan(nodes.get('start')!.position!.x);
  expect(nodes.get('page')!.position!.x).toBeGreaterThan(nodes.get('choice')!.position!.x);
  expect(nodes.get('g')!.width).toBeGreaterThan(500);
  expect(source.nodes[1].position).toEqual({ x: 999, y: 999 });
  expect(result.edges.map((edge) => edge.sourceHandle)).toEqual([undefined, 'yes', 'no']);
  expect(Object.keys(paths)).toHaveLength(3);
  const group = nodes.get('g')!;
  const start = nodes.get('start')!;
  expect(paths.a[0].x).toBeCloseTo(group.position!.x + start.position!.x + start.width!);
  expect(paths.a[0].y).toBeCloseTo(group.position!.y + start.position!.y + start.height! / 2);
});
it('preserves saved coordinates when placing a new node', async () => {
  const node = (id: string) => ({
    id,
    type: 'action',
    data: { label: id },
    origin: 'inferred',
    evidence: [],
  });
  const flow = parseUserFlow({
    schemaVersion: 1,
    id: 'f',
    projectId: 'p',
    title: '배치',
    revision: 'saved',
    nodes: [{ ...node('a'), position: { x: 900, y: 300 } }, node('b')],
    edges: [],
  });
  const result = await layoutUserFlow(flow, new ELK(), true);
  expect(result.flow.nodes[0].position).toEqual({ x: 900, y: 300 });
  expect(result.flow.nodes[1].position).toBeDefined();
  expect(result.paths).toEqual({});
});
it('anchors a group edge to its final-sized boundary', async () => {
  const node = (id: string, type: string, parentId?: string) => ({
    id,
    type,
    parentId,
    data: { label: id },
    origin: 'inferred',
    evidence: [],
  });
  const source = parseUserFlow({
    schemaVersion: 1,
    id: 'f',
    projectId: 'p',
    title: '그룹',
    revision: '',
    nodes: [node('g', 'group'), node('child', 'page', 'g'), node('end', 'action')],
    edges: [{ id: 'edge', source: 'g', target: 'end', origin: 'inferred', evidence: [] }],
  });
  const { flow, paths } = await layoutUserFlow(source, new ELK());
  const group = flow.nodes[0];
  expect(paths.edge[0].x).toBeCloseTo(group.position!.x + group.width!);
  expect(paths.edge[0].y).toBeCloseTo(group.position!.y + 70);
});
