// The `/tasks/new` route: a form for creating one task, optionally with nested subtasks. All the
// form's data — the root task's title/skills and its whole subtask tree — lives in one
// `useReducer(treeReducer, ...)` (see ../components/task-form/treeReducer.ts for why a reducer and
// not several `useState`s: every edit, no matter how deeply nested, goes through one function that
// returns a brand-new tree). This page itself does four things: render the root `TaskNodeForm`
// (which recurses into its own subtasks), decide whether Submit is *clickable* (`canSubmit`, below),
// turn a submit attempt with a missing title into a visible alert and moved focus rather than a
// silently-disabled button, and turn a successful submit into a POST followed by a redirect back to
// the task list with a flash message.
//
// An empty title used to just disable Submit with no explanation — worse, the offending field could
// be scrolled off-screen in a deep tree, so there was no way to even find what was wrong. Now
// `canSubmit` doesn't look at titles at all: the button stays clickable, and clicking it while
// `firstProblem(state.root)` finds an empty title instead flips `showErrors` on (which turns on
// every `TaskNodeForm`'s inline "Title is required" text) and moves focus straight to the offending
// field via `problem.key`. `showErrors` starts `false` so a first-time visitor isn't shown
// validation errors before they've touched anything.
//
// The skill catalogue (`useSkills`) is reference data the form can't safely proceed without: if
// `GET /api/skills` fails, `TaskNodeForm` would render its checkboxes empty, and submitting anyway
// would silently create a task with no skills — which for this app means it's picked up by the LLM
// inference chain, not what the user asked for. So a failed or still-loading skills query is folded
// into `canSubmit`, an `ErrorBanner` (with Retry) explains an outright failure, and a status line
// next to the button explains whichever of a handful of reasons currently applies — including,
// while the POST itself is in flight, that skill inference can take a few seconds when some node was
// left without skills chosen.
import { useReducer, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import TaskNodeForm from '../components/task-form/TaskNodeForm';
import {
  anyNodeWithoutSkills,
  countNodes,
  createInitialState,
  firstProblem,
  taskNumber,
  toCreateRequest,
  treeReducer,
} from '../components/task-form/treeReducer';
import { primaryButtonClass, secondaryButtonClass } from '../components/buttonStyles';
import { displayClass } from '../components/typeStyles';
import ErrorBanner from '../components/ErrorBanner';
import { useCreateTask, useSkills } from '../api/hooks';

/** Id shared by the (at most one) status/alert paragraph next to Submit, for its aria-describedby. */
const STATUS_ID = 'create-task-status';

/** "N subtask" for 1, "N subtasks" otherwise. */
function pluralSubtasks(n: number): string {
  return `${n} subtask${n === 1 ? '' : 's'}`;
}

export default function CreateTaskPage() {
  const [state, dispatch] = useReducer(treeReducer, undefined, createInitialState);
  const [showErrors, setShowErrors] = useState(false);
  const skillsQuery = useSkills();
  const createTask = useCreateTask();
  const navigate = useNavigate();

  const problem = firstProblem(state.root);
  const count = countNodes(state.root);
  const skillsUnavailable = skillsQuery.isPending || skillsQuery.isError;
  const canSubmit = !createTask.isPending && !skillsUnavailable;
  const hasStatusMessage =
    (showErrors && problem !== null) ||
    createTask.isPending ||
    skillsQuery.isPending ||
    skillsQuery.isError;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    if (problem) {
      setShowErrors(true);
      document.getElementById(`task-title-${problem.key}`)?.focus();
      return;
    }
    const request = toCreateRequest(state.root);
    createTask.mutate(request, {
      onSuccess: () => {
        const flash =
          count === 1
            ? `Created "${request.title}"`
            : `Created "${request.title}" and ${pluralSubtasks(count - 1)}`;
        navigate('/', { state: { flash } });
      },
    });
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-3 border-b-2 border-text pb-3">
        <h1 className={displayClass}>Create task</h1>
      </header>
      <p className="max-w-2xl text-sm text-text-muted">
        Give each task a title and, optionally, the skills it needs — leave skills empty and they'll
        be inferred from the title. Use "Add subtask" to nest tasks up to five levels deep.
      </p>

      {createTask.isError && (
        <div
          role="alert"
          className="border-l-2 border-danger bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          {createTask.error.message}
        </div>
      )}

      {skillsQuery.isError && (
        <ErrorBanner
          message="Couldn't load the skill list, so skills can't be chosen right now."
          onRetry={() => skillsQuery.refetch()}
        />
      )}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <TaskNodeForm
          node={state.root}
          path={[]}
          skills={skillsQuery.data ?? []}
          dispatch={dispatch}
          showErrors={showErrors}
        />

        <div className="flex flex-wrap items-center gap-4 self-start">
          <button
            type="submit"
            disabled={!canSubmit}
            aria-describedby={hasStatusMessage ? STATUS_ID : undefined}
            className={primaryButtonClass}
          >
            {createTask.isPending
              ? 'Creating…'
              : count === 1
                ? 'Create task'
                : `Create ${count} tasks`}
          </button>

          <Link to="/" className={secondaryButtonClass}>
            Cancel
          </Link>

          {showErrors && problem ? (
            <p id={STATUS_ID} role="alert" className="text-sm text-danger">
              Task {taskNumber(problem.path)} needs a title.
            </p>
          ) : createTask.isPending ? (
            <p id={STATUS_ID} role="status" className="text-sm text-text-muted">
              {anyNodeWithoutSkills(state.root)
                ? 'Skills are being inferred from the title — this can take a few seconds.'
                : 'Saving…'}
            </p>
          ) : skillsQuery.isPending ? (
            <p id={STATUS_ID} role="status" className="text-sm text-text-muted">
              Loading skills…
            </p>
          ) : skillsQuery.isError ? (
            <p id={STATUS_ID} className="text-sm text-text-muted">
              Create task is unavailable until the skill list loads.
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
