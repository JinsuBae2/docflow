import { BookOpen, Network, GitBranch, ArrowUpRight } from 'lucide-react';
import type { Workspace } from '../../../shared/contracts';
import { isPlanningStart, planningStages, type PlanningMode } from '../../../shared/planning';
import { projectBriefing } from '../../../shared/project-briefing';
import { displayDocumentType } from '../../../shared/document-presentation';
export function ProjectBriefing({
  workspace,
  onDocument,
  onMap,
  onFlows,
  onReview,
  onStartPlanning,
  onResumePlanning,
}: {
  workspace: Workspace;
  onDocument: (id: string) => void;
  onMap: () => void;
  onFlows: (mode: 'mermaid' | 'userflow', flowId?: string) => void;
  onReview: () => void;
  onStartPlanning: (mode: PlanningMode) => void;
  onResumePlanning: (id: string) => void;
}) {
  const briefing = projectBriefing(workspace);
  if (isPlanningStart(workspace.documents))
    return (
      <section className="planning-start">
        <span className="planning-eyebrow">새 소프트웨어 프로젝트</span>
        <h1>{workspace.project.name}</h1>
        <h2>아이디어만 있어도 시작할 수 있습니다.</h2>
        <p>문제와 사용자를 발견하고, MVP와 요구사항을 정리해 첫 문서로 만드세요.</p>
        <div className="planning-start-options">
          <button aria-label="브레인스토밍 시작" onClick={() => onStartPlanning('brainstorm')}>
            <strong>브레인스토밍 시작</strong>
            <span>아이디어를 이야기하며 문제·사용자·대안을 구체화합니다.</span>
          </button>
          <button aria-label="바로 계획 세우기" onClick={() => onStartPlanning('plan')}>
            <strong>바로 계획 세우기</strong>
            <span>정한 아이디어에서 MVP·요구사항·구현과 검증 순서를 정리합니다.</span>
          </button>
        </div>
        {!!workspace.planningSessions?.length && (
          <section>
            <h3>기획 이어가기</h3>
            {workspace.planningSessions.map((session, index) => (
              <button
                className="button"
                key={session.id}
                onClick={() => onResumePlanning(session.id)}
              >
                {index + 1}. {session.mode === 'brainstorm' ? '브레인스토밍' : '계획'} ·{' '}
                {planningStages[session.stage]}
              </button>
            ))}
          </section>
        )}
        <p>
          기존 자료가 있다면 왼쪽에서 Markdown을 가져오거나, 문서 탭에서 직접 작성할 수 있습니다.
        </p>
      </section>
    );

  return (
    <div className="project-briefing">
      <header className="briefing-heading">
        <span className="briefing-eyebrow">프로젝트 브리핑 · AI 호출 없이 표시</span>
        <h1>{workspace.project.name}</h1>
        <p>{workspace.project.goal || '핵심 문서와 연결된 흐름부터 프로젝트를 살펴보세요.'}</p>
        <div className="briefing-stats">
          <span>문서 {workspace.documents.length}개</span>
          <span>연결된 문서 {briefing.connectedCount}개</span>
          <span>유저플로우 {briefing.userFlows.length}개</span>
        </div>
      </header>
      <div className="briefing-grid">
        <section className="briefing-card">
          <h2>
            <BookOpen size={18} /> 어디부터 읽을까요?
          </h2>
          <p>문서 유형과 파일명으로 고른 핵심 후보입니다.</p>
          {briefing.coreDocuments.length ? (
            briefing.coreDocuments.map((doc) => (
              <button className="briefing-link" key={doc.id} onClick={() => onDocument(doc.id)}>
                <span>
                  <strong>{doc.title}</strong>
                  <small>
                    {displayDocumentType(doc) || '문서'} · {doc.sections.length}개 섹션
                  </small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))
          ) : (
            <p>문서를 작성하거나 원본 문서를 추가하면 여기에서 탐색할 수 있습니다.</p>
          )}
        </section>
        <section className="briefing-card">
          <h2>
            <GitBranch size={18} /> 어떤 흐름이 있나요?
          </h2>
          <button className="briefing-link" onClick={() => onFlows('mermaid')}>
            <span>
              <strong>문서 다이어그램 {briefing.sourceFlows.length}개</strong>
              <small>원문에 있는 Mermaid와 정의 파일</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
          {briefing.userFlows.slice(0, 5).map((flow) => (
            <button
              className="briefing-link"
              key={flow.id}
              onClick={() => onFlows('userflow', flow.id)}
            >
              <span>
                <strong>{flow.title}</strong>
                <small>{flow.nodes.filter((n) => n.type !== 'group').length}개 단계</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))}
          {!briefing.userFlows.length && (
            <p>
              저장된 유저플로우가 없습니다. 문서 다이어그램을 먼저 확인하거나 새 흐름을 작성하세요.
            </p>
          )}
          <button className="button compact" onClick={() => onFlows('userflow')}>
            유저플로우 열기
          </button>
        </section>
        <section className="briefing-card">
          <h2>
            <Network size={18} /> 지금 확인할 지점
          </h2>
          <button className="briefing-link" onClick={onReview}>
            <span>
              <strong>
                미확정 제안 {briefing.pendingCount}개 · 재검토 {briefing.staleCount}개
              </strong>
              <small>근거와 변경을 확인한 뒤 반영합니다.</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
          <button className="briefing-link" onClick={onMap}>
            <span>
              <strong>고립 문서 {briefing.isolated.length}개</strong>
              <small>다른 문서와 확정된 연결이 없는 문서</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
          {briefing.isolated.slice(0, 3).map((doc) => (
            <button className="briefing-isolated" key={doc.id} onClick={() => onDocument(doc.id)}>
              {doc.title}
              <ArrowUpRight size={13} />
            </button>
          ))}
          <p>
            확인이 필요한 원문 링크 {briefing.unresolvedLinkCount}개 · 파일/흐름 읽기 문제{' '}
            {briefing.issues.length}개
          </p>
          {briefing.unresolvedDocuments.slice(0, 3).map((doc) => (
            <button key={doc.id} className="briefing-isolated" onClick={() => onDocument(doc.id)}>
              링크 확인: {doc.title}
              <ArrowUpRight size={13} />
            </button>
          ))}
          {!!briefing.unresolvedLinkCount && (
            <p>각 문서의 원문 링크 목록에서 대상 파일과 섹션을 확인하세요.</p>
          )}
          {!!briefing.issues.length && (
            <details>
              <summary>읽기 문제 확인</summary>
              {briefing.issues.map((issue, i) => (
                <p key={i}>{issue}</p>
              ))}
            </details>
          )}
          <button className="button compact" onClick={onMap}>
            문서 구조에서 탐색
          </button>
        </section>
      </div>
      <p className="briefing-footnote">
        이 화면은 저장된 문서·연결·흐름·검토 상태를 집계합니다. AI가 작성한 요약이나 연결의 정확성
        평가가 아닙니다.
      </p>
    </div>
  );
}
