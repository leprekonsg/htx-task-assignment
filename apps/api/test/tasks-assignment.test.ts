/** PATCH /api/tasks/:id — assignment (Rule A: a developer must hold every skill the task requires). */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TestApp } from './helpers/app.js';
import { buildTestApp } from './helpers/app.js';
import { getTestPool, resetDatabase, truncateTasks } from './helpers/db.js';

async function createTask(app: FastifyInstance, skillIds: number[]): Promise<number> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/tasks',
    payload: { title: 'a task', skillIds },
  });
  return res.json().id;
}

describe('PATCH /api/tasks/:id — assignment', () => {
  let app: FastifyInstance;
  let classifier: TestApp['classifier'];

  beforeAll(async () => {
    await resetDatabase(getTestPool());
    ({ app, classifier } = await buildTestApp());
  });

  beforeEach(async () => {
    await truncateTasks(getTestPool());
    classifier.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a developer lacking the required skill: 409 with details.missingSkills', async () => {
    const taskId = await createTask(app, [1]); // Frontend
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      payload: { assigneeId: 2 }, // Bob: Backend only
    });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error.code).toBe('DEVELOPER_LACKS_SKILLS');
    expect(body.error.details.missingSkills).toEqual([{ id: 1, name: 'Frontend' }]);
  });

  it('assigns Carol (Frontend + Backend) to a Frontend task', async () => {
    const taskId = await createTask(app, [1]);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      payload: { assigneeId: 3 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().assignee).toEqual({ id: 3, name: 'Carol' });
  });

  it('assigns Alice (Frontend) to a Frontend task', async () => {
    const taskId = await createTask(app, [1]);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      payload: { assigneeId: 1 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().assignee).toEqual({ id: 1, name: 'Alice' });
  });

  it('rejects an unknown developer with 404 DEVELOPER_NOT_FOUND', async () => {
    const taskId = await createTask(app, [1]);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      payload: { assigneeId: 999 },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('DEVELOPER_NOT_FOUND');
  });

  it('unassigns with assigneeId: null', async () => {
    const taskId = await createTask(app, [1]);
    await app.inject({ method: 'PATCH', url: `/api/tasks/${taskId}`, payload: { assigneeId: 1 } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      payload: { assigneeId: null },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().assignee).toBeNull();
  });

  it('allows anyone to be assigned a task with no required skills (unresolved)', async () => {
    const taskId = await createTask(app, []);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      payload: { assigneeId: 2 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().assignee).toEqual({ id: 2, name: 'Bob' });
  });

  it('only Carol qualifies for a Frontend + Backend task', async () => {
    const taskId = await createTask(app, [1, 2]);

    const bobRes = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      payload: { assigneeId: 2 },
    });
    expect(bobRes.statusCode).toBe(409);

    const carolRes = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      payload: { assigneeId: 3 },
    });
    expect(carolRes.statusCode).toBe(200);
    expect(carolRes.json().assignee).toEqual({ id: 3, name: 'Carol' });
  });
});
