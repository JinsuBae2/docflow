import type { ProjectMap } from '../../../shared/project-map';
export function layoutProjectMap(
  map: ProjectMap,
  sizes: Record<string, { width: number; height: number }>,
) {
  const result: Record<string, { x: number; y: number }> = {};
  const height = (id: string) => sizes[id]?.height || 82;
  let y = 0;
  for (const doc of map.nodes.filter((n) => n.kind === 'document')) {
    const children = map.collapsedDocumentIds.includes(doc.id)
      ? []
      : map.nodes.filter((n) => n.documentId === doc.id && n.kind !== 'document');
    const start = y;
    for (const node of children) {
      result[node.id] = { x: 760, y };
      y += height(node.id) + 24;
    }
    y = Math.max(y, start + height(doc.id) + 24);
    result[doc.id] = { x: 360, y: start + (y - start - 24 - height(doc.id)) / 2 };
    y += 48;
  }
  const root = map.nodes.find((n) => n.kind === 'root');
  if (root) result[root.id] = { x: 0, y: Math.max(0, (y - 48 - height(root.id)) / 2) };
  for (const p of map.positions) if (result[p.nodeId]) result[p.nodeId] = { x: p.x, y: p.y };
  // Only newly placed cards move out of the way of saved coordinates.
  const saved = new Set(map.positions.map((p) => p.nodeId));
  const placed = Object.entries(result).filter(([id]) => saved.has(id));
  for (const [id, p] of Object.entries(result))
    if (!saved.has(id)) {
      while (
        placed.some(
          ([other, q]) =>
            p.x < q.x + (sizes[other]?.width || 230) + 16 &&
            p.x + 230 + 16 > q.x &&
            p.y < q.y + height(other) + 24 &&
            p.y + height(id) + 24 > q.y,
        )
      )
        p.y += height(id) + 24;
      placed.push([id, p]);
    }
  return result;
}

export function layoutDocuments(
  ids: string[],
  relations: Array<{ from: string; to: string }>,
): Record<string, { x: number; y: number }> {
  const known = new Set(ids);
  const incoming = new Map(ids.map((id) => [id, 0]));
  const edges = relations.filter((r) => known.has(r.from) && known.has(r.to) && r.from !== r.to);
  for (const edge of edges) incoming.set(edge.to, incoming.get(edge.to)! + 1);
  const queue = ids.filter((id) => incoming.get(id) === 0);
  const depth = new Map(ids.map((id) => [id, 0]));
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    for (const edge of edges.filter((r) => r.from === id)) {
      depth.set(edge.to, Math.max(depth.get(edge.to)!, depth.get(id)! + 1));
      incoming.set(edge.to, incoming.get(edge.to)! - 1);
      if (!incoming.get(edge.to)) queue.push(edge.to);
    }
  }
  const rows = new Map<number, string[]>();
  for (const id of ids) {
    const level = depth.get(id)!;
    rows.set(level, [...(rows.get(level) || []), id]);
  }
  return Object.fromEntries(
    [...rows].flatMap(([level, row]) =>
      row.map((id, index) => [id, { x: (index - (row.length - 1) / 2) * 280, y: level * 200 }]),
    ),
  );
}
