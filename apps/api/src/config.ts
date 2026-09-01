import { z } from 'zod';

/** Treat empty strings from .env files as "unset". */
const optionalString = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

const csv = (fallback: string) =>
  z.preprocess(
    (v) => (v === '' || v === undefined ? fallback : v),
    z.string().transform((s) =>
      s
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
    ),
  );

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /** Optional: without it, skill inference is disabled and tasks created without skills are `unresolved`. */
  GEMINI_API_KEY: optionalString,
  LLM_MODEL: z.string().default('gemini-3.5-flash-lite'),
  LLM_FALLBACK_MODELS: csv('gemma-4-31b-it,gemma-4-26b-a4b-it'),
  /** Whole-call budget for one create request's inference, across every model in the chain. */
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  /** Per-attempt HTTP timeout and attempts for the primary model (fallbacks get one attempt each). */
  LLM_ATTEMPT_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),
  LLM_PRIMARY_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),
  /**
   * How long the chain skips a model that answered 429, so a used-up quota costs one refused request
   * per window instead of one per task created. Defaults to a per-minute window; 0 disables it.
   */
  LLM_RATE_LIMIT_COOLDOWN_MS: z.coerce.number().int().nonnegative().default(60_000),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}
