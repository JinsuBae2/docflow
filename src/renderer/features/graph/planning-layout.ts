import type { Point, Rect } from './routing';
export function planningPositions(
  documents: string[],
  items: string[],
  expandedId?: string,
): Record<string, Point> {
  const selectedIndex = expandedId ? documents.indexOf(expandedId) : -1;
  const itemTop =
    selectedIndex < 0 ? 75 : Math.max(75, 75 + selectedIndex * 110 - (items.length - 1) * 55);
  return Object.fromEntries([
    ['project', { x: 110, y: 440 }],
    ...documents.map((id, index) => [id, { x: 390, y: 75 + index * 110 }]),
    ...items.map((id, index) => [id, { x: 770, y: itemTop + index * 110 }]),
  ]);
}
export function adjacentDetailPosition(
  card: Rect,
  width: number,
  height: number,
  panelWidth: number,
  panelHeight: number,
): Point {
  const gap = 12,
    right = card.x + card.width + gap,
    left = card.x - panelWidth - gap;
  const x =
    right + panelWidth <= width - gap
      ? right
      : left >= gap
        ? left
        : card.x > width / 2
          ? left
          : right;
  return {
    x: Math.max(gap, Math.min(Math.max(gap, width - panelWidth - gap), x)),
    y: Math.max(gap, Math.min(Math.max(gap, height - panelHeight - gap), card.y)),
  };
}
