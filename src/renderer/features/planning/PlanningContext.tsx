import type { ContextSnapshot } from '../../../shared/contracts';
import { planningStages } from '../../../shared/planning';
export function PlanningContext({ context }: { context: ContextSnapshot }) {
  const planning = context.planningContext;
  if (!planning) return null;
  return (
    <section className="planning-context">
      <h3>기획 대화 맥락</h3>
      <p>현재 단계: {planningStages[planning.stage]}</p>
      <p>
        현재 기획의 확정 내용·열린 질문·가정과 이전 대화를 전달합니다. 기존 문서는 포함하지
        않습니다.
      </p>
      <dl>
        {Object.entries(planning.brief).map(([key, text]) => (
          <div key={key}>
            <dt>
              {{ confirmed: '확정 내용', openQuestions: '열린 질문', assumptions: '가정' }[key]}
            </dt>
            <dd>{text || '아직 없음'}</dd>
          </div>
        ))}
      </dl>
      {context.planningSelection?.omittedMessageIds.length ? (
        <p role="status">
          대화가 길어 이전 메시지 {context.planningSelection.omittedMessageIds.length}개는 이번
          요청에서 제외했습니다. 전체 기록은 보존됩니다. 중요한 내용은 기획 정리에 저장해 주세요.
        </p>
      ) : null}
      <details>
        <summary>전달하는 이전 대화 {planning.messages.length}개</summary>
        {planning.messages.map((message) => (
          <div key={message.id}>
            <strong>{message.role === 'user' ? '나' : 'Docflow'}</strong>
            <pre>{message.text}</pre>
          </div>
        ))}
      </details>
    </section>
  );
}
