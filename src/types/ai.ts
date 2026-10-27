export type AiProviderType =
  | "ollama"
  | "lmstudio"
  | "openrouter"
  | "nvidia"
  | "openai"
  | "anthropic"
  | "deepseek"
  | "custom";

export interface AiChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface AiProviderConfig {
  readonly endpoint: string;
  readonly apiKey?: string;
  readonly selectedModel: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly customSystemPrompt?: string;
}

export interface AiModelInfo {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

export interface AiCompletionInput {
  readonly provider: string;
  readonly endpoint: string;
  readonly api_key?: string;
  readonly model: string;
  readonly messages: readonly AiChatMessage[];
  readonly temperature?: number;
  readonly max_tokens?: number;
  readonly timeout_seconds?: number;
}

export interface AiCompletionOutput {
  readonly text: string;
  readonly provider: string;
  readonly model: string;
  readonly latency_ms: number;
}

export interface AiFetchModelsInput {
  readonly provider: string;
  readonly endpoint: string;
  readonly api_key?: string;
  readonly timeout_seconds?: number;
}

export interface AiGeneratedCommand {
  readonly command: string;
  readonly explanation: string;
  readonly isDangerous: boolean;
  readonly dangerReason?: string;
}

export interface AiErrorExplanation {
  readonly summary: string;
  readonly cause: string;
  readonly fixCommand?: string;
  readonly fixExplanation?: string;
}

export interface AiHistoryItem {
  readonly id: string;
  readonly timestamp: number;
  readonly query: string;
  readonly command: string;
  readonly explanation: string;
  readonly hostLabel?: string;
}
