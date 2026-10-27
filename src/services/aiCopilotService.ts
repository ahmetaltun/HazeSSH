import { api } from "@/services/api";
import { useAiCopilotStore } from "@/stores/useAiCopilotStore";
import type {
  AiChatMessage,
  AiGeneratedCommand,
  AiErrorExplanation,
  AiModelInfo,
} from "@/types/ai";

export interface TargetShellContext {
  readonly osName?: string; // "linux" | "darwin" | "windows" | string
  readonly shellType?: string; // "bash" | "zsh" | "sh" | "powershell"
  readonly hostname?: string;
  readonly username?: string;
  readonly recentBuffer?: string;
}

const DANGEROUS_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  {
    regex: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+\/(\s|$)/i,
    reason: "Destructive root filesystem recursive deletion (rm -rf /)",
  },
  {
    regex: /\brm\s+-[a-zA-Z]*f?[a-zA-Z]*r?\s+\/(\s|$)/i,
    reason: "Destructive root filesystem recursive deletion (rm -fr /)",
  },
  {
    regex: /\bmkfs(\.[a-zA-Z0-9]+)?\s+/i,
    reason: "Filesystem creation destroys all data on the target partition",
  },
  {
    regex: /\bdd\s+if=.*\s+of=\/dev\/[a-zA-Z0-9]+/i,
    reason: "Direct block device write overwrites disk partitions",
  },
  {
    regex: />\s*\/dev\/(sda|sdb|nvme|vda|disk[0-9])/i,
    reason: "Raw disk redirection destroys partition tables",
  },
  {
    regex: /\bchmod\s+(-R\s+)?777\s+\//i,
    reason: "Unrestricted root directory permissions compromise system security",
  },
  {
    regex: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/i,
    reason: "Shell fork bomb will cause kernel starvation and system crash",
  },
  {
    regex: /\b(drop\s+database|drop\s+table)\b/i,
    reason: "Irreversible database or table deletion",
  },
];

export function detectDestructiveCommand(command: string): { isDangerous: boolean; reason?: string } {
  for (const { regex, reason } of DANGEROUS_PATTERNS) {
    if (regex.test(command)) {
      return { isDangerous: true, reason };
    }
  }
  return { isDangerous: false };
}

function extractJsonFromText(rawText: string): string {
  let cleaned = rawText.trim();

  // Strip markdown code fences ```json ... ``` or ``` ... ```
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    if (firstNewline !== -1) {
      cleaned = cleaned.slice(firstNewline + 1);
    }
    const lastFence = cleaned.lastIndexOf("```");
    if (lastFence !== -1) {
      cleaned = cleaned.slice(0, lastFence);
    }
    cleaned = cleaned.trim();
  }

  // Find first { and last }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned;
}

/**
 * Intelligently picks a recommended active chat/instruct model for a provider
 */
export function pickRecommendedModel(
  provider: string,
  models: readonly AiModelInfo[]
): string | undefined {
  if (!models || models.length === 0) return undefined;

  const p = provider.toLowerCase();

  // Helper to filter out known non-chat models (embedding, safety, reward, moderation)
  const isLikelyChatModel = (id: string) => {
    const lower = id.toLowerCase();
    return (
      !lower.includes("embed") &&
      !lower.includes("reward") &&
      !lower.includes("safety") &&
      !lower.includes("moderation") &&
      !lower.includes("guard") &&
      !lower.includes("rerank")
    );
  };

  const validModels = models.filter((m) => isLikelyChatModel(m.id));
  const pool = validModels.length > 0 ? validModels : models;

  // Provider-specific heuristics
  if (p === "nvidia") {
    // Prefer known fast & high quality native instruct models
    const preferredNvidia = [
      "nvidia/nemotron-3.5-bolt-e4b",
      "nvidia/nemotron-4-340b-instruct",
      "nvidia/nemotron-3.5-lightning-30b-a3b",
      "meta/llama-3.3-70b-instruct",
      "mistralai/mistral-large-2-instruct",
    ];
    for (const pref of preferredNvidia) {
      const match = pool.find((m) => m.id === pref || m.id.endsWith(pref));
      if (match) return match.id;
    }
    const instructMatch = pool.find((m) => m.id.toLowerCase().includes("instruct"));
    if (instructMatch) return instructMatch.id;
  } else if (p === "openai") {
    const preferredOpenai = ["gpt-4o-mini", "gpt-4o", "o3-mini", "gpt-4-turbo"];
    for (const pref of preferredOpenai) {
      const match = pool.find((m) => m.id === pref || m.id.startsWith(pref));
      if (match) return match.id;
    }
  } else if (p === "anthropic") {
    const preferredAnthropic = ["claude-3-5-sonnet", "claude-3-5-haiku", "claude-3-opus"];
    for (const pref of preferredAnthropic) {
      const match = pool.find((m) => m.id.toLowerCase().includes(pref));
      if (match) return match.id;
    }
  } else if (p === "deepseek") {
    const preferredDeepseek = ["deepseek-chat", "deepseek-reasoner"];
    for (const pref of preferredDeepseek) {
      const match = pool.find((m) => m.id.toLowerCase().includes(pref));
      if (match) return match.id;
    }
  } else if (p === "openrouter") {
    const preferredOpenRouter = [
      "deepseek/deepseek-chat",
      "anthropic/claude-3.5-sonnet",
      "meta-llama/llama-3.3-70b-instruct",
      "meta-llama/llama-3.1-70b-instruct",
    ];
    for (const pref of preferredOpenRouter) {
      const match = pool.find((m) => m.id === pref || m.id.endsWith(pref));
      if (match) return match.id;
    }
  } else if (p === "ollama") {
    const preferredOllama = ["llama3.2", "llama3.1", "qwen2.5-coder", "qwen2.5", "mistral"];
    for (const pref of preferredOllama) {
      const match = pool.find((m) => m.id.toLowerCase().includes(pref));
      if (match) return match.id;
    }
  } else if (p === "lmstudio") {
    const match = pool.find(
      (m) =>
        m.id.toLowerCase().includes("coder") ||
        m.id.toLowerCase().includes("instruct") ||
        m.id.toLowerCase().includes("chat")
    );
    if (match) return match.id;
  }

  // Fallback to first non-embedding candidate
  return pool[0]?.id;
}

export const aiCopilotService = {
  /**
   * Generates shell command from natural language prompt
   */
  generateCommand: async (
    userPrompt: string,
    context?: TargetShellContext
  ): Promise<AiGeneratedCommand> => {
    const { activeProvider, providerConfigs, setIsGenerating, setLastLatencyMs, addHistory } =
      useAiCopilotStore.getState();

    const config = providerConfigs[activeProvider];
    if (!config) {
      throw new Error(`AI Provider '${activeProvider}' is not configured.`);
    }

    setIsGenerating(true);

    try {
      const targetOs = context?.osName || "Linux / Unix";
      const targetShell = context?.shellType || "bash/zsh";
      const hostInfo = context?.hostname
        ? `Host: ${context.username ? `${context.username}@` : ""}${context.hostname}`
        : "Local System";

      const systemPrompt = `You are Haze SSH AI Copilot, a terminal commands expert.
Target Environment:
- OS: ${targetOs}
- Shell: ${targetShell}
- ${hostInfo}

Goal: Generate the single most accurate, idiomatic command for the user's natural language request.
Rules:
1. Always output ONLY a JSON object with this exact schema:
{
  "command": "<executable shell command>",
  "explanation": "<concise 1-2 sentence explanation of what the command does and key flags>",
  "isDangerous": <boolean>
}
2. Prefer standard POSIX utilities (grep, find, awk, sed, curl, ss, systemctl, docker).
3. Do not wrap output in prose or conversational filler. Return only valid JSON.
${config.customSystemPrompt ? `User Custom Instructions:\n${config.customSystemPrompt}` : ""}`;

      const messages: AiChatMessage[] = [
        { role: "system", content: systemPrompt },
      ];

      if (context?.recentBuffer && context.recentBuffer.trim().length > 0) {
        messages.push({
          role: "user",
          content: `Recent terminal screen buffer context:\n\`\`\`\n${context.recentBuffer.slice(-1500)}\n\`\`\``,
        });
      }

      messages.push({
        role: "user",
        content: `User request: ${userPrompt.trim()}`,
      });

      const response = await api.aiChatCompletion({
        provider: activeProvider,
        endpoint: config.endpoint,
        api_key: config.apiKey,
        model: config.selectedModel,
        messages,
        temperature: config.temperature ?? 0.1,
        max_tokens: config.maxTokens ?? 512,
        timeout_seconds: 40,
      });

      setLastLatencyMs(response.latency_ms);

      // Parse JSON from response
      const jsonText = extractJsonFromText(response.text);
      let parsed: { command?: string; explanation?: string; isDangerous?: boolean } = {};

      try {
        parsed = JSON.parse(jsonText);
      } catch {
        // Fallback: extract command line directly if model failed JSON format
        const lines = response.text.trim().split("\n");
        const candidateCommand = lines[0].replace(/^[`$]|\s*`$/g, "").trim();
        parsed = {
          command: candidateCommand,
          explanation: lines.slice(1).join(" ").trim() || "Generated command.",
        };
      }

      const generatedCommand = (parsed.command || "").trim();
      const explanation = (parsed.explanation || "Executes the requested terminal task.").trim();

      // Check dangerous pattern safety
      const safetyCheck = detectDestructiveCommand(generatedCommand);
      const isDangerous = Boolean(parsed.isDangerous || safetyCheck.isDangerous);
      const dangerReason = safetyCheck.reason;

      const result: AiGeneratedCommand = {
        command: generatedCommand,
        explanation,
        isDangerous,
        dangerReason,
      };

      addHistory({
        query: userPrompt,
        command: generatedCommand,
        explanation,
        hostLabel: context?.hostname,
      });

      return result;
    } finally {
      setIsGenerating(false);
    }
  },

  /**
   * Analyzes a command error or terminal trace and returns diagnosis with executable fix
   */
  explainError: async (
    errorOutput: string,
    failingCommand?: string,
    context?: TargetShellContext
  ): Promise<AiErrorExplanation> => {
    const { activeProvider, providerConfigs, setIsGenerating, setLastLatencyMs } =
      useAiCopilotStore.getState();

    const config = providerConfigs[activeProvider];
    if (!config) {
      throw new Error(`AI Provider '${activeProvider}' is not configured.`);
    }

    setIsGenerating(true);

    try {
      const targetOs = context?.osName || "Linux / Unix";

      const systemPrompt = `You are Haze SSH Copilot, an expert sysadmin and terminal troubleshooter.
Target OS: ${targetOs}.
Your task: Analyze the provided terminal error or command failure and provide a clear diagnosis and fix.

Format response ONLY as a JSON object with this schema:
{
  "summary": "<one sentence diagnosis of what failed>",
  "cause": "<2-3 sentence explanation of the root cause in plain English>",
  "fixCommand": "<executable terminal command to fix or verify, or empty string if not applicable>",
  "fixExplanation": "<brief explanation of what the fix command does>"
}
Return only valid JSON.`;

      const promptContent = `${failingCommand ? `Failing Command: \`${failingCommand}\`\n\n` : ""}Terminal Error Output:\n\`\`\`\n${errorOutput.slice(-3000)}\n\`\`\``;

      const messages: AiChatMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: promptContent },
      ];

      const response = await api.aiChatCompletion({
        provider: activeProvider,
        endpoint: config.endpoint,
        api_key: config.apiKey,
        model: config.selectedModel,
        messages,
        temperature: 0.2,
        max_tokens: 768,
        timeout_seconds: 45,
      });

      setLastLatencyMs(response.latency_ms);

      const jsonText = extractJsonFromText(response.text);
      let parsed: {
        summary?: string;
        cause?: string;
        fixCommand?: string;
        fixExplanation?: string;
      } = {};

      try {
        parsed = JSON.parse(jsonText);
      } catch {
        parsed = {
          summary: "Error detected in terminal output.",
          cause: response.text.trim(),
        };
      }

      return {
        summary: parsed.summary || "Command returned an error status.",
        cause: parsed.cause || "The command failed to execute successfully.",
        fixCommand: parsed.fixCommand?.trim(),
        fixExplanation: parsed.fixExplanation?.trim(),
      };
    } finally {
      setIsGenerating(false);
    }
  },

  /**
   * Tests connection to the configured AI provider by querying the models catalog.
   * Does NOT require a model name upfront, consumes zero completion tokens,
   * verifies credentials and network, and automatically populates available models.
   */
  testConnection: async (
    provider: string
  ): Promise<{ success: boolean; latencyMs: number; message: string; modelCount?: number }> => {
    const { providerConfigs, setAvailableModels, updateProviderConfig } = useAiCopilotStore.getState();
    const config = providerConfigs[provider as keyof typeof providerConfigs];
    if (!config) {
      return { success: false, latencyMs: 0, message: "Provider not configured" };
    }

    const startTime = Date.now();

    try {
      const models = await api.aiFetchModels({
        provider,
        endpoint: config.endpoint,
        api_key: config.apiKey,
        timeout_seconds: 15,
      });

      const latencyMs = Date.now() - startTime;

      const sorted = [...models].sort((a, b) =>
        (a.name || a.id).localeCompare(b.name || b.id, undefined, {
          sensitivity: "base",
          numeric: true,
        })
      );

      // Automatically populate available models in the store
      setAvailableModels(provider as any, sorted);

      // Smart auto-select: if no model selected or current model is not found in available list, pick recommended
      if (sorted.length > 0 && (!config.selectedModel || !sorted.some((m) => m.id === config.selectedModel))) {
        const recommended = pickRecommendedModel(provider, sorted);
        if (recommended) {
          updateProviderConfig(provider as any, { selectedModel: recommended });
        }
      }

      return {
        success: true,
        latencyMs,
        message: `Connected successfully (${latencyMs}ms) • ${sorted.length} models available`,
        modelCount: sorted.length,
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: 0,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
