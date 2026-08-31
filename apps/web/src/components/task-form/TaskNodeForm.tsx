// One block of the Create Task form: a title, its skills, and its own subtasks. A "subtask" is
// just another task, so rather than write a separate component for nested tasks, this component
// renders itself again for each of `node.subtasks` — the same pattern as folders containing
// folders. Every block is addressed by a `path` (indices from the root, e.g. `[0, 2]` is "the
// third subtask of the first subtask") which it hands to `dispatch` on every edit; `treeReducer`
// (see ../task-form/treeReducer.ts) uses that path to find and replace just that one node in the
// tree, immutably. This component holds no state of its own — the whole form's state lives in
// CreateTaskPage's `useReducer`, which is what lets `firstProblem`/`toCreateRequest` see the whole
// tree at once.
import type { Dispatch } from 'react';
import type { Skill } from '@htx/shared';
import type { FormAction, FormNode, Path } from './treeReducer';
import { canAddSubtaskAt } from './treeReducer';
import SkillCheckboxes from './SkillCheckboxes';
import { secondaryButtonClass } from '../buttonStyles';

interface TaskNodeFormProps {
  node: FormNode;
  path: Path;
  skills: readonly Skill[];
  dispatch: Dispatch<FormAction>;
}

/** "1" for the root, "1.2" for its second subtask, "1.2.1" for that subtask's first child, etc. */
function taskNumber(path: Path): string {
  return [1, ...path.map((index) => index + 1)].join('.');
}

export default function TaskNodeForm({ node, path, skills, dispatch }: TaskNodeFormProps) {
  const isRoot = path.length === 0;
  const number = taskNumber(path);
  const titleId = `task-title-${node.key}`;

  return (
    <div
      className={
        isRoot
          ? 'flex flex-col gap-3'
          : 'flex flex-col gap-3 border-l-2 border-border pl-4 pt-3 first:pt-0'
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-text-muted">Task {number}</span>
        {!isRoot && (
          <button
            type="button"
            onClick={() => dispatch({ type: 'removeNode', path })}
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
          value={node.title}
          onChange={(event) => dispatch({ type: 'setTitle', path, title: event.target.value })}
          className="rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm text-text"
        />
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
        />
      ))}

      {canAddSubtaskAt(path) && (
        <button
          type="button"
          onClick={() => dispatch({ type: 'addSubtask', path })}
          className={`self-start ${secondaryButtonClass}`}
        >
          Add subtask
        </button>
      )}
    </div>
  );
}
