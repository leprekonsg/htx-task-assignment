import { ApiError, ThinkingLevel, type GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import type { ClassificationItem, ClassificationResult, SkillClassifier } from './classifier.js';
import { buildPrompt, extractJson, responseSchema } from './prompt.js';

export interface GenAiClassifierOptions {
  model: string;
  /** Attempts for this model. Only 408/429/5xx, network errors and per-attempt timeouts are retried. */
  attempts: number;
  /**
   * Timeout per attempt, in ms — enforced client-side with an AbortSignal and never sent to the server.
   * (`httpOptions.timeout` would also be sent as an `X-Server-Timeout` deadline, which the Gemini API
   * rejects with 400 when under 10 s; found by the e2e suite against the live API.)
   */
  attemptTimeoutMs: number;
  /**
   * Gemini models accept `responseMimeType`/`responseJsonSchema` (constrained JSON output). Gemma models on
   * the Gemini API ignore them, so we ask for JSON in the prompt and parse leniently.
   */
  structuredOutput: boolean;
  /** Backoff before attempt n+1 is min(maxDelayMs, initialDelayMs · 2^(n−1)) with ±20 % jitter. */
  initialDelayMs?: number;
  maxDelayMs?: number;
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Shape used to PARSE the model's raw text. Deliberately looser than `responseSchema` (which enforces
 * `skills` to be exactly the allowed names, case-sensitively): that strict schema is only right for
 * building the `responseJsonSchema` hint sent to the model, since applying it to the actual response
 * would reject an entire batch over one hallucinated or mis-cased skill name instead of just dropping
 * it. `skills` filtering against the allowed list (case-insensitively) happens below, after parsing.
 */
const RawResponseSchema = z.object({
  items: z.array(z.object({ ref: z.string(), skills: z.array(z.string()) })),
});

/** One model on the Gemini API, wrapped as a SkillClassifier, with its own bounded retry loop. */
export class GenAiClassifier implements SkillClassifier {
  readonly name: string;

  constructor(
    private readonly ai: GoogleGenAI,
    private readonly options: GenAiClassifierOptions,
  ) {
    this.name = options.model;
  }

  async classify(
    items: readonly ClassificationItem[],
    allowedSkills: readonly string[],
    signal?: AbortSignal,
  ): Promise<ClassificationResult> {
    const schema = responseSchema(allowedSkills);
    const contents = buildPrompt(items, allowedSkills);
    let lastError: unknown = new Error('no attempt was made');

    for (let attempt = 1; attempt <= this.options.attempts; attempt++) {
      if (signal?.aborted) return this.failure(signal.reason);

      const attemptTimeout = AbortSignal.timeout(this.options.attemptTimeoutMs);
      const attemptSignal = signal ? AbortSignal.any([signal, attemptTimeout]) : attemptTimeout;
      let text: string | undefined;
      try {
        const response = await this.ai.models.generateContent({
          model: this.options.model,
          contents,
          config: {
            temperature: 0,
            ...(this.options.structuredOutput
              ? { responseMimeType: 'application/json', responseJsonSchema: z.toJSONSchema(schema) }
              : {}),
            // Labelling needs no reasoning. Gemma 4 models think by default (measured live: 6–10 s and
            // ~275 thought tokens for two titles); MINIMAL brings them to 3–5 s and Gemini flash-lite to
            // under a second. The other levels/budgets are rejected by Gemma with a 400.
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            abortSignal: attemptSignal,
            // Retries are handled here, not by the SDK, so each attempt gets its own timeout.
            httpOptions: { retryOptions: { attempts: 1 } },
          },
        });
        text = response.text;
      } catch (error) {
        lastError = error;
        const canRetry = attempt < this.options.attempts && !signal?.aborted && isRetryable(error);
        if (!canRetry) break;
        await sleep(this.backoffMs(attempt), signal);
        continue;
      }
      return this.parse(text, allowedSkills);
    }
    return this.failure(lastError);
  }

  private parse(text: string | undefined, allowedSkills: readonly string[]): ClassificationResult {
    if (!text) return { ok: false, reason: `${this.name}: empty response` };
    let json: unknown;
    try {
      json = extractJson(text);
    } catch (error) {
      return this.failure(error);
    }
    const parsed = RawResponseSchema.safeParse(json);
    if (!parsed.success)
      return { ok: false, reason: `${this.name}: response did not match schema` };
    const allowed = new Set(allowedSkills.map((s) => s.toLowerCase()));
    return {
      ok: true,
      model: this.name,
      items: parsed.data.items.map((i) => ({
        ref: i.ref,
        skills: i.skills.filter((s) => allowed.has(s.toLowerCase())),
      })),
    };
  }

  private failure(error: unknown): ClassificationResult {
    return { ok: false, reason: `${this.name}: ${describe(error)}` };
  }

  private backoffMs(attempt: number): number {
    const initial = this.options.initialDelayMs ?? 1000;
    const max = this.options.maxDelayMs ?? 2000;
    const base = Math.min(max, initial * 2 ** (attempt - 1));
    const jitter = 1 + (Math.random() * 2 - 1) * 0.2;
    return Math.round(base * jitter);
  }
}

/** HTTP 408/429/5xx, network failures and per-attempt timeouts are worth another try; 4xx are not. */
function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) return RETRYABLE_STATUSES.has(error.status);
  return true;
}

/** Resolves after `ms`, or as soon as `signal` aborts (the caller checks the signal next). */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}

function describe(error: unknown): string {
  if (error instanceof Error)
    return error.name === 'AbortError' || error.name === 'TimeoutError'
      ? `aborted (${error.message})`
      : error.message;
  return String(error);
}
