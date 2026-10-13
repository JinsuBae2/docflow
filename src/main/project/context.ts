import { randomUUID } from 'node:crypto';
import type { ContextInput, ContextSnapshot, ContextSource, Document, RejectionFeedback } from '../../shared/contracts';
import type { ProjectStore } from './store';
export async function buildContext(input: ContextInput, store: ProjectStore, replacesId?: string, feedbackId?: string): Promise<ContextSnapshot> {
  const ws = store.workspace(); const excluded = new Set(input.excludedIds); const selected = new Set(input.selectedIds);
  const revisionProposal = replacesId ? ws.proposals.find(p => p.id === replacesId) : undefined;
  const feedback = feedbackId ? store.get<RejectionFeedback>('feedback', feedbackId) : undefined;
  const rejected = feedback ? ws.proposals.find(p => p.id === feedback.proposalId && p.status === 'rejected') : undefined;
  if (feedbackId && (!feedback || !rejected || replacesId)) throw new Error('거절 피드백 맥락을 확인해 주세요.');
  if (replacesId && (!revisionProposal || !['pending', 'stale'].includes(revisionProposal.status))) throw new Error('수정 요청할 대기 제안을 찾을 수 없습니다.');
  if (revisionProposal?.targetId) selected.add(revisionProposal.targetId);
  const docFor = (id: string) => ws.documents.find(d => d.id === id || d.sections.some(s => s.id === id));
  for (const id of selected) if (!docFor(id)) throw new Error('선택한 문서를 찾을 수 없습니다. 최신 문서를 확인해 주세요.');
  const source = (doc: Document, sectionId?: string): ContextSource => ({ id: sectionId || doc.id, documentId: doc.id, title: sectionId ? doc.sections.find(s => s.id === sectionId)!.title : doc.title, revision: doc.revision, content: sectionId ? doc.sections.find(s => s.id === sectionId)!.content : doc.markdown });
  const sources: ContextSource[] = []; const omittedIds: string[] = [];
  for (const id of selected) { const doc = docFor(id)!; if (!excluded.has(id) && !excluded.has(doc.id)) sources.push(source(doc, id === doc.id ? undefined : id)); }
  const { id: _id, ...project } = ws.project;
  const snapshot: ContextSnapshot = { id: randomUUID(), requestId: randomUUID(), instruction: input.instruction, project, sources, decisions: ws.decisions, proposalHistory: ws.proposals.filter(p => ['accepted', 'rejected'].includes(p.status)).map(p => ({ id: p.id, title: p.title, status: p.status, reason: p.reason, rejectionReason: p.rejectionReason })), omittedIds };
  const limit = input.maxCharacters ?? 60000;
  if (revisionProposal) snapshot.revisionProposal = revisionProposal;
  if (rejected && feedback) {
    snapshot.rejectedProposal = { id: rejected.id, title: rejected.title, kind: rejected.kind, rejectionReason: feedback.reason };
    snapshot.proposalHistory = snapshot.proposalHistory.map(p => ({ ...p, reason: '' }));
  }
  if (JSON.stringify(snapshot).length > limit) throw new Error('필수 맥락이 너무 큽니다. 선택 범위를 줄여 주세요.');
  const linkedIds = new Set(ws.relations.filter(r => selected.has(r.fromId) || selected.has(r.toId) || sources.some(s => s.documentId === r.fromId || s.documentId === r.toId)).flatMap(r => [r.fromId, r.toId]));
  const words = input.instruction.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const candidates = ws.documents.filter(doc => linkedIds.has(doc.id) || doc.sections.some(s => linkedIds.has(s.id)) || words.some(w => (doc.title + ' ' + doc.markdown).toLowerCase().includes(w)));
  for (const doc of candidates) {
    if (sources.some(s => s.documentId === doc.id) || excluded.has(doc.id)) continue;
    const item = source(doc); sources.push(item);
    if (JSON.stringify(snapshot).length > limit) { sources.pop(); omittedIds.push(doc.id); }
  }
  for (const id of excluded) if (!omittedIds.includes(id)) omittedIds.push(id);
  snapshot.relations = []; snapshot.omittedRelationCount = 0;
  for (const relation of ws.relations) {
    const from = docFor(relation.fromId); const to = docFor(relation.toId);
    if (!from || !to || !sources.some(s => s.documentId === from.id) || !sources.some(s => s.documentId === to.id)) continue;
    snapshot.relations.push({ fromId: from.id, toId: to.id, type: relation.type });
    if (JSON.stringify(snapshot).length > limit) { snapshot.relations.pop(); snapshot.omittedRelationCount++; }
  }
  if (JSON.stringify(snapshot).length > limit) throw new Error('필수 맥락이 너무 큽니다. 선택 범위를 줄여 주세요.');
  store.saveSnapshot(snapshot); return snapshot;
}
