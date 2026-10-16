module.exports = (context) => {
  const history = context.planningContext.messages.map((message) => message.text).join('\n');
  const confirmed =
    context.planningContext.brief.confirmed || history.split('\n')[0] || context.instruction;
  return {
    message: history
      ? `이전 설명을 이어갑니다: ${history.split('\n')[0]}`
      : '어떤 사용자의 어떤 문제를 해결하고 싶나요?',
    planningSuggestion:
      context.planningContext.action === 'discuss'
        ? {
            confirmed: confirmed.slice(0, 4000),
            openQuestions: 'MVP 성공 기준은 무엇인가요?',
            assumptions: '웹 서비스로 가정합니다.',
          }
        : null,
    proposals:
      context.planningContext.action === 'draft'
        ? [
            ['프로젝트 개요', 'overview'],
            ['MVP 요구사항', 'prd'],
            ['사용자 시나리오', 'flow'],
          ].map(([title, documentType]) => ({
            kind: 'create',
            title,
            documentType,
            targetId: null,
            baseRevision: null,
            replacement: `# ${title}\n\n${confirmed}\n\n운영자가 탐지 이벤트를 확인하고 검토 결과를 저장합니다.\n`,
            sourceIds: [],
            reason: '사용자 아이디어를 바탕으로 한 검토용 초안입니다.',
            dependencyIds: [],
          }))
        : [],
  };
};
