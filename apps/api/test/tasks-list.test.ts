/** GET /api/tasks and GET /api/tasks/:id — tree shape and ordering. */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TestApp } from './helpers/app.js';
import { buildTestApp } from './helpers/app.js';
import { getTestPool, resetDatabase, truncateTasks } from './helpers/db.js';

describe('GET /api/tasks', () => {
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

  it('returns only roots at the top level, with subtasks nested and ordered by id', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'first root', subtasks: [{ title: 'a' }, { title: 'b' }] },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'second root' },
    });

    const res = await app.inject({ method: 'GET', url: '/api/tasks' });
    expect(res.statusCode).toBe(200);
    const roots = res.json();
    expect(roots).toHaveLength(2);
    expect(roots.map((t: { id: number }) => t.id)).toEqual([first.json().id, second.json().id]);
    expect(roots[0].subtasks.map((t: { title: string }) => t.title)).toEqual(['a', 'b']);
    expect(roots[1].subtasks).toEqual([]);
  });

  it('GET /api/tasks/:id for a child returns that subtree, not the whole tree', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: 'root',
        subtasks: [{ title: 'child', subtasks: [{ title: 'grandchild' }] }],
      },
    });
    const childId = created.json().subtasks[0].id;

    const res = await app.inject({ method: 'GET', url: `/api/tasks/${childId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.title).toBe('child');
    expect(body.parentId).toBe(created.json().id);
    expect(body.subtasks).toHaveLength(1);
    expect(body.subtasks[0].title).toBe('grandchild');
  });

  it('GET /api/tasks/:id for an unknown id returns 404 TASK_NOT_FOUND', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tasks/999' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('TASK_NOT_FOUND');
  });
});
