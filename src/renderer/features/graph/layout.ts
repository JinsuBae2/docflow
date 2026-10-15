import type { ProjectMap } from '../../../shared/project-map';
import { compareDocuments } from '../../../shared/document-presentation';
import { CARD_WIDTH } from '../../../shared/document-map';
export function layoutProjectMap(
  map: ProjectMap,
  sizes: Record<string, { width: number; height: number }>,
) {
  const documents = map.nodes.filter((n) => n.kind === 'document').sort(compareDocuments);
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(documents.length))));
  const result: Record<string, { x: number; y: number }> = {};
  let y = 0;
  for (let row = 0; row < documents.length; row += columns) {
    const batch = documents.slice(row, row + columns);
    batch.forEach((node, col) => {
      result[node.id] = { x: col * (CARD_WIDTH + 120), y };
    });
    y += Math.max(...batch.map((n) => sizes[n.id]?.height || 308)) + 96;
  }
  const saved = map.layoutVersion === 2 ? map.positions.filter((p) => result[p.nodeId]) : [];
  for (const p of saved) result[p.nodeId] = { x: p.x, y: p.y };
  const placed = saved.map((p) => p.nodeId);
  for (const node of documents.filter((n) => !placed.includes(n.id))) {
    const p = result[node.id];
    while (
      placed.some((id) => {
        const q = result[id];
        return (
          p.x < q.x + CARD_WIDTH + 24 &&
          p.x + CARD_WIDTH + 24 > q.x &&
          p.y < q.y + (sizes[id]?.height || 308) + 24 &&
          p.y + (sizes[node.id]?.height || 308) + 24 > q.y
        );
      })
    )
      p.y += (sizes[node.id]?.height || 308) + 96;
    placed.push(node.id);
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
