import { expect, it } from 'vitest';
import { projectBriefing } from '../../src/shared/project-briefing';
import type { Workspace } from '../../src/shared/contracts';
it('derives core documents, section-owned connections and isolated documents without AI', () => {
  const workspace = {
    documents: [
      { id: 'a', title: '01. 개요', type: 'overview', sections: [{ id: 'sa' }] },
      {
        id: 'b',
        title: '02. API',
        type: 'note',
        relativePath: 'docs/api.md',
        sections: [{ id: 'sb' }],
      },
      { id: 'c', title: '03. 메모', type: 'note', sections: [] },
    ],
    relations: [
      { fromId: 'sa', toId: 'sb', confirmed: true },
      { fromId: 'a', toId: 'sa', confirmed: true },
    ],
    proposals: [{ status: 'pending' }, { status: 'stale' }, { status: 'accepted' }],
    documentLinks: [{ status: 'missing' }, { status: 'external' }],
    userFlows: [{ id: 'f' }],
    flows: [{ id: 'mermaid' }],
    documentIssues: [],
    flowIssues: [],
  } as unknown as Workspace;
  const result = projectBriefing(workspace);
  expect(result.coreDocuments[0].id).toBe('a');
  expect(result.isolated.map((d) => d.id)).toEqual(['c']);
  expect(result.connectedCount).toBe(2);
  expect(result.pendingCount).toBe(1);
  expect(result.staleCount).toBe(1);
  expect(result.unresolvedLinkCount).toBe(1);
  expect(result.userFlows).toHaveLength(1);
});
