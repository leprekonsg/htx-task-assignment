// The `/tasks/new` route: a form for creating one task, optionally with nested subtasks. All the
// form's data — the root task's title/skills and its whole subtask tree — lives in one
// `useReducer(treeReducer, ...)` (see ../components/task-form/treeReducer.ts for why a reducer and
// not several `useState`s: every edit, no matter how deeply nested, goes through one function that
// returns a brand-new tree). This page itself only does three things: render the root
// `TaskNodeForm` (which recurses into its own subtasks), decide whether Submit is allowed
// (`firstProblem` finds the first empty title anywhere in the tree), and turn a successful submit
// into a POST followed by a redirect back to the task list with a flash message.
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
import { useCreateTask, useSkills } from '../api/hooks';

export default function CreateTaskPage() {
  const [state, dispatch] = useReducer(treeReducer, undefined, createInitialState);
  const skillsQuery = useSkills();
  const createTask = useCreateTask();
  const navigate = useNavigate();

  const problem = firstProblem(state.root);
  const canSubmit = problem === null && !createTask.isPending;

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

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TaskNodeForm
          node={state.root}
          path={[]}
          skills={skillsQuery.data ?? []}
          dispatch={dispatch}
        />

        <button type="submit" disabled={!canSubmit} className={`self-start ${primaryButtonClass}`}>
          Create task
        </button>
      </form>
    </div>
  );
}
