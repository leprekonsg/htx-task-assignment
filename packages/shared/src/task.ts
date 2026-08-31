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

/** Flattened view of a task tree for the Task List: hierarchical numbering (1, 1.1, 1.1.1) and depth for indentation. */
export interface TaskListRow {
  task: Task;
  number: string;
  depth: number;
}

export function flattenTaskTree(roots: readonly Task[]): TaskListRow[] {
  const rows: TaskListRow[] = [];
  const walk = (tasks: readonly Task[], prefix: string, depth: number) => {
    tasks.forEach((task, index) => {
      const number = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
      rows.push({ task, number, depth });
      walk(task.subtasks, number, depth + 1);
    });
  };
  walk(roots, '', 0);
  return rows;
}
