// The composer that opens directly under a task row to add one subtask to it, without leaving the
// list. It is deliberately *not* the Create Task page's recursive form: that form builds a whole
// tree before saving anything, which is the right shape when you are planning work and the wrong
// shape when you are looking at a task and want one more thing under it. This is one node — a
// title, optional skills — posted with the parent's id.
//
// The API has always accepted `parentId` on POST /api/tasks; this is the UI that sends it. Nothing
// about the server changes, including the two rules it enforces on attach: the parent must not be
// Done, and the tree must not pass five levels.
//
// Three things it borrows from the Create Task page rather than reinventing:
//   - `SkillCheckboxes`, so choosing skills looks and behaves the same in both places. Leave them
//     unchecked and the backend infers them from the title, exactly as it does on create.
//   - An empty title does not disable the button. A disabled control cannot explain itself, so the
//     button stays live and pressing it shows the reason and puts the cursor back in the field.
//   - The skill catalogue is reference data the form should not proceed without: if it can't be
//     loaded, skills silently become "inferred" without the user having chosen that, so the submit
//     is held and the status line says why.
//
// A Done parent is the one case where the button really is disabled: the server would reject the
// attach, and here we know that in advance without asking it — Rule B means a task can only be Done
// once its whole subtree is, so "this task is Done" and "the server will refuse" are the same fact.
// The explanation sits next to the disabled button rather than arriving as an error afterwards.
import { useState, type FormEvent } from 'react';
import type { Task } from '@htx/shared';
import SkillCheckboxes from './task-form/SkillCheckboxes';
import { primaryButtonClass, secondaryButtonClass } from './buttonStyles';
import { microTextClass, taskNumberClass } from './typeStyles';
import { useCreateTask, useSkills } from '../api/hooks';

interface AddSubtaskFormProps {
  parent: Task;
  /** The parent's hierarchical number ("1.2"), for naming what is being added to. */
  parentNumber: string;
  /** Called after a successful POST, with the task the server created. */
  onCreated: (created: Task) => void;
  onCancel: () => void;
}

export default function AddSubtaskForm({
  parent,
  parentNumber,
  onCreated,
  onCancel,
}: AddSubtaskFormProps) {
  const [title, setTitle] = useState('');
  const [skillIds, setSkillIds] = useState<number[]>([]);
  const [showTitleError, setShowTitleError] = useState(false);
  const skillsQuery = useSkills();
  const createTask = useCreateTask();

  const titleId = `add-subtask-title-${parent.id}`;
  const errorId = `add-subtask-title-error-${parent.id}`;
  const statusId = `add-subtask-status-${parent.id}`;

  const parentIsDone = parent.status === 'done';
  const skillsUnavailable = skillsQuery.isPending || skillsQuery.isError;
  const canSubmit = !createTask.isPending && !skillsUnavailable && !parentIsDone;
  const titleMissing = title.trim().length === 0;

  const status = parentIsDone
    ? `“${parent.title}” is Done, so it can't take a new subtask. Set it back to To-do or In progress first.`
    : skillsQuery.isError
      ? "Couldn't load the skill list, so skills can't be chosen right now."
      : skillsQuery.isPending
        ? 'Loading skills…'
        : createTask.isPending
          ? skillIds.length === 0
            ? 'Skills are being inferred from the title — this can take a few seconds.'
            : 'Saving…'
          : null;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    if (titleMissing) {
      setShowTitleError(true);
      document.getElementById(titleId)?.focus();
      return;
    }
    createTask.mutate(
      {
        title: title.trim(),
        parentId: parent.id,
        // Omitted entirely when empty: a missing key is how the backend is told to infer.
        ...(skillIds.length > 0 ? { skillIds } : {}),
      },
      { onSuccess: onCreated },
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label={`New subtask of ${parentNumber}, ${parent.title}`}
      className="flex flex-col gap-3 border-l-2 border-accent-muted/35 bg-surface-sunken px-4 py-4"
    >
      {/* Says what is being added to, in the same voice the outline uses for a task's number. */}
      <p className={microTextClass}>
        New subtask of <span className={taskNumberClass}>{parentNumber}</span> — {parent.title}
      </p>

      <div className="flex flex-col gap-1">
        <label htmlFor={titleId} className="text-sm font-medium text-text">
          Title
        </label>
        <input
          id={titleId}
          type="text"
          required
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-invalid={showTitleError && titleMissing ? 'true' : undefined}
          aria-describedby={showTitleError && titleMissing ? errorId : undefined}
          className={`max-w-xl rounded-sm border bg-surface-raised px-3 py-2 text-sm text-text transition-colors ${
            showTitleError && titleMissing
              ? 'border-danger'
              : 'border-rule-strong hover:border-text'
          }`}
        />
        {showTitleError && titleMissing && (
          <p id={errorId} className="text-xs font-medium text-danger">
            Title is required
          </p>
        )}
      </div>

      {!skillsUnavailable && (
        <SkillCheckboxes
          legend="Skills for the new subtask"
          skills={skillsQuery.data ?? []}
          selectedSkillIds={skillIds}
          onToggle={(skillId) =>
            setSkillIds((current) =>
              current.includes(skillId)
                ? current.filter((id) => id !== skillId)
                : [...current, skillId].sort((a, b) => a - b),
            )
          }
        />
      )}

      {createTask.isError && (
        <p
          role="alert"
          className="border-l-2 border-danger bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {createTask.error.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          aria-describedby={status ? statusId : undefined}
          className={primaryButtonClass}
        >
          {createTask.isPending ? 'Adding…' : 'Add subtask'}
        </button>
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>
          Cancel
        </button>
        {status && (
          <p id={statusId} role="status" className="text-sm text-text-muted">
            {status}
          </p>
        )}
      </div>
    </form>
  );
}
