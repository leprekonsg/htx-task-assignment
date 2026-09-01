/** Unit tests for GenAiClassifier against a stubbed GoogleGenAI (no network). */
import { ApiError, type GoogleGenAI } from '@google/genai';
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
  initialDelayMs: 1,
  maxDelayMs: 2,
};

const oneItem = [{ ref: '0', title: 'x' }];

describe('GenAiClassifier', () => {
  it('passes responseMimeType and responseJsonSchema when structuredOutput is true', async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: '{"items":[]}' });
    const classifier = new GenAiClassifier(stubAi(generateContent), baseOptions);

    await classifier.classify(oneItem, ['Frontend']);

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

    await classifier.classify(oneItem, ['Frontend']);

    const call = generateContent.mock.calls[0]![0];
    expect(call.config.responseMimeType).toBeUndefined();
    expect(call.config.responseJsonSchema).toBeUndefined();
  });

  it('never sends a server-side deadline (the API rejects deadlines under 10 s) and disables SDK retries', async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: '{"items":[]}' });
    const classifier = new GenAiClassifier(stubAi(generateContent), baseOptions);

    await classifier.classify(oneItem, ['Frontend']);

    const call = generateContent.mock.calls[0]![0];
    expect(call.config.httpOptions.timeout).toBeUndefined();
    expect(call.config.httpOptions.retryOptions).toEqual({ attempts: 1 });
    expect(call.config.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('asks every model for minimal thinking (labelling needs none; Gemma otherwise thinks for ~6–10 s)', async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: '{"items":[]}' });
    const classifier = new GenAiClassifier(stubAi(generateContent), baseOptions);

    await classifier.classify(oneItem, ['Frontend']);

    const call = generateContent.mock.calls[0]![0];
    expect(call.config.thinkingConfig).toEqual({ thinkingLevel: 'MINIMAL' });
  });

  it('parses a fenced JSON response', async () => {
    const generateContent = vi
      .fn()
      .mockResolvedValue({ text: '```json\n{"items":[{"ref":"0","skills":["Frontend"]}]}\n```' });
    const classifier = new GenAiClassifier(stubAi(generateContent), baseOptions);

    const result = await classifier.classify(oneItem, ['Frontend', 'Backend']);
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

    const result = await classifier.classify(oneItem, ['Frontend', 'Backend']);
    expect(result).toEqual({
      ok: true,
      model: 'gemini-3.5-flash-lite',
      items: [{ ref: '0', skills: ['Frontend'] }],
    });
  });

  it('keeps a partially-invalid item, dropping only the unknown name (one bad name never discards a good one)', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: '{"items":[{"ref":"0","skills":["Frontend","DevOps"]}]}',
    });
    const classifier = new GenAiClassifier(stubAi(generateContent), baseOptions);

    const result = await classifier.classify(oneItem, ['Frontend', 'Backend']);
    expect(result).toEqual({
      ok: true,
      model: 'gemini-3.5-flash-lite',
      items: [{ ref: '0', skills: ['Frontend'] }],
    });
  });

  it('keeps a raw empty skills array as a legitimate "no skill applies" answer', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: '{"items":[{"ref":"0","skills":[]}]}',
    });
    const classifier = new GenAiClassifier(stubAi(generateContent), baseOptions);

    const result = await classifier.classify(oneItem, ['Frontend', 'Backend']);
    expect(result).toEqual({
      ok: true,
      model: 'gemini-3.5-flash-lite',
      items: [{ ref: '0', skills: [] }],
    });
  });

  it('rejects a requested item whose skills are all unknown, without retrying (a parse failure is not retryable)', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: '{"items":[{"ref":"0","skills":["DevOps"]}]}',
    });
    const classifier = new GenAiClassifier(stubAi(generateContent), {
      ...baseOptions,
      attempts: 3,
    });

    const result = await classifier.classify(oneItem, ['Frontend', 'Backend']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('no usable items');
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('drops an all-unknown item but keeps a valid one from the same response', async () => {
    const items = [
      { ref: '0', title: 'a' },
      { ref: '1', title: 'b' },
    ];
    const generateContent = vi.fn().mockResolvedValue({
      text: '{"items":[{"ref":"0","skills":["Frontend"]},{"ref":"1","skills":["DevOps"]}]}',
    });
    const classifier = new GenAiClassifier(stubAi(generateContent), baseOptions);

    const result = await classifier.classify(items, ['Frontend', 'Backend']);
    expect(result).toEqual({
      ok: true,
      model: 'gemini-3.5-flash-lite',
      items: [{ ref: '0', skills: ['Frontend'] }],
    });
  });

  it('keeps only the first occurrence of a duplicated ref', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: '{"items":[{"ref":"0","skills":["Frontend"]},{"ref":"0","skills":["Backend"]}]}',
    });
    const classifier = new GenAiClassifier(stubAi(generateContent), baseOptions);

    const result = await classifier.classify(oneItem, ['Frontend', 'Backend']);
    expect(result).toEqual({
      ok: true,
      model: 'gemini-3.5-flash-lite',
      items: [{ ref: '0', skills: ['Frontend'] }],
    });
  });

  it('ignores an item whose ref was never requested', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: '{"items":[{"ref":"0","skills":["Frontend"]},{"ref":"zz","skills":["Backend"]}]}',
    });
    const classifier = new GenAiClassifier(stubAi(generateContent), baseOptions);

    const result = await classifier.classify(oneItem, ['Frontend', 'Backend']);
    expect(result).toEqual({
      ok: true,
      model: 'gemini-3.5-flash-lite',
      items: [{ ref: '0', skills: ['Frontend'] }],
    });
  });

  it('returns ok: false (without retrying) when the response is not JSON', async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: 'I cannot help with that.' });
    const classifier = new GenAiClassifier(stubAi(generateContent), {
      ...baseOptions,
      attempts: 3,
    });

    const result = await classifier.classify(oneItem, ['Frontend']);
    expect(result.ok).toBe(false);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('maps a thrown error to ok: false', async () => {
    const generateContent = vi.fn().mockRejectedValue(new Error('network exploded'));
    const classifier = new GenAiClassifier(stubAi(generateContent), baseOptions);

    const result = await classifier.classify(oneItem, ['Frontend']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('gemini-3.5-flash-lite');
      expect(result.reason).toContain('network exploded');
    }
  });

  it('does not retry a 429, and flags it so the chain falls through to a model with its own quota', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValue(new ApiError({ message: 'quota exceeded', status: 429 }));
    const classifier = new GenAiClassifier(stubAi(generateContent), {
      ...baseOptions,
      attempts: 3,
    });

    const result = await classifier.classify(oneItem, ['Frontend', 'Backend']);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rateLimited).toBe(true);
      expect(result.reason).toContain('quota exceeded');
    }
  });

  it('does not flag a non-429 failure as rate-limited', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValue(new ApiError({ message: 'unavailable', status: 503 }));
    const classifier = new GenAiClassifier(stubAi(generateContent), baseOptions);

    const result = await classifier.classify(oneItem, ['Frontend']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rateLimited).toBeUndefined();
  });

  it('retries a connection-level failure from fetch', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed', { cause: new Error('ECONNRESET') }))
      .mockResolvedValueOnce({ text: '{"items":[{"ref":"0","skills":["Backend"]}]}' });
    const classifier = new GenAiClassifier(stubAi(generateContent), {
      ...baseOptions,
      attempts: 2,
    });

    const result = await classifier.classify(oneItem, ['Frontend', 'Backend']);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });

  it('does not retry a bug in our own code (a TypeError with no cause)', async () => {
    const generateContent = vi.fn().mockRejectedValue(new TypeError('x is not a function'));
    const classifier = new GenAiClassifier(stubAi(generateContent), {
      ...baseOptions,
      attempts: 3,
    });

    const result = await classifier.classify(oneItem, ['Frontend']);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
  });

  it('does not retry a 400', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValue(new ApiError({ message: 'bad request', status: 400 }));
    const classifier = new GenAiClassifier(stubAi(generateContent), {
      ...baseOptions,
      attempts: 3,
    });

    const result = await classifier.classify(oneItem, ['Frontend']);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('bad request');
  });

  it('gives up after the configured number of attempts', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValue(new ApiError({ message: 'unavailable', status: 503 }));
    const classifier = new GenAiClassifier(stubAi(generateContent), {
      ...baseOptions,
      attempts: 2,
    });

    const result = await classifier.classify(oneItem, ['Frontend']);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
  });

  it('times out a hanging attempt client-side, and does not spend the budget retrying it', async () => {
    const generateContent = vi.fn(
      ({ config }: { config: { abortSignal: AbortSignal } }) =>
        new Promise((_, reject) =>
          config.abortSignal.addEventListener('abort', () => reject(config.abortSignal.reason)),
        ),
    );
    const classifier = new GenAiClassifier(stubAi(generateContent), {
      ...baseOptions,
      attempts: 3,
      attemptTimeoutMs: 20,
    });

    const result = await classifier.classify(oneItem, ['Frontend']);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('aborted');
  });

  it('stops immediately when the chain budget is already exhausted', async () => {
    const generateContent = vi.fn();
    const classifier = new GenAiClassifier(stubAi(generateContent), {
      ...baseOptions,
      attempts: 2,
    });

    const result = await classifier.classify(oneItem, ['Frontend'], AbortSignal.abort());
    expect(generateContent).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('aborted');
  });

  it('does not retry once the chain budget aborts mid-flight', async () => {
    const controller = new AbortController();
    const generateContent = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(new ApiError({ message: 'unavailable', status: 503 }));
    });
    const classifier = new GenAiClassifier(stubAi(generateContent), {
      ...baseOptions,
      attempts: 3,
    });

    const result = await classifier.classify(oneItem, ['Frontend'], controller.signal);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
  });
});
