import { useEffect, useState } from 'react';
import type { AnalysisSummary, Workspace } from '../../../shared/contracts';

const statuses = {
  ready: '준비',
  running: '분석 중',
  paused: '일시 중단',
  completed: '완료',
  error: '오류',
};
export function AnalysisDialog({
  workspace,
  initialInstruction,
  initialExcluded,
  running,
  onStart,
  onError,
  onClose,
}: {
  workspace: Workspace;
  initialInstruction: string;
  initialExcluded: string[];
  running: boolean;
  onStart: (id: string) => Promise<void>;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const [instruction, setInstruction] = useState(
    initialInstruction || '프로젝트 문서의 빠진 내용과 모순, 문서 간 연결을 검토해 주세요.',
  );
  const [excluded, setExcluded] = useState(initialExcluded);
  const [contextTokens, setContextTokens] = useState(32768);
  const [outputTokens, setOutputTokens] = useState(8192);
  const [plan, setPlan] = useState<AnalysisSummary | null>(null);
  const [history, setHistory] = useState<AnalysisSummary[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      void window.workspace
        .listAnalyses()
        .then((items) => {
          if (!alive) return;
          setHistory(items);
          setPlan((current) =>
            current ? items.find((item) => item.id === current.id) || current : null,
          );
        })
        .catch((error) => {
          if (alive) onError(error.message);
        });
    refresh();
    const timer = setInterval(refresh, 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [onError]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const blocked = busy || running;
  return (
    <div className="modal-backdrop">
      <section
        className="modal context-modal"
        role="dialog"
        aria-modal="true"
        aria-label="프로젝트 전체 분석"
      >
        <div className="modal-heading">
          <h2>프로젝트 전체 분석</h2>
          <button className="button" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="context-content analysis-content">
          <p>
            저장된 등록 문서를 나눠 분석합니다. 모델의 실제 한도는 확인되지 않았으며 아래 값은 로컬
            예산입니다. 여러 AI 호출로 사용량이 늘어날 수 있습니다.
          </p>
          <label>
            분석 요청
            <textarea
              aria-label="분석 요청"
              value={instruction}
              disabled={blocked}
              onChange={(e) => {
                setInstruction(e.target.value);
                setPlan(null);
              }}
            />
          </label>
          <div className="analysis-budgets">
            <label>
              전체 맥락 예산
              <input
                aria-label="전체 맥락 예산"
                type="number"
                min={20000}
                max={200000}
                value={contextTokens}
                disabled={blocked}
                onChange={(e) => {
                  setContextTokens(Number(e.target.value));
                  setPlan(null);
                }}
              />
            </label>
            <label>
              출력 예산
              <input
                aria-label="출력 예산"
                type="number"
                min={1024}
                max={8192}
                value={outputTokens}
                disabled={blocked}
                onChange={(e) => {
                  setOutputTokens(Number(e.target.value));
                  setPlan(null);
                }}
              />
            </label>
          </div>
          <p>
            지침·응답 형식 여유 8,192 토큰을 별도로 남깁니다. UTF-8 바이트 기준 상한 추정으로
            한국어는 특히 보수적입니다. Codex 출력은 수신 후 크기를 검증합니다.
          </p>
          <h3>전송 범위</h3>
          {workspace.documents.map((doc) => (
            <label className="context-source" key={doc.id}>
              <input
                type="checkbox"
                checked={!excluded.includes(doc.id)}
                disabled={blocked}
                onChange={(e) => {
                  setExcluded(
                    e.target.checked
                      ? excluded.filter((id) => id !== doc.id)
                      : [...excluded, doc.id],
                  );
                  setPlan(null);
                }}
              />
              <span>{doc.title}</span>
              <small>
                {doc.markdown.length.toLocaleString()}자{' '}
                {workspace.drafts?.some((d) => d.documentId === doc.id) && '· 초안 있음'}
              </small>
            </label>
          ))}
          <p>
            초안 문서는 저장하거나 제외해야 합니다. 문서·섹션·링크 근거를 우선 검색하고 모든 포함
            본문을 순서대로 처리합니다. 마지막에 기존 연결 양쪽의 관련 발췌를 함께 검토합니다. 링크
            없는 문서 조합의 전수 관계 분석은 포함되지 않습니다.
          </p>
          <button
            className="button"
            disabled={blocked || !instruction.trim()}
            onClick={() =>
              void act(async () =>
                setPlan(
                  await window.workspace.prepareAnalysis({
                    instruction,
                    selectedIds: [],
                    excludedIds: excluded,
                    contextTokens,
                    outputTokens,
                  }),
                ),
              )
            }
          >
            분석 계획 확인
          </button>
          {plan && (
            <div className="context-project" aria-live="polite">
              <strong>
                {statuses[plan.status]} · {plan.completed}/{plan.total} 묶음 · 재사용 {plan.cached}
              </strong>
              <p>
                {plan.provider} · {plan.model || '기본 모델'} · 입력 상한{' '}
                {plan.budget.inputTokens.toLocaleString()} · 출력{' '}
                {plan.budget.outputTokens.toLocaleString()}
              </p>
              <p>
                포함 {plan.documentIds.length}개 · 제외 {plan.excludedIds.length}개 ·{' '}
                {plan.instruction}
              </p>
              <details>
                <summary>전송 근거 · 문서/섹션/범위/버전</summary>
                {plan.evidence?.map((s, i) => (
                  <p key={`${s.sourceId}:${i}`}>
                    {s.phase === 'links' ? '연결' : '본문'} · {s.title} · {s.start}–{s.end}
                    <br />
                    <small>
                      문서 {s.documentId} · 섹션 {s.sectionId || '문서 머리'} ·{' '}
                      {s.revision.slice(0, 8)}
                    </small>
                  </p>
                ))}
              </details>
              {plan.error && <p role="alert">{plan.error}</p>}
              {plan.warnings?.map((warning, index) => (
                <p key={index}>누락 근거: {warning}</p>
              ))}
              <button
                className="button primary"
                disabled={blocked || plan.status === 'completed'}
                onClick={() => void act(async () => onStart(plan.id))}
              >
                {plan.completed || plan.status === 'paused' || plan.status === 'error'
                  ? '분석 재개'
                  : '분석 시작'}
              </button>
              {running && (
                <button className="button" onClick={() => void window.workspace.cancelRequest()}>
                  분석 취소
                </button>
              )}
            </div>
          )}
          {!!history.length && (
            <details>
              <summary>저장된 분석 · 완료된 묶음 재사용</summary>
              {history
                .slice()
                .reverse()
                .map((item) => (
                  <button
                    className="context-source"
                    key={item.id}
                    disabled={blocked}
                    onClick={() => {
                      setPlan(item);
                      setInstruction(item.instruction);
                      setExcluded(item.excludedIds);
                      setContextTokens(item.budget.contextTokens);
                      setOutputTokens(item.budget.outputTokens);
                    }}
                  >
                    {statuses[item.status]} {item.completed}/{item.total} · {item.instruction}
                  </button>
                ))}
            </details>
          )}
        </div>
      </section>
    </div>
  );
}
