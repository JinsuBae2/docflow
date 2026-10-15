import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import { displayRouteLabel, type Route } from './routing';
export function RoutedEdge(props: EdgeProps) {
  const { id, data, markerEnd, style, label, labelStyle, labelBgStyle } = props;
  const route = data?.route as Route | undefined;
  const ready = route?.status === 'ready' && route.points.length >= 2;
  const fallback = getBezierPath(props);
  const path = ready
    ? route.points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
    : fallback[0];
  const text = typeof label === 'string' ? displayRouteLabel(label) : label;
  const labelPosition = ready ? route.labelPosition : { x: fallback[1], y: fallback[2] };
  return (
    <g
      data-routing={ready ? 'routed' : 'fallback'}
      data-sourcehandle={props.sourceHandleId}
      data-targethandle={props.targetHandleId}
    >
      <title>{typeof label === 'string' ? label : '문서 연결'}</title>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={style}
        label={labelPosition ? text : undefined}
        labelX={labelPosition?.x}
        labelY={labelPosition?.y}
        labelStyle={labelStyle}
        labelBgStyle={labelBgStyle}
        labelBgPadding={[8, 5]}
      />
    </g>
  );
}
