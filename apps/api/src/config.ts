import { z } from 'zod';

/**
 * Configuration only. Spec v7 sec. 8 timing values are configuration, never
 * hard-coded constants, and the Bedrock model id is deployment configuration
 * (sec. 17: "Do not assume Claude is available").
 */

/** The development-only password. Refused in production (see below). */
export const DEV_DEMO_PASSWORD = 'activityops-dev-only';

const flag = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));

const schema = z
  .object({
    NODE_ENV: z.string().default('development'),
    // 8080 is held by a local service on the primary dev machine (D-026); the
    // container sets PORT explicitly, so the dev default avoids the collision.
    PORT: z.coerce.number().default(8787),
    HOST: z.string().default('127.0.0.1'),
    DATABASE_PATH: z.string().default('./data/activityops.sqlite'),
    /** Built frontend to serve. Unset in development, where Vite serves it. */
    WEB_DIST_PATH: z.string().optional(),

    CLOCK_SKEW_ALLOWANCE_SECONDS: z.coerce.number().default(30),
    SESSION_WINDOW_SECONDS: z.coerce.number().default(600),
    DEMO_SESSION_WINDOW_SECONDS: z.coerce.number().default(300),
    // PROVISIONAL: Day-1 T5 could not be run (device offline), so this is unmeasured.
    POST_WINDOW_OBSERVATION_MARGIN_SECONDS: z.coerce.number().default(60),
    HISTORY_PAGE_CAP: z.coerce.number().default(10),

    // One login in this build, so the UI never implies two-person control (sec. 14).
    DEMO_USERNAME: z.string().min(3).default('demo.operator'),
    DEMO_PASSWORD: z.string().optional(),
    /** Secure cookies require HTTPS; defaults on in production. */
    COOKIE_SECURE: flag,
    SESSION_IDLE_MINUTES: z.coerce.number().default(720),
    /** Behind Caddy, the client IP comes from X-Forwarded-For (used for rate limits). */
    TRUST_PROXY: flag,

    RING_API_BASE_URL: z.string().optional(),

    // AI copilot (spec sec. 17). Nothing is assumed about the account: with no
    // model id the copilot is off. Credentials are NEVER configured here - the
    // AWS SDK default chain supplies them (a temporary session locally, the EC2
    // instance role in production).
    AWS_REGION: z.string().optional(),
    BEDROCK_MODEL_ID: z.string().optional(),
    /** strands (preferred) | bedrock-converse (fallback) | off */
    AI_RUNTIME: z.enum(['strands', 'bedrock-converse', 'off']).optional(),
    AI_MAX_TOKENS: z.coerce.number().int().min(256).max(8192).default(2048),
    AI_TIMEOUT_MS: z.coerce.number().int().min(5000).max(300000).default(60000),
  })
  .transform((env, context) => {
    const production = env.NODE_ENV === 'production';
    const password = env.DEMO_PASSWORD ?? (production ? undefined : DEV_DEMO_PASSWORD);

    // Refuse to boot with a missing or known password rather than ship one.
    if (!password || (production && (password === DEV_DEMO_PASSWORD || password.length < 12))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DEMO_PASSWORD'],
        message: 'DEMO_PASSWORD must be set to a value of at least 12 characters in production.',
      });
      return z.NEVER;
    }

    const aiRuntime = env.AI_RUNTIME ?? (env.BEDROCK_MODEL_ID ? 'strands' : 'off');
    if (aiRuntime !== 'off' && (!env.BEDROCK_MODEL_ID || !env.AWS_REGION)) {
      context.addIssue({
        code: 'custom',
        path: ['BEDROCK_MODEL_ID'],
        message: `AI_RUNTIME=${aiRuntime} needs both BEDROCK_MODEL_ID and AWS_REGION (or set AI_RUNTIME=off).`,
      });
      return z.NEVER;
    }

    return {
      ...env,
      AI_RUNTIME: aiRuntime,
      DEMO_PASSWORD: password,
      COOKIE_SECURE: env.COOKIE_SECURE ?? production,
      TRUST_PROXY: env.TRUST_PROXY ?? production,
    };
  });

export function loadConfig(source: NodeJS.ProcessEnv = process.env) {
  return schema.parse(source);
}

export const config = loadConfig();
export type Config = ReturnType<typeof loadConfig>;
