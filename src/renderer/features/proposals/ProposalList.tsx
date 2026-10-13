import { useState } from 'react';
import { diffLines } from 'diff';
import { Check, X, RefreshCw, ChevronDown, ChevronUp, FilePlus2, FilePenLine, GitBranch, BookmarkCheck, ArrowUpRight } from 'lucide-react';
import type { Proposal, Workspace } from '../../../shared/contracts';
const statuses = { pending: '검토 대기', accepted: '수락됨', rejected: '거절됨', stale: '재검토 필요', superseded: '대체됨' };
function ProposalItem({ proposal: p, workspace, onAccept, onReject, onRevise, onSource }: { proposal: Proposal; workspace: Workspace; onAccept: (id: string) => void; onReject: (id: string, reason?: string) => void; onRevise: (proposal: Proposal, text: string) => void; onSource: (id: string) => void }) {
  const [expanded, setExpanded] = useState(p.status === 'pending'); const [reason, setReason] = useState(''); const [mode, setMode] = useState<'none' | 'reject' | 'revise'>('none');
  const target = workspace.documents.find(d => d.id === p.targetId); const before = p.kind === 'update' ? target?.markdown || '' : '';
  const icon = p.kind === 'create' ? <FilePlus2 size={15} /> : p.kind === 'diagram' ? <GitBranch size={15} /> : p.kind === 'decision' ? <BookmarkCheck size={15} /> : <FilePenLine size={15} />;
  const source = (id: string) => workspace.documents.find(d => d.id === id || d.sections.some(s => s.id === id));
  return <section className={'proposal-item proposal-' + p.status}>
    <button className="proposal-heading" onClick={() => setExpanded(!expanded)}>{icon}<strong>{p.title}</strong>{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
    <div className="proposal-meta"><span className={'status-pill status-' + p.status}>{statuses[p.status]}</span><span>{target?.title || (p.kind === 'decision' ? '프로젝트 결정' : '새 문서')}</span></div>
    {expanded && <><p className="proposal-reason">{p.reason}</p><div className="source-links">{p.sourceIds.map(id => <button key={id} onClick={() => onSource(id)}><ArrowUpRight size={11} />{source(id)?.title || '근거 확인'}</button>)}</div>
      {p.status === 'pending' || p.status === 'stale' ? <div className="proposal-diff" aria-label="변경 전후">{diffLines(before, p.replacement).map((part, index) => <pre key={index} className={part.added ? 'diff-added' : part.removed ? 'diff-removed' : 'diff-same'}>{part.value}</pre>)}</div> : <p className="processed-note">{p.status === 'rejected' ? p.rejectionReason || '작성자가 제안을 거절했습니다.' : p.status === 'accepted' ? '문서 또는 프로젝트 결정에 반영했습니다.' : '후속 제안으로 대체되었습니다.'}</p>}
      {(p.status === 'pending' || p.status === 'stale') && <>{mode !== 'none' && <div className="proposal-input"><textarea aria-label={mode === 'reject' ? '거절 이유' : '수정 요청'} placeholder={mode === 'reject' ? '거절 이유 (선택)' : '어떻게 수정할까요?'} value={reason} onChange={e => setReason(e.target.value)} /><button className="button compact" disabled={mode === 'revise' && !reason.trim()} onClick={() => { if (mode === 'reject') onReject(p.id, reason); else onRevise(p, reason); setMode('none'); setReason(''); }}>{mode === 'reject' ? '거절 확정' : '수정 요청 보내기'}</button></div>}
        <div className="proposal-actions">{p.status === 'pending' && <button className="button primary compact" aria-label="제안 수락" onClick={() => onAccept(p.id)}><Check size={14} />수락</button>}<button className="icon-button" aria-label="제안 거절" title="거절" onClick={() => onReject(p.id)}><X size={15} /></button><button className="icon-button" aria-label="제안 수정 요청" title="수정 요청" onClick={() => setMode(mode === 'revise' ? 'none' : 'revise')}><RefreshCw size={14} /></button><button className="text-button reason-button" onClick={() => setMode(mode === 'reject' ? 'none' : 'reject')}>이유 남기기</button></div></>}
    </>}
  </section>;
}
export function ProposalList(props: Omit<Parameters<typeof ProposalItem>[0], 'proposal'>) {
  const proposals = [...props.workspace.proposals].reverse().sort((a, b) => Number(['pending', 'stale'].includes(b.status)) - Number(['pending', 'stale'].includes(a.status)));
  return <div className="proposal-list">{proposals.length ? proposals.map(p => <ProposalItem key={p.id} proposal={p} {...props} />) : <div className="empty-state small"><FilePenLine size={25} /><h3>검토할 제안이 없습니다</h3><p>AI 대화에서 문서 생성이나 보완을 요청하세요.</p></div>}</div>;
}
