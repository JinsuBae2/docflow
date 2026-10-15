import { createElement } from 'react';
import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlowProvider, Position, type EdgeProps } from '@xyflow/react';
import { RoutedEdge } from '../../src/renderer/features/graph/RoutedEdge';
const props = {
  id: 'edge',
  source: 'a',
  target: 'b',
  sourceX: 320,
  sourceY: 48,
  targetX: 440,
  targetY: 100,
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  label: '설계 근거',
} as EdgeProps;
it.each([undefined, 'blocked', 'budget'])(
  'renders a visible curve and label for unavailable route %s',
  (status) => {
    const markup = renderToStaticMarkup(
      createElement(
        ReactFlowProvider,
        null,
        createElement(
          'svg',
          null,
          createElement(RoutedEdge, {
            ...props,
            data: status ? { route: { id: 'edge', points: [], status } } : undefined,
          }),
        ),
      ),
    );
    expect(markup).toContain('data-routing="fallback"');
    expect(markup).toContain('react-flow__edge-path');
    expect(markup).toContain('설계 근거');
    expect(markup).toMatch(/d="M.+C/);
  },
);
