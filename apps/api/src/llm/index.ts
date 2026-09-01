import { GoogleGenAI } from '@google/genai';
import type { Config } from '../config.js';
import { ChainClassifier, type ChainLogger } from './chain.js';
import { DisabledClassifier, type SkillClassifier } from './classifier.js';
import { RateLimitCooldown } from './cooldown.js';
import { GenAiClassifier } from './genai-classifier.js';

export type {
  SkillClassifier,
  ClassificationResult,
  ClassificationItem,
  ClassifiedItem,
} from './classifier.js';
export { DisabledClassifier } from './classifier.js';

/** Gemma models on the Gemini API do not support constrained JSON output; Gemini models do. */
export const supportsStructuredOutput = (model: string): boolean =>
  !model.toLowerCase().startsWith('gemma');

/** Builds the production chain from config: primary Gemini model, then fallbacks, or disabled without a key. */
export function createSkillClassifier(config: Config, log: ChainLogger): SkillClassifier {
  if (!config.GEMINI_API_KEY) return new DisabledClassifier();
  const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  const models = [
    config.LLM_MODEL,
    ...config.LLM_FALLBACK_MODELS.filter((m) => m !== config.LLM_MODEL),
  ];
  const classifiers = models.map(
    (model, index) =>
      new GenAiClassifier(ai, {
        model,
        attempts: index === 0 ? config.LLM_PRIMARY_ATTEMPTS : 1,
        attemptTimeoutMs: config.LLM_ATTEMPT_TIMEOUT_MS,
        structuredOutput: supportsStructuredOutput(model),
      }),
  );
  // One cooldown for the whole chain: each model's 429s are tracked under its own name.
  const cooldown = new RateLimitCooldown(config.LLM_RATE_LIMIT_COOLDOWN_MS);
  return new ChainClassifier(classifiers, config.LLM_TIMEOUT_MS, log, cooldown);
}
