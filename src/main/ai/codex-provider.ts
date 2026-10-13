import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, dirname, isAbsolute } from 'node:path';
import { existsSync, realpathSync } from 'node:fs';
import type {
  AiEvent,
  AiModel,
  ContextSnapshot,
  ProviderStatus,
  UsageLimits,
} from '../../shared/contracts';
import { outputSchema, responseSchema } from '../../shared/proposal-schema';
import type { AiProvider } from './provider';
import { documentInstructions } from './instructions';
import { codexLimits, normalizeCodexUsage } from './usage';

type RpcMessage = {
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: { message: string };
};
export function codexExecutable(): string {
  if (process.env.DOCFLOW_CODEX_PATH) return process.env.DOCFLOW_CODEX_PATH;
  const candidates =
    process.platform === 'win32'
      ? [join(homedir(), '.local', 'bin', 'codex.exe')]
      : [
          '/opt/homebrew/bin/codex',
          '/usr/local/bin/codex',
          join(homedir(), '.local', 'bin', 'codex'),
        ];
  return candidates.find(existsSync) || (process.platform === 'win32' ? 'codex.exe' : 'codex');
}
export class CodexProvider implements AiProvider {
  private child?: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private listener?: (message: RpcMessage) => void;
  private init?: Promise<void>;
  private directory?: string;
  private diagnostic = '';
  constructor(
    private executable = codexExecutable(),
    private args = [
      'app-server',
      '--stdio',
      '-c',
      'features.shell_tool=false',
      '-c',
      'features.unified_exec=false',
      '-c',
      'features.apps=false',
      '-c',
      'features.apply_patch_freeform=false',
      '-c',
      'web_search="disabled"',
      '-c',
      'default_permissions="docflow"',
      '-c',
      'permissions.docflow={filesystem={":minimal"="read",":workspace_roots"={"."="read"}},network={enabled=false}}',
    ],
  ) {}

  private fail(error: Error) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    this.listener?.({ method: 'transport/error', params: { message: error.message } });
  }
  private async connect(): Promise<void> {
    if (!this.init)
      this.init = (async () => {
        this.directory = await mkdtemp(join(tmpdir(), 'docflow-ai-'));
        const args = [...this.args];
        if (isAbsolute(this.executable) && this.args.includes('app-server')) {
          const paths = [
            ...new Set([dirname(this.executable), dirname(realpathSync(this.executable))]),
          ]
            .map((path) => `${JSON.stringify(path)}="read"`)
            .join(',');
          args.push(
            '-c',
            `permissions.docflow={filesystem={":minimal"="read",":workspace_roots"={"."="read"},${paths}},network={enabled=false}}`,
          );
        }
        this.child = spawn(this.executable, args, {
          cwd: this.directory,
          stdio: 'pipe',
          windowsHide: true,
          env: { ...process.env, NO_COLOR: '1' },
        });
        const child = this.child;
        this.diagnostic = '';
        child.on('error', (error) => {
          if (this.child === child)
            this.fail(new Error(`Codex를 실행할 수 없습니다: ${error.message}`));
        });
        child.on('exit', () => {
          if (this.child === child)
            this.fail(new Error(this.diagnostic || 'Codex 연결이 종료되었습니다.'));
        });
        child.stderr.on('data', (chunk) => {
          if (this.child !== child) return;
          const line = String(chunk)
            .split('\n')
            .find((line) => line.startsWith('Error:'));
          if (line) this.diagnostic = line.slice(0, 1000);
        });
        createInterface({ input: child.stdout }).on('line', (line) => {
          if (this.child !== child) return;
          let message: RpcMessage;
          try {
            message = JSON.parse(line);
          } catch {
            return;
          }
          if (message.id !== undefined && this.pending.has(message.id)) {
            const p = this.pending.get(message.id)!;
            this.pending.delete(message.id);
            clearTimeout(p.timer);
            if (message.error) p.reject(new Error(message.error.message));
            else p.resolve(message.result);
          } else if (message.id !== undefined && message.method) {
            this.send({
              id: message.id,
              error: {
                code: -32601,
                message: 'This document client does not execute tools or grant approvals.',
              },
            });
          } else this.listener?.(message);
        });
        await this.rpc('initialize', {
          clientInfo: { name: 'docflow', title: 'Docflow', version: '0.1.0' },
          capabilities: { experimentalApi: true },
        });
        this.send({ method: 'initialized', params: {} });
      })();
    return this.init;
  }
  private send(message: unknown) {
    if (this.child?.stdin.writable) this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  private rpc(method: string, params: unknown): Promise<any> {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex 응답 시간 초과: ${method}`));
      }, 25000);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  async getStatus(): Promise<ProviderStatus> {
    try {
      await this.connect();
      const result = await this.rpc('account/read', { refreshToken: false });
      return result.account
        ? {
            connected: true,
            label: 'Codex',
            detail: result.account.type === 'chatgpt' ? 'ChatGPT 로그인 연결됨' : 'API 계정 연결됨',
          }
        : { connected: false, label: 'Codex', detail: '터미널에서 codex login을 실행해 주세요.' };
    } catch (error) {
      return { connected: false, label: 'Codex', detail: (error as Error).message };
    }
  }
  async listModels(): Promise<AiModel[]> {
    await this.connect();
    const models: AiModel[] = [];
    let cursor: string | undefined;
    do {
      const result = await this.rpc('model/list', {
        limit: 100,
        includeHidden: false,
        ...(cursor ? { cursor } : {}),
      });
      for (const m of result.data || [])
        if (!m.hidden && typeof m.model === 'string')
          models.push({
            model: m.model,
            displayName: m.displayName || m.model,
            isDefault: !!m.isDefault,
          });
      cursor = result.nextCursor || undefined;
    } while (cursor && models.length < 500);
    return models;
  }
  async getUsageLimits(): Promise<UsageLimits> {
    try {
      await this.connect();
      const account = await this.rpc('account/read', { refreshToken: false });
      if (!account.account)
        return {
          provider: 'codex',
          checkedAt: null,
          source: 'account',
          windows: [],
          reason: 'auth_required',
        };
      if (
        !['chatgpt', 'chatgptAuthTokens', 'agentIdentity', 'personalAccessToken'].includes(
          account.account.type,
        )
      )
        return {
          provider: 'codex',
          checkedAt: null,
          source: 'account',
          windows: [],
          reason: 'auth_mode',
        };
      return codexLimits(await this.rpc('account/rateLimits/read', {}));
    } catch (error) {
      const message = (error as Error).message;
      return {
        provider: 'codex',
        checkedAt: null,
        source: 'account',
        windows: [],
        reason: /method.*not.*found|unsupported/i.test(message)
          ? 'unsupported'
          : /auth|login|log in/i.test(message)
            ? 'auth_required'
            : 'network',
      };
    }
  }
  async *run(
    context: ContextSnapshot,
    signal: AbortSignal,
    model?: string,
  ): AsyncGenerator<AiEvent> {
    if (signal.aborted) {
      yield { type: 'cancelled' };
      return;
    }
    const queue: AiEvent[] = [];
    let wake: (() => void) | undefined;
    let done = false;
    let threadId = '';
    let turnId = '';
    let actualModel = model;
    const items = new Map<string, string>();
    const push = (event: AiEvent, finish = false) => {
      if (done) return;
      queue.push(event);
      done = finish;
      wake?.();
    };
    const cancel = () => {
      if (threadId && turnId) void this.rpc('turn/interrupt', { threadId, turnId }).catch(() => {});
      push({ type: 'cancelled' }, true);
    };
    const timeout = setTimeout(
      () =>
        push(
          { type: 'error', message: '응답 시간이 초과되었습니다. 범위를 줄여 다시 요청해 주세요.' },
          true,
        ),
      180000,
    );
    signal.addEventListener('abort', cancel, { once: true });
    try {
      await this.connect();
      if (signal.aborted) {
        yield { type: 'cancelled' };
        return;
      }
      if (model && !(await this.listModels()).some((m) => m.model === model))
        throw new Error('선택한 모델을 사용할 수 없습니다. 모델 목록을 새로 확인해 주세요.');
      this.listener = (m) => {
        if (m.method === 'transport/error') {
          push({ type: 'error', message: m.params.message }, true);
          return;
        }
        if (m.params?.threadId !== threadId) return;
        if (m.method === 'model/rerouted' && typeof m.params.toModel === 'string')
          actualModel = m.params.toModel;
        if (
          m.method === 'thread/tokenUsage/updated' &&
          (!turnId || !m.params.turnId || m.params.turnId === turnId)
        )
          push({
            type: 'usage',
            usage: normalizeCodexUsage(m.params.tokenUsage?.total),
            model: actualModel,
          });
        if (m.method === 'item/agentMessage/delta')
          push({ type: 'progress', text: '문서와 연결된 맥락을 검토하고 있습니다.' });
        if (m.method === 'item/completed' && m.params.item?.type === 'agentMessage')
          items.set(m.params.item.id, m.params.item.text);
        if (m.method === 'turn/completed') {
          if (m.params.turn.status !== 'completed') {
            push(
              {
                type: 'error',
                message: m.params.turn.error?.message || 'AI 작업이 완료되지 않았습니다.',
              },
              true,
            );
            return;
          }
          try {
            const text = [...items.values()].at(-1) || '';
            push({ type: 'result', response: responseSchema.parse(JSON.parse(text)) }, true);
          } catch {
            push(
              {
                type: 'error',
                message: 'AI 응답 형식이 올바르지 않습니다. 문서는 변경하지 않았습니다.',
              },
              true,
            );
          }
        }
        if (m.method === 'error' && !m.params?.willRetry)
          push({ type: 'error', message: m.params.error?.message || 'Codex 요청 오류' }, true);
      };
      const instructions = documentInstructions;
      const inherited = await this.rpc('config/read', { includeLayers: false });
      const overrides: Record<string, unknown> = {
        'features.shell_tool': false,
        'features.unified_exec': false,
        'features.apps': false,
        'features.apply_patch_freeform': false,
        web_search: 'disabled',
      };
      for (const name of Object.keys(inherited.config?.mcp_servers || {}))
        overrides[`mcp_servers.${name}.enabled`] = false;
      for (const name of Object.keys(inherited.config?.plugins || {}))
        overrides[`plugins.${name}.enabled`] = false;
      const thread = await this.rpc('thread/start', {
        cwd: this.directory,
        permissions: 'docflow',
        approvalPolicy: 'never',
        ephemeral: true,
        baseInstructions: instructions,
        developerInstructions: instructions,
        config: overrides,
        ...(model ? { model } : {}),
      });
      threadId = thread.thread.id;
      if (typeof thread.model === 'string') actualModel = thread.model;
      if (signal.aborted) {
        yield { type: 'cancelled' };
        return;
      }
      const turn = await this.rpc('turn/start', {
        threadId,
        input: [{ type: 'text', text: JSON.stringify(context) }],
        outputSchema,
        permissions: 'docflow',
        approvalPolicy: 'never',
        ...(model ? { model } : {}),
      });
      turnId = turn.turn.id;
      yield { type: 'progress', text: 'Codex가 요청을 처리하고 있습니다.' };
      while (!done || queue.length) {
        if (!queue.length)
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        while (queue.length) yield queue.shift()!;
      }
    } catch (error) {
      if (signal.aborted) yield { type: 'cancelled' };
      else yield { type: 'error', message: (error as Error).message };
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      this.listener = undefined;
      await this.close();
    }
  }
  async close(): Promise<void> {
    this.listener = undefined;
    if (this.child) {
      this.child.stdin.end();
      this.child.kill();
      this.child = undefined;
    }
    this.fail(new Error('연결 종료'));
    this.init = undefined;
    if (this.directory) {
      await rm(this.directory, { recursive: true, force: true }).catch(() => {});
      this.directory = undefined;
    }
  }
}
