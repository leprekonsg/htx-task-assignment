import { z } from 'zod';
import type { ClassificationItem } from './classifier.js';

/** Shape we ask the model for; also the JSON Schema sent as `responseJsonSchema` where supported. */
export function responseSchema(allowedSkills: readonly string[]) {
  const skill =
    allowedSkills.length > 0 ? z.enum(allowedSkills as [string, ...string[]]) : z.string();
  return z.object({
    items: z.array(z.object({ ref: z.string(), skills: z.array(skill) })),
  });
}
export type ClassifierResponse = z.infer<ReturnType<typeof responseSchema>>;

export function buildPrompt(
  items: readonly ClassificationItem[],
  allowedSkills: readonly string[],
): string {
  const skillList = allowedSkills.map((s) => `"${s}"`).join(', ');
  const lines = items
    .map((i) => `- ref ${JSON.stringify(i.ref)}: ${JSON.stringify(i.title)}`)
    .join('\n');
  return [
    'You label software tasks with the skills a developer needs to complete them.',
    `Allowed skills (use these exact names, nothing else): ${skillList}.`,
    'A task may need one skill, several, or none. Judge by what the work involves, not by keywords.',
    '',
    'Examples:',
    '- "Fix UI bug on login page" → ["Frontend"]',
    '- "Add support for exporting reports to PDF" → ["Backend"]',
    '- "Refactor database schema for the new reporting feature" → ["Backend"]',
    '- "Build the settings page and its save endpoint" → ["Frontend", "Backend"]',
    '- "Book a meeting room for the retro" → []',
    '',
    'Tasks:',
    lines,
    '',
    'Respond with JSON only, no prose and no code fences, in exactly this shape:',
    '{"items":[{"ref":"<ref>","skills":["<skill>", ...]}, ...]}',
    'Include every ref exactly once.',
  ].join('\n');
}

/** Tolerates code fences or stray text around the JSON object. */
export function extractJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('response contains no JSON object');
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}
