import type { ClassificationItem, ClassificationResult, SkillClassifier } from './classifier.js';
import type { RateLimitCooldown } from './cooldown.js';

export interface ChainLogger {
  warn(obj: Record<string, unknown>, msg: string): void;
  info(obj: Record<string, unknown>, msg: string): void;
}

/**
 * Tries each classifier in order until one answers, within one shared time budget.
 *
 * Rate limits are applied per project and vary per model, so a 429 from one model says nothing about
 * the next: the chain falls through to a model with its own quota rather than failing the request,
 * and — given a `cooldown` — holds the rate-limited one back so later requests skip it while its
 * window resets, instead of paying a round trip to be refused again.
 */
export class ChainClassifier implements SkillClassifier {
  readonly name: string;

  constructor(
    private readonly classifiers: readonly SkillClassifier[],
    private readonly totalTimeoutMs: number,
    private readonly log: ChainLogger,
    /** Omitted in tests that do not exercise rate limiting; then every model is always tried. */
    private readonly cooldown?: RateLimitCooldown,
  ) {
    this.name = classifiers.map((c) => c.name).join(' → ');
  }

  async classify(
    items: readonly ClassificationItem[],
    allowedSkills: readonly string[],
    signal?: AbortSignal,
  ): Promise<ClassificationResult> {
    const budget = AbortSignal.timeout(this.totalTimeoutMs);
    const combined = signal ? AbortSignal.any([signal, budget]) : budget;
    const reasons: string[] = [];
    const started = Date.now();

    for (const classifier of this.classifiers) {
      if (combined.aborted) break;

      const coolingMs = this.cooldown?.remainingMs(classifier.name) ?? 0;
      if (coolingMs > 0) {
        reasons.push(
          `${classifier.name}: skipped, rate-limited (${Math.ceil(coolingMs / 1000)}s left)`,
        );
        this.log.warn({ model: classifier.name, coolingMs }, 'skipping rate-limited model');
        continue;
      }

      const result = await classifier.classify(items, allowedSkills, combined);
      if (result.ok) {
        this.log.info(
          { model: result.model, items: items.length, ms: Date.now() - started },
          'skills inferred',
        );
        return result;
      }
      if (result.rateLimited) this.cooldown?.record(classifier.name);
      reasons.push(result.reason);
      this.log.warn(
        { model: classifier.name, reason: result.reason },
        'skill classifier failed, trying next',
      );
    }
    return {
      ok: false,
      reason: reasons.join(' | ') || 'inference budget exhausted before any model was tried',
    };
  }
}
