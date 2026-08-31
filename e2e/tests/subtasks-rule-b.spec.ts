// Part 4: nested creation through the dynamically rendered form, hierarchical numbering in the list,
// and Rule B — a parent can be Done only when every subtask is Done (plus the reopen guard).
import { expect, test } from '@playwright/test';
import { numberCell, rowAlert, statusSelect, uniqueTitle } from './helpers.js';

test('creates a 3-level tree in one request, numbers it, and enforces completion rules', async ({
  page,
}) => {
  const root = uniqueTitle('Reporting feature');
  const child = uniqueTitle('Design report schema');
  const grandchild = uniqueTitle('Add indexes for report queries');

  await page.goto('/tasks/new');
  await page.getByLabel('Title').fill(root);
  await page.getByRole('group', { name: 'Skills for task 1' }).getByLabel('Backend').check();

  // Each node's own "Add subtask" button now has a distinct accessible name naming that task, so
  // this can target the root's button directly instead of relying on DOM order.
  await page.getByRole('button', { name: 'Add subtask to task 1', exact: true }).click();
  await expect(page.getByText('Task 1.1', { exact: true })).toBeVisible();
  await page.getByLabel('Title').nth(1).fill(child);
  await page.getByRole('group', { name: 'Skills for task 1.1' }).getByLabel('Backend').check();

  await page.getByRole('button', { name: 'Add subtask to task 1.1', exact: true }).click();
  await expect(page.getByText('Task 1.1.1', { exact: true })).toBeVisible();
  await page.getByLabel('Title').nth(2).fill(grandchild);
  await page.getByRole('group', { name: 'Skills for task 1.1.1' }).getByLabel('Backend').check();

  await page.getByRole('button', { name: 'Create 3 tasks', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  // Hierarchical numbering: N, N.1, N.1.1 for whatever position N the new root got.
  const rootNumber = (await numberCell(page, root).textContent())?.trim() ?? '';
  expect(rootNumber).toMatch(/^\d+$/);
  await expect(numberCell(page, child)).toHaveText(`${rootNumber}.1`);
  await expect(numberCell(page, grandchild)).toHaveText(`${rootNumber}.1.1`);

  // Rule B: parent cannot be Done while a subtask is not.
  await statusSelect(page, root).selectOption('done');
  await expect(rowAlert(page, /All subtasks must be Done/)).toBeVisible();
  await expect(statusSelect(page, root)).toHaveValue('todo');

  // Complete bottom-up, then the parent succeeds.
  await statusSelect(page, grandchild).selectOption('done');
  await expect(statusSelect(page, grandchild)).toHaveValue('done');
  await statusSelect(page, child).selectOption('done');
  await expect(statusSelect(page, child)).toHaveValue('done');
  await statusSelect(page, root).selectOption('done');
  await expect(statusSelect(page, root)).toHaveValue('done');
  await expect(rowAlert(page, /All subtasks must be Done/)).toHaveCount(0);

  // Reopen guard: a subtask cannot be reopened under a Done parent...
  await statusSelect(page, child).selectOption('todo');
  await expect(
    rowAlert(page, /Cannot reopen a subtask while its parent task is Done/),
  ).toBeVisible();
  await expect(statusSelect(page, child)).toHaveValue('done');

  // ...but reopening the parent first makes it possible.
  await statusSelect(page, root).selectOption('in_progress');
  await expect(statusSelect(page, root)).toHaveValue('in_progress');
  await statusSelect(page, child).selectOption('todo');
  await expect(statusSelect(page, child)).toHaveValue('todo');

  // Everything persisted server-side.
  await page.reload();
  await expect(statusSelect(page, root)).toHaveValue('in_progress');
  await expect(statusSelect(page, child)).toHaveValue('todo');
  await expect(statusSelect(page, grandchild)).toHaveValue('done');
});

test('the form stops nesting at depth 5', async ({ page }) => {
  await page.goto('/tasks/new');
  for (let depth = 1; depth < 5; depth++) {
    // Each click adds a child to the deepest node: its button is always first in DOM order.
    // Accessible names are now e.g. "Add subtask to task 1.1.1" rather than the bare "Add subtask";
    // Playwright's default name match is substring/case-insensitive, so this still finds them.
    await page.getByRole('button', { name: 'Add subtask' }).first().click();
  }
  await expect(page.getByText('Task 1.1.1.1.1', { exact: true })).toBeVisible();
  // Five levels exist; the deepest node offers no "Add subtask" (4 buttons: root + 3 intermediate nodes).
  await expect(page.getByRole('button', { name: 'Add subtask' })).toHaveCount(4);
});
