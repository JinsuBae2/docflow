import { Position, type NodeHandle } from '@xyflow/react';
import type { UserFlowNode } from '../../../shared/user-flow';

export function flowNodeGeometry(
  node: UserFlowNode,
  inputs: string[],
  outputs: Array<{ id: string }>,
) {
  const width = node.collapsed ? 250 : node.width || 250;
  const height = node.collapsed ? 110 : node.height || 140;
  const y = (index: number, count: number) =>
    node.type === 'group' && !node.collapsed ? 70 : (height * (index + 1)) / (count + 1);
  const handles: NodeHandle[] = [
    ...inputs.map((id, index) => ({
      id,
      type: 'target' as const,
      position: Position.Left,
      x: 0,
      y: y(index, inputs.length),
      width: 0,
      height: 0,
    })),
    ...outputs.map((port, index) => ({
      id: port.id,
      type: 'source' as const,
      position: Position.Right,
      x: width,
      y: y(index, outputs.length),
      width: 0,
      height: 0,
    })),
  ];
  return { width, height, handles };
}
