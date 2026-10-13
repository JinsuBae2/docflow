const readline = require('node:readline');
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line);
  const mode = process.argv[2] || process.env.DOCFLOW_TEST_ACCOUNT_MODE;
  if (m.method === 'account/rateLimits/read' && process.env.DOCFLOW_TEST_LIMITS_ERROR === 'missing') { send({ id: m.id, result: {} }); return; }
  if (m.method === 'account/rateLimits/read' && process.env.DOCFLOW_TEST_LIMITS_ERROR === 'invalid') { send({ id: m.id, result: { rateLimits: { primary: { usedPercent: -1 } } } }); return; }
  if (m.method === 'account/rateLimits/read' && (mode === 'old-server' || process.env.DOCFLOW_TEST_LIMITS_ERROR)) { send({ id: m.id, error: { code: -32601, message: mode === 'old-server' ? 'Method not found' : 'fixture limits unavailable' } }); return; }
  const result = m.method === 'account/read' ? { account: mode === 'no-account' ? null : { type: mode === 'api-account' ? 'apiKey' : 'chatgpt' } }
    : m.method === 'account/rateLimits/read' ? { rateLimitsByLimitId: { codex: { primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1800000000 }, secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: 1800600000 } } } }
    : m.method === 'model/list' ? { data: [{ model: 'test-balanced', displayName: 'Test Balanced', isDefault: true }, { model: 'test-fast', displayName: 'Test Fast', isDefault: false }], nextCursor: null }
    : m.method === 'thread/start' ? { thread: { id: 'test-thread' }, model: m.params.model || 'test-balanced' }
    : m.method === 'turn/start' ? { turn: { id: 'test-turn' } } : {};
  if (m.id !== undefined) send({ id: m.id, result });
  if (m.method === 'turn/start') setTimeout(() => {
    const context = JSON.parse(m.params.input[0].text);
    const usage = { totalTokens: 150, inputTokens: 100, outputTokens: 50, cachedInputTokens: 40, cacheWriteInputTokens: 0 };
    send({ method: 'thread/tokenUsage/updated', params: { threadId: 'test-thread', turnId: 'test-turn', tokenUsage: { total: usage, last: usage } } });
    send({ method: 'thread/tokenUsage/updated', params: { threadId: 'test-thread', turnId: 'test-turn', tokenUsage: { total: usage, last: usage } } });
    if (context.instruction === '사용량 실패') { send({ method: 'turn/completed', params: { threadId: 'test-thread', turn: { status: 'failed', error: { message: 'fixture failure' } } } }); return; }
    if (context.instruction === '모델 전달 검증' && m.params.model !== 'test-fast') { send({ method: 'turn/completed', params: { threadId: 'test-thread', turn: { status: 'failed', error: { message: 'Selected model was not forwarded.' } } } }); return; }
    const target = context.sources[0];
    const draft = target ? { kind: 'update', title: '실패 시 원본 보존', documentType: 'prd', targetId: target.documentId, baseRevision: target.revision, replacement: target.content + '\n\n## 실패 시 원본 보존\n파일을 열지 못하면 원본을 유지하고 오류를 표시합니다.\n', sourceIds: [target.id], reason: '파일 접근 실패 시 데이터 보존이 필요합니다.', dependencyIds: [] } : null;
    let proposals = draft ? [draft, { ...draft, title: '추가 안내', reason: '사용자의 다음 행동을 안내합니다.' }] : [];
    if (context.instruction.includes('관계 검토') && context.sources.length >= 2) {
      const from = context.sources[0]; const to = context.sources[1];
      const relation = { fromId: from.documentId, toId: to.documentId, relationType: '근거', fromRevision: from.revision, toRevision: to.revision };
      const base = { kind: 'relation', title: 'AI 연결 제안', documentType: 'note', targetId: null, baseRevision: null, replacement: '근거가 있는 문서 연결', sourceIds: [from.id, to.id], reason: '선택한 두 문서에서 연결 근거를 찾았습니다.', dependencyIds: [], relation };
      proposals = [base, { ...base, title: 'AI 역방향 연결 제안', relation: { ...relation, fromId: relation.toId, toId: relation.fromId, fromRevision: relation.toRevision, toRevision: relation.fromRevision, relationType: '참고' } }];
    }
    const item = { id: 'answer', type: 'agentMessage', text: JSON.stringify({ message: '검토했습니다.', proposals }) };
    send({ method: 'item/completed', params: { threadId: 'test-thread', item } });
    send({ method: 'item/completed', params: { threadId: 'test-thread', item } });
    send({ method: 'turn/completed', params: { threadId: 'test-thread', turn: { id: 'test-turn', status: 'completed' } } });
  }, Number(process.env.DOCFLOW_TEST_DELAY_MS) || 50);
});
