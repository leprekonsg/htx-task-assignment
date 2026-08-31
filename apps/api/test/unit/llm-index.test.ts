/** Unit tests for createSkillClassifier: disabled vs. chain wiring from config. */
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { DisabledClassifier } from '../../src/llm/classifier.js';
import { createSkillClassifier } from '../../src/llm/index.js';

const noopLogger = { warn: () => undefined, info: () => undefined };

function config(overrides: Record<string, string> = {}) {
  return loadConfig({ DATABASE_URL: 'postgresql://x', ...overrides });
}

describe('createSkillClassifier', () => {
  it('returns a DisabledClassifier when no API key is configured', () => {
    const classifier = createSkillClassifier(config({ GEMINI_API_KEY: '' }), noopLogger);
    expect(classifier).toBeInstanceOf(DisabledClassifier);
  });

  it('builds the default fallback chain from a configured key', () => {
    const classifier = createSkillClassifier(config({ GEMINI_API_KEY: 'test-key' }), noopLogger);
    expect(classifier.name).toBe('gemini-3.5-flash-lite → gemma-4-31b-it → gemma-4-26b-a4b-it');
  });
});
