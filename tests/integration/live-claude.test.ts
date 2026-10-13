import { it, expect } from 'vitest';
import { ClaudeProvider } from '../../src/main/ai/claude-provider';

it.skipIf(process.env.DOCFLOW_CLAUDE_MODELS !== '1')(
  'reads real Claude models without inference',
  async () => {
    if (!process.env.ANTHROPIC_API_KEY)
      throw new Error('ANTHROPIC_API_KEY를 실행 환경에 설정해 주세요.');
    const provider = new ClaudeProvider(() => process.env.ANTHROPIC_API_KEY!);
    try {
      expect((await provider.listModels()).length).toBeGreaterThan(0);
    } finally {
      await provider.close();
    }
  },
  60000,
);

it.skipIf(process.env.DOCFLOW_CLAUDE_LIVE !== '1')(
  'validates a real Claude response using only synthetic context',
  async () => {
    if (!process.env.ANTHROPIC_API_KEY || !process.env.DOCFLOW_CLAUDE_MODEL)
      throw new Error('ANTHROPIC_API_KEY와 DOCFLOW_CLAUDE_MODEL을 실행 환경에 설정해 주세요.');
    const provider = new ClaudeProvider(() => process.env.ANTHROPIC_API_KEY!);
    const events = [];
    try {
      for await (const event of provider.run(
        {
          id: 'live-claude',
          requestId: 'live-claude',
          instruction:
            '테스트 프로젝트에 대한 짧은 확인 문장을 반환하세요. proposals는 빈 배열로 반환하세요.',
          project: { name: '합성 테스트', goal: '연결 검증', constraints: '문서 없음' },
          sources: [],
          decisions: [],
          proposalHistory: [],
          omittedIds: [],
        },
        new AbortController().signal,
        process.env.DOCFLOW_CLAUDE_MODEL,
      ))
        events.push(event);
      expect(events.at(-1)?.type).toBe('result');
    } finally {
      await provider.close();
    }
  },
  210000,
);
