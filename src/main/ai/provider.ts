import type { AiEvent, AiModel, ContextSnapshot, ProviderStatus } from '../../shared/contracts';
export interface AiProvider {
  getStatus(): Promise<ProviderStatus>;
  listModels(): Promise<AiModel[]>;
  run(context: ContextSnapshot, signal: AbortSignal, model?: string): AsyncIterable<AiEvent>;
  close(): Promise<void>;
}
