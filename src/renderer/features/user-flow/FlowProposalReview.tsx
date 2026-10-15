import { useEffect, useState } from 'react';
import ELK from 'elkjs/lib/elk-api.js';
import type { Proposal, Workspace } from '../../../shared/contracts';
import type { UserFlow } from '../../../shared/user-flow';
import { flowProposalPreview } from '../../../shared/flow-proposal-preview';
import { Dialog } from '../../components/Dialog';
import type { FlowLayout } from './layout';
import { layoutFlowProposal } from './proposal-layout';
import { UserFlowCanvas } from './UserFlowCanvas';

export function FlowProposalReview({
  proposal,
  workspace,
  disabled,
  onClose,
  onAccept,
  onReject,
  onSource,
}: {
  proposal: Proposal;
  workspace: Workspace;
  disabled: boolean;
  onClose: () => void;
  onSource: (id: string) => void;
  onAccept: (id: string, flow?: UserFlow) => void;
  onReject: (id: string, reason: string, feedbackId: string) => Promise<boolean>;
}) {
  const [layout, setLayout] = useState<FlowLayout>();
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [feedbackId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let active = true;
    const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
    const engine = new ELK({ workerFactory: () => worker });
    void layoutFlowProposal(proposal.baseFlow || null, proposal.flow!, engine)
      .then((result) => {
        if (active) setLayout(result);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
      worker.terminate();
    };
  }, [proposal]);
  const preview =
    layout && flowProposalPreview(proposal.baseFlow || null, proposal.flow!, layout.flow);
  return (
    <Dialog title="유저플로우 Diff 검토" onClose={onClose} locked={disabled}>
      <div className="flow-review">
        <div className="flow-review-bar">
          <div>
            <strong>{proposal.title}</strong>
            <p>{proposal.reason}</p>
          </div>
          <button
            className="button primary"
            disabled={disabled || !layout || !!error || proposal.status !== 'pending'}
            onClick={() => onAccept(proposal.id, layout!.flow)}
          >
            플로우 수락
          </button>
          <button className="button" disabled={disabled} onClick={() => setRejecting(!rejecting)}>
            플로우 거절
          </button>
        </div>
        <div className="flow-diff-legend" aria-label="플로우 변경 범례">
          <span className="flow-diff-added">추가됨</span>
          <span className="flow-diff-modified">수정됨</span>
          <span className="flow-diff-deleted">삭제됨</span>
          <span>원본은 수락 전까지 유지됩니다.</span>
        </div>
        {rejecting && (
          <div className="proposal-input">
            <textarea
              aria-label="플로우 거절 이유"
              maxLength={3000}
              value={reason}
              disabled={disabled}
              onChange={(event) => setReason(event.target.value)}
              placeholder="사유를 입력하면 후속 보완을 요청합니다 (선택)"
            />
            <button
              className="button"
              disabled={disabled}
              onClick={async () => {
                if (await onReject(proposal.id, reason, feedbackId)) onClose();
              }}
            >
              거절 확정
            </button>
          </div>
        )}
        {proposal.status === 'stale' && (
          <p role="alert">
            기준 플로우 또는 근거 문서가 변경되었습니다. 제안 목록에서 수정 요청을 보내 최신
            기준으로 다시 검토해 주세요.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        {!preview ? (
          <p role="status">변경 미리보기를 배치하고 있습니다…</p>
        ) : (
          <>
            <UserFlowCanvas
              flow={preview.flow}
              documents={workspace.documents}
              paths={{}}
              disabled
              onChange={() => {}}
              onEvidence={(evidence) => {
                onClose();
                onSource(evidence.sectionId || evidence.documentId);
              }}
              changes={preview.changes}
            />
            <details className="flow-review-summary" open>
              <summary>변경 속성</summary>
              {(['nodes', 'edges'] as const).flatMap((kind) =>
                Object.entries(preview.changes[kind])
                  .filter(([, change]) => change.status !== 'unchanged')
                  .map(([id, change]) => (
                    <p key={`${kind}-${id}`}>
                      <strong>
                        {kind === 'nodes' ? '노드' : '연결'} {id} · {change.status}
                      </strong>
                      {change.summary && <span>{change.summary}</span>}
                    </p>
                  )),
              )}
            </details>
          </>
        )}
      </div>
    </Dialog>
  );
}
