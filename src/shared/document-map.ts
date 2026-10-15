import type { MapEdge, MapNode, ProjectMap } from './project-map';
import { compareDocuments } from './document-presentation';
export const CARD_WIDTH = 320;
export const CARD_HEADER = 112;
export const SECTION_ROW_HEIGHT = 32;
export const sectionHandle = (id: string, side: 'left' | 'right') => `section:${id}:${side}`;
export interface DocumentCard {
  node: MapNode;
  rows: MapNode[];
  sectionCount: number;
  hiddenCount: number;
  collapsed: boolean;
  height: number;
}
export interface DocumentConnection {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  label: string;
  members: MapEdge[];
}
export function projectDocumentMap(
  map: ProjectMap,
  options: {
    focusId?: string;
    detailId?: string;
    detailEdgeIds?: string[];
    expandedIds?: string[];
    query?: string;
  } = {},
) {
  const documents = map.nodes.filter((n) => n.kind === 'document').sort(compareDocuments);
  const owners = new Map(map.nodes.map((n) => [n.id, n.kind === 'document' ? n.id : n.documentId]));
  const known = new Set(documents.map((n) => n.id));
  const links = map.edges.filter(
    (e) =>
      e.kind === 'semantic' &&
      known.has(owners.get(e.fromId) || '') &&
      known.has(owners.get(e.toId) || ''),
  );
  const connectedSections = new Set(links.flatMap((e) => [e.fromId, e.toId]));
  const neighborhood = new Set([options.focusId]);
  for (const e of links) {
    const a = owners.get(e.fromId)!,
      b = owners.get(e.toId)!;
    if (a === options.focusId) neighborhood.add(b);
    if (b === options.focusId) neighborhood.add(a);
  }
  const query = options.query?.trim().toLocaleLowerCase();
  const cards: DocumentCard[] = documents
    .filter((n) => !options.focusId || neighborhood.has(n.id))
    .flatMap((node) => {
      const sections = map.nodes.filter((n) => n.documentId === node.id && n.kind === 'section');
      if (query && ![node, ...sections].some((n) => n.title.toLocaleLowerCase().includes(query)))
        return [];
      const ordered = [
        ...sections.filter((n) => connectedSections.has(n.id)),
        ...sections.filter((n) => !connectedSections.has(n.id)),
      ];
      const collapsed = map.collapsedDocumentIds.includes(node.id);
      const rows = collapsed
        ? []
        : options.expandedIds?.includes(node.id)
          ? ordered
          : ordered.filter((n) => connectedSections.has(n.id)).slice(0, 5);
      return [
        {
          node,
          rows,
          sectionCount: sections.length,
          hiddenCount: sections.length - rows.length,
          collapsed,
          height: CARD_HEADER + rows.length * SECTION_ROW_HEIGHT + (sections.length ? 36 : 0),
        },
      ];
    });
  const visible = new Map(cards.map((c) => [c.node.id, c]));
  const handle = (doc: string, endpoint: string, side: 'left' | 'right') =>
    visible.get(doc)?.rows.some((n) => n.id === endpoint) ? sectionHandle(endpoint, side) : side;
  const groups = new Map<string, MapEdge[]>();
  for (const edge of links) {
    const source = owners.get(edge.fromId)!,
      target = owners.get(edge.toId)!;
    if (!visible.has(source) || !visible.has(target)) continue;
    const detailed =
      source === target ||
      source === options.detailId ||
      target === options.detailId ||
      options.detailEdgeIds?.includes(edge.id);
    const pair = [source, target].sort();
    const key = detailed ? edge.id : `bundle:${JSON.stringify([...pair, edge.status])}`;
    groups.set(key, [...(groups.get(key) || []), edge]);
  }
  const edges: DocumentConnection[] = [...groups].map(([id, members]) => {
    const first = members[0],
      source = owners.get(first.fromId)!,
      target = owners.get(first.toId)!;
    return {
      id: members.length === 1 ? first.id : id,
      source,
      target,
      members,
      sourceHandle: members.length === 1 ? handle(source, first.fromId, 'right') : 'right',
      targetHandle: members.length === 1 ? handle(target, first.toId, 'left') : 'left',
      label: members.length > 1 ? `${members.length}개 연결` : first.label,
    };
  });
  return { cards, edges };
}
export function resolveDocumentEndpoint(
  cards: DocumentCard[],
  documentId: string,
  handleId?: string | null,
) {
  return (
    cards
      .find((c) => c.node.id === documentId)
      ?.rows.find(
        (row) =>
          handleId === sectionHandle(row.id, 'left') || handleId === sectionHandle(row.id, 'right'),
      )?.id || documentId
  );
}
