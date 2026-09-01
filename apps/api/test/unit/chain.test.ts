/** Unit tests for ChainClassifier: fallback order, failure joining, and the shared time budget. */
import { ApiError } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';
import { ChainClassifier, type ChainLogger } from '../../src/llm/chain.js';
import { RateLimitCooldown } from '../../src/llm/cooldown.js';
import { GenAiClassifier } from '../../src/llm/genai-classifier.js';
import type {
  ClassificationItem,
  ClassificationResult,
  SkillClassifier,
} from '../../src/llm/classifier.js';

const noopLogger: ChainLogger = { warn: () => undefined, info: () => undefined };

const items: ClassificationItem[] = [{ ref: '0', title: 'do a thing' }];

class StaticClassifier implements SkillClassifier {
  calls = 0;
  constructor(
    readonly name: string,
    private readonly result: ClassificationResult,
  ) {}
  async classify(): Promise<ClassificationResult> {
    this.calls++;
    return this.result;
  }
}

/** Waits for its abort signal to fire before resolving — simulates a cancellable network call. */
class SignalAwareClassifier implements SkillClassifier {
  readonly name = 'signal-aware';
  calls = 0;
  async classify(
    _items: readonly ClassificationItem[],
    _allowedSkills: readonly string[],
    signal?: AbortSignal,
  ): Promise<ClassificationResult> {
    this.calls++;
    await new Promise<void>((resolve) => {
      if (!signal || signal.aborted) {
        resolve();
        return;
      }
      signal.addEventListener('abort', () => resolve(), { once: true });
    });
    return { ok: false, reason: 'aborted' };
  }
}

describe('ChainClassifier', () => {
  it('returns the first ok result and does not try later classifiers', async () => {
    const first = new StaticClassifier('first', { ok: true, model: 'first', items: [] });
    const second = new StaticClassifier('second', { ok: true, model: 'second', items: [] });
    const chain = new ChainClassifier([first, second], 1000, noopLogger);

    const result = await chain.classify(items, ['Frontend']);
    expect(result).toEqual({ ok: true, model: 'first', items: [] });
    expect(first.calls).toBe(1);
    expect(second.calls).toBe(0);
  });

  it('skips a failing classifier and tries the next', async () => {
    const failing = new StaticClassifier('failing', { ok: false, reason: 'boom' });
    const working = new StaticClassifier('working', { ok: true, model: 'working', items: [] });
    const chain = new ChainClassifier([failing, working], 1000, noopLogger);

    const result = await chain.classify(items, ['Frontend']);
    expect(result).toEqual({ ok: true, model: 'working', items: [] });
    expect(failing.calls).toBe(1);
    expect(working.calls).toBe(1);
  });

  it('returns ok: false with joined reasons when every classifier fails', async () => {
    const a = new StaticClassifier('a', { ok: false, reason: 'reason A' });
    const b = new StaticClassifier('b', { ok: false, reason: 'reason B' });
    const chain = new ChainClassifier([a, b], 1000, noopLogger);

    const result = await chain.classify(items, ['Frontend']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('reason A');
      expect(result.reason).toContain('reason B');
    }
  });

  it('stops trying further classifiers once the shared budget is exhausted', async () => {
    const slow = new SignalAwareClassifier();
    const never = new StaticClassifier('never', { ok: true, model: 'never', items: [] });
    const chain = new ChainClassifier([slow, never], 5, noopLogger);

    const result = await chain.classify(items, ['Frontend']);
    expect(result.ok).toBe(false);
    expect(slow.calls).toBe(1);
    expect(never.calls).toBe(0);
  });

  // The two classifiers below are real GenAiClassifiers over a stubbed SDK, because the behaviour
  // under test is exactly the interaction between the model's attempt loop and the chain's budget.
  describe('budget shared with a model that retries', () => {
    function stubbed(model: string, generateContent: () => Promise<unknown>, attempts: number) {
      return new GenAiClassifier({ models: { generateContent } } as never, {
        model,
        attempts,
        attemptTimeoutMs: 250,
        structuredOutput: false,
        initialDelayMs: 1,
        maxDelayMs: 2,
      });
    }

    it('leaves the fallback enough budget when the primary times out', async () => {
      const hang = vi.fn(
        ({ config }: { config: { abortSignal: AbortSignal } }) =>
          new Promise((_, reject) =>
            config.abortSignal.addEventListener('abort', () => reject(config.abortSignal.reason)),
          ),
      );
      const answer = vi.fn(async () => ({ text: '{"items":[{"ref":"0","skills":["Frontend"]}]}' }));
      // 400 ms of budget against a primary allowed two 250 ms attempts: retrying the timeout would
      // spend all of it and the fallback would never be reached.
      const chain = new ChainClassifier(
        [stubbed('primary', hang, 2), stubbed('fallback', answer, 1)],
        400,
        noopLogger,
      );

      const result = await chain.classify(items, ['Frontend']);

      expect(hang).toHaveBeenCalledTimes(1); // the timed-out attempt is not retried
      expect(answer).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        ok: true,
        model: 'fallback',
        items: [{ ref: '0', skills: ['Frontend'] }],
      });
    });

    it('hands a 429 straight to the fallback rather than spending an attempt on backoff', async () => {
      const limited = vi.fn(async () => {
        throw new ApiError({ message: 'quota exceeded', status: 429 });
      });
      const answer = vi.fn(async () => ({ text: '{"items":[{"ref":"0","skills":["Frontend"]}]}' }));
      const cooldown = new RateLimitCooldown(60_000);
      const chain = new ChainClassifier(
        [stubbed('primary', limited, 3), stubbed('fallback', answer, 1)],
        1000,
        noopLogger,
        cooldown,
      );

      const result = await chain.classify(items, ['Frontend']);

      expect(limited).toHaveBeenCalledTimes(1); // no second attempt against an exhausted quota
      expect(result.ok).toBe(true);
      expect(cooldown.remainingMs('primary')).toBeGreaterThan(0);
    });
  });

  describe('rate limiting', () => {
    const limited = () =>
      new StaticClassifier('limited', { ok: false, reason: 'quota exceeded', rateLimited: true });
    const working = () =>
      new StaticClassifier('working', { ok: true, model: 'working', items: [] });

    it('falls through to the next model, whose quota is its own', async () => {
      const first = limited();
      const second = working();
      const chain = new ChainClassifier(
        [first, second],
        1000,
        noopLogger,
        new RateLimitCooldown(60_000),
      );

      const result = await chain.classify(items, ['Frontend']);
      expect(result).toEqual({ ok: true, model: 'working', items: [] });
      expect(first.calls).toBe(1);
      expect(second.calls).toBe(1);
    });

    it('skips a rate-limited model on later requests instead of paying to be refused again', async () => {
      const first = limited();
      const second = working();
      const chain = new ChainClassifier(
        [first, second],
        1000,
        noopLogger,
        new RateLimitCooldown(60_000),
      );

      await chain.classify(items, ['Frontend']);
      const result = await chain.classify(items, ['Frontend']);

      expect(result).toEqual({ ok: true, model: 'working', items: [] });
      expect(first.calls).toBe(1); // not called again
      expect(second.calls).toBe(2);
    });

    it('tries the model again once its window has passed', async () => {
      let now = 0;
      const first = limited();
      const second = working();
      const chain = new ChainClassifier(
        [first, second],
        1000,
        noopLogger,
        new RateLimitCooldown(60_000, () => now),
      );

      await chain.classify(items, ['Frontend']);
      now += 60_000;
      await chain.classify(items, ['Frontend']);

      expect(first.calls).toBe(2);
    });

    it('does not hold back a model that failed for some other reason', async () => {
      const first = new StaticClassifier('first', { ok: false, reason: 'bad output' });
      const second = working();
      const chain = new ChainClassifier(
        [first, second],
        1000,
        noopLogger,
        new RateLimitCooldown(60_000),
      );

      await chain.classify(items, ['Frontend']);
      await chain.classify(items, ['Frontend']);

      expect(first.calls).toBe(2);
    });

    it('says which models were skipped when every one of them is cooling down', async () => {
      const first = limited();
      const chain = new ChainClassifier([first], 1000, noopLogger, new RateLimitCooldown(60_000));

      await chain.classify(items, ['Frontend']);
      const result = await chain.classify(items, ['Frontend']);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain('limited: skipped, rate-limited');
    });

    it('tries every model when no cooldown is wired in', async () => {
      const first = limited();
      const second = working();
      const chain = new ChainClassifier([first, second], 1000, noopLogger);

      await chain.classify(items, ['Frontend']);
      await chain.classify(items, ['Frontend']);

      expect(first.calls).toBe(2);
    });
  });
});
