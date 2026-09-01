import { ApiError, ThinkingLevel, type GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import type {
  ClassificationItem,
  ClassificationResult,
  ClassifiedItem,
  SkillClassifier,
} from './classifier.js';
import { buildPrompt, extractJson, responseSchema } from './prompt.js';

export interface GenAiClassifierOptions {
  model: string;
  /**
   * Attempts for this model. Only 408/5xx and network-level failures are retried: those fail fast,
   * so a second attempt costs little. A 429 hands over to the next model instead (see
   * `RETRYABLE_STATUSES`), and a timed-out attempt is not retried either — it has already spent a
   * full `attemptTimeoutMs`, and what is left of the chain budget buys more from another model than
   * from asking this one twice.
   */
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

/**
 * Statuses worth another attempt against the same model. They fail fast, so retrying is cheap.
 *
 * 429 is deliberately absent. A per-minute limit resets on a 60-second boundary, which no backoff
 * short enough for a synchronous HTTP request can wait out, and limits vary per model — so the
 * useful answer to a 429 is the next model in the chain, which has its own quota, not another
 * attempt at this one. `ChainClassifier` does that, and remembers the 429 so later requests skip
 * the model while its window resets.
 */
const RETRYABLE_STATUSES = new Set([408, 500, 502, 503, 504]);

/**
 * Shape used to PARSE the model's raw text. Deliberately looser than `responseSchema` (which enforces
 * `skills` to be exactly the allowed names, case-sensitively): that strict schema is only right for
 * building the `responseJsonSchema` hint sent to the model, since applying it to the actual response
 * would reject an entire batch over one hallucinated or mis-cased skill name instead of just dropping
 * it. `skills` filtering against the allowed list (case-insensitively) happens below, after parsing.
 *
 * That leniency is per skill name, not per item. If an item's raw `skills` array came back non-empty
 * but every name in it was rejected by the allow-list filter, the item is dropped from the result
 * entirely rather than kept as `skills: []`. A raw empty array is a legitimate "no skill applies"
 * answer (e.g. "Book the quarterly team lunch"); an array that went in non-empty and came out empty
 * means every name the model gave was invalid, which is a wrong answer, not an empty one. The two are
 * indistinguishable once stored as `skills: []` — and because a skill-less task can be picked up by
 * any developer (Rule A), silently keeping the wrong answer would turn a hallucination into an
 * unrestricted task. Dropping the item instead leaves it unresolved (`TasksService.resolveSkills`
 * records refs missing from the result as `source: 'unresolved'`), and if the whole response turns out
 * to contain no usable items this way, `parse` reports failure so `ChainClassifier` falls through to
 * the next model instead of recording a fabricated success.
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
      return this.parse(text, items, allowedSkills);
    }
    return this.failure(lastError);
  }

  private parse(
    text: string | undefined,
    items: readonly ClassificationItem[],
    allowedSkills: readonly string[],
  ): ClassificationResult {
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

    const requested = new Set(items.map((i) => i.ref));
    const allowed = new Set(allowedSkills.map((s) => s.toLowerCase()));
    const seen = new Set<string>();
    const usable: ClassifiedItem[] = [];

    for (const item of parsed.data.items) {
      if (!requested.has(item.ref)) continue; // the model invented a ref we never asked about
      if (seen.has(item.ref)) continue; // duplicate ref in the response — first occurrence wins
      seen.add(item.ref);

      const skills = item.skills.filter((s) => allowed.has(s.toLowerCase()));
      // Raw `skills` was non-empty but nothing survived the filter: every name was invalid, so this
      // is a hallucinated answer, not an empty one — drop the item rather than emit `skills: []`.
      if (item.skills.length > 0 && skills.length === 0) continue;
      usable.push({ ref: item.ref, skills });
    }

    if (usable.length === 0 && items.length > 0)
      return { ok: false, reason: `${this.name}: response contained no usable items` };

    return { ok: true, model: this.name, items: usable };
  }

  private failure(error: unknown): ClassificationResult {
    return {
      ok: false,
      reason: `${this.name}: ${describe(error)}`,
      ...(isRateLimit(error) ? { rateLimited: true } : {}),
    };
  }

  private backoffMs(attempt: number): number {
    const initial = this.options.initialDelayMs ?? 1000;
    const max = this.options.maxDelayMs ?? 2000;
    const base = Math.min(max, initial * 2 ** (attempt - 1));
    const jitter = 1 + (Math.random() * 2 - 1) * 0.2;
    return Math.round(base * jitter);
  }
}

/** HTTP 429 — this model is out of quota, whether the exhausted window is per minute or per day. */
function isRateLimit(error: unknown): boolean {
  return error instanceof ApiError && error.status === 429;
}

/**
 * Whether another attempt against the same model is worth the budget: a fast HTTP failure, or a
 * connection that never got that far. Everything else ends this model and lets the chain move on —
 * a 429 or any other 4xx (the next attempt would be refused identically), an aborted or timed-out
 * attempt (it has already spent its full slot), and a bug in our own code (it would only throw
 * again).
 */
function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) return RETRYABLE_STATUSES.has(error.status);
  // Node reports connection-level failures from `fetch` as `TypeError: fetch failed`, with the
  // underlying socket error attached as `cause`; a plain programming TypeError carries none.
  return error instanceof TypeError && error.cause !== undefined;
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
