import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import type { ClassificationItem, ClassificationResult, SkillClassifier } from './classifier.js';
import { buildPrompt, extractJson, responseSchema } from './prompt.js';

export interface GenAiClassifierOptions {
  model: string;
  /** HTTP attempts for this model (the SDK retries 408/429/5xx with exponential backoff when > 1). */
  attempts: number;
  /** Timeout per HTTP attempt, in ms. */
  attemptTimeoutMs: number;
  /**
   * Gemini models accept `responseMimeType`/`responseJsonSchema` (constrained JSON output). Gemma models on the
   * Gemini API do not, so we ask for JSON in the prompt and parse leniently.
   */
  structuredOutput: boolean;
}

/** One model on the Gemini API, wrapped as a SkillClassifier. */
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
    try {
      const response = await this.ai.models.generateContent({
        model: this.options.model,
        contents: buildPrompt(items, allowedSkills),
        config: {
          temperature: 0,
          ...(this.options.structuredOutput
            ? { responseMimeType: 'application/json', responseJsonSchema: z.toJSONSchema(schema) }
            : {}),
          ...(signal ? { abortSignal: signal } : {}),
          httpOptions: {
            timeout: this.options.attemptTimeoutMs,
            retryOptions:
              this.options.attempts > 1
                ? {
                    attempts: this.options.attempts,
                    initialDelay: 1,
                    maxDelay: 2,
                    expBase: 2,
                    jitter: 0.2,
                  }
                : { attempts: 1 },
          },
        },
      });
      const text = response.text;
      if (!text) return { ok: false, reason: `${this.name}: empty response` };
      const parsed = schema.safeParse(extractJson(text));
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
    } catch (error) {
      return { ok: false, reason: `${this.name}: ${describe(error)}` };
    }
  }
}

function describe(error: unknown): string {
  if (error instanceof Error)
    return error.name === 'AbortError' || error.name === 'TimeoutError'
      ? `aborted (${error.message})`
      : error.message;
  return String(error);
}
