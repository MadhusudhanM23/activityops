import { BedrockModel } from '@strands-agents/sdk';
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
