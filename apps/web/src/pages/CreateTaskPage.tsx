// The `/tasks/new` route: a form for creating one task, optionally with nested subtasks. All the
// form's data — the root task's title/skills and its whole subtask tree — lives in one
// `useReducer(treeReducer, ...)` (see ../components/task-form/treeReducer.ts for why a reducer and
// not several `useState`s: every edit, no matter how deeply nested, goes through one function that
// returns a brand-new tree). This page itself only does three things: render the root
// `TaskNodeForm` (which recurses into its own subtasks), decide whether Submit is allowed
// (`firstProblem` finds the first empty title anywhere in the tree), and turn a successful submit
// into a POST followed by a redirect back to the task list with a flash message.
//
// The skill catalogue (`useSkills`) is reference data the form can't safely proceed without: if
// `GET /api/skills` fails, `TaskNodeForm` would render its checkboxes empty, and submitting anyway
// would silently create a task with no skills — which for this app means it's picked up by the LLM
// inference chain, not what the user asked for. So a failed or still-loading skills query is folded
// into `canSubmit` right alongside the existing title check, an `ErrorBanner` (with Retry) explains
// an outright failure, and — because a disabled button that doesn't say why is its own bug — a short
// status line next to the button spells out which of the two skill-related reasons applies (loading,
// vs. genuinely unavailable). The pre-existing "title is empty" disabled case still shows no message
// of its own; that's a separate, already-tracked gap this fix intentionally leaves alone.
import { useReducer, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import TaskNodeForm from '../components/task-form/TaskNodeForm';
import {
  createInitialState,
  firstProblem,
  toCreateRequest,
  treeReducer,
} from '../components/task-form/treeReducer';
import { primaryButtonClass } from '../components/buttonStyles';
import ErrorBanner from '../components/ErrorBanner';
import { useCreateTask, useSkills } from '../api/hooks';

export default function CreateTaskPage() {
  const [state, dispatch] = useReducer(treeReducer, undefined, createInitialState);
  const skillsQuery = useSkills();
  const createTask = useCreateTask();
  const navigate = useNavigate();

  const problem = firstProblem(state.root);
  const skillsUnavailable = skillsQuery.isPending || skillsQuery.isError;
  const canSubmit = problem === null && !createTask.isPending && !skillsUnavailable;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    const request = toCreateRequest(state.root);
    createTask.mutate(request, {
      onSuccess: () => {
        navigate('/', { state: { flash: `Created "${request.title}"` } });
      },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-text">Create task</h1>

      {createTask.isError && (
        <div
          role="alert"
          className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger"
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

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TaskNodeForm
          node={state.root}
          path={[]}
          skills={skillsQuery.data ?? []}
          dispatch={dispatch}
        />

        <div className="flex items-center gap-3 self-start">
          <button type="submit" disabled={!canSubmit} className={primaryButtonClass}>
            Create task
          </button>

          {skillsQuery.isPending && (
            <p role="status" className="text-sm text-text-muted">
              Loading skills…
            </p>
          )}

          {skillsQuery.isError && (
            <p className="text-sm text-text-muted">
              Create task is unavailable until the skill list loads.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
