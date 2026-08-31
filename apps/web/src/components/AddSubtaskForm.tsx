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
//     is held. An `ErrorBanner` with Retry offers the way out and the status line says why the
//     button is off — the same recovery, in the same words, as the full page.
//
// A Done parent is the one case where the button really is disabled: the server would reject the
// attach, and here we know that in advance without asking it — Rule B means a task can only be Done
// once its whole subtree is, so "this task is Done" and "the server will refuse" are the same fact.
// The explanation sits next to the disabled button rather than arriving as an error afterwards.
//
// ── Why the draft lives on the page, not here ──────────────────────────────────────────────────
//
// The title and skills are props, not state. This component unmounts for reasons that have nothing
// to do with the user abandoning it: opening a composer on another row, folding this row's parent,
// or pressing Collapse all. If it owned the half-written subtask, all three would throw it away
// without a word. TaskListPage keeps drafts keyed by parent id and discards one only on Cancel or a
// successful create, so the two deliberate exits are the only ones that lose anything.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Task } from '@htx/shared';
import ErrorBanner from './ErrorBanner';
import SkillCheckboxes from './task-form/SkillCheckboxes';
import { primaryButtonClass, secondaryButtonClass } from './buttonStyles';
import { microTextClass, taskNumberClass } from './typeStyles';
import { useCreateTask, useSkills } from '../api/hooks';

/** One half-written subtask: everything the composer would lose if it were thrown away. */
export interface SubtaskDraft {
  title: string;
  skillIds: number[];
}

interface AddSubtaskFormProps {
  parent: Task;
  /** The parent's hierarchical number ("1.2"), for naming what is being added to. */
  parentNumber: string;
  /** What has been typed and ticked so far — owned by the page so it survives an unmount. */
  draft: SubtaskDraft;
  onDraftChange: (draft: SubtaskDraft) => void;
  /** Called after a successful POST, with the task the server created. */
  onCreated: (created: Task) => void;
  onCancel: () => void;
}

export default function AddSubtaskForm({
  parent,
  parentNumber,
  draft,
  onDraftChange,
  onCreated,
  onCancel,
}: AddSubtaskFormProps) {
  const { title, skillIds } = draft;
  // Deliberately *not* part of the draft: this is a response to pressing the button, not something
  // the user wrote. Coming back to a restored draft should present the field, not an old telling-off.
  const [showTitleError, setShowTitleError] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const skillsQuery = useSkills();
  const createTask = useCreateTask();

  const titleId = `add-subtask-title-${parent.id}`;
  const errorId = `add-subtask-title-error-${parent.id}`;
  const statusId = `add-subtask-status-${parent.id}`;

  const parentIsDone = parent.status === 'done';
  const skillsUnavailable = skillsQuery.isPending || skillsQuery.isError;
  const canSubmit = !createTask.isPending && !skillsUnavailable && !parentIsDone;
  const titleMissing = title.trim().length === 0;

  // Focus on open, and on reopen put the caret *after* a restored draft rather than in front of it —
  // otherwise the first keystroke back in the field lands at the start of the title.
  useEffect(() => {
    const input = titleRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  const status = parentIsDone
    ? `“${parent.title}” is Done, so it can't take a new subtask. Set it back to To-do or In progress first.`
    : skillsQuery.isError
      ? 'Add subtask is unavailable until the skill list loads.'
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
      titleRef.current?.focus();
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
          ref={titleRef}
          type="text"
          required
          value={title}
          onChange={(event) => onDraftChange({ ...draft, title: event.target.value })}
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

      {/* A failed skill list is recoverable, so it gets the same banner and Retry the full page
          gives it. Nothing typed is lost by retrying: the draft is the page's, not this form's. */}
      {skillsQuery.isError && (
        <ErrorBanner
          message="Couldn't load the skill list, so skills can't be chosen right now."
          onRetry={() => skillsQuery.refetch()}
        />
      )}

      {!skillsUnavailable && (
        <SkillCheckboxes
          legend="Skills for the new subtask"
          skills={skillsQuery.data ?? []}
          selectedSkillIds={skillIds}
          onToggle={(skillId) =>
            onDraftChange({
              ...draft,
              skillIds: skillIds.includes(skillId)
                ? skillIds.filter((id) => id !== skillId)
                : [...skillIds, skillId].sort((a, b) => a - b),
            })
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
          // Not a live region when the skill list failed: the ErrorBanner above is already an
          // `alert`, and announcing the same outage twice is worse than announcing it once.
          <p
            id={statusId}
            role={skillsQuery.isError && !parentIsDone ? undefined : 'status'}
            className="text-sm text-text-muted"
          >
            {status}
          </p>
        )}
      </div>
    </form>
  );
}
