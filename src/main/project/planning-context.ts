import type { ContextSnapshot, Message } from '../../shared/contracts';
import type { PlanningSession } from '../../shared/planning';
import { contextPayload } from '../../shared/context-payload';

export function attachPlanningContext(
  snapshot: ContextSnapshot,
  session: PlanningSession,
  messages: Message[],
  action: 'discuss' | 'draft',
  limit: number,
): void {
  snapshot.decisions = [];
  snapshot.proposalHistory = [];
  snapshot.planningContext = {
    sessionId: session.id,
    revision: session.revision,
    mode: session.mode,
    stage: session.stage,
    brief: session.brief,
    action,
    messages: [],
    omittedMessageCount: 0,
  };
  const context = snapshot.planningContext;
  const owned = messages.filter((message) => session.requestIds.includes(message.requestId));
  context.omittedMessageCount = owned.length;
  const selected = new Set<string>();
  const size = () => JSON.stringify(contextPayload(snapshot)).length;
  if (size() > limit) throw new Error('기획 정리 내용이 너무 깁니다. 핵심 내용을 정리해 주세요.');
  for (const requestId of [...session.requestIds].reverse()) {
    const turn = owned.filter((message) => message.requestId === requestId);
    const nextIds = new Set([...selected, ...turn.map((message) => message.id)]);
    context.messages = owned
      .filter((message) => nextIds.has(message.id))
      .map(({ id, role, text, requestId }) => ({ id, role, text, requestId }));
    context.omittedMessageCount = owned.length - context.messages.length;
    if (size() <= limit) turn.forEach((message) => selected.add(message.id));
  }
  context.messages = owned
    .filter((message) => selected.has(message.id))
    .map(({ id, role, text, requestId }) => ({ id, role, text, requestId }));
  context.omittedMessageCount = owned.length - context.messages.length;
  snapshot.planningSelection = {
    includedMessageIds: [...selected],
    omittedMessageIds: owned
      .filter((message) => !selected.has(message.id))
      .map((message) => message.id),
    usedCharacters: size(),
    limit,
  };
}
