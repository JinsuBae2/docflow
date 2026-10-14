import { expect, it } from 'vitest';
import { parseUserFlow, projectUserFlow, diffUserFlow } from '../../src/shared/user-flow';

const node = (id: string, type = 'action', parentId?: string) => ({
  id,
  type,
  parentId,
  data: { label: id },
  origin: 'inferred',
  evidence: [],
});
const flow = () => ({
  schemaVersion: 1,
  id: 'journey',
  projectId: 'project',
  title: '문서 가져오기',
  revision: '',
  nodes: [node('group', 'group'), node('a', 'action', 'group'), node('b')],
  edges: [{ id: 'ab', source: 'a', target: 'b', label: '성공', origin: 'inferred', evidence: [] }],
});
it('rejects orphan edges, duplicate IDs, invalid parents, cyclic groups and persisted diff flags', () => {
  const valid = flow();
  expect(parseUserFlow(valid).nodes).toHaveLength(3);
  for (const invalid of [
    { ...valid, edges: [{ ...valid.edges[0], target: 'missing' }] },
    { ...valid, nodes: [...valid.nodes, node('a')] },
    { ...valid, edges: [{ ...valid.edges[0], id: 'a' }] },
    { ...valid, nodes: [node('a', 'action', 'missing')] },
    { ...valid, nodes: [node('a'), node('b', 'action', 'a')] },
    { ...valid, nodes: [node('g1', 'group', 'g2'), node('g2', 'group', 'g1')] },
    { ...valid, nodes: [{ ...valid.nodes[0], isNew: true }] },
  ])
    expect(() => parseUserFlow(invalid)).toThrow();
});
it('validates grounded evidence, ranges, condition ports and finite coordinates', () => {
  const valid = flow();
  expect(() =>
    parseUserFlow({ ...valid, nodes: [{ ...node('a'), origin: 'grounded' }] }),
  ).toThrow();
  expect(() =>
    parseUserFlow({
      ...valid,
      nodes: [
        {
          ...node('a', 'condition'),
          data: { label: '조건', outputs: [{ id: 'in', label: '승인' }] },
        },
        node('b'),
      ],
      edges: [],
    }),
  ).toThrow();
  expect(() =>
    parseUserFlow({ ...valid, nodes: [{ ...node('a'), position: { x: NaN, y: 0 } }] }),
  ).toThrow();
  expect(() =>
    parseUserFlow({
      ...valid,
      nodes: [
        {
          ...node('a'),
          evidence: [
            { documentId: 'd', sectionId: 's', revision: 'r', quoteRange: { start: 8, end: 2 } },
          ],
        },
      ],
    }),
  ).toThrow();
  expect(() =>
    parseUserFlow({ ...valid, nodes: [node('a', 'condition'), node('b')], edges: valid.edges }),
  ).toThrow();
});
it('projects external edges to the outer collapsed group without changing source IDs', () => {
  const source = parseUserFlow({
    ...flow(),
    nodes: [
      { ...node('outer', 'group'), collapsed: true },
      { ...node('group', 'group', 'outer'), collapsed: true },
      node('a', 'action', 'group'),
      node('inside', 'action', 'outer'),
      node('b'),
    ],
    edges: [...flow().edges, { ...flow().edges[0], id: 'internal', target: 'inside' }],
  });
  const projection = projectUserFlow(source);
  expect(projection.nodes.map((n) => n.id)).toEqual(['outer', 'b']);
  expect(projection.edges).toHaveLength(1);
  expect(projection.edges[0]).toMatchObject({
    id: 'ab',
    source: 'outer',
    target: 'b',
    label: '성공',
  });
  expect(source.edges[0].source).toBe('a');
});
it('computes runtime add/delete/modified statuses including parent and branch changes', () => {
  const base = parseUserFlow(flow());
  const proposed = parseUserFlow({
    ...flow(),
    nodes: [node('group', 'group'), { ...node('a'), data: { label: '바뀐 단계' } }, node('c')],
    edges: [{ ...flow().edges[0], target: 'c', label: '실패' }],
  });
  const diff = diffUserFlow(base, proposed);
  expect(diff.nodes).toContainEqual({ id: 'a', status: 'modified' });
  expect(diff.nodes).toContainEqual({ id: 'b', status: 'deleted' });
  expect(diff.nodes).toContainEqual({ id: 'c', status: 'added' });
  expect(diff.edges).toContainEqual({ id: 'ab', status: 'modified' });
  expect(base.nodes[1]).not.toHaveProperty('isUpdated');
});
