// Part 3: the Create Task page — title + optional skills, no assignee — and the list showing the result.
import { expect, test } from '@playwright/test';
import { rowFor, uniqueTitle } from './helpers.js';

test('creates a task with a chosen skill and shows it in the list', async ({ page }) => {
  const title = uniqueTitle('Build the settings page');
  await page.goto('/tasks/new');

  // No assignee control exists on this page (assignment happens on the list).
  await expect(page.getByLabel(/assignee/i)).toHaveCount(0);

  const submit = page.getByRole('button', { name: 'Create task' });
  await expect(submit).toBeDisabled(); // empty title

  await page.getByLabel('Title').fill(title);
  await page.getByRole('group', { name: 'Skills for task 1' }).getByLabel('Frontend').check();
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(`Created "${title}"`)).toBeVisible();

  const row = rowFor(page, title);
  await expect(row).toBeVisible();
  await expect(row.getByText('Frontend', { exact: true })).toBeVisible();
  await expect(row.getByText('AI-inferred')).toHaveCount(0);
  await expect(row.getByText('Not inferred')).toHaveCount(0);
  await expect(page.getByLabel(`Status of ${title}`, { exact: true })).toHaveValue('todo');
  await expect(page.getByLabel(`Assignee of ${title}`, { exact: true })).toHaveValue('');
});

test('the API rejects invalid create requests with the documented envelope', async ({
  request,
}) => {
  const empty = await request.post('/api/tasks', { data: { title: '   ' } });
  expect(empty.status()).toBe(400);
  expect(await empty.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

  const unknownSkill = await request.post('/api/tasks', { data: { title: 'x', skillIds: [999] } });
  expect(unknownSkill.status()).toBe(404);
  expect(await unknownSkill.json()).toMatchObject({ error: { code: 'SKILL_NOT_FOUND' } });

  const tooDeep = await request.post('/api/tasks', {
    data: {
      title: '1',
      subtasks: [
        {
          title: '2',
          subtasks: [
            {
              title: '3',
              subtasks: [{ title: '4', subtasks: [{ title: '5', subtasks: [{ title: '6' }] }] }],
            },
          ],
        },
      ],
    },
  });
  expect(tooDeep.status()).toBe(400);
  expect(await tooDeep.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
});
