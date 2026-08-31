/** POST /api/tasks — validation, skill checks, nesting/depth, and parent attachment. */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TestApp } from './helpers/app.js';
import { buildTestApp } from './helpers/app.js';
import { getTestPool, resetDatabase, truncateTasks } from './helpers/db.js';

/** A nested title/subtasks object `n` levels deep (n=1 is a leaf). */
function chain(n: number, prefix = 'root'): { title: string; subtasks?: unknown[] } {
  if (n <= 1) return { title: prefix };
  return { title: prefix, subtasks: [chain(n - 1, `${prefix}.child`)] };
}

async function taskCount(): Promise<number> {
  const { rows } = await getTestPool().query<{ count: string }>('SELECT count(*) FROM tasks');
  return Number(rows[0]!.count);
}

describe('POST /api/tasks', () => {
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

  it('creates a single task with skillIds: 201, skillsSource user, skills populated, classifier untouched', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'Build login form', skillIds: [1] },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.title).toBe('Build login form');
    expect(body.skillsSource).toBe('user');
    expect(body.skillsModel).toBeNull();
    expect(body.skills).toEqual([{ id: 1, name: 'Frontend' }]);
    expect(body.subtasks).toEqual([]);
    expect(classifier.calls).toHaveLength(0);
  });

  it.each([
    ['empty title', ''],
    ['whitespace title', '   '],
    ['501-char title', 'x'.repeat(501)],
  ])('rejects %s with 400 VALIDATION_ERROR', async (_label, title) => {
    const res = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts a 500-char title', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'x'.repeat(500) },
    });
    expect(res.statusCode).toBe(201);
  });

  it('rejects an unknown skill id with 404 SKILL_NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'a task', skillIds: [999] },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('SKILL_NOT_FOUND');
  });

  it('rejects duplicate skill ids in one node with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'a task', skillIds: [1, 1] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('creates a nested tree of depth 5, persisting and returning every node', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/tasks', payload: chain(5) });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.title).toBe('root');
    expect(body.subtasks[0].subtasks[0].subtasks[0].subtasks[0].title).toBe(
      'root.child.child.child.child',
    );
    expect(body.subtasks[0].subtasks[0].subtasks[0].subtasks[0].subtasks).toEqual([]);
    expect(await taskCount()).toBe(5);
  });

  it('rejects a nested tree of depth 6 with 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/tasks', payload: chain(6) });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(await taskCount()).toBe(0);
  });

  it('rolls back the whole tree when a deep node has an unknown skill id: 404, nothing persisted', async () => {
    const tree = {
      title: 'root',
      subtasks: [
        {
          title: 'root.child',
          subtasks: [{ title: 'root.child.child', skillIds: [999] }],
        },
      ],
    };
    const res = await app.inject({ method: 'POST', url: '/api/tasks', payload: tree });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('SKILL_NOT_FOUND');
    expect(await taskCount()).toBe(0);
  });

  it('rejects an unknown parentId with 404 PARENT_NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'child', parentId: 999 },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('PARENT_NOT_FOUND');
  });

  it('rejects a parentId whose task is done with 409 PARENT_IS_DONE', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'parent' },
    });
    const parentId = createRes.json().id;
    const doneRes = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${parentId}`,
      payload: { status: 'done' },
    });
    expect(doneRes.statusCode).toBe(200);

    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'child', parentId },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('PARENT_IS_DONE');
  });

  describe('attaching under a depth-4 node', () => {
    let depth4Id: number;

    beforeEach(async () => {
      const res = await app.inject({ method: 'POST', url: '/api/tasks', payload: chain(4) });
      const body = res.json();
      depth4Id = body.subtasks[0].subtasks[0].subtasks[0].id;
    });

    it('rejects attaching a tree of depth 2 with 400 MAX_DEPTH_EXCEEDED', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: { title: 'x', subtasks: [{ title: 'x.1' }], parentId: depth4Id },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('MAX_DEPTH_EXCEEDED');
    });

    it('accepts attaching a single task, 201 with parentId set', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: { title: 'x', parentId: depth4Id },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().parentId).toBe(depth4Id);
    });
  });
});
