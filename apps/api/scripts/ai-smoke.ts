/**
 * Real-Bedrock smoke test - Day-1 T9 / T10 (spec v7 sec. 21).
 *
 *   AWS_REGION=us-east-1 BEDROCK_MODEL_ID=<model id from the Bedrock console> npm run ai:smoke --workspace apps/api
 *
 * Runs ONE handover note for the recorded demo run through the same runtime the
 * server would use (Strands by default; AI_RUNTIME=bedrock-converse for the
 * fallback), against an in-memory database. It makes real, billed Bedrock calls
 * - a few cents at most.
 *
 * Credentials are found by the AWS SDK default chain (e.g. `aws configure sso` /
 * `aws login`, or environment variables set in your own terminal). This script
 * never reads, prints or stores them. Do not paste keys into chat or commit them.
 */
import { DatabaseSync } from 'node:sqlite';
import { AiUnavailableError, type AiUnavailableKind } from '../src/ai/errors.js';
import { createAiRuntime } from '../src/ai/factory.js';
import { config } from '../src/config.js';
import { migrate } from '../src/db/migrate.js';
import { REVIEW_RUN_ID, seedReviewMode } from '../src/seed/reviewMode.js';

const NEXT_STEP: Record<AiUnavailableKind, string> = {
  NO_CREDENTIALS: 'No AWS credentials were found. Sign in with the AWS CLI in this terminal (for example `aws configure sso`), then retry.',
  ACCESS_DENIED: 'Credentials work but cannot use this model. Check Bedrock model access for this model (Anthropic models need the use-case form), and that the identity allows bedrock:InvokeModel and bedrock:Converse.',
  MODEL_NOT_FOUND: 'The model id is wrong for this region. Copy the exact model or inference-profile id from the Bedrock console for the same region.',
  THROTTLED: 'Throttled or over quota. Wait a minute and retry; check Bedrock service quotas for this model in this region.',
  NETWORK: 'Bedrock could not be reached. Check the network, proxy and region.',
  TIMEOUT: 'The request took too long. Retry, or raise AI_TIMEOUT_MS.',
  PROVIDER_ERROR: 'Bedrock returned an unexpected error. Retry once; if it persists, try AI_RUNTIME=bedrock-converse to compare.',
};

async function main(): Promise<number> {
  const runtime = createAiRuntime(config);
  if (!runtime) {
    console.error('AI is off. Set AWS_REGION and BEDROCK_MODEL_ID (and optionally AI_RUNTIME) in this terminal, then retry.');
    return 2;
  }

  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  seedReviewMode(db);

  console.log(`runtime: ${runtime.runtime}  model: ${runtime.modelId}  region: ${config.AWS_REGION}`);
  const started = Date.now();
  try {
    const result = await runtime.run({ db, runId: REVIEW_RUN_ID, now: new Date() }, 'HANDOVER');
    console.log(`status: ${result.status}  (${Date.now() - started} ms)`);
    console.log('tool trace:');
    for (const entry of result.trace) console.log(`  ${entry.ok ? 'ok     ' : 'REFUSED'} ${entry.tool} - ${entry.summary}`);
    console.log('\n--- note ---\n' + result.text + '\n------------');
    if (result.trace.length === 0) console.log('\nWARNING: the model called no tools. Tool use (T10) is NOT demonstrated by this run.');
    return result.status === 'COMPLETED' ? 0 : 1;
  } catch (error) {
    const kind = error instanceof AiUnavailableError ? error.kind : 'PROVIDER_ERROR';
    console.error(`FAILED: ${kind} (${Date.now() - started} ms)\n${NEXT_STEP[kind]}`);
    return 1;
  } finally {
    db.close();
  }
}

process.exitCode = await main();
