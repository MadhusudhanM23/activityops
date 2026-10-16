import { runAgent, type AgentResult, type AgentTask, type ModelClient } from './agent.js';
import { classifyAiError } from './errors.js';
import type { ToolContext } from './tools.js';

/**
 * What the route needs from an AI backend: run one fixed task over one run's
 * read-only tools and return a guarded result, or throw AiUnavailableError.
 *
 * Two implementations (spec v7 sec. 17):
 *   - StrandsRuntime (preferred): Strands Agents for TypeScript + Amazon Bedrock.
 *   - ConverseRuntime (fallback): our own loop over the Bedrock Converse API
 *     "using the same tool contracts".
 * Both share the tool set, system prompt, step limit and output guard.
 */
/** Where the model runs. Shown on every note so a local model is never mistaken for Bedrock. */
export type AiProvider = 'bedrock' | 'local' | 'google' | 'test';

export interface AiRuntime {
  readonly runtime: 'strands' | 'bedrock-converse' | 'test';
  readonly provider: AiProvider;
  readonly modelId: string;
  run(ctx: ToolContext, task: AgentTask, options?: { incidentId?: string; now?: () => Date }): Promise<AgentResult>;
}

export class ConverseRuntime implements AiRuntime {
  readonly modelId: string;
  readonly provider: AiProvider;

  constructor(
    private readonly model: ModelClient,
    readonly runtime: 'bedrock-converse' | 'test' = 'bedrock-converse',
  ) {
    this.modelId = model.modelId;
    this.provider = runtime === 'test' ? 'test' : 'bedrock';
  }

  async run(ctx: ToolContext, task: AgentTask, options: { incidentId?: string; now?: () => Date } = {}): Promise<AgentResult> {
    try {
      return await runAgent(this.model, ctx, task, options);
    } catch (error) {
      throw classifyAiError(error);
    }
  }
}
