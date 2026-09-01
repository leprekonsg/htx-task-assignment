/** Unit tests for RateLimitCooldown: the window, its expiry, and the disable switch. */
import { describe, expect, it } from 'vitest';
import { RateLimitCooldown } from '../../src/llm/cooldown.js';

/** A hand-cranked clock, so the tests never sleep. */
function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe('RateLimitCooldown', () => {
  it('reports a model as available until it records a 429', () => {
    const time = clock();
    const cooldown = new RateLimitCooldown(60_000, time.now);

    expect(cooldown.remainingMs('gemini-3.5-flash-lite')).toBe(0);
    cooldown.record('gemini-3.5-flash-lite');
    expect(cooldown.remainingMs('gemini-3.5-flash-lite')).toBe(60_000);
  });

  it('holds one model back without touching another (limits vary per model)', () => {
    const time = clock();
    const cooldown = new RateLimitCooldown(60_000, time.now);

    cooldown.record('gemini-3.5-flash-lite');
    expect(cooldown.remainingMs('gemma-4-31b-it')).toBe(0);
  });

  it('counts the window down and releases the model once it has passed', () => {
    const time = clock();
    const cooldown = new RateLimitCooldown(60_000, time.now);

    cooldown.record('gemini-3.5-flash-lite');
    time.advance(59_000);
    expect(cooldown.remainingMs('gemini-3.5-flash-lite')).toBe(1000);
    time.advance(1000);
    expect(cooldown.remainingMs('gemini-3.5-flash-lite')).toBe(0);
  });

  it('restarts the window on a later 429', () => {
    const time = clock();
    const cooldown = new RateLimitCooldown(60_000, time.now);

    cooldown.record('gemini-3.5-flash-lite');
    time.advance(30_000);
    cooldown.record('gemini-3.5-flash-lite');
    expect(cooldown.remainingMs('gemini-3.5-flash-lite')).toBe(60_000);
  });

  it('records nothing when the cooldown is disabled with 0', () => {
    const time = clock();
    const cooldown = new RateLimitCooldown(0, time.now);

    cooldown.record('gemini-3.5-flash-lite');
    expect(cooldown.remainingMs('gemini-3.5-flash-lite')).toBe(0);
  });
});
