/** Unit tests for GenAiClassifier against a stubbed GoogleGenAI (no network). */
import type { GoogleGenAI } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';
import { GenAiClassifier, type GenAiClassifierOptions } from '../../src/llm/genai-classifier.js';

function stubAi(generateContent: ReturnType<typeof vi.fn>): GoogleGenAI {
  return { models: { generateContent } } as unknown as GoogleGenAI;
}

const baseOptions: GenAiClassifierOptions = {
  model: 'gemini-3.5-flash-lite',
  attempts: 1,
  attemptTimeoutMs: 5000,
  structuredOutput: true,
};

describe('GenAiClassifier', () => {
  it('passes responseMimeType and responseJsonSchema when structuredOutput is true', async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: '{"items":[]}' });
    const classifier = new GenAiClassifier(stubAi(generateContent), baseOptions);

    await classifier.classify([{ ref: '0', title: 'x' }], ['Frontend']);

    const call = generateContent.mock.calls[0]![0];
    expect(call.config.responseMimeType).toBe('application/json');
    expect(call.config.responseJsonSchema).toBeDefined();
  });

  it('omits responseMimeType and responseJsonSchema when structuredOutput is false', async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: '{"items":[]}' });
    const classifier = new GenAiClassifier(stubAi(generateContent), {
      ...baseOptions,
      structuredOutput: false,
    });

    await classifier.classify([{ ref: '0', title: 'x' }], ['Frontend']);

    const call = generateContent.mock.calls[0]![0];
    expect(call.config.responseMimeType).toBeUndefined();
    expect(call.config.responseJsonSchema).toBeUndefined();
  });

  it('parses a fenced JSON response', async () => {
    const generateContent = vi
      .fn()
      .mockResolvedValue({ text: '```json\n{"items":[{"ref":"0","skills":["Frontend"]}]}\n```' });
    const classifier = new GenAiClassifier(stubAi(generateContent), baseOptions);

    const result = await classifier.classify([{ ref: '0', title: 'x' }], ['Frontend', 'Backend']);
    expect(result).toEqual({
      ok: true,
      model: 'gemini-3.5-flash-lite',
      items: [{ ref: '0', skills: ['Frontend'] }],
    });
  });

  it('drops skills the model returns that are not in the allowed list', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: '{"items":[{"ref":"0","skills":["Frontend","MadeUpSkill"]}]}',
    });
    const classifier = new GenAiClassifier(stubAi(generateContent), {
      ...baseOptions,
      structuredOutput: false,
    });

    const result = await classifier.classify([{ ref: '0', title: 'x' }], ['Frontend', 'Backend']);
    expect(result).toEqual({
      ok: true,
      model: 'gemini-3.5-flash-lite',
      items: [{ ref: '0', skills: ['Frontend'] }],
    });
  });

  it('maps a thrown error to ok: false', async () => {
    const generateContent = vi.fn().mockRejectedValue(new Error('network exploded'));
    const classifier = new GenAiClassifier(stubAi(generateContent), baseOptions);

    const result = await classifier.classify([{ ref: '0', title: 'x' }], ['Frontend']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('gemini-3.5-flash-lite');
      expect(result.reason).toContain('network exploded');
    }
  });
});
