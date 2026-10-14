import { expect, it } from 'vitest';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { CodexProvider } from '../../src/main/ai/codex-provider';
import { ClaudeProvider } from '../../src/main/ai/claude-provider';
import type { ContextSnapshot, AiEvent } from '../../src/shared/contracts';
const flowResponse = createRequire(import.meta.url)('../fixtures/flow-response.cjs') as (
  context: ContextSnapshot,
) => unknown;
const context: ContextSnapshot = {
  id: 'ctx',
  requestId: 'req',
  instruction: '플로우',
  project: { name: 'test', goal: '', constraints: '' },
  sources: [
    {
      id: 'doc',
      documentId: 'doc',
      revision: 'rev',
      title: '문서',
      content: '# 로그인\n버튼 클릭',
    },
  ],
  decisions: [],
  proposalHistory: [],
  omittedIds: [],
  flowContext: { flowId: 'journey', projectId: 'project', baseFlow: null },
};
it.each(['codex', 'claude'])(
  'parses structured flow proposals from %s without live requests',
  async (kind) => {
    const provider =
      kind === 'codex'
        ? new CodexProvider(process.execPath, [resolve('tests/fixtures/fake-codex.cjs')])
        : new ClaudeProvider(
            () => 'fixture',
            async (url) =>
              new Response(
                JSON.stringify(
                  String(url).includes('/models')
                    ? { data: [{ id: 'test', display_name: 'Test' }], has_more: false }
                    : {
                        stop_reason: 'end_turn',
                        content: [{ type: 'text', text: JSON.stringify(flowResponse(context)) }],
                      },
                ),
              ),
          );
    const events: AiEvent[] = [];
    try {
      for await (const event of provider.run(
        context,
        new AbortController().signal,
        kind === 'claude' ? 'test' : undefined,
      ))
        events.push(event);
    } finally {
      await provider.close();
    }
    const result = events.find((event) => event.type === 'result');
    expect(result?.type === 'result' && result.response.proposals[0].flow?.nodes).toHaveLength(3);
    expect(events.some((event) => event.type === 'error')).toBe(false);
  },
);
