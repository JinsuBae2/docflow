import type { AiProvider } from './provider';
import type {
  AiEvent,
  AiModel,
  ContextSnapshot,
  ProviderStatus,
  UsageLimits,
  UsageReport,
} from '../../shared/contracts';
import { outputSchema, responseSchema } from '../../shared/proposal-schema';
import { documentInstructions } from './instructions';
import { claudeLimits, normalizeClaudeUsage } from './usage';

// The API accepts a subset of JSON Schema; full bounds remain enforced locally.
function apiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(apiSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) => !['$schema', 'minLength', 'maxLength', 'minItems', 'maxItems'].includes(key),
      )
      .map(([key, item]) => [key, apiSchema(item)]),
  );
}
export class ClaudeProvider implements AiProvider {
  private active = new Set<AbortController>();
  private measured?: { usage: UsageReport; limits: UsageLimits; model?: string };
  private lastLimits?: UsageLimits;
  private report() {
    return this.measured;
  }
  constructor(
    private key: () => string,
    private request: typeof fetch = fetch,
  ) {}
  private async call(path: string, body?: object, signal?: AbortSignal): Promise<any> {
    const key = this.key();
    if (!key) throw new Error('Claude API 키를 연결 설정에서 저장해 주세요.');
    const controller = new AbortController();
    this.active.add(controller);
    const timeout = setTimeout(() => controller.abort(), body ? 180000 : 25000);
    try {
      const response = await this.request('https://api.anthropic.com/v1/' + path, {
        method: body ? 'POST' : 'GET',
        redirect: 'error',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      });
      if (path === 'messages') {
        this.lastLimits = claudeLimits(response.headers);
        this.measured = { usage: normalizeClaudeUsage(undefined), limits: this.lastLimits };
      }
      const result = await response.json();
      if (path === 'messages') {
        this.measured = {
          usage: normalizeClaudeUsage(result.usage),
          limits: this.lastLimits!,
          model: typeof result.model === 'string' ? result.model : undefined,
        };
        if (response.status === 401 && this.measured.usage.totalTokens === null) {
          this.measured.usage.reason = 'auth_required';
          this.lastLimits!.reason = 'auth_required';
        }
      }
      if (!response.ok) {
        const detail =
          response.status === 401
            ? 'API 키를 확인해 주세요.'
            : response.status === 429
              ? '사용량 또는 요청 한도를 확인해 주세요.'
              : response.status === 400
                ? '모델 지원 여부와 API 크레딧을 확인해 주세요.'
                : '잠시 후 연결을 다시 확인해 주세요.';
        throw new Error(`Claude API 오류 (${response.status}). ${detail}`);
      }
      return result;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (controller.signal.aborted)
        // eslint-disable-next-line preserve-caught-error -- Provider details may contain credentials.
        throw new Error('Claude 응답 시간이 초과되었거나 연결이 종료되었습니다.');
      if (error instanceof Error && error.message.startsWith('Claude API 오류')) throw error;
      // eslint-disable-next-line preserve-caught-error -- Expose only a sanitized connection error.
      throw new Error('Claude API에 연결할 수 없습니다. 네트워크와 연결 설정을 확인해 주세요.');
    } finally {
      clearTimeout(timeout);
      this.active.delete(controller);
    }
  }
  private async models(signal?: AbortSignal): Promise<AiModel[]> {
    const models: AiModel[] = [];
    const cursors = new Set<string>();
    let cursor = '';
    do {
      const page = await this.call(
        'models?limit=100' + (cursor ? '&after_id=' + encodeURIComponent(cursor) : ''),
        undefined,
        signal,
      );
      for (const item of page.data || []) {
        if (
          typeof item.id === 'string' &&
          item.lifecycle !== 'retired' &&
          item.capabilities?.structured_outputs?.supported !== false
        )
          models.push({
            model: item.id,
            displayName: item.display_name || item.id,
            isDefault: false,
          });
      }
      if (!page.has_more) break;
      if (!page.last_id || cursors.has(page.last_id) || cursors.size >= 5)
        throw new Error('Claude 모델 목록이 올바르지 않습니다.');
      cursor = page.last_id;
      cursors.add(cursor);
      // eslint-disable-next-line no-constant-condition -- Pagination stops at has_more or validated cursor limits.
    } while (true);
    return models;
  }
  async listModels(): Promise<AiModel[]> {
    return this.models();
  }
  async getUsageLimits(): Promise<UsageLimits> {
    if (this.lastLimits) return this.lastLimits;
    let connected = false;
    try {
      connected = !!this.key();
    } catch {
      /* Keep credential errors private. */
    }
    return {
      provider: 'claude',
      checkedAt: null,
      source: 'response',
      windows: [],
      reason: connected ? 'unsupported' : 'auth_required',
    };
  }
  async getStatus(): Promise<ProviderStatus> {
    try {
      const models = await this.listModels();
      return {
        connected: !!models.length,
        label: 'Claude',
        detail: models.length
          ? 'Anthropic API 연결됨 · 요청 시 API 사용량 발생'
          : '사용 가능한 Claude 모델이 없습니다.',
      };
    } catch (error) {
      return { connected: false, label: 'Claude', detail: (error as Error).message };
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
    this.measured = undefined;
    let reported = false;
    try {
      if (!model) throw new Error('연결 설정에서 Claude 모델을 선택해 주세요.');
      if (!(await this.models(signal)).some((item) => item.model === model))
        throw new Error('선택한 Claude 모델을 사용할 수 없습니다. 모델 목록을 다시 확인해 주세요.');
      if (signal.aborted) {
        yield { type: 'cancelled' };
        return;
      }
      yield { type: 'progress', text: 'Claude가 문서 맥락을 검토하고 있습니다.' };
      const result = await this.call(
        'messages',
        {
          model,
          max_tokens: context.budget?.outputTokens ?? 8192,
          system: documentInstructions,
          messages: [{ role: 'user', content: JSON.stringify(context) }],
          output_config: { format: { type: 'json_schema', schema: apiSchema(outputSchema) } },
        },
        signal,
      );
      const measured = this.report();
      if (measured) {
        reported = true;
        yield { type: 'usage', ...measured, model: measured.model || model };
      }
      if (signal.aborted) {
        yield { type: 'cancelled' };
        return;
      }
      if (
        result.stop_reason !== 'end_turn' ||
        !Array.isArray(result.content) ||
        result.content.some((item: any) => item.type !== 'text')
      )
        throw new Error('Claude 응답이 완성되지 않았습니다. 문서는 변경하지 않았습니다.');
      const parsed = responseSchema.safeParse(
        JSON.parse(result.content.map((item: any) => item.text).join('')),
      );
      if (!parsed.success)
        throw new Error('Claude 응답 형식이 올바르지 않습니다. 문서는 변경하지 않았습니다.');
      yield { type: 'result', response: parsed.data };
    } catch (error) {
      const measured = this.report();
      if (!reported && measured)
        yield { type: 'usage', ...measured, model: measured.model || model };
      if (signal.aborted) yield { type: 'cancelled' };
      else
        yield {
          type: 'error',
          message:
            error instanceof SyntaxError
              ? 'Claude 응답 형식이 올바르지 않습니다. 문서는 변경하지 않았습니다.'
              : (error as Error).message,
        };
    } finally {
      await this.close();
    }
  }
  async close(): Promise<void> {
    for (const controller of this.active) controller.abort();
    this.active.clear();
  }
}
