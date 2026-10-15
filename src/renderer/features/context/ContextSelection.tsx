import type { ContextSnapshot } from '../../../shared/contracts';
const reasons = {
  excluded: '직접 제외',
  budget: '예산에서 제외',
  partial: '일부만 발췌',
  unrelated: '관련 근거로 선택하지 않음',
  empty: '본문 근거 없음',
};
export function ContextSelection({
  context,
  onExclude,
}: {
  context: ContextSnapshot;
  onExclude?: (id: string) => void;
}) {
  const selection = context.selection;
  if (!selection) return null;
  return (
    <section className="context-selection" aria-label="원문 발췌 선택 결과">
      <strong>
        {selection.mode === 'excerpts' ? '예산 내 원문 발췌' : '원문 맥락'} ·{' '}
        {context.sources.length}개 근거
      </strong>
      <p>
        {selection.usedCharacters.toLocaleString()} / {selection.limit.toLocaleString()}자
        {!context.flowContext && (
          <> · 예상 입력 {selection.estimatedInputTokens.toLocaleString()} 토큰</>
        )}
      </p>
      <p>
        제목과 목차의 관련도를 기준으로 선택합니다. 요약을 만들지 않으며 범위와 revision을
        보존합니다. 사용량은 UTF-8 바이트 기반의 보수적 추정입니다.
      </p>
      {context.requiresEvidence && !context.sources.length && (
        <p role="alert">전송할 원문 근거가 없습니다. 문서 또는 섹션을 선택해 주세요.</p>
      )}
      <ul>
        {context.sources.map((source) => (
          <li key={source.id}>
            <span>
              <strong>{source.title}</strong>
              <small>
                {source.complete === false
                  ? `원문 ${source.range?.start}–${source.range?.end} · 발췌`
                  : '문서 전체'}{' '}
                · revision {source.revision.slice(0, 8)}
              </small>
            </span>
            {onExclude && (
              <button
                className="text-button"
                aria-label={`근거 제외: ${source.title}`}
                onClick={() => onExclude(source.id)}
              >
                제외
              </button>
            )}
          </li>
        ))}
      </ul>
      <details>
        <summary>선택하지 않은 섹션 {selection.omitted.length}개</summary>
        <ul>
          {selection.omitted.map((item, i) => (
            <li key={i}>
              <span>
                {item.title}
                <small>{reasons[item.reason]}</small>
              </span>
            </li>
          ))}
        </ul>
      </details>
      {!!(selection.omittedDecisions || selection.omittedHistory) && (
        <p>
          예산을 위해 이전 결정 {selection.omittedDecisions}개 · 처리 이력{' '}
          {selection.omittedHistory}개를 제외했습니다.
        </p>
      )}
    </section>
  );
}
