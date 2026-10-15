import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { Diagram } from '../graph/Diagram';
import { UserFlowWorkspace } from './UserFlowWorkspace';
import type { Workspace } from '../../../shared/contracts';
import type { FlowEvidence } from '../../../shared/user-flow';

export function ProjectDiagrams(
  props: ComponentProps<typeof Diagram> & {
    workspace: Workspace;
    onRequestFlow?: (flowId: string | null) => void;
    onEvidence: (evidence: FlowEvidence) => void;
    userFlowFocus?: { flowId: string; nodeId: string };
  },
) {
  const [mode, setMode] = useState<'mermaid' | 'userflow'>(
    props.userFlowFocus ? 'userflow' : 'mermaid',
  );
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (props.userFlowFocus) setMode('userflow');
  }, [props.userFlowFocus]);
  const onDirty = useCallback(
    (dirty: boolean) => {
      setDirty(dirty);
      props.onDirty(dirty);
    },
    [props.onDirty],
  );
  return (
    <div className="project-diagrams">
      <div className="diagram-mode-tabs" role="tablist" aria-label="사용자 흐름 보기">
        {(['mermaid', 'userflow'] as const).map((item) => (
          <button
            key={item}
            role="tab"
            aria-selected={mode === item}
            onClick={() => {
              if (mode !== item && (!dirty || confirm('저장하지 않은 흐름 변경을 버릴까요?')))
                setMode(item);
            }}
          >
            {item === 'mermaid' ? '문서 속 흐름' : '유저플로우'}
          </button>
        ))}
      </div>
      {mode === 'mermaid' ? (
        <Diagram {...props} onDirty={onDirty} />
      ) : (
        <UserFlowWorkspace
          workspace={props.workspace}
          onRequestFlow={props.onRequestFlow}
          onRefresh={props.onRefresh}
          onEvidence={props.onEvidence}
          onDirty={onDirty}
          onEditingChange={props.onEditingChange}
          focus={props.userFlowFocus}
        />
      )}
    </div>
  );
}
