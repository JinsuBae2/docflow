import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexProvider } from '../../src/main/ai/codex-provider';
import { ProjectStore } from '../../src/main/project/store';
import { buildContext } from '../../src/main/project/context';
import { ProposalService } from '../../src/main/project/proposals';
import type { AiResponse, ContextSnapshot } from '../../src/shared/contracts';

it.skipIf(process.env.DOCFLOW_LIVE !== '1')('reviews real documents, accepts/rejects actual proposals and sends that history on a follow-up', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docflow-live-'));
  const store = await ProjectStore.open(root); const provider = new CodexProvider();
  const request = async (context: ContextSnapshot): Promise<AiResponse> => {
    for await (const event of provider.run(context, new AbortController().signal)) {
      if (event.type === 'error') throw new Error(event.message);
      if (event.type === 'result') return event.response;
    }
    throw new Error('Codex returned no result.');
  };
  try {
    const status = await provider.getStatus(); if (!status.connected) throw new Error(status.detail);
    const prd = await store.createDocument('PRD', 'prd', '# PRD\n회원가입 없이 로컬 메모를 관리한다.');
    const feature = await store.createDocument('기능 명세', 'feature', '# 기능 명세\n사용자는 로컬 Markdown 파일을 연다.');
    store.updateProject('예제', '로컬 메모 관리', '회원가입 없음');
    const context = await buildContext({ instruction: '기능 명세를 수정하는 서로 독립적인 update 제안 정확히 2개: 하나는 파일 열기 실패 시 원본 보존, 다른 하나는 빈 파일 안내. 각각 원문 전체와 모든 ID를 보존해줘. 간단히.', selectedIds: [prd.id, feature.id], excludedIds: [] }, store);
    const service = new ProposalService(store);
    const proposals = await service.register(context.id, await request(context));
    expect(proposals).toHaveLength(2);
    await service.accept(proposals[0].id);
    await service.reject(proposals[1].id, '다음 버전에서 검토');
    const next = await buildContext({ instruction: '수락된 수정과 거절 사유를 한 문장으로 요약해줘. 추가 제안은 하지 마.', selectedIds: [feature.id], excludedIds: [] }, store);
    expect(next.proposalHistory.map(p => p.status)).toEqual(['accepted', 'rejected']);
    expect(next.sources[0].content).toBe(store.document(feature.id).markdown);
    const followup = await request(next);
    expect(followup.message.length).toBeGreaterThan(0);
    expect(followup.proposals).toHaveLength(0);
    console.log('LIVE_CODEX_OK: actual proposals accepted/rejected; follow-up history delivered.');
  } finally { provider.close(); store.close(); await rm(root, { recursive: true, force: true }); }
}, 240000);
