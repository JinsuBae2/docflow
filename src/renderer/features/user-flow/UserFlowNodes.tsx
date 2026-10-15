import { useLayoutEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from '@xyflow/react';
import { Database, MousePointer2, GitFork } from 'lucide-react';
import type { Document } from '../../../shared/contracts';
import type { FlowChange } from '../../../shared/flow-proposal-preview';
import { flowNodeGeometry } from './node-geometry';
import type { FlowEvidence, UserFlowNode } from '../../../shared/user-flow';

export type SemanticFlowNode = Node<
  {
    node: UserFlowNode;
    change?: FlowChange;
    documents: Document[];
    inputs: string[];
    outputs: Array<{ id: string; label?: string }>;
    onEvidence: (evidence: FlowEvidence) => void;
    onToggle: (button: HTMLButtonElement) => void;
  },
  'semantic'
>;

export function UserFlowNodeCard({ data }: NodeProps<SemanticFlowNode>) {
  const { node, documents, inputs, outputs, change } = data;
  const geometry = flowNodeGeometry(node, inputs, outputs);
  const updateNodeInternals = useUpdateNodeInternals();
  const handles = JSON.stringify({ inputs, outputs, collapsed: node.collapsed });
  useLayoutEffect(() => {
    updateNodeInternals(node.id);
  }, [node.id, node.width, node.height, handles, updateNodeInternals]);
  const labels = {
    group: '여정',
    startEnd: node.data.role === 'end' ? '종료' : '시작',
    page: '화면',
    action: '사용자 행동',
    condition: '조건 분기',
    system: '시스템 처리',
  };
  return (
    <div
      className={`user-flow-card user-flow-${node.type} ${node.collapsed ? 'is-collapsed' : ''} ${change ? `flow-diff-${change.status}` : ''}`}
      title={change?.summary || undefined}
      data-diff={change?.status}
    >
      <div className="user-flow-card-header">
        {node.type === 'page' && (
          <span className="browser-dots" aria-hidden="true">
            ● ● ●
          </span>
        )}
        {node.type === 'action' && <MousePointer2 size={16} />}
        {node.type === 'condition' && <GitFork size={18} />}
        {node.type === 'system' && <Database size={18} />}
        <small>{labels[node.type]}</small>
        {node.type === 'group' && (
          <button
            className="nodrag nopan text-button"
            aria-label={`${node.data.label} ${node.collapsed ? '펼치기' : '접기'}`}
            onClick={(event) => {
              event.stopPropagation();
              data.onToggle(event.currentTarget);
            }}
          >
            {node.collapsed ? '+' : '−'}
          </button>
        )}
      </div>
      {change && change.status !== 'unchanged' && (
        <span className="flow-change-badge">
          {{ added: '추가됨', modified: '수정됨', deleted: '삭제됨' }[change.status]}
        </span>
      )}
      <strong title={node.data.label}>{node.data.label}</strong>
      {node.type !== 'group' && node.data.description && <p>{node.data.description}</p>}
      {node.type === 'page' && !!node.data.components?.length && (
        <ul>
          {node.data.components.slice(0, 3).map((component, index) => (
            <li key={index}>{component}</li>
          ))}
        </ul>
      )}
      <div className="user-flow-evidence nodrag nopan">
        {node.origin === 'inferred' && <span className="inferred-badge">AI 추정</span>}
        {node.evidence.map((evidence, index) => {
          const doc = documents.find((doc) => doc.id === evidence.documentId);
          const section = evidence.sectionId
            ? doc?.sections.find((section) => section.id === evidence.sectionId)
            : undefined;
          const stale = doc?.revision !== evidence.revision;
          return (
            <button
              key={index}
              className={stale ? 'evidence-stale' : ''}
              disabled={!doc || (!!evidence.sectionId && !section)}
              title={`${doc?.title || '삭제된 문서'}${section ? ` · ${section.title}` : ''}${stale ? ' · 근거 변경됨' : ''}`}
              aria-label={`${node.data.label} 문서 근거 ${index + 1}${stale ? ' 변경됨' : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                data.onEvidence(evidence);
              }}
            >
              문서 근거{stale ? ' · 변경됨' : ''}
              {node.evidence.length > 1 ? ` ${index + 1}` : ''}
            </button>
          );
        })}
      </div>
      {inputs.map((id) => (
        <Handle
          key={id}
          id={id}
          type="target"
          position={Position.Left}
          style={{
            top: geometry.handles.find((handle) => handle.type === 'target' && handle.id === id)!.y,
          }}
          isConnectable={false}
        />
      ))}
      {outputs.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={Position.Right}
          style={{
            top: geometry.handles.find(
              (handle) => handle.type === 'source' && handle.id === port.id,
            )!.y,
          }}
          isConnectable={false}
        >
          {port.label && <span className="user-flow-port-label">{port.label}</span>}
        </Handle>
      ))}
    </div>
  );
}
