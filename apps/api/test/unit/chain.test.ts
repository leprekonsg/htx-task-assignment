/** Unit tests for ChainClassifier: fallback order, failure joining, and the shared time budget. */
import { describe, expect, it } from 'vitest';
import { ChainClassifier, type ChainLogger } from '../../src/llm/chain.js';
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
});
