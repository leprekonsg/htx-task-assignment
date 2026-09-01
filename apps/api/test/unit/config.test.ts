/** Unit tests for loadConfig: required env, and treating an empty GEMINI_API_KEY as unset. */
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  it('rejects a missing DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('treats an empty GEMINI_API_KEY as unset', () => {
    const config = loadConfig({ DATABASE_URL: 'postgresql://x', GEMINI_API_KEY: '' });
    expect(config.GEMINI_API_KEY).toBeUndefined();
  });

  it('keeps a non-empty GEMINI_API_KEY', () => {
    const config = loadConfig({ DATABASE_URL: 'postgresql://x', GEMINI_API_KEY: 'abc123' });
    expect(config.GEMINI_API_KEY).toBe('abc123');
  });

  it('defaults the rate-limit cooldown to one per-minute window, and accepts 0 to disable it', () => {
    expect(loadConfig({ DATABASE_URL: 'postgresql://x' }).LLM_RATE_LIMIT_COOLDOWN_MS).toBe(60_000);
    const off = loadConfig({ DATABASE_URL: 'postgresql://x', LLM_RATE_LIMIT_COOLDOWN_MS: '0' });
    expect(off.LLM_RATE_LIMIT_COOLDOWN_MS).toBe(0);
  });
});
