// Part 5: a task created without skills gets them inferred on the backend. With a Gemini key the
// list shows the inferred skill and an "AI-inferred" tag; without one the task is still created and
// honestly tagged "Not inferred".
import { expect, test } from '@playwright/test';
import { rowFor, uniqueTitle } from './helpers.js';

const inferenceEnabled = Boolean(process.env.GEMINI_API_KEY);

test(`task created without skills is ${inferenceEnabled ? 'inferred by the LLM' : 'created and tagged as not inferred'}`, async ({
  page,
  request,
}) => {
  const title = uniqueTitle('Fix UI bug on login page');
  await page.goto('/tasks/new');
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Create task' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 }); // inference may take a few seconds

  const row = rowFor(page, title);
  await expect(row).toBeVisible();

  const tasks: {
    title: string;
    skillsSource: string;
    skillsModel: string | null;
    skills: { name: string }[];
  }[] = await (await request.get('/api/tasks')).json();
  const created = tasks.find((t) => t.title === title);
  expect(created).toBeDefined();

  if (inferenceEnabled) {
    expect(created!.skillsSource).toBe('llm');
    expect(created!.skillsModel).toBeTruthy();
    expect(created!.skills.map((s) => s.name)).toEqual(['Frontend']);
    await expect(row.getByText('AI-inferred')).toBeVisible();
    await expect(row.getByText('Frontend', { exact: true })).toBeVisible();
  } else {
    expect(created!.skillsSource).toBe('unresolved');
    expect(created!.skills).toEqual([]);
    await expect(row.getByText('Not inferred')).toBeVisible();
  }
});
