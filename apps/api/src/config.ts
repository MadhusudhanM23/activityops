import { z } from 'zod';

/**
 * Configuration only. Spec v7 sec. 8 timing values are configuration, never
 * hard-coded constants, and the Bedrock model id is deployment configuration
 * (sec. 17: "Do not assume Claude is available").
 */
const schema = z.object({
  NODE_ENV: z.string().default('development'),
  // 8080 is held by a local service on the primary dev machine (D-026); the
  // container sets PORT explicitly, so the dev default avoids the collision.
  PORT: z.coerce.number().default(8787),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_PATH: z.string().default('./data/activityops.sqlite'),
  CLOCK_SKEW_ALLOWANCE_SECONDS: z.coerce.number().default(30),
  SESSION_WINDOW_SECONDS: z.coerce.number().default(600),
  DEMO_SESSION_WINDOW_SECONDS: z.coerce.number().default(300),
  POST_WINDOW_OBSERVATION_MARGIN_SECONDS: z.coerce.number().default(60),
  HISTORY_PAGE_CAP: z.coerce.number().default(10),
  // Single demo identity until Phase 6 adds sessions. One login means the UI must
  // never imply two-person control (sec. 14).
  DEMO_ACTOR: z.string().default('demo.operator'),
  RING_API_BASE_URL: z.string().optional(),
  AWS_REGION: z.string().optional(),
  BEDROCK_MODEL_ID: z.string().optional(),
});

export const config = schema.parse(process.env);
export type Config = z.infer<typeof schema>;
