// One row of the Task List table, for one task (root or subtask — TaskListPage flattens the tree
// before rendering, so each row already knows its hierarchical number like "1.2", its depth for
// indentation, and how many tasks sit underneath it). This is where "change a select, PATCH
// immediately" lives: the row owns its own `useUpdateTask()` mutation, so its pending/error state is
// scoped to this row only — other rows keep working while this one is mid-request. There is
// deliberately no optimistic update: while the PATCH is in flight the row's controls are disabled,
// and once it resolves, TanStack Query's cache invalidation (see api/hooks.ts) refetches the task
// list, so a successful change shows the server's new value and a failed one snaps back to the
// server's old value — the select never has to be told "undo yourself."
//
// `assignmentUnavailable` comes from TaskListPage's developers query, not from anything this row
// knows about itself — it's true whenever the developer list couldn't be loaded (still pending, or
// errored), which means `developers` may be incomplete or empty and the assignee dropdown has
// nothing trustworthy to offer. It's combined with the mutation's own pending state and applied only
// to the assignee `<select>`; the status `<select>` doesn't read `developers` at all, so it stays
// usable even during a developers outage.
//
// Folding is owned by the page, not by the row: TaskListPage holds the set of collapsed task ids and
// decides which rows exist at all, so a row that is folded away simply isn't rendered. This row only
// reports the click (`onToggleCollapse`) and, when it is the one standing shut, says how many rows
// it is standing in for. Nothing here reads or writes the fold state itself, which is why folding
// can never disagree with what the table shows.
import type { Developer, TaskListRow, TaskStatus } from '@htx/shared';
import { countDoneDescendants } from '@htx/shared';
import AssigneeSelect from './AssigneeSelect';
import SkillBadges from './SkillBadges';
import StatusSelect from './StatusSelect';
import SubtaskToggle from './SubtaskToggle';
import { microTextClass, taskNumberClass } from './typeStyles';
import { useUpdateTask } from '../api/hooks';

const INDENT_PER_DEPTH_PX = 20;

/** "1 subtask" / "3 subtasks". */
function pluralSubtasks(n: number): string {
  return `${n} subtask${n === 1 ? '' : 's'}`;
}

interface TaskRowProps {
  row: TaskListRow;
  developers: readonly Developer[];
  assignmentUnavailable: boolean;
  /** True when this task's subtree is folded away. Always false for a task with no subtasks. */
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function TaskRow({
  row,
  developers,
  assignmentUnavailable,
  collapsed,
  onToggleCollapse,
}: TaskRowProps) {
  const { task, number, depth, descendantCount } = row;
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
  // no and the usual inline alert (below) still explains why. The count is over the whole subtree,
  // not just the direct children, because that is the set the server checks.
  const doneDescendants = countDoneDescendants(task);
  const hasSubtasks = descendantCount > 0;
  const hasUnfinishedSubtasks = hasSubtasks && doneDescendants < descendantCount;

  return (
    <>
      <tr className="border-b border-rule transition-colors last:border-b-0 hover:bg-surface">
        <td className="py-3 pl-3 align-top">
          {hasSubtasks ? (
            <SubtaskToggle
              taskTitle={task.title}
              expanded={!collapsed}
              onToggle={onToggleCollapse}
            />
          ) : (
            // A leaf has nothing to fold, but its number still has to line up with every other
            // number in the column, so it reserves the same 24px of gutter.
            <span className="block h-6 w-6" />
          )}
        </td>
        <td className={`px-3 py-3 align-top ${taskNumberClass}`}>{number}</td>
        <td
          className="px-3 py-3 align-top"
          style={{ paddingLeft: 12 + depth * INDENT_PER_DEPTH_PX }}
        >
          {/* Subtask titles get a hierarchy rail (a left border) so depth is legible even before
              the reader registers the indent or the number's dotted depth. */}
          <div className={depth > 0 ? 'border-l-2 border-accent-muted/35 pl-3' : ''}>
            <span className={depth > 0 ? 'block' : 'block font-medium'}>{task.title}</span>
            {/* A folded row says exactly what it is hiding. A bare count chip would tell you
                something is missing without telling you how much, which is the whole question. */}
            {collapsed && (
              <p className={`mt-1 ${microTextClass}`}>{pluralSubtasks(descendantCount)} hidden</p>
            )}
          </div>
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
                {doneDescendants}/{descendantCount} subtasks done
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
          <td colSpan={6} className="px-3 pb-3">
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
