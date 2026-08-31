import { z } from 'zod';
import { IdSchema, SkillSchema } from './skill.js';
import { TaskStatusSchema } from './status.js';

/** How a task's required skills were determined. Kept on the row so the UI/API can be honest about LLM use. */
export const SKILLS_SOURCES = ['user', 'llm', 'unresolved'] as const;
export const SkillsSourceSchema = z.enum(SKILLS_SOURCES);
export type SkillsSource = z.infer<typeof SkillsSourceSchema>;

export const SKILLS_SOURCE_LABELS: Readonly<Record<SkillsSource, string>> = {
  user: 'Chosen by user',
  llm: 'Inferred by LLM',
  unresolved: 'Not inferred (LLM unavailable)',
};

export const TASK_TITLE_MAX_LENGTH = 500;
/** Maximum nesting: a root task (depth 1) may have subtasks down to depth 5 (1 → 1.1 → 1.1.1 → 1.1.1.1 → 1.1.1.1.1). */
export const MAX_TASK_DEPTH = 5;
export const MAX_SUBTASKS_PER_TASK = 50;

export const TaskTitleSchema = z.string().trim().min(1).max(TASK_TITLE_MAX_LENGTH);

export const TaskAssigneeSchema = z.object({ id: IdSchema, name: z.string() });

/** A task as returned by the API. `subtasks` is the full subtree, ordered by id. */
export const TaskSchema = z.object({
  id: IdSchema,
  title: z.string(),
  status: TaskStatusSchema,
  parentId: IdSchema.nullable(),
  assignee: TaskAssigneeSchema.nullable(),
  skills: z.array(SkillSchema),
  skillsSource: SkillsSourceSchema,
  /** Model id that answered when `skillsSource === 'llm'`, otherwise null. */
  skillsModel: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  get subtasks(): z.ZodArray<typeof TaskSchema> {
    return z.array(TaskSchema);
  },
});
export type Task = z.infer<typeof TaskSchema>;
// Self-referential schemas used inline (e.g. as a Fastify response schema) need a registered `id` so
// fastify-type-provider-zod / @fastify/swagger can turn the cycle into a `$ref` component instead of erroring.
z.globalRegistry.add(TaskSchema, { id: 'Task' });

const uniqueIds = (ids: readonly number[]) => new Set(ids).size === ids.length;

/**
 * One node of a create request. `skillIds` omitted or empty ⇒ "no skills provided" ⇒ the backend infers them.
 * Nodes nest through `subtasks`, mirroring the Create Task page (1 → 1.1 → 1.1.1).
 */
export const TaskNodeInputSchema = z.object({
  title: TaskTitleSchema,
  skillIds: z
    .array(IdSchema)
    .max(20)
    .refine(uniqueIds, { message: 'skillIds must not contain duplicates' })
    .optional(),
  get subtasks(): z.ZodOptional<z.ZodArray<typeof TaskNodeInputSchema>> {
    return z.array(TaskNodeInputSchema).max(MAX_SUBTASKS_PER_TASK).optional();
  },
});
export type TaskNodeInput = z.infer<typeof TaskNodeInputSchema>;
// Same reason as TaskSchema above: this recursive schema is nested inside CreateTaskRequestSchema's body.
z.globalRegistry.add(TaskNodeInputSchema, { id: 'TaskNodeInput' });

/** Depth of a node tree: 1 for a leaf, 2 for a node with subtasks, ... */
export function taskTreeDepth(node: { subtasks?: readonly TaskNodeInput[] | undefined }): number {
  const children = node.subtasks ?? [];
  return 1 + children.reduce((max, child) => Math.max(max, taskTreeDepth(child)), 0);
}

/** Body of POST /api/tasks. `parentId` attaches the whole tree under an existing task. */
export const CreateTaskRequestSchema = TaskNodeInputSchema.extend({
  parentId: IdSchema.optional(),
}).refine((req) => taskTreeDepth(req) <= MAX_TASK_DEPTH, {
  message: `Task trees may be at most ${MAX_TASK_DEPTH} levels deep`,
  path: ['subtasks'],
});
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;

/** Body of PATCH /api/tasks/:id. Only status and assignee are mutable (skills are fixed at creation). */
export const UpdateTaskRequestSchema = z
  .object({
    status: TaskStatusSchema.optional(),
    /** `null` unassigns. */
    assigneeId: IdSchema.nullable().optional(),
  })
  .refine((body) => body.status !== undefined || body.assigneeId !== undefined, {
    message: 'Provide at least one of: status, assigneeId',
  });
export type UpdateTaskRequest = z.infer<typeof UpdateTaskRequestSchema>;

/**
 * Flattened view of a task tree for the Task List: hierarchical numbering (1, 1.1, 1.1.1), depth
 * for indentation, and the size of the subtree hanging off this row.
 *
 * `number` is built from a task's position among its siblings in the *whole* tree, never from its
 * position in the returned array. That is what lets the UI fold a subtree away without renumbering
 * anything: hide 1.2 and 1.3 is still 1.3.
 */
export interface TaskListRow {
  task: Task;
  number: string;
  depth: number;
  /** Every task underneath this one — children, their children, and so on. 0 for a leaf. */
  descendantCount: number;
}

/** Children, grandchildren, … of `task`, not counting `task` itself. */
export function countDescendants(task: Task): number {
  return task.subtasks.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

/**
 * One pre-order walk of the forest, shared by both flatteners below. `shouldDescend` decides, for
 * each task, whether to walk into its subtasks — it is the only difference between "every task" and
 * "every task a reader can currently see".
 */
function walkTaskTree(
  roots: readonly Task[],
  shouldDescend: (task: Task) => boolean,
): TaskListRow[] {
  const rows: TaskListRow[] = [];
  const walk = (tasks: readonly Task[], prefix: string, depth: number) => {
    tasks.forEach((task, index) => {
      const number = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
      rows.push({ task, number, depth, descendantCount: countDescendants(task) });
      if (shouldDescend(task)) walk(task.subtasks, number, depth + 1);
    });
  };
  walk(roots, '', 0);
  return rows;
}

/** Every task in the forest, parents before their children. */
export function flattenTaskTree(roots: readonly Task[]): TaskListRow[] {
  return walkTaskTree(roots, () => true);
}

/**
 * The rows actually on screen once the reader has folded some parents shut. A collapsed task keeps
 * its own row (with `descendantCount` intact, so the UI can say how many rows it is standing in
 * for) and contributes none of its descendants.
 */
export function flattenVisibleTaskTree(
  roots: readonly Task[],
  collapsedIds: ReadonlySet<number>,
): TaskListRow[] {
  return walkTaskTree(roots, (task) => !collapsedIds.has(task.id));
}

/**
 * Descendants of `task` that are Done. Rule B is enforced over the whole subtree, not just the
 * direct children, so this is what the "n/m subtasks done" hint has to count to match the server.
 */
export function countDoneDescendants(task: Task): number {
  return task.subtasks.reduce(
    (sum, child) => sum + (child.status === 'done' ? 1 : 0) + countDoneDescendants(child),
    0,
  );
}

/** Ids of every task that has subtasks — exactly the tasks a reader is able to fold. */
export function collapsibleTaskIds(roots: readonly Task[]): number[] {
  const ids: number[] = [];
  const walk = (tasks: readonly Task[]) => {
    for (const task of tasks) {
      if (task.subtasks.length > 0) ids.push(task.id);
      walk(task.subtasks);
    }
  };
  walk(roots);
  return ids;
}
