/**
 * Every SQL statement the tasks module runs, in one place. The recursive CTEs walk the parent/child
 * tree in both directions; `lockTree` is the row lock the Rule B design serialises on.
 */
import type { SkillsSource, TaskStatus } from '@htx/shared';
import type { PoolClient } from 'pg';
import type { Queryable } from '../../db/pool.js';

export interface TaskRow {
  id: number;
  title: string;
  status: TaskStatus;
  parent_task_id: number | null;
  assignee_id: number | null;
  assignee_name: string | null;
  skills_source: SkillsSource;
  skills_model: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface TaskSkillRow {
  task_id: number;
  skill_id: number;
  skill_name: string;
}

export interface AncestorRow {
  id: number;
  parent_task_id: number | null;
  status: TaskStatus;
  /** 0 = the task itself, 1 = its parent, ... */
  distance: number;
}

const SELECT_TASK = `
  SELECT t.id, t.title, t.status, t.parent_task_id, t.assignee_id, d.name AS assignee_name,
         t.skills_source, t.skills_model, t.created_at, t.updated_at
  FROM tasks t
  LEFT JOIN developers d ON d.id = t.assignee_id`;

export async function selectAllTasks(db: Queryable): Promise<TaskRow[]> {
  const { rows } = await db.query<TaskRow>(`${SELECT_TASK} ORDER BY t.id`);
  return rows;
}

/** The task and every descendant (the subtree rooted at `id`). */
export async function selectSubtree(db: Queryable, id: number): Promise<TaskRow[]> {
  const { rows } = await db.query<TaskRow>(
    `WITH RECURSIVE subtree AS (
       SELECT id FROM tasks WHERE id = $1
       UNION ALL
       SELECT t.id FROM tasks t JOIN subtree s ON t.parent_task_id = s.id
     )
     ${SELECT_TASK}
     WHERE t.id IN (SELECT id FROM subtree)
     ORDER BY t.id`,
    [id],
  );
  return rows;
}

export async function selectTaskSkills(
  db: Queryable,
  taskIds: readonly number[],
): Promise<TaskSkillRow[]> {
  if (taskIds.length === 0) return [];
  const { rows } = await db.query<TaskSkillRow>(
    `SELECT ts.task_id, s.id AS skill_id, s.name AS skill_name
     FROM task_skills ts JOIN skills s ON s.id = ts.skill_id
     WHERE ts.task_id = ANY($1::int[])
     ORDER BY ts.task_id, s.id`,
    [taskIds],
  );
  return rows;
}

/** The task itself (distance 0) followed by its parent, grandparent, ... up to the root. Empty if `id` does not exist. */
export async function selectAncestors(db: Queryable, id: number): Promise<AncestorRow[]> {
  const { rows } = await db.query<AncestorRow>(
    `WITH RECURSIVE up AS (
       SELECT id, parent_task_id, status, 0 AS distance FROM tasks WHERE id = $1
       UNION ALL
       SELECT t.id, t.parent_task_id, t.status, up.distance + 1
       FROM tasks t JOIN up ON t.id = up.parent_task_id
     )
     SELECT id, parent_task_id, status, distance FROM up ORDER BY distance`,
    [id],
  );
  return rows;
}

/** Statuses of every strict descendant of `id`. */
export async function selectDescendantStatuses(
  db: Queryable,
  id: number,
): Promise<{ id: number; status: TaskStatus }[]> {
  const { rows } = await db.query<{ id: number; status: TaskStatus }>(
    `WITH RECURSIVE down AS (
       SELECT id, status FROM tasks WHERE parent_task_id = $1
       UNION ALL
       SELECT t.id, t.status FROM tasks t JOIN down ON t.parent_task_id = down.id
     )
     SELECT id, status FROM down ORDER BY id`,
    [id],
  );
  return rows;
}

/**
 * Row-lock the root of a tree. Every mutation that can affect the tree's completion invariant takes this
 * lock first, so two such mutations on the same tree run one after the other (see docs: Rule B).
 */
export async function lockTree(client: PoolClient, rootId: number): Promise<void> {
  await client.query('SELECT id FROM tasks WHERE id = $1 FOR UPDATE', [rootId]);
}

export async function insertTask(
  client: PoolClient,
  task: {
    title: string;
    parentId: number | null;
    skillsSource: SkillsSource;
    skillsModel: string | null;
  },
): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO tasks (title, parent_task_id, skills_source, skills_model)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [task.title, task.parentId, task.skillsSource, task.skillsModel],
  );
  return rows[0]!.id;
}

export async function insertTaskSkills(
  client: PoolClient,
  taskId: number,
  skillIds: readonly number[],
): Promise<void> {
  if (skillIds.length === 0) return;
  await client.query(`INSERT INTO task_skills (task_id, skill_id) SELECT $1, unnest($2::int[])`, [
    taskId,
    skillIds,
  ]);
}

export async function updateTask(
  client: PoolClient,
  id: number,
  patch: { status?: TaskStatus; assigneeId?: number | null },
): Promise<void> {
  await client.query(
    `UPDATE tasks
     SET status      = COALESCE($2::task_status, status),
         assignee_id = CASE WHEN $3::boolean THEN $4::int ELSE assignee_id END,
         updated_at  = now()
     WHERE id = $1`,
    [id, patch.status ?? null, patch.assigneeId !== undefined, patch.assigneeId ?? null],
  );
}
