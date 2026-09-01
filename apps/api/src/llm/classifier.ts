/**
 * The seam between task creation and any LLM. The service only knows this interface; providers, retries
 * and fallbacks live behind it, and tests use a fake.
 */
export interface ClassificationItem {
  /** Caller's key for the item; echoed back so results can be matched to nodes. */
  ref: string;
  title: string;
}

export interface ClassifiedItem {
  ref: string;
  /** Skill names, each one of the allowed skills passed in. Empty means "no skill applies". */
  skills: string[];
}

export type ClassificationResult =
  | { ok: true; model: string; items: ClassifiedItem[] }
  | {
      ok: false;
      reason: string;
      /**
       * The provider answered HTTP 429. Rate limits apply per project and vary per model, so this
       * is a fact about one model rather than the whole chain: the chain moves on to the next
       * model, whose quota is separate, and holds this one back until its window resets.
       */
      rateLimited?: boolean;
    };

export interface SkillClassifier {
  readonly name: string;
  classify(
    items: readonly ClassificationItem[],
    allowedSkills: readonly string[],
    signal?: AbortSignal,
  ): Promise<ClassificationResult>;
}

/** Used when no API key is configured: every task created without skills is `unresolved`. */
export class DisabledClassifier implements SkillClassifier {
  readonly name = 'disabled';
  async classify(): Promise<ClassificationResult> {
    return { ok: false, reason: 'skill inference is disabled (no GEMINI_API_KEY)' };
  }
}
