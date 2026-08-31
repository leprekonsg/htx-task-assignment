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
import { microTextClass, taskNumberClass } from './typeStyles';
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

  // Rule B (a parent can't be marked done while a subtask isn't) is enforced by the server, not
  // here — but a select that just silently rejects "Done" is a bad surprise, so when it applies we
  // print the reason as a quiet fact under the status control, ahead of time. It's plain text, not
  // an error: the Done option stays enabled, and if the user picks it anyway the server still says
  // no and the usual inline alert (below) still explains why.
  const subtaskCount = task.subtasks.length;
  const doneSubtasks = task.subtasks.filter((subtask) => subtask.status === 'done').length;
  const hasUnfinishedSubtasks = subtaskCount > 0 && doneSubtasks < subtaskCount;

  return (
    <>
      <tr className="border-b border-rule transition-colors last:border-b-0 hover:bg-surface">
        <td className={`px-3 py-3 align-top ${taskNumberClass}`}>{number}</td>
        <td
          className="px-3 py-3 align-top"
          style={{ paddingLeft: 12 + depth * INDENT_PER_DEPTH_PX }}
        >
          {/* Subtask titles get a hierarchy rail (a left border) so depth is legible even before
              the reader registers the indent or the number's dotted depth. */}
          <span
            className={
              depth > 0 ? 'block border-l-2 border-accent-muted/35 pl-3' : 'block font-medium'
            }
          >
            {task.title}
          </span>
        </td>
        <td className="px-3 py-3 align-top">
          <SkillBadges
            skills={task.skills}
            skillsSource={task.skillsSource}
            skillsModel={task.skillsModel}
          />
        </td>
        <td className="px-3 py-3 align-top">
          <div className="flex flex-col gap-1">
            <StatusSelect
              task={task}
              disabled={updateTask.isPending}
              onChange={handleStatusChange}
            />
            {hasUnfinishedSubtasks && (
              <p className={microTextClass}>
                {doneSubtasks}/{subtaskCount} subtasks done
              </p>
            )}
          </div>
        </td>
        <td className="px-3 py-3 align-top">
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
          <td colSpan={5} className="px-3 pb-3">
            <p
              role="alert"
              className="border-l-2 border-danger bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              {updateTask.error.message}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}
