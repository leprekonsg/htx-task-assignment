/**
 * Rule B is enforced across two rows (a task and its descendants), so it needs the root-row-lock
 * design documented in tasks.service.ts, not just a transaction. This races two mutations that touch
 * the same tree — `PATCH parent status=done` and `PATCH child status=todo` — many times and checks that
 * exactly one wins each time, and that the "done implies every descendant is done" invariant never breaks.
 */
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers/app.js';
import { getTestPool, resetDatabase } from './helpers/db.js';

const ROUNDS = 25;

/** Any task, anywhere in the tree, whose status is Done but has a non-Done descendant. */
const INVARIANT_VIOLATIONS_SQL = `
  WITH RECURSIVE tree(root_id, id, status) AS (
    SELECT id, id, status FROM tasks
    UNION ALL
    SELECT tree.root_id, t.id, t.status FROM tasks t JOIN tree ON t.parent_task_id = tree.id
  )
  SELECT DISTINCT tree.root_id
  FROM tree
  JOIN tasks root ON root.id = tree.root_id
  WHERE root.status = 'done' AND tree.status != 'done' AND tree.id != tree.root_id
`;

describe('concurrent status updates on the same tree', () => {
  let app: FastifyInstance;
  let pool: pg.Pool;
  let parentId: number;
  let childId: number;

  beforeAll(async () => {
    pool = getTestPool();
    await resetDatabase(pool);
    ({ app } = await buildTestApp());
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { title: 'parent', subtasks: [{ title: 'child' }] },
    });
    const body = res.json();
    parentId = body.id;
    childId = body.subtasks[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  it(`exactly one of the two racing updates wins, ${ROUNDS} rounds`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await pool.query('UPDATE tasks SET status = $2 WHERE id = $1', [parentId, 'in_progress']);
      await pool.query('UPDATE tasks SET status = $2 WHERE id = $1', [childId, 'done']);

      const [parentDone, childTodo] = await Promise.all([
        app.inject({
          method: 'PATCH',
          url: `/api/tasks/${parentId}`,
          payload: { status: 'done' },
        }),
        app.inject({ method: 'PATCH', url: `/api/tasks/${childId}`, payload: { status: 'todo' } }),
      ]);

      const codes = [parentDone.statusCode, childTodo.statusCode].sort();
      expect(codes).toEqual([200, 409]);
      if (parentDone.statusCode === 409) {
        expect(parentDone.json().error.code).toBe('SUBTASKS_NOT_DONE');
      }
      if (childTodo.statusCode === 409) {
        expect(childTodo.json().error.code).toBe('ANCESTOR_IS_DONE');
      }

      const { rows } = await pool.query(INVARIANT_VIOLATIONS_SQL);
      expect(rows).toEqual([]);
    }
  });
});
