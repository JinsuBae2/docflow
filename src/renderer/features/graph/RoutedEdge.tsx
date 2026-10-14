import { BaseEdge, type EdgeProps } from '@xyflow/react';
import { displayRouteLabel, type Route } from './routing';
export function RoutedEdge({
  id,
  data,
  markerEnd,
  style,
  label,
  labelStyle,
  labelBgStyle,
}: EdgeProps) {
  const route = data?.route as Route | undefined;
  if (!route || route.status !== 'ready') return null;
  const path = route.points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
  const text = typeof label === 'string' ? displayRouteLabel(label) : label;
  return (
    <g>
      <title>{typeof label === 'string' ? label : '문서 구조'}</title>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={style}
        label={route.labelPosition ? text : undefined}
        labelX={route.labelPosition?.x}
        labelY={route.labelPosition?.y}
        labelStyle={labelStyle}
        labelBgStyle={labelBgStyle}
        labelBgPadding={[8, 5]}
      />
    </g>
  );
}
