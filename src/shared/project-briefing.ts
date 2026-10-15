import type { Workspace } from './contracts';
import { compareDocuments, displayDocumentType } from './document-presentation';
export function projectBriefing(workspace: Workspace) {
  const documents = [...workspace.documents].sort(compareDocuments);
  const owners = new Map(
    documents.flatMap(
      (d) => [[d.id, d.id], ...d.sections.map((s) => [s.id, d.id])] as [string, string][],
    ),
  );
  const connected = new Set<string>();
  for (const relation of workspace.relations) {
    const from = owners.get(relation.fromId),
      to = owners.get(relation.toId);
    if (relation.confirmed && from && to && from !== to) {
      connected.add(from);
      connected.add(to);
    }
  }
  const weight = (doc: Workspace['documents'][number]) => {
    const label = displayDocumentType(doc);
    return label === '개요'
      ? 5
      : label === 'PRD'
        ? 4
        : ['설계', '아키텍처'].includes(label)
          ? 3
          : label
            ? 2
            : 0;
  };
  return {
    coreDocuments: [...documents]
      .sort((a, b) => weight(b) - weight(a) || compareDocuments(a, b))
      .slice(0, 5),
    connectedCount: connected.size,
    isolated: documents.filter((d) => !connected.has(d.id)),
    pendingCount: workspace.proposals.filter((p) => p.status === 'pending').length,
    staleCount: workspace.proposals.filter((p) => p.status === 'stale').length,
    unresolvedLinkCount: workspace.documentLinks.filter((l) =>
      ['missing', 'missing-anchor', 'unregistered'].includes(l.status),
    ).length,
    unresolvedDocuments: documents.filter((doc) =>
      workspace.documentLinks.some(
        (link) =>
          link.documentId === doc.id &&
          ['missing', 'missing-anchor', 'unregistered'].includes(link.status),
      ),
    ),
    userFlows: workspace.userFlows || [],
    sourceFlows: workspace.flows,
    issues: [
      ...workspace.documentIssues,
      ...workspace.flowIssues,
      ...(workspace.userFlowIssues || []),
    ],
  };
}
