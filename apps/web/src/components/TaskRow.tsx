// One row of the Task List table, for one task (root or subtask — TaskListPage flattens the tree
// with `flattenTaskTree` before rendering, so each row already knows its hierarchical number like
// "1.2" and its depth for indentation). This is where "change a select, PATCH immediately" lives:
// the row owns its own `useUpdateTask()` mutation, so its pending/error state is scoped to this row
// only — other rows keep working while this one is mid-request. There is deliberately no optimistic
// update: while the PATCH is in flight the row's controls are disabled, and once it resolves,
// TanStack Query's cache invalidation (see api/hooks.ts) refetches the task list, so a successful
// change shows the server's new value and a failed one snaps back to the server's old value — the
// select never has to be told "undo yourself."
//
// `assignmentUnavailable` comes from TaskListPage's developers query, not from anything this row
// knows about itself — it's true whenever the developer list couldn't be loaded (still pending, or
// errored), which means `developers` may be incomplete or empty and the assignee dropdown has
// nothing trustworthy to offer. It's combined with the mutation's own pending state and applied only
// to the assignee `<select>`; the status `<select>` doesn't read `developers` at all, so it stays
// usable even during a developers outage.
import type { Developer, TaskListRow, TaskStatus } from '@htx/shared';
import AssigneeSelect from './AssigneeSelect';
import SkillBadges from './SkillBadges';
import StatusSelect from './StatusSelect';
import { useUpdateTask } from '../api/hooks';

const INDENT_PER_DEPTH_PX = 20;

interface TaskRowProps {
  row: TaskListRow;
  developers: readonly Developer[];
  assignmentUnavailable: boolean;
}

export default function TaskRow({ row, developers, assignmentUnavailable }: TaskRowProps) {
  const { task, number, depth } = row;
  const updateTask = useUpdateTask();

  const handleStatusChange = (status: TaskStatus) => {
    updateTask.mutate({ id: task.id, status });
  };

  const handleAssigneeChange = (assigneeId: number | null) => {
    updateTask.mutate({ id: task.id, assigneeId });
  };

  return (
    <>
      <tr className="border-b border-border last:border-b-0">
        <td className="px-3 py-2 align-top text-text-muted">{number}</td>
        <td
          className="px-3 py-2 align-top"
          style={{ paddingLeft: 12 + depth * INDENT_PER_DEPTH_PX }}
        >
          {task.title}
        </td>
        <td className="px-3 py-2 align-top">
          <SkillBadges
            skills={task.skills}
            skillsSource={task.skillsSource}
            skillsModel={task.skillsModel}
          />
        </td>
        <td className="px-3 py-2 align-top">
          <StatusSelect task={task} disabled={updateTask.isPending} onChange={handleStatusChange} />
        </td>
        <td className="px-3 py-2 align-top">
          <AssigneeSelect
            task={task}
            developers={developers}
            disabled={updateTask.isPending || assignmentUnavailable}
            onChange={handleAssigneeChange}
          />
        </td>
      </tr>
      {updateTask.isError && (
        <tr>
          <td colSpan={5} className="px-3 pb-2">
            <p role="alert" className="text-sm text-danger">
              {updateTask.error.message}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}
