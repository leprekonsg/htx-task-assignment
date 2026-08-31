import { z } from 'zod';

/** Lifecycle of a task. The spec names "To-do" and "Done"; "In progress" is our addition (README assumption). */
export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TASK_STATUS_LABELS: Readonly<Record<TaskStatus, string>> = {
  todo: 'To-do',
  in_progress: 'In progress',
  done: 'Done',
};
