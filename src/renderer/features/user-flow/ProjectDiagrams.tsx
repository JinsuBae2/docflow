import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { Maximize2, Minimize2, PanelLeft } from 'lucide-react';
import { Diagram } from '../graph/Diagram';
import { UserFlowWorkspace } from './UserFlowWorkspace';
import type { Workspace } from '../../../shared/contracts';
import type { FlowEvidence } from '../../../shared/user-flow';

export function ProjectDiagrams(
  props: ComponentProps<typeof Diagram> & {
    workspace: Workspace;
    onRequestFlow?: (flowId: string | null) => void;
    onEvidence: (evidence: FlowEvidence) => void;
    initialMode?: 'mermaid' | 'userflow';
    userFlowFocus?: { flowId: string; nodeId: string };
  },
) {
  const [mode, setMode] = useState<'mermaid' | 'userflow'>(
    props.userFlowFocus ? 'userflow' : props.initialMode || 'mermaid',
  );
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [compact, setCompact] = useState(false);
  const [listOpen, setListOpen] = useState<boolean>();
  const [expandedListOpen, setExpandedListOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const showList = expanded ? expandedListOpen : (listOpen ?? !compact);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 720));
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
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
    <div
      ref={root}
      className={`project-diagrams${expanded ? ' diagrams-expanded' : ''}${showList ? '' : ' flow-list-collapsed'}`}
      role={expanded ? 'dialog' : undefined}
      aria-modal={expanded || undefined}
      aria-label={expanded ? '다이어그램 확대 보기' : undefined}
      onKeyDown={(event) => {
        if (!expanded) return;
        if (event.key === 'Escape') {
          event.stopPropagation();
          setExpanded(false);
          expandButton.current?.focus();
        }
        if (event.key === 'Tab') {
          const controls = Array.from(
            root.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex="0"]',
            ) || [],
          ).filter((element) => element.getClientRects().length);
          const first = controls[0],
            last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div className="diagram-workspace-toolbar">
        <div className="diagram-workspace-actions">
          <button
            className="button compact"
            aria-expanded={showList}
            onClick={() => (expanded ? setExpandedListOpen(!showList) : setListOpen(!showList))}
          >
            <PanelLeft size={14} /> {showList ? '목록 접기' : '목록 펼치기'}
          </button>
          <button
            ref={expandButton}
            className="button compact"
            aria-pressed={expanded}
            onClick={() => {
              if (!expanded) setExpandedListOpen(false);
              setExpanded(!expanded);
            }}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            {expanded ? '확대 보기 종료' : '다이어그램 확대 보기'}
          </button>
        </div>
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
              {item === 'mermaid' ? '문서 다이어그램' : '유저플로우'}
            </button>
          ))}
        </div>
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
