import type { Workspace } from './contracts';
export interface MapEvidence {
  sourceId: string;
  documentId: string;
  revision: string;
  start: number;
  end: number;
  quote: string;
}
export interface MapNode {
  id: string;
  kind: 'root' | 'document' | 'section' | 'topic';
  title: string;
  documentId?: string;
  sectionId?: string;
  origin: 'source' | 'ai';
  revision?: string;
  level?: number;
  evidence?: MapEvidence[];
}
export interface MapPosition {
  nodeId: string;
  x: number;
  y: number;
}
export interface MapEdge {
  id: string;
  fromId: string;
  toId: string;
  kind: 'structure' | 'semantic';
  label: string;
  origin: 'source' | 'manual' | 'ai' | 'markdown';
  status: 'pending' | 'confirmed' | 'stale';
  evidence?: MapEvidence[];
}
export interface MapView {
  layoutVersion?: number;
  version?: number;
  positions: MapPosition[];
  collapsedDocumentIds: string[];
  legendCollapsed: boolean;
}
export interface ProjectMap extends MapView {
  projectId: string;
  nodes: MapNode[];
  edges: MapEdge[];
}
export function buildProjectMap(workspace: Workspace): ProjectMap {
  const root = `root:${workspace.project.id}`;
  const nodes: MapNode[] = [
    { id: root, kind: 'root', title: workspace.project.name, origin: 'source' },
  ];
  const edges: MapEdge[] = [];
  const structure = (fromId: string, toId: string) =>
    edges.push({
      id: `structure:${fromId}:${toId}`,
      fromId,
      toId,
      kind: 'structure',
      label: '',
      origin: 'source',
      status: 'confirmed',
    });
  for (const doc of workspace.documents) {
    nodes.push({
      id: doc.id,
      kind: 'document',
      title: doc.title,
      documentId: doc.id,
      origin: 'source',
      revision: doc.revision,
    });
    structure(root, doc.id);
    for (const section of doc.sections) {
      nodes.push({
        id: section.id,
        kind: 'section',
        title: section.title,
        documentId: doc.id,
        sectionId: section.id,
        origin: 'source',
        revision: doc.revision,
        level: section.level,
      });
      structure(doc.id, section.id);
    }
  }
  const known = new Set(nodes.map((n) => n.id));
  for (const r of workspace.relations) {
    if (!known.has(r.fromId) || !known.has(r.toId)) continue;
    const link = workspace.documentLinks.find((l) => l.id === r.linkId);
    const meaningful = link?.label.trim();
    const label =
      r.origin === 'markdown'
        ? meaningful && !/^(여기|링크|here|link|https?:\/\/.*)$/i.test(meaningful)
          ? meaningful
          : '참조'
        : r.type;
    edges.push({
      id: r.id,
      fromId: r.fromId,
      toId: r.toId,
      kind: 'semantic',
      label,
      origin: r.origin || 'manual',
      status: 'confirmed',
    });
  }
  for (const proposal of workspace.proposals) {
    const r = proposal.relation;
    if (
      proposal.kind === 'relation' &&
      proposal.status === 'pending' &&
      r &&
      known.has(r.fromId) &&
      known.has(r.toId)
    )
      edges.push({
        id: `proposal-${proposal.id}`,
        fromId: r.fromId,
        toId: r.toId,
        kind: 'semantic',
        label: r.relationType,
        origin: 'ai',
        status: 'pending',
      });
  }
  return {
    projectId: workspace.project.id,
    version: workspace.mapView?.version || 0,
    layoutVersion: workspace.mapView?.layoutVersion,
    nodes,
    edges,
    positions: workspace.mapView?.positions || [],
    collapsedDocumentIds: (workspace.mapView?.collapsedDocumentIds || []).filter((id) =>
      workspace.documents.some((document) => document.id === id),
    ),
    legendCollapsed: workspace.mapView?.legendCollapsed || false,
  };
}
