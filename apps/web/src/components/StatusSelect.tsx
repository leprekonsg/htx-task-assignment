// The inline status dropdown shown in each Task List row. It is a "controlled" select: its value
// always comes from the task passed in (never its own internal state), and picking a new option
// just calls `onChange` with the new status — the parent (TaskRow) decides what to do with that,
// which is send a PATCH. This component knows nothing about the network.
import type { Task, TaskStatus } from '@htx/shared';
import { TASK_STATUSES, TASK_STATUS_LABELS } from '@htx/shared';

interface StatusSelectProps {
  task: Task;
  disabled: boolean;
  onChange: (status: TaskStatus) => void;
}

export default function StatusSelect({ task, disabled, onChange }: StatusSelectProps) {
  return (
    <select
      aria-label={`Status of ${task.title}`}
      value={task.status}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as TaskStatus)}
      className="rounded-md border border-border bg-surface-raised px-2 py-1 text-sm text-text disabled:cursor-not-allowed disabled:opacity-60"
    >
      {TASK_STATUSES.map((status) => (
        <option key={status} value={status}>
          {TASK_STATUS_LABELS[status]}
        </option>
      ))}
    </select>
  );
}
