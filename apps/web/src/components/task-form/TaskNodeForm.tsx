// One block of the Create Task form: a title, its skills, and its own subtasks. A "subtask" is
// just another task, so rather than write a separate component for nested tasks, this component
// renders itself again for each of `node.subtasks` — the same pattern as folders containing
// folders. Every block is addressed by a `path` (indices from the root, e.g. `[0, 2]` is "the
// third subtask of the first subtask") which it hands to `dispatch` on every edit; `treeReducer`
// (see ../task-form/treeReducer.ts) uses that path to find and replace just that one node in the
// tree, immutably. This component holds no state of its own — the whole form's state lives in
// CreateTaskPage's `useReducer`, which is what lets `firstProblem`/`toCreateRequest` see the whole
// tree at once.
//
// Two bits of focus management live here because they need a real DOM node, not just tree state:
//   - Every title input has `autoFocus`. React calls `.focus()` on an element exactly once, the
//     moment it mounts — never on a later re-render of the same element. That single behaviour
//     gives us two things for free: the root's title is focused when the page first loads, and a
//     freshly added subtask's title is focused (and scrolled into view) the instant its block
//     appears, because that block's input is a brand-new DOM node.
//   - "Remove" destroys a whole subtree, which can otherwise throw focus into space (the button that
//     was clicked is gone). So a node never removes itself: it calls `onRemove`, a callback its
//     PARENT builds and passes down for each child. The parent runs `window.confirm` (only when the
//     child being removed has descendants of its own), dispatches `removeNode`, and then focuses its
//     OWN "Add subtask" button through a ref. That button is a sibling of the child being removed —
//     it stays mounted throughout the removal — so it's always a safe, findable place to land focus
//     (every parent has one: a parent is at most depth 4, and `canAddSubtaskAt` is true there).
import { useRef, type Dispatch } from 'react';
import type { Skill } from '@htx/shared';
import type { FormAction, FormNode, Path } from './treeReducer';
import { canAddSubtaskAt, countNodes, taskNumber } from './treeReducer';
import SkillCheckboxes from './SkillCheckboxes';
import { secondaryButtonClass } from '../buttonStyles';

interface TaskNodeFormProps {
  node: FormNode;
  path: Path;
  skills: readonly Skill[];
  dispatch: Dispatch<FormAction>;
  /** True once the user has attempted a submit; turns on the "Title is required" validation UI. */
  showErrors: boolean;
  /** Removes this node. Only passed to non-root nodes — the handler itself lives in the parent. */
  onRemove?: () => void;
}

/** "N subtask" for 1, "N subtasks" otherwise. */
function pluralSubtasks(n: number): string {
  return `${n} subtask${n === 1 ? '' : 's'}`;
}

export default function TaskNodeForm({
  node,
  path,
  skills,
  dispatch,
  showErrors,
  onRemove,
}: TaskNodeFormProps) {
  const isRoot = path.length === 0;
  const number = taskNumber(path);
  const titleId = `task-title-${node.key}`;
  const errorId = `task-title-error-${node.key}`;
  const invalid = showErrors && node.title.trim().length === 0;

  // This node's own "Add subtask" button. If one of our children is removed, we move focus here.
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const ownDescendantCount = countNodes(node) - 1;
  const removeLabel =
    ownDescendantCount === 0
      ? `Remove task ${number}`
      : `Remove task ${number} and its ${pluralSubtasks(ownDescendantCount)}`;

  /** Builds the remove handler for `node.subtasks[index]`, passed to that child as `onRemove`. */
  const handleRemoveChild = (index: number) => () => {
    const child = node.subtasks[index]!;
    const childPath = [...path, index];
    const descendantCount = countNodes(child) - 1;
    if (descendantCount > 0) {
      const confirmed = window.confirm(
        `Remove task ${taskNumber(childPath)} and its ${pluralSubtasks(descendantCount)}?`,
      );
      if (!confirmed) return;
    }
    dispatch({ type: 'removeNode', path: childPath });
    addButtonRef.current?.focus();
  };

  return (
    <div
      className={
        isRoot
          ? 'flex flex-col gap-3'
          : 'flex flex-col gap-3 border-l-2 border-border-strong pl-4 pt-3 first:pt-0'
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-text-muted">Task {number}</span>
        {!isRoot && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={removeLabel}
            className={secondaryButtonClass}
          >
            Remove
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={titleId} className="text-sm font-medium text-text">
          Title
        </label>
        <input
          id={titleId}
          type="text"
          required
          autoFocus
          value={node.title}
          onChange={(event) => dispatch({ type: 'setTitle', path, title: event.target.value })}
          aria-invalid={invalid ? 'true' : undefined}
          aria-describedby={invalid ? errorId : undefined}
          className={`rounded-md border bg-surface-raised px-3 py-1.5 text-sm text-text ${
            invalid ? 'border-danger' : 'border-border'
          }`}
        />
        {invalid && (
          <p id={errorId} className="text-xs text-danger">
            Title is required
          </p>
        )}
      </div>

      <SkillCheckboxes
        legend={`Skills for task ${number}`}
        skills={skills}
        selectedSkillIds={node.skillIds}
        onToggle={(skillId) => dispatch({ type: 'toggleSkill', path, skillId })}
      />

      {node.subtasks.map((child, index) => (
        <TaskNodeForm
          key={child.key}
          node={child}
          path={[...path, index]}
          skills={skills}
          dispatch={dispatch}
          showErrors={showErrors}
          onRemove={handleRemoveChild(index)}
        />
      ))}

      {canAddSubtaskAt(path) && (
        <button
          type="button"
          ref={addButtonRef}
          onClick={() => dispatch({ type: 'addSubtask', path })}
          aria-label={`Add subtask to task ${number}`}
          className={`self-start ${secondaryButtonClass}`}
        >
          Add subtask
        </button>
      )}
    </div>
  );
}
