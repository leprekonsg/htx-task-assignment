// The stack is up and wired together: nginx serves the SPA, proxies the API and the Swagger docs.
import { expect, test } from '@playwright/test';

test('API health, Swagger document and error envelope are reachable through the web origin', async ({
  request,
}) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: 'ok' });

  const docs = await request.get('/docs/json');
  expect(docs.status()).toBe(200);
  const openapi = await docs.json();
  expect(openapi.info.title).toBe('Task Assignment API');
  expect(Object.keys(openapi.paths)).toEqual(
    expect.arrayContaining(['/api/tasks', '/api/tasks/{id}', '/api/developers', '/api/skills']),
  );

  const docsUi = await request.get('/docs/');
  expect(docsUi.status()).toBe(200);

  const missing = await request.get('/api/does-not-exist');
  expect(missing.status()).toBe(404);
  expect(await missing.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
});

test('seed data is present', async ({ request }) => {
  const skills = await (await request.get('/api/skills')).json();
  expect(skills).toEqual([
    { id: 1, name: 'Frontend' },
    { id: 2, name: 'Backend' },
  ]);
  const developers = await (await request.get('/api/developers')).json();
  expect(
    developers.map((d: { name: string; skills: { name: string }[] }) => [
      d.name,
      d.skills.map((s) => s.name),
    ]),
  ).toEqual([
    ['Alice', ['Frontend']],
    ['Bob', ['Backend']],
    ['Carol', ['Frontend', 'Backend']],
    ['Dave', ['Backend']],
  ]);
});

test('home page renders the task list shell and navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create task' })).toBeVisible();
  await page.getByRole('link', { name: 'Create task' }).click();
  await expect(page).toHaveURL(/\/tasks\/new$/);
  await expect(page.getByRole('heading', { name: 'Create task' })).toBeVisible();
});
