import { expect, it } from 'vitest';
import { projectDocumentMap, resolveDocumentEndpoint } from '../../src/shared/document-map';
import { compareDocuments, displayDocumentType } from '../../src/shared/document-presentation';
import type { ProjectMap } from '../../src/shared/project-map';

const map: ProjectMap = {
  projectId: 'p',
  positions: [],
  collapsedDocumentIds: [],
  legendCollapsed: false,
  nodes: Array.from({ length: 24 }, (_, i) => [
    { id: `d${i}`, kind: 'document' as const, title: `문서 ${i}`, origin: 'source' as const },
    ...Array.from({ length: 30 }, (_, j) => ({
      id: `s${i}-${j}`,
      kind: 'section' as const,
      documentId: `d${i}`,
      title: `절 ${j}`,
      origin: 'source' as const,
    })),
  ]).flat(),
  edges: Array.from({ length: 50 }, (_, i) => ({
    id: `e${i}`,
    fromId: `s${Math.floor(i / 2) % 24}-${i % 2}`,
    toId: `s${(Math.floor(i / 2) + 1) % 24}-0`,
    kind: 'semantic' as const,
    label: '근거',
    status: 'confirmed' as const,
    origin: 'manual' as const,
  })),
};
it('projects 24 documents into bounded cards and bundles without losing original endpoints', () => {
  const result = projectDocumentMap(map);
  expect(result.cards).toHaveLength(24);
  expect(result.cards.every((c) => c.rows.length <= 5 && c.height <= 320)).toBe(true);
  expect(result.edges.length).toBeLessThan(50);
  expect(
    result.edges
      .flatMap((e) => e.members)
      .map((e) => e.id)
      .sort(),
  ).toEqual(map.edges.map((e) => e.id).sort());
  expect(result.edges[0].members[0].fromId).toBe('s0-0');
});
it('focuses exactly one hop and restores section handles in detail mode after expanding', () => {
  const focused = projectDocumentMap(map, { focusId: 'd0', detailId: 'd0' });
  expect(focused.cards.map((c) => c.node.id).sort()).toEqual(['d0', 'd1', 'd23']);
  expect(focused.edges.find((e) => e.members[0].id === 'e0')?.sourceHandle).toBe(
    'section:s0-0:right',
  );
  const collapsed = projectDocumentMap(
    { ...map, collapsedDocumentIds: ['d0'] },
    { detailId: 'd0' },
  );
  expect(collapsed.edges.find((e) => e.members[0].id === 'e0')?.sourceHandle).toBe('right');
  expect(projectDocumentMap(map, { expandedIds: ['d0'] }).cards[0].rows).toHaveLength(30);
});
it('keeps pending proposals distinct from confirmed bundles and filters by section titles', () => {
  const proposal = {
    ...map.edges[0],
    id: 'proposal',
    status: 'pending' as const,
    origin: 'ai' as const,
  };
  const result = projectDocumentMap({ ...map, edges: [...map.edges, proposal] });
  expect(result.edges.find((e) => e.members.some((m) => m.id === 'proposal'))?.members).toEqual([
    proposal,
  ]);
  expect(projectDocumentMap(map, { query: '절 29' }).cards).toHaveLength(24);
});
it('sorts numbered titles naturally and infers display labels without changing source types', () => {
  const docs = ['11. 안내', '02. 안내', '01. 안내'].map((title) => ({
    title,
    type: 'note' as const,
  }));
  expect(docs.sort(compareDocuments).map((d) => d.title)).toEqual([
    '01. 안내',
    '02. 안내',
    '11. 안내',
  ]);
  expect(displayDocumentType(docs[0])).toBe('');
  const doc = { title: '설계', relativePath: 'docs/architecture.md', type: 'note' as const };
  expect(displayDocumentType(doc)).toBe('아키텍처');
  expect(doc.type).toBe('note');
});
it('delegates overflow section connections to the boundary until their rows expand', () => {
  const evidence = [
    { sourceId: 's0-6', documentId: 'd0', revision: 'r1', start: 1, end: 5, quote: '원문' },
  ];
  const edges = Array.from({ length: 7 }, (_, i) => ({
    ...map.edges[0],
    id: `overflow-${i}`,
    fromId: `s0-${i}`,
    toId: `s1-${i}`,
    evidence,
  }));
  const source = { ...map, edges };
  const folded = projectDocumentMap(source, { detailId: 'd0' });
  expect(folded.cards[0].rows).toHaveLength(5);
  expect(folded.edges[6].sourceHandle).toBe('right');
  expect(folded.edges[6].members[0].evidence).toEqual(evidence);
  const expanded = projectDocumentMap(source, { detailId: 'd0', expandedIds: ['d0'] });
  expect(expanded.edges[6].sourceHandle).toBe('section:s0-6:right');
  expect(source.edges[6].fromId).toBe('s0-6');
});
it('resolves connection gestures back to original section IDs, including different rows of one card', () => {
  const cards = projectDocumentMap(map, { expandedIds: ['d0'] }).cards;
  expect(resolveDocumentEndpoint(cards, 'd0', 'section:s0-1:right')).toBe('s0-1');
  expect(resolveDocumentEndpoint(cards, 'd0', 'section:s0-2:left')).toBe('s0-2');
  expect(resolveDocumentEndpoint(cards, 'd0', 'right')).toBe('d0');
});
