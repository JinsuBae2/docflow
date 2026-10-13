import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, FileText, X } from 'lucide-react';
import type { Document, ProjectEntry } from '../../shared/contracts';
export function ProjectSections({
  entries,
  activeRoot,
  disabled,
  children,
  onSelect,
  onForget,
  onError,
}: {
  entries: ProjectEntry[];
  activeRoot?: string;
  disabled: boolean;
  children: ReactNode;
  onSelect: (entry: ProjectEntry, documentId?: string) => void;
  onForget: (entry: ProjectEntry) => void;
  onError: (message: string) => void;
}) {
  const [documents, setDocuments] = useState<
    Record<string, Array<Pick<Document, 'id' | 'title' | 'type'>>>
  >({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let active = true;
    for (const entry of entries) {
      const folded = collapsed[entry.id] ?? entry.collapsed ?? entry.root !== activeRoot;
      if (!folded && !entry.error && entry.root !== activeRoot) {
        void window.workspace
          .projectDocuments(entry.id)
          .then((docs) => {
            if (active) setDocuments((old) => ({ ...old, [entry.id]: docs }));
          })
          .catch((e) => {
            if (active) onError(e.message);
          });
      }
    }
    return () => {
      active = false;
    };
  }, [entries, activeRoot, collapsed]);
  const toggle = async (entry: ProjectEntry, value: boolean) => {
    try {
      await window.workspace.setProjectCollapsed(entry.id, value);
      setCollapsed((old) => ({ ...old, [entry.id]: value }));
    } catch (e) {
      onError((e as Error).message);
    }
  };
  return (
    <div className="project-sections">
      {entries.map((entry) => {
        const active = entry.root === activeRoot;
        const folded = collapsed[entry.id] ?? entry.collapsed ?? !active;
        return (
          <section
            key={entry.id}
            className={'project-section ' + (active ? 'current-project' : '')}
          >
            <div className="project-section-heading">
              <button
                className="project-fold"
                aria-label={`프로젝트 ${folded ? '펼치기' : '접기'}: ${entry.name}`}
                aria-expanded={!folded}
                data-tooltip={
                  folded
                    ? '이 프로젝트의 문서 목록을 펼칩니다. 현재 작업 프로젝트는 바뀌지 않습니다.'
                    : '문서 목록만 접습니다. 편집 중인 문서와 초안은 유지됩니다.'
                }
                title={folded ? '프로젝트 문서 목록 펼치기' : '프로젝트 문서 목록 접기'}
                onClick={() => void toggle(entry, !folded)}
              >
                {folded ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
              <button
                className="project-name"
                aria-label={`프로젝트 전환: ${entry.name}`}
                aria-current={active ? 'true' : undefined}
                disabled={disabled || !!entry.error}
                data-tooltip={
                  entry.error ||
                  '현재 초안을 보존하고 이 프로젝트의 문서·대화·관계 지도로 전환합니다.'
                }
                title={entry.error || '이 프로젝트의 문서·대화·관계 지도로 전환'}
                onClick={() => onSelect(entry)}
              >
                {entry.name}
                {active && <span className="project-active-mark">작업 중</span>}
              </button>
              <button
                className="project-forget"
                aria-label={`목록에서 숨기기: ${entry.name}`}
                disabled={disabled}
                data-tooltip="목록에서만 숨깁니다. 문서·대화·초안 파일은 삭제하지 않습니다."
                title="프로젝트 목록에서 숨기기 · 파일과 초안은 유지됩니다"
                onClick={() => onForget(entry)}
              >
                <X size={12} />
              </button>
            </div>
            {entry.error && <p className="project-entry-error">{entry.error}</p>}
            {!folded &&
              (active ? (
                children
              ) : (
                <nav className="inactive-project-docs">
                  {documents[entry.id]?.map((doc) => (
                    <button
                      key={doc.id}
                      disabled={disabled}
                      onClick={() => onSelect(entry, doc.id)}
                    >
                      <FileText size={14} />
                      <span>{doc.title}</span>
                    </button>
                  ))}
                  {!documents[entry.id]?.length && (
                    <button disabled={disabled || !!entry.error} onClick={() => onSelect(entry)}>
                      프로젝트 열기
                    </button>
                  )}
                </nav>
              ))}
          </section>
        );
      })}
      {!entries.length && children}
    </div>
  );
}
