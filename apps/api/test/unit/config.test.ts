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
});
