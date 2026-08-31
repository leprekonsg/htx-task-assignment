/**
 * Two states you can put the database into, so the app can be *looked at* and not only run:
 *
 *   **empty** — no tasks at all. What a clean `docker compose up` gives you, and the state the
 *   empty-state screen was written for.
 *
 *   **demo** — one task tree per thing the UI has to be able to show: a branch deep enough to be
 *   worth folding, a Done parent whose whole subtree is Done, a chain five levels deep, a leaf with
 *   nothing under it, all three `skills_source` values, assigned and unassigned rows, and a task
 *   whose two skills only one developer holds.
 *
 * Neither touches developers or skills. Those are the assignment's seed data (`migrations/seed.sql`)
 * and are identical in both states — the two states differ only in tasks.
 *
 * Why rows are inserted directly rather than posted to `POST /api/tasks`: the fixture has to *state*
 * how each task's skills were decided, including `llm` with a model name, and a real request can
 * only produce that by calling a real model. It also needs Done parents, which the API will only
 * accept once their children are Done — so building it through the API would mean creating
 * everything to-do and then walking it bottom-up. Inserting the rows keeps the fixture readable and
 * free of network dependence; `test/demo.test.ts` then checks the result is a state the API's own
 * rules would have permitted, which is the part that actually matters.
 */
import type { SkillsSource, TaskStatus } from '@htx/shared';
import type { Pool, Queryable } from './pool.js';
import { withTransaction } from './pool.js';

export interface DemoTask {
  title: string;
  status: TaskStatus;
  /** Skill names, resolved against the seeded catalogue at load time. */
  skills: string[];
  /** Developer name, or null. Must hold every skill above — Rule A. Checked by demo.test.ts. */
  assignee: string | null;
  /** Defaults to 'user' — the honest answer for skills written into a fixture by hand. */
  skillsSource?: SkillsSource;
  skillsModel?: string | null;
  subtasks?: DemoTask[];
}

export interface DemoLoadResult {
  /** Tasks that were in the database before this ran. */
  removed: number;
  created: number;
}

/**
 * Every row here is a case the Task List has to render. Read it as a checklist of the UI, not as a
 * plausible backlog: each tree earns its place by being the only one that shows something.
 */
export const DEMO_TASKS: readonly DemoTask[] = [
  {
    // The everyday case, and deep enough that folding is worth having. Two skills means Carol is
    // the only developer who can hold it — Rule A, visible in one row.
    title: 'Launch the customer portal',
    status: 'in_progress',
    skills: ['Frontend', 'Backend'],
    assignee: 'Carol',
    subtasks: [
      {
        title: 'Design the sign-in screen',
        status: 'done',
        skills: ['Frontend'],
        assignee: 'Alice',
      },
      {
        title: 'Build the session API',
        status: 'in_progress',
        skills: ['Backend'],
        assignee: 'Bob',
        subtasks: [
          { title: 'Add refresh tokens', status: 'todo', skills: ['Backend'], assignee: null },
          {
            title: 'Rate-limit the login route',
            status: 'done',
            skills: ['Backend'],
            assignee: 'Dave',
          },
        ],
      },
      {
        // No skills and no model: what a task looks like when inference was unavailable.
        title: 'Write the launch checklist',
        status: 'todo',
        skills: [],
        assignee: null,
        skillsSource: 'unresolved',
      },
    ],
  },
  {
    // Done, with a subtree that is entirely Done — the one case where Add subtask is disabled and
    // says why, because the server would refuse the attach.
    title: 'Ship the billing rewrite',
    status: 'done',
    skills: ['Backend'],
    assignee: 'Dave',
    subtasks: [
      { title: 'Migrate the invoice table', status: 'done', skills: ['Backend'], assignee: 'Dave' },
      {
        title: 'Backfill historical invoices',
        status: 'done',
        skills: ['Backend'],
        assignee: 'Bob',
      },
    ],
  },
  {
    // Skills the model chose rather than the user: the AI-inferred badge and its model name.
    title: 'Refresh the marketing site',
    status: 'todo',
    skills: ['Frontend'],
    assignee: null,
    skillsSource: 'llm',
    skillsModel: 'gemini-3.5-flash-lite',
  },
  {
    // Five levels — the API's limit. The deepest row is offered no Add subtask action, and this is
    // the tree that makes Collapse all worth pressing.
    title: 'Rebuild the search index',
    status: 'todo',
    skills: ['Backend'],
    assignee: 'Bob',
    subtasks: [
      {
        title: 'Choose a ranking model',
        status: 'todo',
        skills: ['Backend'],
        assignee: null,
        subtasks: [
          {
            title: 'Benchmark the current ranking',
            status: 'todo',
            skills: ['Backend'],
            assignee: null,
            subtasks: [
              {
                title: 'Collect a query set',
                status: 'todo',
                skills: ['Backend'],
                assignee: null,
                subtasks: [
                  {
                    title: 'Sample a week of production logs',
                    status: 'todo',
                    skills: ['Backend'],
                    assignee: null,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    // A leaf: no chevron, nothing to fold, nothing hidden. The row most of a real list is made of.
    title: 'Fix the flaky checkout test',
    status: 'todo',
    skills: ['Backend'],
    assignee: null,
  },
];

/** How many tasks the fixture describes, counted from the fixture itself rather than written down. */
export function countDemoTasks(tasks: readonly DemoTask[] = DEMO_TASKS): number {
  return tasks.reduce((sum, task) => sum + 1 + countDemoTasks(task.subtasks ?? []), 0);
}

async function countTasks(db: Queryable): Promise<number> {
  const { rows } = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM tasks');
  return Number(rows[0]?.count ?? 0);
}

/**
 * `RESTART IDENTITY` so a loaded state is the same every time — ids 1..n in fixture order, which is
 * what makes a screenshot or a bug report reproducible. `CASCADE` reaches `task_skills` only:
 * `developers` and `skills` are referenced *by* tasks, not the other way round, so the seed survives.
 */
async function truncateTasks(db: Queryable): Promise<void> {
  await db.query('TRUNCATE tasks RESTART IDENTITY CASCADE');
}

async function nameToId(db: Queryable, sql: string, what: string): Promise<Map<string, number>> {
  const { rows } = await db.query<{ id: number; name: string }>(sql);
  if (rows.length === 0) throw new Error(`No ${what} found — run the migrations and seed first.`);
  return new Map(rows.map((row) => [row.name, row.id]));
}

function lookup(map: Map<string, number>, name: string, what: string): number {
  const id = map.get(name);
  if (id === undefined) {
    throw new Error(
      `Demo data names a ${what} that isn't seeded: "${name}". Known: ${[...map.keys()].join(', ')}.`,
    );
  }
  return id;
}

async function insertTasks(
  db: Queryable,
  tasks: readonly DemoTask[],
  parentId: number | null,
  skillIds: Map<string, number>,
  developerIds: Map<string, number>,
): Promise<number> {
  let created = 0;
  for (const task of tasks) {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO tasks (title, status, assignee_id, parent_task_id, skills_source, skills_model)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        task.title,
        task.status,
        task.assignee === null ? null : lookup(developerIds, task.assignee, 'developer'),
        parentId,
        task.skillsSource ?? 'user',
        task.skillsModel ?? null,
      ],
    );
    const id = rows[0]!.id;
    created += 1;

    if (task.skills.length > 0) {
      await db.query(`INSERT INTO task_skills (task_id, skill_id) SELECT $1, unnest($2::int[])`, [
        id,
        task.skills.map((name) => lookup(skillIds, name, 'skill')),
      ]);
    }

    created += await insertTasks(db, task.subtasks ?? [], id, skillIds, developerIds);
  }
  return created;
}

/** Removes every task, leaving the seeded developers and skills untouched. */
export async function loadEmptyState(pool: Pool): Promise<DemoLoadResult> {
  return withTransaction(pool, async (client) => {
    const removed = await countTasks(client);
    await truncateTasks(client);
    return { removed, created: 0 };
  });
}

/** Replaces every task with `DEMO_TASKS`. All or nothing: one transaction. */
export async function loadDemoState(pool: Pool): Promise<DemoLoadResult> {
  return withTransaction(pool, async (client) => {
    const removed = await countTasks(client);
    await truncateTasks(client);
    const skillIds = await nameToId(client, 'SELECT id, name FROM skills', 'skills');
    const developerIds = await nameToId(client, 'SELECT id, name FROM developers', 'developers');
    const created = await insertTasks(client, DEMO_TASKS, null, skillIds, developerIds);
    return { removed, created };
  });
}
