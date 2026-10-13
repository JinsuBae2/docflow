import { useState } from 'react';
import { diffLines } from 'diff';
import {
  Check,
  X,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  FilePlus2,
  FilePenLine,
  GitBranch,
  BookmarkCheck,
  ArrowUpRight,
} from 'lucide-react';
import type { Proposal, Workspace } from '../../../shared/contracts';
const statuses = {
  pending: '검토 대기',
  accepted: '수락됨',
  rejected: '거절됨',
  stale: '재검토 필요',
  superseded: '대체됨',
};
function ProposalItem({
  proposal: p,
  workspace,
  onAccept,
  onReject,
  onRevise,
  onSource,
  onRetry,
  disabled,
}: {
  proposal: Proposal;
  workspace: Workspace;
  onAccept: (id: string) => void;
  onReject: (id: string, reason: string, feedbackId: string) => Promise<boolean>;
  onRetry: (id: string) => void;
  disabled: boolean;
  onRevise: (proposal: Proposal, text: string) => void;
  onSource: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(p.status === 'pending');
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'none' | 'reject' | 'revise'>('none');
  const [feedbackId, setFeedbackId] = useState(() => crypto.randomUUID());
  const feedback = workspace.feedbacks?.find((f) => f.proposalId === p.id);
  const target = workspace.documents.find((d) => d.id === p.targetId);
  const scope = p.sourceRanges?.find((s) => s.id === p.scopedSourceId);
  const before =
    p.kind === 'update'
      ? (scope ? target?.markdown.slice(scope.start, scope.end) : target?.markdown) || ''
      : '';
  const icon =
    p.kind === 'create' ? (
      <FilePlus2 size={15} />
    ) : p.kind === 'diagram' || p.kind === 'relation' ? (
      <GitBranch size={15} />
    ) : p.kind === 'decision' ? (
      <BookmarkCheck size={15} />
    ) : (
      <FilePenLine size={15} />
    );
  const source = (id: string) =>
    workspace.documents.find(
      (d) =>
        d.id === id ||
        d.sections.some((s) => s.id === id) ||
        p.sourceRanges?.some((s) => s.id === id && s.documentId === d.id),
    );
  return (
    <section className={'proposal-item proposal-' + p.status}>
      <button className="proposal-heading" onClick={() => setExpanded(!expanded)}>
        {icon}
        <strong>{p.title}</strong>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      <div className="proposal-meta">
        <span className={'status-pill status-' + p.status}>{statuses[p.status]}</span>
        <span>
          {target?.title ||
            (p.kind === 'decision'
              ? '프로젝트 결정'
              : p.kind === 'relation'
                ? '문서 연결'
                : '새 문서')}
        </span>
      </div>
      {expanded && (
        <>
          {p.kind === 'relation' && p.relation && (
            <div className="relation-proposal-summary">
              <strong>{source(p.relation.fromId)?.title || '문서 확인 필요'}</strong>
              <span>→ {p.relation.relationType} →</span>
              <strong>{source(p.relation.toId)?.title || '문서 확인 필요'}</strong>
              <small>
                검토 기준 {p.relation.fromRevision.slice(0, 8)} ·{' '}
                {p.relation.toRevision.slice(0, 8)}
              </small>
            </div>
          )}
          <p className="proposal-reason">{p.reason}</p>
          {scope && (
            <p className="processed-note">
              발췌 범위만 수정: {scope.start}–{scope.end} · 기준 {p.baseRevision?.slice(0, 8)}
            </p>
          )}
          <div className="source-links">
            {p.sourceIds.map((id) => (
              <button key={id} onClick={() => onSource(source(id)?.id || id)}>
                <ArrowUpRight size={11} />
                {source(id)?.title || '근거 확인'}
              </button>
            ))}
          </div>
          {p.status === 'pending' || p.status === 'stale' ? (
            <div className="proposal-diff" aria-label="변경 전후">
              {diffLines(before, p.replacement).map((part, index) => (
                <pre
                  key={index}
                  className={
                    part.added ? 'diff-added' : part.removed ? 'diff-removed' : 'diff-same'
                  }
                >
                  {part.value}
                </pre>
              ))}
            </div>
          ) : (
            <p className="processed-note">
              {p.status === 'rejected'
                ? p.rejectionReason || '작성자가 제안을 거절했습니다.'
                : p.status === 'accepted'
                  ? '문서 또는 프로젝트 결정에 반영했습니다.'
                  : '후속 제안으로 대체되었습니다.'}
            </p>
          )}
          {(p.status === 'pending' || p.status === 'stale') && (
            <>
              {mode !== 'none' && (
                <div className="proposal-input">
                  <textarea
                    maxLength={3000}
                    disabled={disabled}
                    aria-label={mode === 'reject' ? '거절 이유' : '수정 요청'}
                    placeholder={mode === 'reject' ? '거절 이유 (선택)' : '어떻게 수정할까요?'}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <button
                    className="button compact"
                    disabled={disabled || (mode === 'revise' && !reason.trim())}
                    onClick={async () => {
                      if (mode === 'reject') {
                        if (!(await onReject(p.id, reason, feedbackId))) return;
                      } else onRevise(p, reason);
                      setMode('none');
                      setReason('');
                    }}
                  >
                    {mode === 'reject' ? '보내기' : '수정 요청 보내기'}
                  </button>
                  <button
                    className="text-button"
                    aria-label={mode === 'reject' ? '거절 취소' : '수정 요청 취소'}
                    disabled={disabled}
                    onClick={() => {
                      setMode('none');
                      setReason('');
                      setFeedbackId(crypto.randomUUID());
                    }}
                  >
                    취소
                  </button>
                </div>
              )}
              <div className="proposal-actions">
                {p.status === 'pending' && (
                  <button
                    className="button primary compact"
                    aria-label="제안 수락"
                    disabled={disabled}
                    onClick={() => onAccept(p.id)}
                  >
                    <Check size={14} />
                    수락
                  </button>
                )}
                <button
                  className="icon-button"
                  aria-label="제안 거절"
                  title="거절"
                  disabled={disabled}
                  onClick={() => setMode('reject')}
                >
                  <X size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label="제안 수정 요청"
                  title="수정 요청"
                  disabled={disabled}
                  onClick={() => setMode(mode === 'revise' ? 'none' : 'revise')}
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  className="text-button reason-button"
                  disabled={disabled}
                  onClick={() => setMode(mode === 'reject' ? 'none' : 'reject')}
                >
                  이유 남기기
                </button>
              </div>
            </>
          )}
          {feedback && ['failed', 'ready'].includes(feedback.status) && (
            <div className="proposal-input">
              <p className="processed-note">
                후속 답변을 받지 못했습니다. 거절 이유는 저장되었습니다.
              </p>
              <button
                className="button compact"
                disabled={disabled}
                onClick={() => onRetry(feedback.id)}
              >
                후속 답변 다시 요청
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
export function ProposalList(props: Omit<Parameters<typeof ProposalItem>[0], 'proposal'>) {
  const proposals = [...props.workspace.proposals]
    .reverse()
    .sort(
      (a, b) =>
        Number(['pending', 'stale'].includes(b.status)) -
        Number(['pending', 'stale'].includes(a.status)),
    );
  return (
    <div className="proposal-list">
      {proposals.length ? (
        proposals.map((p) => <ProposalItem key={p.id} proposal={p} {...props} />)
      ) : (
        <div className="empty-state small">
          <FilePenLine size={25} />
          <h3>검토할 제안이 없습니다</h3>
          <p>AI 대화에서 문서 생성이나 보완을 요청하세요.</p>
        </div>
      )}
    </div>
  );
}
