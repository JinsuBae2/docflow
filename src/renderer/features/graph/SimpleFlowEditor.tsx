import { useEffect, useState } from 'react';
import { ReactFlow, Background, Controls, MarkerType, Position } from '@xyflow/react';
import { layoutDocuments } from './layout';
import { serializeSimpleFlow, type SimpleFlow } from '../../../shared/flows';

export function SimpleFlowEditor({
  initial,
  onSave,
  onCancel,
  onDirty,
}: {
  initial: SimpleFlow;
  onSave: (code: string) => Promise<void>;
  onCancel: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [flow, setFlow] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [from, setFrom] = useState(initial.nodes[0]?.id || '');
  const [to, setTo] = useState(initial.nodes[1]?.id || initial.nodes[0]?.id || '');
  const dirty = JSON.stringify(flow) !== JSON.stringify(initial);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const positions = layoutDocuments(
    flow.nodes.map((node) => node.id),
    flow.edges,
  );
  const horizontal = flow.direction === 'LR' || flow.direction === 'RL';
  const reverse = flow.direction === 'RL' || flow.direction === 'BT';
  const nodes = flow.nodes.map((node) => {
    const position = positions[node.id];
    return {
      id: node.id,
      data: { label: node.label },
      position: horizontal
        ? { x: position.y * (reverse ? -1 : 1), y: position.x }
        : { x: position.x, y: position.y * (reverse ? -1 : 1) },
      sourcePosition: horizontal
        ? reverse
          ? Position.Left
          : Position.Right
        : reverse
          ? Position.Top
          : Position.Bottom,
      targetPosition: horizontal
        ? reverse
          ? Position.Right
          : Position.Left
        : reverse
          ? Position.Bottom
          : Position.Top,
    };
  });
  const connect = (source: string, target: string) => {
    if (
      !flow.nodes.some((node) => node.id === source) ||
      !flow.nodes.some((node) => node.id === target)
    )
      return;
    if (flow.edges.some((edge) => edge.from === source && edge.to === target)) {
      setError('이미 연결된 단계입니다.');
      return;
    }
    setError('');
    setFlow({ ...flow, edges: [...flow.edges, { from: source, to: target }] });
  };
  let code = '';
  try {
    code = serializeSimpleFlow(flow);
  } catch {
    /* Invalid labels remain editable until corrected. */
  }
  return (
    <section className="simple-flow-editor" aria-label="기본 흐름 편집기">
      <div className="flow-edit-canvas">
        <ReactFlow
          nodes={nodes}
          edges={flow.edges.map((edge) => ({
            id: edge.from + ':' + edge.to,
            source: edge.from,
            target: edge.to,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed },
          }))}
          fitView
          fitViewOptions={{ maxZoom: 1 }}
          nodesDraggable={false}
          nodesConnectable={!saving}
          deleteKeyCode={null}
          onConnect={(edge) => {
            if (edge.source && edge.target) connect(edge.source, edge.target);
          }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <div className="flow-edit-fields">
        <p>
          사각 단계를 연결점으로 잇거나 아래에서 연결하세요. 문서에는 단계·연결·방향을 저장하며
          위치는 자동 배치합니다.
        </p>
        <label>
          방향{' '}
          <select
            aria-label="흐름 방향"
            disabled={saving}
            value={flow.direction}
            onChange={(event) =>
              setFlow({ ...flow, direction: event.target.value as SimpleFlow['direction'] })
            }
          >
            {['TD', 'TB', 'BT', 'LR', 'RL'].map((direction) => (
              <option key={direction}>{direction}</option>
            ))}
          </select>
        </label>
        {flow.nodes.map((node) => (
          <div className="flow-node-field" key={node.id}>
            <label>
              {node.id}
              <input
                aria-label={'단계 이름 ' + node.id}
                disabled={saving}
                maxLength={200}
                value={node.label}
                onChange={(event) =>
                  setFlow({
                    ...flow,
                    nodes: flow.nodes.map((item) =>
                      item.id === node.id ? { ...item, label: event.target.value } : item,
                    ),
                  })
                }
              />
            </label>
            <button
              className="text-button"
              disabled={saving || flow.nodes.length === 1}
              aria-label={'단계 삭제 ' + node.id}
              onClick={() =>
                setFlow({
                  ...flow,
                  nodes: flow.nodes.filter((item) => item.id !== node.id),
                  edges: flow.edges.filter((edge) => edge.from !== node.id && edge.to !== node.id),
                })
              }
            >
              삭제
            </button>
          </div>
        ))}
        <button
          className="button compact"
          disabled={saving || flow.nodes.length >= 100}
          onClick={() => {
            let index = 1;
            while (flow.nodes.some((node) => node.id === 'Step' + index)) index++;
            setFlow({ ...flow, nodes: [...flow.nodes, { id: 'Step' + index, label: '새 단계' }] });
          }}
        >
          새 단계 추가
        </button>
        <div className="flow-connect-fields">
          <select
            aria-label="연결 시작 단계"
            disabled={saving}
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          >
            {flow.nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.id} · {node.label}
              </option>
            ))}
          </select>
          <select
            aria-label="연결 대상 단계"
            disabled={saving}
            value={to}
            onChange={(event) => setTo(event.target.value)}
          >
            {flow.nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.id} · {node.label}
              </option>
            ))}
          </select>
          <button
            className="button compact"
            disabled={saving || flow.edges.length >= 200}
            onClick={() => connect(from, to)}
          >
            단계 연결
          </button>
        </div>
        {flow.edges.map((edge) => (
          <div className="flow-edge-field" key={edge.from + ':' + edge.to}>
            <span>
              {edge.from} → {edge.to}
            </span>
            <button
              className="text-button"
              disabled={saving}
              aria-label={`연결 삭제 ${edge.from} ${edge.to}`}
              onClick={() =>
                setFlow({ ...flow, edges: flow.edges.filter((item) => item !== edge) })
              }
            >
              연결 삭제
            </button>
          </div>
        ))}
        <details>
          <summary>저장할 Mermaid 코드</summary>
          <pre>{code || '단계 이름과 연결을 확인해 주세요.'}</pre>
        </details>
        {error && (
          <p role="alert" className="inline-warning">
            {error}
          </p>
        )}
        <div className="action-row">
          <button
            className="button"
            disabled={saving}
            onClick={() => {
              if (!dirty || confirm('저장하지 않은 흐름 편집을 취소할까요?')) onCancel();
            }}
          >
            흐름 편집 취소
          </button>
          <button
            className="button primary"
            disabled={saving || !dirty || !code}
            onClick={async () => {
              setSaving(true);
              setError('');
              try {
                await onSave(serializeSimpleFlow(flow));
              } catch (error) {
                setError((error as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            흐름 원본에 저장
          </button>
        </div>
      </div>
    </section>
  );
}
