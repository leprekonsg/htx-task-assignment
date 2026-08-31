import type { Task } from '@htx/shared';
import type { TaskRow, TaskSkillRow } from './tasks.sql.js';

/** Assemble flat rows into nested `Task` objects. Returns the roots (rows whose parent is not in the set). */
export function buildTaskTree(
  rows: readonly TaskRow[],
  skillRows: readonly TaskSkillRow[],
): Task[] {
  const skillsByTask = new Map<number, Task['skills']>();
  for (const row of skillRows) {
    const list = skillsByTask.get(row.task_id) ?? [];
    list.push({ id: row.skill_id, name: row.skill_name });
    skillsByTask.set(row.task_id, list);
  }

  const byId = new Map<number, Task>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      title: row.title,
      status: row.status,
      parentId: row.parent_task_id,
      assignee:
        row.assignee_id !== null && row.assignee_name !== null
          ? { id: row.assignee_id, name: row.assignee_name }
          : null,
      skills: skillsByTask.get(row.id) ?? [],
      skillsSource: row.skills_source,
      skillsModel: row.skills_model,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      subtasks: [],
    });
  }

  const roots: Task[] = [];
  for (const row of rows) {
    const task = byId.get(row.id)!;
    const parent = row.parent_task_id === null ? undefined : byId.get(row.parent_task_id);
    if (parent) parent.subtasks.push(task);
    else roots.push(task);
  }
  return roots; // rows arrive ordered by id, so siblings are in creation order
}
