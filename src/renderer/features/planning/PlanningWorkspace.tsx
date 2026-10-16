import { useEffect, useRef, useState } from 'react';
import {
  planningStages,
  type PlanningSession,
  type PlanningPatch,
  type PlanningMode,
} from '../../../shared/planning';

export function PlanningWorkspace({
  session,
  sessions,
  running,
  onSave,
  onDirty,
  onSelect,
  onStart,
  onDraft,
}: {
  session: PlanningSession;
  sessions: PlanningSession[];
  running: boolean;
  onSave: (patch: PlanningPatch) => Promise<void>;
  onDirty: (dirty: boolean) => void;
  onSelect: (id: string) => void;
  onStart: (mode: PlanningMode) => void;
  onDraft: (instruction: string) => void;
}) {
  const [patch, setPatch] = useState<PlanningPatch>({ stage: session.stage, brief: session.brief });
  const [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const [request, setRequest] = useState(
    '프로젝트 개요, MVP 요구사항, 핵심 사용자 시나리오를 검토용 문서 초안으로 작성해줘. 확정 내용과 가정을 구분해줘.',
  );
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setPatch({ stage: session.stage, brief: session.brief });
  }, [session.revision]);
  useEffect(() => () => onDirty(false), [onDirty]);
  const change = (next: PlanningPatch) => {
    setPatch(next);
    dirty.current = true;
    onDirty(true);
  };
  const save = async (next = patch) => {
    setSaving(true);
    setError('');
    try {
      await onSave(next);
      setPatch(next);
      dirty.current = false;
      onDirty(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="planning-workspace">
      <header className="planning-heading">
        <div>
          <span className="planning-eyebrow">
            {session.mode === 'brainstorm' ? '브레인스토밍' : '소프트웨어 기획'}
          </span>
          <h1>아이디어에서 프로젝트로</h1>
          <p>문제와 사용자를 정리하고, 검토한 기획을 첫 문서로 만드세요.</p>
        </div>
        <select
          aria-label="기획 세션"
          value={session.id}
          disabled={running || saving}
          onChange={(e) => onSelect(e.target.value)}
        >
          {sessions.map((item, index) => (
            <option key={item.id} value={item.id}>
              {index + 1}. {item.mode === 'brainstorm' ? '브레인스토밍' : '계획'} ·{' '}
              {planningStages[item.stage]}
            </option>
          ))}
        </select>
      </header>
      <div className="planning-stage-bar">
        <label>
          현재 단계
          <select
            aria-label="기획 단계"
            value={patch.stage}
            disabled={running || saving}
            onChange={(e) => change({ ...patch, stage: e.target.value as PlanningPatch['stage'] })}
          >
            {Object.entries(planningStages).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p>단계를 되돌리거나 필요한 곳부터 시작할 수 있습니다.</p>
        <button
          className="button primary"
          disabled={running || saving || !dirty.current}
          onClick={() => void save()}
        >
          기획 저장
        </button>
        <span role="status">
          {saving ? '기획 저장 중' : dirty.current ? '기획 저장 필요' : '기획 저장됨'}
        </span>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="planning-notes">
        {(
          [
            [
              'confirmed',
              '확정 내용',
              '대상 사용자, 문제, 목표, MVP 범위와 결정한 내용을 정리하세요.',
            ],
            ['openQuestions', '열린 질문', '아직 답하지 못한 질문과 확인할 내용을 남기세요.'],
            ['assumptions', '가정', '검증이 필요한 가정을 확정 내용과 구분하세요.'],
          ] as const
        ).map(([key, label, placeholder]) => (
          <label key={key}>
            {label}
            <textarea
              aria-label={label}
              maxLength={4000}
              value={patch.brief[key]}
              disabled={running || saving}
              placeholder={placeholder}
              onChange={(e) =>
                change({ ...patch, brief: { ...patch.brief, [key]: e.target.value } })
              }
            />
          </label>
        ))}
      </div>
      {session.pendingBrief && (
        <section className="planning-suggestion" aria-label="AI 기획 정리 제안">
          <h2>AI 정리 제안</h2>
          <p>검토하고 반영하기 전까지 확정 내용은 바뀌지 않습니다.</p>
          {Object.entries(session.pendingBrief).map(([key, text]) => (
            <div key={key}>
              <strong>
                {
                  { confirmed: '확정 내용 후보', openQuestions: '열린 질문', assumptions: '가정' }[
                    key
                  ]
                }
              </strong>
              <p>{text || '없음'}</p>
            </div>
          ))}
          <button
            className="button"
            disabled={dirty.current || running || saving}
            onClick={() => void save({ stage: patch.stage, brief: session.pendingBrief! })}
          >
            AI 정리 반영
          </button>
        </section>
      )}
      <section className="planning-documents">
        <h2>첫 문서 만들기</h2>
        <p>
          기본 후보는 프로젝트 개요·MVP 요구사항·사용자 시나리오입니다. 필요한 문서로 조정하세요.
          개발 계획은 범위를 확인한 뒤 구체화합니다.
        </p>
        <textarea
          aria-label="문서 작성 요청"
          maxLength={10000}
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          disabled={running || saving}
        />
        <button
          className="button primary"
          disabled={dirty.current || running || saving || !request.trim()}
          onClick={() => onDraft(request)}
        >
          문서 초안 작성
        </button>
        <small>초안은 제안으로 표시되며 수락한 문서만 저장합니다.</small>
      </section>
      <div className="planning-new">
        <button
          className="text-button"
          disabled={running || saving}
          onClick={() => onStart('brainstorm')}
        >
          새 브레인스토밍
        </button>
        <button
          className="text-button"
          disabled={running || saving}
          onClick={() => onStart('plan')}
        >
          새 계획 세우기
        </button>
      </div>
    </section>
  );
}
