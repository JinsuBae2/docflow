const readline = require('node:readline');
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line);
  const result = m.method === 'account/read' ? { account: { type: 'chatgpt' } }
    : m.method === 'model/list' ? { data: [{ model: 'test-balanced', displayName: 'Test Balanced', isDefault: true }, { model: 'test-fast', displayName: 'Test Fast', isDefault: false }], nextCursor: null }
    : m.method === 'thread/start' ? { thread: { id: 'test-thread' } }
    : m.method === 'turn/start' ? { turn: { id: 'test-turn' } } : {};
  if (m.id !== undefined) send({ id: m.id, result });
  if (m.method === 'turn/start') setTimeout(() => {
    const context = JSON.parse(m.params.input[0].text);
    if (context.instruction === '모델 전달 검증' && m.params.model !== 'test-fast') { send({ method: 'turn/completed', params: { threadId: 'test-thread', turn: { status: 'failed', error: { message: 'Selected model was not forwarded.' } } } }); return; }
    const target = context.sources[0];
    const draft = target ? { kind: 'update', title: '실패 시 원본 보존', documentType: 'prd', targetId: target.documentId, baseRevision: target.revision, replacement: target.content + '\n\n## 실패 시 원본 보존\n파일을 열지 못하면 원본을 유지하고 오류를 표시합니다.\n', sourceIds: [target.id], reason: '파일 접근 실패 시 데이터 보존이 필요합니다.', dependencyIds: [] } : null;
    const proposals = draft ? [draft, { ...draft, title: '추가 안내', reason: '사용자의 다음 행동을 안내합니다.' }] : [];
    const item = { id: 'answer', type: 'agentMessage', text: JSON.stringify({ message: '검토했습니다.', proposals }) };
    send({ method: 'item/completed', params: { threadId: 'test-thread', item } });
    send({ method: 'item/completed', params: { threadId: 'test-thread', item } });
    send({ method: 'turn/completed', params: { threadId: 'test-thread', turn: { id: 'test-turn', status: 'completed' } } });
  }, Number(process.env.DOCFLOW_TEST_DELAY_MS) || 50);
});
