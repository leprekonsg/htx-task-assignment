/** Unit tests for the classifier prompt helpers (no network, no DB). */
import { describe, expect, it } from 'vitest';
import { buildPrompt, extractJson, responseSchema } from '../../src/llm/prompt.js';

describe('extractJson', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"items":[]}')).toEqual({ items: [] });
  });

  it('parses JSON inside a ```json fence', () => {
    expect(extractJson('```json\n{"items":[]}\n```')).toEqual({ items: [] });
  });

  it('parses JSON inside a plain ``` fence', () => {
    expect(extractJson('```\n{"items":[]}\n```')).toEqual({ items: [] });
  });

  it('extracts JSON surrounded by prose', () => {
    expect(extractJson('Sure, here you go: {"items":[]} Hope that helps!')).toEqual({ items: [] });
  });

  it('handles Gemma-style output: prose, a fenced object, then trailing chatter', () => {
    const text = [
      '*   Task "Fix UI bug" needs the Frontend skill.',
      '',
      '```json',
      '{"items":[{"ref":"0","skills":["Frontend"]}]}',
      '```',
      '',
      'Let me know if you need anything else!',
    ].join('\n');
    expect(extractJson(text)).toEqual({ items: [{ ref: '0', skills: ['Frontend'] }] });
  });

  it('prefers the last {"items"} object when the model echoes the requested shape first', () => {
    const text =
      'Using the shape {"items":[{"ref":"<ref>","skills":["<skill>", ...]}]} you asked for:\n' +
      '{"items":[{"ref":"0","skills":["Backend"]}]}';
    expect(extractJson(text)).toEqual({ items: [{ ref: '0', skills: ['Backend'] }] });
  });

  it('is string-aware when balancing braces', () => {
    const text = 'Result: {"items":[{"ref":"0","skills":["Backend"],"note":"has } inside"}]} done';
    expect(extractJson(text)).toEqual({
      items: [{ ref: '0', skills: ['Backend'], note: 'has } inside' }],
    });
  });

  it('throws on garbage with no JSON object', () => {
    expect(() => extractJson('not json at all')).toThrow();
  });
});

describe('responseSchema', () => {
  it('accepts skills from the allowed list', () => {
    const schema = responseSchema(['Frontend', 'Backend']);
    const result = schema.safeParse({ items: [{ ref: '0', skills: ['Frontend'] }] });
    expect(result.success).toBe(true);
  });

  it('rejects a skill not in the allowed list', () => {
    const schema = responseSchema(['Frontend', 'Backend']);
    const result = schema.safeParse({ items: [{ ref: '0', skills: ['Nonexistent'] }] });
    expect(result.success).toBe(false);
  });
});

describe('buildPrompt', () => {
  it('includes every item ref and the allowed skill names', () => {
    const prompt = buildPrompt(
      [
        { ref: '0', title: 'Build login form' },
        { ref: '0.0', title: 'Wire up the API' },
      ],
      ['Frontend', 'Backend'],
    );
    expect(prompt).toContain('"0"');
    expect(prompt).toContain('"0.0"');
    expect(prompt).toContain('Build login form');
    expect(prompt).toContain('Wire up the API');
    expect(prompt).toContain('"Frontend"');
    expect(prompt).toContain('"Backend"');
  });
});
