const readline = require('node:readline');
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line);
  const mode = process.argv[2] || process.env.DOCFLOW_TEST_ACCOUNT_MODE;
  if (
    m.method === 'account/rateLimits/read' &&
    process.env.DOCFLOW_TEST_LIMITS_ERROR === 'missing'
  ) {
    send({ id: m.id, result: {} });
    return;
  }
  if (
    m.method === 'account/rateLimits/read' &&
    process.env.DOCFLOW_TEST_LIMITS_ERROR === 'invalid'
  ) {
    send({ id: m.id, result: { rateLimits: { primary: { usedPercent: -1 } } } });
    return;
  }
  if (
    m.method === 'account/rateLimits/read' &&
    (mode === 'old-server' || process.env.DOCFLOW_TEST_LIMITS_ERROR)
  ) {
    send({
      id: m.id,
      error: {
        code: -32601,
        message: mode === 'old-server' ? 'Method not found' : 'fixture limits unavailable',
      },
    });
    return;
  }
  if (mode === 'instruction-isolation' && m.method === 'thread/start') {
    const config = m.params.config;
    const body = require('node:fs').readFileSync(config.model_instructions_file, 'utf8');
    if (
      config.project_doc_max_bytes !== 0 ||
      config.project_doc_fallback_filenames.length ||
      config.developer_instructions !== body ||
      m.params.baseInstructions !== body ||
      m.params.developerInstructions !== body ||
      !body.includes('in-app planning conversation') ||
      config['mcp_servers.fixture.enabled'] !== false ||
      config['plugins.fixture.enabled'] !== false
    ) {
      send({ id: m.id, error: { message: 'Application instruction isolation missing' } });
      return;
    }
  }
  if (m.method === 'turn/start') {
    const valid = (value) => {
      if (!value || typeof value !== 'object') return true;
      if (Array.isArray(value)) return value.every(valid);
      if (
        value.type === 'object' &&
        (value.additionalProperties !== false ||
          Object.keys(value.properties || {}).some((key) => !(value.required || []).includes(key)))
      )
        return false;
      return Object.values(value).every(valid);
    };
    if (!valid(m.params.outputSchema)) {
      send({
        id: m.id,
        error: { message: 'Invalid strict output schema: every property must be required' },
      });
      return;
    }
  }
  const result =
    m.method === 'config/read' && mode === 'instruction-isolation'
      ? {
          config: {
            developer_instructions: '작업 결과 및 변경 사항',
            model_instructions_file: '/missing/inherited.md',
            mcp_servers: { fixture: {} },
            plugins: { fixture: {} },
          },
        }
      : m.method === 'account/read'
        ? {
            account:
              mode === 'no-account'
                ? null
                : { type: mode === 'api-account' ? 'apiKey' : 'chatgpt' },
          }
        : m.method === 'account/rateLimits/read'
          ? {
              rateLimitsByLimitId: {
                codex: {
                  primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1800000000 },
                  secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: 1800600000 },
                },
              },
            }
          : m.method === 'model/list'
            ? {
                data: [
                  { model: 'test-balanced', displayName: 'Test Balanced', isDefault: true },
                  { model: 'test-fast', displayName: 'Test Fast', isDefault: false },
                ],
                nextCursor: null,
              }
            : m.method === 'thread/start'
              ? { thread: { id: 'test-thread' }, model: m.params.model || 'test-balanced' }
              : m.method === 'turn/start'
                ? { turn: { id: 'test-turn' } }
                : {};
  if (m.id !== undefined) send({ id: m.id, result });
  if (m.method === 'turn/start')
    setTimeout(
      () => {
        const context = JSON.parse(m.params.input[0].text);
        if (
          mode === 'instruction-isolation' &&
          ('selection' in context || 'flowEstimate' in context)
        ) {
          send({
            method: 'turn/completed',
            params: {
              threadId: 'test-thread',
              turn: { status: 'failed', error: { message: 'Local selection diagnostics leaked' } },
            },
          });
          return;
        }
        if (context.rejectedProposal && process.env.DOCFLOW_TEST_FEEDBACK_FAILURE) {
          send({
            method: 'turn/completed',
            params: {
              threadId: 'test-thread',
              turn: { status: 'failed', error: { message: 'fixture feedback failure' } },
            },
          });
          return;
        }
        const usage = {
          totalTokens: 150,
          inputTokens: 100,
          outputTokens: 50,
          cachedInputTokens: 40,
          cacheWriteInputTokens: 0,
        };
        send({
          method: 'thread/tokenUsage/updated',
          params: {
            threadId: 'test-thread',
            turnId: 'test-turn',
            tokenUsage: { total: usage, last: usage },
          },
        });
        send({
          method: 'thread/tokenUsage/updated',
          params: {
            threadId: 'test-thread',
            turnId: 'test-turn',
            tokenUsage: { total: usage, last: usage },
          },
        });
        if (context.instruction === '사용량 실패') {
          send({
            method: 'turn/completed',
            params: {
              threadId: 'test-thread',
              turn: { status: 'failed', error: { message: 'fixture failure' } },
            },
          });
          return;
        }
        if (context.instruction === '모델 전달 검증' && m.params.model !== 'test-fast') {
          send({
            method: 'turn/completed',
            params: {
              threadId: 'test-thread',
              turn: { status: 'failed', error: { message: 'Selected model was not forwarded.' } },
            },
          });
          return;
        }
        const target = context.sources[0];
        const draft = target
          ? {
              kind: 'update',
              title: '실패 시 원본 보존',
              documentType: 'prd',
              targetId: target.documentId,
              baseRevision: target.revision,
              replacement:
                target.content +
                '\n\n## 실패 시 원본 보존\n파일을 열지 못하면 원본을 유지하고 오류를 표시합니다.\n',
              sourceIds: [target.id],
              reason: '파일 접근 실패 시 데이터 보존이 필요합니다.',
              dependencyIds: [],
            }
          : null;
        let proposals = draft
          ? [draft, { ...draft, title: '추가 안내', reason: '사용자의 다음 행동을 안내합니다.' }]
          : [];
        if (context.instruction.includes('발췌 확인만')) proposals = [];
        if (context.instruction.includes('관계 검토') && context.sources.length >= 2) {
          const from = context.sources[0];
          const to = context.sources[1];
          const relation = {
            fromId: from.documentId,
            toId: to.documentId,
            relationType: '근거',
            fromRevision: from.revision,
            toRevision: to.revision,
          };
          const base = {
            kind: 'relation',
            title: 'AI 연결 제안',
            documentType: 'note',
            targetId: null,
            baseRevision: null,
            replacement: '근거가 있는 문서 연결',
            sourceIds: [from.id, to.id],
            reason: '선택한 두 문서에서 연결 근거를 찾았습니다.',
            dependencyIds: [],
            relation,
          };
          proposals = [
            base,
            {
              ...base,
              title: 'AI 역방향 연결 제안',
              relation: {
                ...relation,
                fromId: relation.toId,
                toId: relation.fromId,
                fromRevision: relation.toRevision,
                toRevision: relation.fromRevision,
                relationType: '참고',
              },
            },
          ];
        }
        if (context.flowContext) proposals = require('./flow-response.cjs')(context).proposals;
        if (mode === 'flow-null-fields') {
          const node = proposals[0].flow.nodes[0];
          Object.assign(node, {
            parentId: null,
            extent: null,
            position: null,
            width: null,
            height: null,
            collapsed: null,
          });
          Object.assign(node.data, { description: null, components: null, outputs: null });
          proposals[0].scopedSourceId = null;
        }
        if (context.rejectedProposal) proposals = proposals.slice(0, 1);
        if (context.budget && context.instruction === '대형 프로젝트 범위 검증') proposals = [];
        const item = {
          id: 'answer',
          type: 'agentMessage',
          text: JSON.stringify(
            context.planningContext
              ? require('./planning-response.cjs')(context)
              : {
                  message: context.rejectedProposal ? '거절 이유를 검토했습니다.' : '검토했습니다.',
                  proposals,
                },
          ),
        };
        send({ method: 'item/completed', params: { threadId: 'test-thread', item } });
        send({ method: 'item/completed', params: { threadId: 'test-thread', item } });
        send({
          method: 'turn/completed',
          params: { threadId: 'test-thread', turn: { id: 'test-turn', status: 'completed' } },
        });
      },
      Number(process.env.DOCFLOW_TEST_DELAY_MS) || 50,
    );
});
