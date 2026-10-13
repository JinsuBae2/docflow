export function layoutDocuments(ids: string[], relations: Array<{ from: string; to: string }>): Record<string, { x: number; y: number }> {
  const known = new Set(ids); const incoming = new Map(ids.map(id => [id, 0]));
  const edges = relations.filter(r => known.has(r.from) && known.has(r.to) && r.from !== r.to);
  for (const edge of edges) incoming.set(edge.to, incoming.get(edge.to)! + 1);
  const queue = ids.filter(id => incoming.get(id) === 0); const depth = new Map(ids.map(id => [id, 0]));
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    for (const edge of edges.filter(r => r.from === id)) {
      depth.set(edge.to, Math.max(depth.get(edge.to)!, depth.get(id)! + 1));
      incoming.set(edge.to, incoming.get(edge.to)! - 1);
      if (!incoming.get(edge.to)) queue.push(edge.to);
    }
  }
  const rows = new Map<number, string[]>();
  for (const id of ids) { const level = depth.get(id)!; rows.set(level, [...(rows.get(level) || []), id]); }
  return Object.fromEntries([...rows].flatMap(([level, row]) => row.map((id, index) => [id, { x: (index - (row.length - 1) / 2) * 280, y: level * 200 }])));
}
