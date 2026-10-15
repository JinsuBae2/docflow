import { expect, it } from 'vitest';
import { CodexProvider } from '../../src/main/ai/codex-provider';
import { parseUserFlow } from '../../src/shared/user-flow';

it.skipIf(process.env.DOCFLOW_LIVE_SCHEMA !== '1')(
  'accepts strict flow output with null optional fields from real Codex using synthetic evidence',
  async () => {
    const provider = new CodexProvider();
    const content = '# 예제\n사용자는 로컬 Markdown 파일을 열고 내용을 확인한다.';
    try {
      const events = [];
      for await (const event of provider.run(
        {
          id: 'public-schema-check',
          requestId: 'public-schema-request',
          instruction:
            '공개 가능한 가상 예제다. 시작 → 파일 내용 확인 → 종료의 3노드 유저플로우를 제안 정확히 1개로 반환해줘. 그룹은 만들지 마. 파일 내용 확인 노드만 문서 근거로 표시하고 quoteRange는 start=0, end=원문 길이를 사용해줘. 적용할 선택 속성은 유지하고 나머지는 null로 반환해줘. 설명은 한국어 2문장 이내.',
          project: { name: '공개 가능한 합성 예제', goal: '로컬 파일 보기', constraints: '' },
          requiresEvidence: true,
          sources: [
            {
              id: 'demo-doc',
              documentId: 'demo-doc',
              revision: 'demo-r1',
              title: '예제',
              content,
              complete: true,
            },
          ],
          decisions: [],
          proposalHistory: [],
          omittedIds: [],
          flowContext: { flowId: 'demo-flow', projectId: 'demo-project', baseFlow: null },
        },
        new AbortController().signal,
      ))
        events.push(event);
      const error = events.find((event) => event.type === 'error');
      expect(error).toBeUndefined();
      const result = events.find((event) => event.type === 'result');
      expect(result?.type).toBe('result');
      if (result?.type !== 'result') throw new Error('No final response');
      expect(result.response.proposals).toHaveLength(1);
      const flow = parseUserFlow(result.response.proposals[0].flow);
      expect(flow.nodes).toHaveLength(3);
      expect(flow.nodes.every((node) => node.parentId === undefined)).toBe(true);
      expect(result.response.message).not.toMatch(
        /작업 결과 및 변경 사항|수정된 파일 목록|검증 상태/,
      );
      console.log(
        'LIVE_STRICT_SCHEMA_OK: actual Codex accepted nested strict schema; optional nulls normalized; natural Korean response.',
      );
    } finally {
      await provider.close();
    }
  },
  180000,
);
