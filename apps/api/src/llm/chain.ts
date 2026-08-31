import type { ClassificationItem, ClassificationResult, SkillClassifier } from './classifier.js';

export interface ChainLogger {
  warn(obj: Record<string, unknown>, msg: string): void;
  info(obj: Record<string, unknown>, msg: string): void;
}

/**
 * Tries each classifier in order until one answers, within one shared time budget. A 429 on the primary
 * model (shared free-tier quota) therefore falls through to the next model instead of failing the request.
 */
export class ChainClassifier implements SkillClassifier {
  readonly name: string;

  constructor(
    private readonly classifiers: readonly SkillClassifier[],
    private readonly totalTimeoutMs: number,
    private readonly log: ChainLogger,
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
      const result = await classifier.classify(items, allowedSkills, combined);
      if (result.ok) {
        this.log.info(
          { model: result.model, items: items.length, ms: Date.now() - started },
          'skills inferred',
        );
        return result;
      }
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
