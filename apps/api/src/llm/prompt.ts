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

/**
 * Pulls the JSON object out of a model response. Gemini in JSON mode returns bare JSON, but Gemma
 * ignores JSON mode (verified live, see README) and tends to wrap the object in prose and a ```json
 * fence, sometimes echoing the requested shape first. Candidates are tried in order: the whole text,
 * each fenced block (last first), the last `{"items": ...}` object, then first `{` … last `}`.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const candidates: string[] = [trimmed];

  const fenced = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]!.trim());
  candidates.push(...fenced.reverse());

  const itemsStarts = [...trimmed.matchAll(/\{\s*"items"\s*:/g)].map((m) => m.index);
  const lastItems = itemsStarts.at(-1);
  if (lastItems !== undefined) {
    const balanced = sliceBalancedObject(trimmed, lastItems);
    if (balanced !== undefined) candidates.push(balanced);
  }

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  throw new Error('response contains no JSON object');
}

/** Returns the `{ ... }` starting at `start` with balanced braces (string-aware), or undefined. */
function sliceBalancedObject(text: string, start: number): string | undefined {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}
