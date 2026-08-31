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
//
// Adding a subtask works the same way: the page decides which single row (if any) has its composer
// open, so opening one anywhere closes the last. This row renders the action, renders
// `AddSubtaskForm` in a full-width row underneath itself when it is the chosen one, and owns one
// imperative detail the page can't — a `ref` to its own Add subtask button, so that cancelling or
// finishing hands focus back to the control the user came from instead of dropping it on `<body>`.
// The composer's half-written contents pass straight through this row: they belong to the page,
// because this row is exactly what stops existing when its parent is folded (see AddSubtaskForm).
// The action is absent at depth 5 (`MAX_TASK_DEPTH`), because there is nowhere left to put a child
// and offering a button the server would refuse is worse than not offering one.
import { useRef } from 'react';
import type { Developer, Task, TaskListRow, TaskStatus } from '@htx/shared';
import { MAX_TASK_DEPTH, countDoneDescendants } from '@htx/shared';
import type { SubtaskDraft } from './AddSubtaskForm';
import AddSubtaskForm from './AddSubtaskForm';
import AssigneeSelect from './AssigneeSelect';
import SkillBadges from './SkillBadges';
import StatusSelect from './StatusSelect';
import SubtaskToggle from './SubtaskToggle';
import { quietButtonClass } from './buttonStyles';
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
  /** True when this is the one row whose Add subtask composer is open. */
  composerOpen: boolean;
  onOpenComposer: () => void;
  onCloseComposer: () => void;
  /** The half-written subtask for this row, held by the page so it outlives the composer. */
  draft: SubtaskDraft;
  onDraftChange: (draft: SubtaskDraft) => void;
  onSubtaskCreated: (created: Task) => void;
  /** True for a subtask that has just been added, for the one-shot settle on its new row. */
  highlighted: boolean;
}

export default function TaskRow({
  row,
  developers,
  assignmentUnavailable,
  collapsed,
  onToggleCollapse,
  composerOpen,
  onOpenComposer,
  onCloseComposer,
  draft,
  onDraftChange,
  onSubtaskCreated,
  highlighted,
}: TaskRowProps) {
  const { task, number, depth, descendantCount } = row;
  const updateTask = useUpdateTask();
  const addButtonRef = useRef<HTMLButtonElement>(null);

  // A subtask of this row would sit one level deeper, so the deepest row that can take one is the
  // second-to-last level. Nothing is rendered below that: see the header comment.
  const canAddSubtask = depth < MAX_TASK_DEPTH - 1;

  const closeComposer = () => {
    onCloseComposer();
    addButtonRef.current?.focus();
  };

  const handleCreated = (created: Task) => {
    onSubtaskCreated(created);
    // The composer is about to unmount; land focus back on the control that opened it, which is
    // also the fastest place to be if the next thing you want is another subtask.
    addButtonRef.current?.focus();
  };

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
      <tr
        className={`group/row border-b border-rule transition-colors last:border-b-0 hover:bg-surface ${
          highlighted ? 'motion-safe:animate-ink-settle' : ''
        }`}
      >
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
              <p className={`mt-1 whitespace-nowrap ${microTextClass}`}>
                {pluralSubtasks(descendantCount)} hidden
              </p>
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
              <p className={`whitespace-nowrap ${microTextClass}`}>
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
        <td className="px-3 py-3 align-top">
          {canAddSubtask && (
            <button
              type="button"
              ref={addButtonRef}
              onClick={onOpenComposer}
              aria-label={`Add subtask to ${task.title}`}
              // Present in the DOM and in the tab order at all times; only its ink is held back
              // until the row is pointed at or the button itself takes focus, so a full table of
              // buttons doesn't compete with the rows for attention. `focus`, not `focus-visible`:
              // focus lands here programmatically after Cancel, which a mouse user must still see.
              // The `hover: none` clause is for touch, where a hover-only reveal never happens.
              className={`${quietButtonClass} whitespace-nowrap ${
                composerOpen
                  ? 'opacity-100'
                  : 'opacity-0 group-hover/row:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100'
              }`}
            >
              Add subtask
            </button>
          )}
        </td>
      </tr>
      {composerOpen && (
        <tr className="border-b border-rule">
          <td colSpan={7} className="p-0">
            {/* Indented to where the new subtask will land, so the composer sits in the row it is
                about to create rather than floating over the table.

                `sticky left-0` and the viewport cap are what make it usable on a phone. The table
                is 820px wide and scrolls horizontally inside its own container, so a form that
                simply filled this cell would be 820px too — its field running off the side of a
                390px screen. Pinned to the scroller's left edge and capped at the viewport, the
                composer stays whole and in place however far the table is scrolled. */}
            <div
              className="sticky left-0 max-w-[calc(100vw-2rem)] pb-4 pr-4 pt-1"
              style={{ paddingLeft: 12 + (depth + 1) * INDENT_PER_DEPTH_PX }}
            >
              <AddSubtaskForm
                parent={task}
                parentNumber={number}
                draft={draft}
                onDraftChange={onDraftChange}
                onCreated={handleCreated}
                onCancel={closeComposer}
              />
            </div>
          </td>
        </tr>
      )}
      {updateTask.isError && (
        <tr>
          <td colSpan={7} className="px-3 pb-3">
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
