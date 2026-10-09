import { Agent, tool, type JSONSchema, type Model } from '@strands-agents/sdk';
import { finalise, instructionFor, MAX_STEPS, summarise, SYSTEM_PROMPT, type AgentResult, type AgentTask, type Ending, type TraceEntry } from './agent.js';
import { AiUnavailableError, classifyAiError } from './errors.js';
import type { AiRuntime } from './runtime.js';
import { runTool, TOOL_SPECS, type ToolContext } from './tools.js';

/**
 * Strands Agents for TypeScript + Amazon Bedrock - the spec's preferred path
 * (sec. 17). The Strands loop drives the conversation; ActivityOps keeps control
 * of everything safety-relevant:
 *
 *   - tools: the same ten read-only, run-scoped tools, registered as JSON-schema
 *     tools. A name not in the registry is refused by Strands itself;
 *   - the system prompt and fixed task instruction (no free text from users);
 *   - a step limit (Strands has none built in) and a wall-clock timeout;
 *   - the output guard, via the shared `finalise`.
 *
 * Retries are off: this runs inside an HTTP request, and a throttled model
 * should fail fast with "try again" rather than hold the request open.
 */

const KNOWN_TOOLS = new Set(TOOL_SPECS.map((spec) => spec.name));

/** Strands stop reasons mapped onto our provider-neutral endings. */
function endingFor(stopReason: string): Ending {
  if (['guardrailIntervened', 'contentFiltered', 'refusal'].includes(stopReason)) return 'DECLINED';
  if (['maxTokens', 'limitOutputTokens', 'limitTotalTokens', 'modelContextWindowExceeded', 'limitTurns'].includes(stopReason)) return 'TRUNCATED';
  return 'FINISHED';
}

/** Walks plain JSON for blocks of a given key, in order. */
function blocks(value: unknown, key: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>;
      if (record[key] && typeof record[key] === 'object') found.push(record[key] as Record<string, unknown>);
      Object.values(record).forEach(walk);
    }
  };
  walk(value);
  return found;
}

export class StrandsRuntime implements AiRuntime {
  readonly runtime = 'strands' as const;
  readonly modelId: string;

  constructor(
    private readonly model: Model,
    private readonly options: { timeoutMs: number; modelId?: string },
  ) {
    const configured = (model.getConfig() as { modelId?: string }).modelId;
    this.modelId = options.modelId ?? configured ?? 'unknown';
  }

  async run(ctx: ToolContext, task: AgentTask, options: { incidentId?: string; now?: () => Date } = {}): Promise<AgentResult> {
    const clock = options.now ?? (() => new Date());
    const trace: TraceEntry[] = [];
    let toolCalls = 0;
    let stepLimitHit = false;
    let agent: Agent | undefined;

    const tools = TOOL_SPECS.map((spec) =>
      tool({
        name: spec.name,
        description: spec.description,
        // Same JSON Schema object the Converse path sends; typed loosely in tools.ts,
        // so it is narrowed to the SDK's JSON Schema type here.
        inputSchema: spec.inputSchema as JSONSchema,
        callback: (input: unknown) => {
          toolCalls += 1;
          if (toolCalls > MAX_STEPS) {
            stepLimitHit = true;
            agent?.cancel();
            return { error: 'Step limit reached.' };
          }
          const outcome = runTool(ctx, spec.name, input);
          trace.push({ tool: spec.name, at: clock().toISOString(), ok: outcome.ok, summary: summarise(outcome) });
          // A JSON round-trip guarantees the SDK receives plain JSON values only.
          return JSON.parse(JSON.stringify(outcome.ok ? outcome.result : { error: outcome.error }));
        },
      }),
    );

    agent = new Agent({
      model: this.model,
      tools,
      systemPrompt: SYSTEM_PROMPT,
      printer: false,
      sandbox: false,
      retryStrategy: null,
    });

    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Strands checks cancellation only between steps, so a model stream that stalls
    // mid-response would ignore the abort. Racing a timer makes the timeout a hard
    // wall-clock bound on the HTTP request, while abort/cancel still stop the agent.
    const invocation = agent.invoke(instructionFor(task, options.incidentId), { cancelSignal: controller.signal });
    invocation.catch(() => undefined); // the race may abandon it; never leave it unhandled
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        agent?.cancel();
        reject(new AiUnavailableError('TIMEOUT'));
      }, this.options.timeoutMs);
    });

    try {
      const result = await Promise.race([invocation, deadline]);

      // Calls the registry refused never reach a callback; record them from the transcript.
      const messages = JSON.parse(JSON.stringify(agent.messages)) as unknown;
      for (const use of blocks(messages, 'toolUse')) {
        const name = String(use['name'] ?? '');
        if (name && !KNOWN_TOOLS.has(name)) {
          trace.push({ tool: name, at: clock().toISOString(), ok: false, summary: `Tool "${name}" is not available. Only read-only tools exist.` });
        }
      }

      if (timedOut) throw new AiUnavailableError('TIMEOUT');
      if (stepLimitHit) return finalise('', 'STEP_LIMIT', trace, this.modelId);

      const last = JSON.parse(JSON.stringify(result.lastMessage)) as { content?: { text?: string }[] };
      const text = (last.content ?? [])
        .map((block) => (typeof block.text === 'string' ? block.text : ''))
        .join('\n')
        .trim();
      return finalise(text, endingFor(String(result.stopReason)), trace, this.modelId);
    } catch (error) {
      if (timedOut) throw new AiUnavailableError('TIMEOUT');
      if (stepLimitHit) return finalise('', 'STEP_LIMIT', trace, this.modelId);
      throw classifyAiError(error);
    } finally {
      clearTimeout(timer);
    }
  }
}
