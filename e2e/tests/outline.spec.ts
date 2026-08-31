// Part 4 from the reader's side: a task tree you can fold, and extend without leaving the list.
// One journey, in the order someone actually works — fold a subtree away and bring it back, add a
// subtask to an existing task in place, then reload to prove the write reached the server rather
// than only the page.
import { expect, test } from '@playwright/test';
import { SKILL_IDS, createTaskViaApi, numberCell, rowFor, uniqueTitle } from './helpers.js';

test('folds a subtree, adds a subtask in place, and keeps it across a reload', async ({
  page,
  request,
}) => {
  const parent = uniqueTitle('Reporting feature');
  const first = uniqueTitle('Design report schema');
  const second = uniqueTitle('Build the report API');
  const added = uniqueTitle('Charts on the dashboard');

  await createTaskViaApi(request, {
    title: parent,
    skillIds: [SKILL_IDS.Backend],
    subtasks: [
      { title: first, skillIds: [SKILL_IDS.Backend] },
      { title: second, skillIds: [SKILL_IDS.Backend] },
    ],
  });

  await page.goto('/');
  await expect(rowFor(page, first)).toBeVisible();

  // The number the parent happens to have depends on what else is in the database, so every
  // assertion below is relative to it.
  const parentNumber = (await numberCell(page, parent).innerText()).trim();

  // ── Fold ──────────────────────────────────────────────────────────────────────────────────
  const toggle = page.getByRole('button', { name: `Subtasks of ${parent}` });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();

  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText(first)).toHaveCount(0);
  await expect(page.getByText(second)).toHaveCount(0);
  await expect(page.getByText('2 subtasks hidden')).toBeVisible();

  await toggle.click();
  await expect(rowFor(page, first)).toBeVisible();

  // ── Add in place ──────────────────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: `Add subtask to ${parent}` }).click();
  await expect(page.getByText(`New subtask of ${parentNumber} — ${parent}`)).toBeVisible();

  await page.getByLabel('Title').fill(added);
  await page
    .getByRole('group', { name: 'Skills for the new subtask' })
    .getByLabel('Frontend')
    .check();
  await page.getByRole('button', { name: 'Add subtask', exact: true }).click();

  // The composer closes, the new row lands under its parent as the third child, and the change is
  // announced for anyone who can't see it arrive.
  await expect(page.getByText(`New subtask of ${parentNumber} — ${parent}`)).toHaveCount(0);
  const addedRow = rowFor(page, added);
  await expect(addedRow).toBeVisible();
  await expect(numberCell(page, added)).toHaveText(`${parentNumber}.3`);
  await expect(addedRow.getByText('Frontend', { exact: true })).toBeVisible();
  await expect(page.getByText(`Added "${added}" under "${parent}"`)).toHaveCount(1);

  // ── Reload ────────────────────────────────────────────────────────────────────────────────
  await page.reload();
  const reloaded = rowFor(page, added);
  await expect(reloaded).toBeVisible();
  await expect(numberCell(page, added)).toHaveText(`${parentNumber}.3`);
  await expect(reloaded.getByLabel(`Status of ${added}`)).toHaveValue('todo');
  // Folding is a per-session reading choice, not stored state: the list comes back fully expanded.
  await expect(page.getByRole('button', { name: `Subtasks of ${parent}` })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

test('will not attach a subtask under a task that is Done, and says so before you try', async ({
  page,
  request,
}) => {
  const parent = uniqueTitle('Ship the release');
  const created = await createTaskViaApi(request, { title: parent, skillIds: [SKILL_IDS.Backend] });
  const done = await request.patch(`/api/tasks/${created.id}`, { data: { status: 'done' } });
  expect(done.status()).toBe(200);

  await page.goto('/');
  await page.getByRole('button', { name: `Add subtask to ${parent}` }).click();

  await expect(page.getByRole('button', { name: 'Add subtask', exact: true })).toBeDisabled();
  await expect(page.getByText(/is Done, so it can't take a new subtask/)).toBeVisible();

  // And the same rule from the API's side, which is the one actually enforcing it.
  const rejected = await request.post('/api/tasks', {
    data: { title: uniqueTitle('Too late'), parentId: created.id },
  });
  expect(rejected.status()).toBe(409);
  expect(await rejected.json()).toMatchObject({ error: { code: 'PARENT_IS_DONE' } });
});
