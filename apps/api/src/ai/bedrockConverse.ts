import { BedrockRuntimeClient, ConverseCommand, type ConverseCommandInput, type ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import type { ModelClient, ModelRequest, ModelResponse } from './agent.js';
import { classifyAiError } from './errors.js';

/**
 * Direct Amazon Bedrock Converse adapter - the spec's fallback path (sec. 17):
 * "Direct Bedrock tool-use implementation using the same tool contracts".
 *
 * Credentials come from the AWS SDK default chain only - environment variables
 * for a local temporary session, or the EC2 instance role in production. This
 * module never reads, stores, logs or returns a credential.
 */

/** The one method we use, so tests can inject a stub instead of the AWS client. */
export interface ConverseSender {
  send(command: ConverseCommand): Promise<ConverseCommandOutput>;
}

export interface BedrockConverseOptions {
  region: string;
  modelId: string;
  maxTokens: number;
  timeoutMs: number;
  client?: ConverseSender;
}

const STOP_REASONS = new Set(['end_turn', 'tool_use', 'max_tokens', 'stop_sequence', 'guardrail_intervened', 'content_filtered']);

export class BedrockConverseClient implements ModelClient {
  readonly modelId: string;
  private readonly client: ConverseSender;

  constructor(private readonly options: BedrockConverseOptions) {
    this.modelId = options.modelId;
    this.client =
      options.client ??
      new BedrockRuntimeClient({ region: options.region, requestHandler: { requestTimeout: options.timeoutMs } });
  }

  /** The exact request sent to Bedrock. Exposed so tests can check its shape. */
  buildInput(request: ModelRequest): ConverseCommandInput {
    return {
      modelId: this.options.modelId,
      system: [{ text: request.system }],
      messages: request.messages as ConverseCommandInput['messages'],
      toolConfig: {
        tools: request.tools.map((spec) => ({
          toolSpec: {
            name: spec.name,
            description: spec.description,
            inputSchema: { json: spec.inputSchema as never },
          },
        })),
      },
      inferenceConfig: { maxTokens: this.options.maxTokens },
    };
  }

  async converse(request: ModelRequest): Promise<ModelResponse> {
    let output: ConverseCommandOutput;
    try {
      output = await this.client.send(new ConverseCommand(this.buildInput(request)));
    } catch (error) {
      throw classifyAiError(error);
    }
    const message = output.output?.message;
    if (!message || message.role !== 'assistant' || !Array.isArray(message.content)) {
      throw classifyAiError(new Error('Bedrock returned no assistant message'));
    }
    const stopReason = STOP_REASONS.has(String(output.stopReason)) ? output.stopReason : 'end_turn';
    return { stopReason: stopReason as ModelResponse['stopReason'], message: message as unknown as ModelResponse['message'] };
  }
}
