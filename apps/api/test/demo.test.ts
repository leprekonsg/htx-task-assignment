/**
 * The demo fixture is written as rows, not as API calls, so nothing forces it to be a state the API
 * would have allowed. These tests are that force: they load it and then check it against the same
 * two rules the service enforces, plus the depth limit. A fixture that drifts into an impossible
 * state — an assignee who lacks a skill, a Done parent over unfinished work — would show a reviewer
 * a bug that isn't there, which is worse than having no fixture at all.
 */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Developer, Task } from '@htx/shared';
import { MAX_TASK_DEPTH, canAssign } from '@htx/shared';
import { DEMO_TASKS, countDemoTasks, loadDemoState, loadEmptyState } from '../src/db/demo.js';
import { buildTestApp } from './helpers/app.js';
import { getTestPool, resetDatabase, truncateTasks } from './helpers/db.js';

/** Every task in the tree, flat, each with the depth it sits at (roots are depth 1). */
function walk(tasks: readonly Task[], depth = 1): { task: Task; depth: number }[] {
  return tasks.flatMap((task) => [{ task, depth }, ...walk(task.subtasks, depth + 1)]);
}

function everyDescendant(task: Task): Task[] {
  return task.subtasks.flatMap((child) => [child, ...everyDescendant(child)]);
}

describe('demo data', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await resetDatabase(getTestPool());
    ({ app } = await buildTestApp());
  });

  beforeEach(async () => {
    await truncateTasks(getTestPool());
  });

  afterAll(async () => {
    await app.close();
  });

  async function loadAndRead(): Promise<Task[]> {
    await loadDemoState(getTestPool());
    const res = await app.inject({ method: 'GET', url: '/api/tasks' });
    expect(res.statusCode).toBe(200);
    return res.json() as Task[];
  }

  it('loads every task in the fixture and reads back as a tree', async () => {
    const { removed, created } = await loadDemoState(getTestPool());
    expect(removed).toBe(0);
    expect(created).toBe(countDemoTasks());

    const roots = (await app.inject({ method: 'GET', url: '/api/tasks' })).json() as Task[];
    expect(roots).toHaveLength(DEMO_TASKS.length);
    expect(walk(roots)).toHaveLength(created);
  });

  it('respects Rule A: every assignee holds every skill their task requires', async () => {
    const roots = await loadAndRead();
    const developers = (
      await app.inject({ method: 'GET', url: '/api/developers' })
    ).json() as Developer[];
    const skillsOf = new Map(developers.map((dev) => [dev.id, dev.skills.map((s) => s.id)]));

    const assigned = walk(roots).filter(({ task }) => task.assignee !== null);
    expect(assigned.length).toBeGreaterThan(0);
    for (const { task } of assigned) {
      const owned = skillsOf.get(task.assignee!.id) ?? [];
      const required = task.skills.map((s) => s.id);
      expect(canAssign(owned, required), `${task.assignee!.name} cannot hold "${task.title}"`).toBe(
        true,
      );
    }
  });

  it('respects Rule B: nothing Done sits above unfinished work', async () => {
    const roots = await loadAndRead();
    for (const { task } of walk(roots)) {
      if (task.status !== 'done') continue;
      const unfinished = everyDescendant(task).filter((child) => child.status !== 'done');
      expect(
        unfinished.map((t) => t.title),
        `under Done task "${task.title}"`,
      ).toEqual([]);
    }
  });

  it('stays inside the depth limit while reaching it, so the cap is visible', async () => {
    const depths = walk(await loadAndRead()).map((row) => row.depth);
    expect(Math.max(...depths)).toBe(MAX_TASK_DEPTH);
  });

  it('covers the cases the Task List has to render', async () => {
    const rows = walk(await loadAndRead()).map((row) => row.task);

    // All three answers to "where did these skills come from".
    expect(new Set(rows.map((t) => t.skillsSource))).toEqual(
      new Set(['user', 'llm', 'unresolved']),
    );
    expect(rows.find((t) => t.skillsSource === 'llm')?.skillsModel).toBeTruthy();
    expect(rows.find((t) => t.skillsSource === 'unresolved')?.skills).toEqual([]);

    // All three statuses, both assignment states, a leaf, and a task only Carol can hold.
    expect(new Set(rows.map((t) => t.status))).toEqual(new Set(['todo', 'in_progress', 'done']));
    expect(rows.some((t) => t.assignee === null)).toBe(true);
    expect(rows.some((t) => t.assignee !== null)).toBe(true);
    expect(rows.some((t) => t.subtasks.length === 0)).toBe(true);
    expect(rows.some((t) => t.skills.length > 1)).toBe(true);

    // A Done parent with a Done subtree — the row whose Add subtask is disabled with a reason.
    const doneParent = rows.find((t) => t.status === 'done' && t.subtasks.length > 0);
    expect(doneParent).toBeDefined();
  });

  it('is the same state every time it is loaded', async () => {
    const first = walk(await loadAndRead()).map(({ task }) => [task.id, task.title]);
    const { removed } = await loadDemoState(getTestPool());
    expect(removed).toBe(countDemoTasks());

    const second = walk(
      (await app.inject({ method: 'GET', url: '/api/tasks' })).json() as Task[],
    ).map(({ task }) => [task.id, task.title]);
    expect(second).toEqual(first);
  });

  it('empties the tasks without disturbing the seeded developers and skills', async () => {
    await loadDemoState(getTestPool());
    const { removed, created } = await loadEmptyState(getTestPool());
    expect(removed).toBe(countDemoTasks());
    expect(created).toBe(0);

    expect((await app.inject({ method: 'GET', url: '/api/tasks' })).json()).toEqual([]);
    expect((await app.inject({ method: 'GET', url: '/api/developers' })).json()).toHaveLength(4);
    expect((await app.inject({ method: 'GET', url: '/api/skills' })).json()).toHaveLength(2);
  });
});
