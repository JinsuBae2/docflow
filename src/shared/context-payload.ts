import type { ContextSnapshot } from './contracts';
export function contextPayload(context: ContextSnapshot) {
  const {
    selection: _selection,
    flowEstimate: _estimate,
    planningSelection: _planningSelection,
    ...payload
  } = context;
  return payload;
}
export function hasSourceEvidence(content: string) {
  return !!content
    .replace(/<!--\s*docflow-(?:id|section):[\s\S]*?-->/g, '')
    .replace(/^docflow-id:.*$/gm, '')
    .replace(/^---\s*$/gm, '')
    .trim();
}
export function assertDocumentEvidence(context: ContextSnapshot) {
  if (
    (context.requiresEvidence || context.flowContext) &&
    !context.sources.some((s) => s.id && s.documentId && s.revision && hasSourceEvidence(s.content))
  )
    throw new Error('전송할 원문 근거가 없습니다. 문서 또는 섹션을 선택해 주세요.');
}
