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

export const nodeWidth = 230;

/**
 * Picks a vertical lane right of the cards for each relation whose plain line would run behind
 * another card: one in a row it skips, or one between the two cards in a shared row.
 * Lanes stack outward so detours do not overlap.
 */
export function detourLanes(
  positions: Record<string, { x: number; y: number }>,
  edges: Array<{ id: string; from: string; to: string }>,
): Record<string, number> {
  const lanes: Record<string, number> = {};
  let used = 0;
  for (const edge of edges) {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to || edge.from === edge.to) continue;
    const top = Math.min(from.y, to.y);
    const bottom = Math.max(from.y, to.y);
    const left = Math.min(from.x, to.x);
    const right = Math.max(from.x, to.x);
    const blocked = Object.entries(positions).some(([id, p]) => {
      if (id === edge.from || id === edge.to) return false;
      if (top === bottom) return p.y === top && p.x > left && p.x < right;
      return p.y > top && p.y < bottom && p.x < right + nodeWidth && p.x + nodeWidth > left;
    });
    if (!blocked) continue;
    const edgeOfCards = Math.max(
      ...Object.values(positions)
        .filter((p) => p.y >= top && p.y <= bottom)
        .map((p) => p.x + nodeWidth),
    );
    lanes[edge.id] = edgeOfCards + 70 + used++ * 36;
  }
  return lanes;
}
