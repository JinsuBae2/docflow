import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Database, MousePointer2, GitFork } from 'lucide-react';
import type { Document } from '../../../shared/contracts';
import type { FlowEvidence, UserFlowNode } from '../../../shared/user-flow';

export type SemanticFlowNode = Node<
  {
    node: UserFlowNode;
    documents: Document[];
    inputs: string[];
    outputs: Array<{ id: string; label?: string }>;
    onEvidence: (evidence: FlowEvidence) => void;
    onToggle: () => void;
  },
  'semantic'
>;

export function UserFlowNodeCard({ data }: NodeProps<SemanticFlowNode>) {
  const { node, documents, inputs, outputs } = data;
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
      className={`user-flow-card user-flow-${node.type} ${node.collapsed ? 'is-collapsed' : ''}`}
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
              data.onToggle();
            }}
          >
            {node.collapsed ? '+' : '−'}
          </button>
        )}
      </div>
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
      {inputs.map((id, index) => (
        <Handle
          key={id}
          id={id}
          type="target"
          position={Position.Left}
          style={{
            top:
              node.type === 'group' && !node.collapsed
                ? 70
                : `${(100 * (index + 1)) / (inputs.length + 1)}%`,
          }}
          isConnectable={false}
        />
      ))}
      {outputs.map((port, index) => (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={Position.Right}
          style={{
            top:
              node.type === 'group' && !node.collapsed
                ? 70
                : `${(100 * (index + 1)) / (outputs.length + 1)}%`,
          }}
          isConnectable={false}
        >
          {port.label && <span className="user-flow-port-label">{port.label}</span>}
        </Handle>
      ))}
    </div>
  );
}
