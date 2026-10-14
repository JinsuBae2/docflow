import type { ELK } from 'elkjs/lib/elk-api';
import type { UserFlow } from '../../../shared/user-flow';
import { layoutUserFlow } from './layout';
import { removedFlowNodes } from '../../../shared/flow-proposal-preview';

export async function layoutFlowProposal(
  base: UserFlow | null,
  proposed: UserFlow,
  engine: Pick<ELK, 'layout'>,
) {
  const reserved = {
    ...proposed,
    nodes: [
      ...proposed.nodes,
      ...removedFlowNodes(base || { ...proposed, nodes: [], edges: [] }, proposed),
    ],
  };
  const layout = await layoutUserFlow(reserved, engine, true);
  return {
    ...layout,
    flow: {
      ...proposed,
      nodes: proposed.nodes.map((node) => {
        const placed = layout.flow.nodes.find((placed) => placed.id === node.id)!;
        return { ...node, position: placed.position, width: placed.width, height: placed.height };
      }),
    },
  };
}
