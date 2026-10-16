import { BedrockModel } from '@strands-agents/sdk';
import { GoogleModel } from '@strands-agents/sdk/models/google';
import { OpenAIModel } from '@strands-agents/sdk/models/openai';
import type { Config } from '../config.js';
import { BedrockConverseClient } from './bedrockConverse.js';
import { ConverseRuntime, type AiRuntime } from './runtime.js';
import { StrandsRuntime } from './strandsRuntime.js';

/**
 * Builds the AI runtime from configuration, or returns null when it is off.
 *
 * Construction makes no AWS call: credentials are resolved lazily on the first
 * request, so a server without credentials still starts, and the first copilot
 * request reports NO_CREDENTIALS instead of crashing the process.
 */
export function createAiRuntime(config: Config): AiRuntime | null {
  if (config.AI_RUNTIME === 'strands-gemini') {
    // The Google SDK reads GEMINI_API_KEY from the environment itself.
    return new StrandsRuntime(
      new GoogleModel({ modelId: config.GEMINI_MODEL_ID, params: { maxOutputTokens: config.AI_MAX_TOKENS } }),
      { timeoutMs: config.AI_TIMEOUT_MS, modelId: config.GEMINI_MODEL_ID, provider: 'google' },
    );
  }
  if (config.AI_RUNTIME === 'strands-local') {
    if (!config.LOCAL_MODEL_ID) return null;
    // Same Strands agent, tools, prompt and guard; only the model differs.
    // Ollama ignores the key, but the OpenAI client requires one.
    return new StrandsRuntime(
      new OpenAIModel({
        api: 'chat',
        modelId: config.LOCAL_MODEL_ID,
        apiKey: 'local-model-no-key',
        maxTokens: config.AI_MAX_TOKENS,
        clientConfig: { baseURL: config.LOCAL_MODEL_BASE_URL, timeout: config.AI_TIMEOUT_MS, maxRetries: 0 },
      }),
      { timeoutMs: config.AI_TIMEOUT_MS, modelId: config.LOCAL_MODEL_ID, provider: 'local' },
    );
  }
  if (config.AI_RUNTIME === 'off' || !config.BEDROCK_MODEL_ID || !config.AWS_REGION) return null;
  const region = config.AWS_REGION;
  const modelId = config.BEDROCK_MODEL_ID;

  if (config.AI_RUNTIME === 'bedrock-converse') {
    return new ConverseRuntime(
      new BedrockConverseClient({ region, modelId, maxTokens: config.AI_MAX_TOKENS, timeoutMs: config.AI_TIMEOUT_MS }),
    );
  }

  return new StrandsRuntime(
    new BedrockModel({
      region,
      modelId,
      maxTokens: config.AI_MAX_TOKENS,
      clientConfig: { requestHandler: { requestTimeout: config.AI_TIMEOUT_MS } },
    }),
    { timeoutMs: config.AI_TIMEOUT_MS, modelId },
  );
}
