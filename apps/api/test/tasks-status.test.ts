/** PATCH /api/tasks/:id — status transitions (Rule B: a task is Done only once every descendant is Done). */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TestApp } from './helpers/app.js';
import { buildTestApp } from './helpers/app.js';
import { getTestPool, resetDatabase, truncateTasks } from './helpers/db.js';

async function patch(app: FastifyInstance, id: number, payload: unknown) {
  return app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, payload });
}

describe('PATCH /api/tasks/:id — status', () => {
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

  async function createParentChild(): Promise<{ parentId: number; childId: number }> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'parent', subtasks: [{ title: 'child' }] },
    });
    const body = res.json();
    return { parentId: body.id, childId: body.subtasks[0].id };
  }

  it('rejects marking a parent Done while a child is still todo: 409 with details.subtaskIds', async () => {
    const { parentId, childId } = await createParentChild();
    const res = await patch(app, parentId, { status: 'done' });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error.code).toBe('SUBTASKS_NOT_DONE');
    expect(body.error.details.subtaskIds).toEqual([childId]);
  });

  it('allows marking the parent Done once the child is Done, then rejects reopening the child', async () => {
    const { parentId, childId } = await createParentChild();

    const childDone = await patch(app, childId, { status: 'done' });
    expect(childDone.statusCode).toBe(200);

    const parentDone = await patch(app, parentId, { status: 'done' });
    expect(parentDone.statusCode).toBe(200);

    const reopenChild = await patch(app, childId, { status: 'todo' });
    expect(reopenChild.statusCode).toBe(409);
    expect(reopenChild.json().error.code).toBe('ANCESTOR_IS_DONE');
  });

  it('allows reopening the child once the parent is reopened', async () => {
    const { parentId, childId } = await createParentChild();
    await patch(app, childId, { status: 'done' });
    await patch(app, parentId, { status: 'done' });

    const reopenParent = await patch(app, parentId, { status: 'in_progress' });
    expect(reopenParent.statusCode).toBe(200);

    const reopenChild = await patch(app, childId, { status: 'todo' });
    expect(reopenChild.statusCode).toBe(200);
  });

  it('rejects marking a grandparent Done while a grandchild is still todo', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        title: 'root',
        subtasks: [{ title: 'child', subtasks: [{ title: 'grandchild' }] }],
      },
    });
    const rootId = res.json().id;

    const done = await patch(app, rootId, { status: 'done' });
    expect(done.statusCode).toBe(409);
    expect(done.json().error.code).toBe('SUBTASKS_NOT_DONE');
  });

  it('treats setting the same status as a no-op: 200', async () => {
    const { parentId, childId } = await createParentChild();
    await patch(app, childId, { status: 'done' });
    await patch(app, parentId, { status: 'done' });

    const res = await patch(app, parentId, { status: 'done' });
    expect(res.statusCode).toBe(200);
  });

  it('rejects an empty body with 400', async () => {
    const { parentId } = await createParentChild();
    const res = await patch(app, parentId, {});
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown task with 404 TASK_NOT_FOUND', async () => {
    const res = await patch(app, 999, { status: 'done' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('TASK_NOT_FOUND');
  });

  it('rejects an invalid status value with 400', async () => {
    const { parentId } = await createParentChild();
    const res = await patch(app, parentId, { status: 'finished' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
