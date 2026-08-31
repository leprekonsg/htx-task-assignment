// Part 2 / Rule A: only developers holding every required skill can be assigned — visible in the UI
// (ineligible options disabled, with the missing skill named) and enforced by the API.
import { expect, test } from '@playwright/test';
import {
  DEVELOPER_IDS,
  SKILL_IDS,
  assigneeSelect,
  createTaskViaApi,
  rowFor,
  uniqueTitle,
} from './helpers.js';

test('assignee dropdown disables ineligible developers and persists an eligible assignment', async ({
  page,
  request,
}) => {
  const title = uniqueTitle('Fix UI bug on login page');
  const task = await createTaskViaApi(request, { title, skillIds: [SKILL_IDS.Frontend] });

  await page.goto('/');
  await expect(rowFor(page, title)).toBeVisible();
  const select = assigneeSelect(page, title);

  await expect(select.locator('option', { hasText: 'Bob — lacks Frontend' })).toBeDisabled();
  await expect(select.locator('option', { hasText: 'Dave — lacks Frontend' })).toBeDisabled();
  await expect(select.locator('option', { hasText: /^Alice$/ })).toBeEnabled();
  await expect(select.locator('option', { hasText: /^Carol$/ })).toBeEnabled();

  await select.selectOption({ label: 'Carol' });
  await expect(select).toHaveValue(String(DEVELOPER_IDS.Carol));

  await page.reload();
  await expect(assigneeSelect(page, title)).toHaveValue(String(DEVELOPER_IDS.Carol));

  // Unassign
  await assigneeSelect(page, title).selectOption({ label: 'Unassigned' });
  await expect(assigneeSelect(page, title)).toHaveValue('');

  // The API enforces the same rule regardless of the UI.
  const bob = await request.patch(`/api/tasks/${task.id}`, {
    data: { assigneeId: DEVELOPER_IDS.Bob },
  });
  expect(bob.status()).toBe(409);
  expect(await bob.json()).toMatchObject({
    error: {
      code: 'DEVELOPER_LACKS_SKILLS',
      details: { missingSkills: [{ id: 1, name: 'Frontend' }] },
    },
  });
});

test('a Frontend + Backend task can only go to Carol', async ({ request }) => {
  const task = await createTaskViaApi(request, {
    title: uniqueTitle('Full-stack feature'),
    skillIds: [SKILL_IDS.Frontend, SKILL_IDS.Backend],
  });
  for (const id of [DEVELOPER_IDS.Alice, DEVELOPER_IDS.Bob, DEVELOPER_IDS.Dave]) {
    const res = await request.patch(`/api/tasks/${task.id}`, { data: { assigneeId: id } });
    expect(res.status()).toBe(409);
  }
  const carol = await request.patch(`/api/tasks/${task.id}`, {
    data: { assigneeId: DEVELOPER_IDS.Carol },
  });
  expect(carol.status()).toBe(200);
  expect((await carol.json()).assignee).toEqual({ id: DEVELOPER_IDS.Carol, name: 'Carol' });
});
