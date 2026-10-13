import type { AiEvent, AiModel, ContextSnapshot, ProviderStatus, UsageLimits } from '../../shared/contracts';
export interface AiProvider {
  getStatus(): Promise<ProviderStatus>;
  listModels(): Promise<AiModel[]>;
  getUsageLimits(): Promise<UsageLimits>;
  run(context: ContextSnapshot, signal: AbortSignal, model?: string): AsyncIterable<AiEvent>;
  close(): Promise<void>;
}
