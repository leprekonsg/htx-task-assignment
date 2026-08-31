// Tests for the Task List page. `globalThis.fetch` is replaced with a hand-written mock that
// answers by URL/method, the same shape a real API response takes, so these tests exercise the real
// TanStack Query hooks and TaskRow/AssigneeSelect/SkillBadges components — only the network is
// faked. See docs/frontend-guide.md for why mocking fetch (rather than mocking the hooks) is the
// right level: it proves the whole "select changes → PATCH → refetch → re-render" path actually
// works, not just that a hook was called.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Developer, ErrorResponse, Task } from '@htx/shared';
import TaskListPage from './TaskListPage';

const frontend = { id: 1, name: 'Frontend' };
const backend = { id: 2, name: 'Backend' };

const subtask: Task = {
  id: 2,
  title: 'Write tests',
  status: 'todo',
  parentId: 1,
  assignee: null,
  skills: [],
  skillsSource: 'user',
  skillsModel: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  subtasks: [],
};

const rootTasks: Task[] = [
  {
    id: 1,
    title: 'Build API',
    status: 'in_progress',
    parentId: null,
    assignee: { id: 1, name: 'Alice' },
    skills: [backend],
    skillsSource: 'user',
    skillsModel: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    subtasks: [subtask],
  },
  {
    id: 3,
    title: 'Design login page',
    status: 'todo',
    parentId: null,
    assignee: null,
    skills: [frontend],
    skillsSource: 'llm',
    skillsModel: 'gemini-2.0-flash',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    subtasks: [],
  },
];

const developers: Developer[] = [
  { id: 1, name: 'Alice', skills: [frontend, backend] },
  { id: 2, name: 'Bob', skills: [backend] },
  { id: 3, name: 'Carol', skills: [frontend] },
];

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const developersError: ErrorResponse = {
  error: { code: 'INTERNAL_ERROR', message: 'Failed to load developers.' },
};

/**
 * `fetchState.developersOk` starts `true` and can be flipped by a test (e.g. to simulate a Retry
 * that succeeds) — the mock reads it fresh on every call, so mutating the object after `renderPage`
 * changes what the *next* `/api/developers` request returns.
 */
function makeFetchMock(fetchState: { developersOk: boolean } = { developersOk: true }) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (method === 'GET' && url === '/api/tasks') return jsonResponse(200, rootTasks);
    if (method === 'GET' && url === '/api/developers') {
      return fetchState.developersOk
        ? jsonResponse(200, developers)
        : jsonResponse(500, developersError);
    }

    if (method === 'PATCH' && url === '/api/tasks/1') {
      const body = JSON.parse(String(init?.body)) as { status?: string };
      if (body.status === 'done') {
        const error: ErrorResponse = {
          error: {
            code: 'SUBTASKS_NOT_DONE',
            message: 'Complete all subtasks before marking this task done.',
          },
        };
        return jsonResponse(409, error);
      }
      return jsonResponse(200, { ...rootTasks[0], ...body });
    }

    throw new Error(`Unhandled request: ${method} ${url}`);
  });
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TaskListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TaskListPage', () => {
  beforeEach(() => {
    globalThis.fetch = makeFetchMock() as unknown as typeof fetch;
  });

  it('renders tasks with hierarchical numbering and skill badges', async () => {
    renderPage();

    expect(await screen.findByRole('cell', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '1.1' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument();

    expect(screen.getByText('Build API')).toBeInTheDocument();
    expect(screen.getByText('Write tests')).toBeInTheDocument();
    expect(screen.getByText('Design login page')).toBeInTheDocument();

    expect(screen.getByText('Backend')).toBeInTheDocument();
    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(screen.getByText('AI-inferred')).toBeInTheDocument();
  });

  it('shows Bob as an ineligible, disabled option on the Frontend task', async () => {
    renderPage();
    await screen.findByText('Design login page');

    const assigneeSelect = screen.getByRole('combobox', {
      name: 'Assignee of Design login page',
    });
    const options = within(assigneeSelect).getAllByRole('option') as HTMLOptionElement[];

    const bobOption = options.find((option) => option.textContent?.startsWith('Bob'));
    const aliceOption = options.find((option) => option.textContent === 'Alice');
    const carolOption = options.find((option) => option.textContent === 'Carol');

    expect(bobOption?.textContent).toBe('Bob — lacks Frontend');
    expect(bobOption?.disabled).toBe(true);
    expect(aliceOption?.disabled).toBe(false);
    expect(carolOption?.disabled).toBe(false);
  });

  it('PATCHes the new status when the status select changes', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Build API');

    const statusSelect = screen.getByRole('combobox', { name: 'Status of Build API' });
    await user.selectOptions(statusSelect, 'To-do');

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/tasks/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'todo' }),
        }),
      );
    });
  });

  it('shows the server message inline in the row when a PATCH is rejected', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Build API');

    const statusSelect = screen.getByRole('combobox', { name: 'Status of Build API' });
    await user.selectOptions(statusSelect, 'Done');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Complete all subtasks before marking this task done.');
    // the select is enabled again once the failed request settles
    await waitFor(() => expect(statusSelect).not.toBeDisabled());
  });

  it('disables only the assignee select, and still renders the task list, when developers fails to load', async () => {
    const fetchState = { developersOk: false };
    globalThis.fetch = makeFetchMock(fetchState) as unknown as typeof fetch;
    renderPage();

    await screen.findByText('Build API');

    expect(
      screen.getByText("Couldn't load developers, so tasks can't be assigned right now."),
    ).toBeInTheDocument();

    const assigneeSelect = screen.getByRole('combobox', { name: 'Assignee of Build API' });
    expect(assigneeSelect).toBeDisabled();

    const statusSelect = screen.getByRole('combobox', { name: 'Status of Build API' });
    expect(statusSelect).not.toBeDisabled();

    // a developers outage must not hide tasks the user can still read and re-status
    expect(screen.getByText('Write tests')).toBeInTheDocument();
    expect(screen.getByText('Design login page')).toBeInTheDocument();
  });

  it('summarises the list beside the heading without renaming the heading', async () => {
    renderPage();
    await screen.findByText('Build API');

    // The census has to sit *outside* the <h1>: putting it inside would change the heading's
    // accessible name from "Tasks" to "Tasks 3 tasks · 0 done · 2 unassigned".
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument();
    expect(screen.getByText('3 tasks · 0 done · 2 unassigned')).toBeInTheDocument();
  });

  it('says why a parent is not completable yet, without disabling the Done option', async () => {
    renderPage();
    await screen.findByText('Build API');

    // "Build API" has one subtask ("Write tests") that is still to-do.
    expect(screen.getByText('0/1 subtasks done')).toBeInTheDocument();

    // Crucially this is a hint, not a lock: Rule B is the server's to enforce, and the user can
    // still try, getting the server's own message back (covered by the rejected-PATCH test above).
    const statusSelect = screen.getByRole('combobox', { name: 'Status of Build API' });
    const done = within(statusSelect).getByRole('option', { name: 'Done' }) as HTMLOptionElement;
    expect(done.disabled).toBe(false);

    // A parent whose subtasks are all done gets no hint, and neither does a leaf.
    expect(screen.queryByText('1/1 subtasks done')).not.toBeInTheDocument();
  });

  it('offers a distinctly named action in the empty state', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/tasks') return jsonResponse(200, []);
      if (url === '/api/developers') return jsonResponse(200, developers);
      throw new Error(`Unhandled request: ${url}`);
    }) as unknown as typeof fetch;
    renderPage();

    expect(await screen.findByText('No tasks yet')).toBeInTheDocument();
    // Deliberately not "Create task": the app shell already has a link by that name, and two
    // controls sharing an accessible name make the page ambiguous to assistive tech and to tests.
    expect(screen.getByRole('link', { name: 'Create the first task' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('gives a parent a disclosure toggle and a leaf none', async () => {
    renderPage();
    await screen.findByText('Build API');

    expect(screen.getByRole('button', { name: 'Subtasks of Build API' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    // "Write tests" is a leaf and "Design login page" has no subtasks: neither can be folded.
    expect(screen.queryByRole('button', { name: 'Subtasks of Write tests' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Subtasks of Design login page' })).toBeNull();
  });

  it('retries the developers query on Retry, re-enabling the assignee select', async () => {
    const user = userEvent.setup();
    const fetchState = { developersOk: false };
    globalThis.fetch = makeFetchMock(fetchState) as unknown as typeof fetch;
    renderPage();

    await screen.findByText('Build API');
    const assigneeSelect = screen.getByRole('combobox', { name: 'Assignee of Build API' });
    expect(assigneeSelect).toBeDisabled();

    fetchState.developersOk = true;
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(assigneeSelect).not.toBeDisabled());
    expect(
      screen.queryByText("Couldn't load developers, so tasks can't be assigned right now."),
    ).not.toBeInTheDocument();
  });
});

/**
 * Folding, on a tree deep enough to have something to hide: 1 → (1.1 → 1.1.1, 1.2), 2. The point of
 * these tests is that folding is a *reading* change — it must never move a number or a total.
 */
describe('TaskListPage folding', () => {
  const node = (id: number, title: string, subtasks: Task[] = []): Task => ({
    id,
    title,
    status: 'todo',
    parentId: null,
    assignee: null,
    skills: [],
    skillsSource: 'user',
    skillsModel: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    subtasks,
  });

  const tree: Task[] = [
    node(1, 'Build API', [node(2, 'Write tests', [node(4, 'Add fixtures')]), node(5, 'Ship it')]),
    node(3, 'Design login page'),
  ];

  function mockTasks(tasks: Task[]) {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/tasks') return jsonResponse(200, tasks);
      if (url === '/api/developers') return jsonResponse(200, developers);
      throw new Error(`Unhandled request: ${url}`);
    }) as unknown as typeof fetch;
  }

  it('hides the whole subtree and says how many rows it is standing in for', async () => {
    const user = userEvent.setup();
    mockTasks(tree);
    renderPage();
    await screen.findByText('Build API');

    await user.click(screen.getByRole('button', { name: 'Subtasks of Build API' }));

    // Children and grandchildren both go, not just the direct children.
    expect(screen.queryByText('Write tests')).toBeNull();
    expect(screen.queryByText('Add fixtures')).toBeNull();
    expect(screen.queryByText('Ship it')).toBeNull();
    expect(screen.getByText('3 subtasks hidden')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subtasks of Build API' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('leaves numbering and the census exactly as they were', async () => {
    const user = userEvent.setup();
    mockTasks(tree);
    renderPage();
    await screen.findByText('Build API');
    expect(screen.getByText('5 tasks · 0 done · 5 unassigned')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Subtasks of Build API' }));

    // The census counts what exists, not what is on screen.
    expect(screen.getByText('5 tasks · 0 done · 5 unassigned')).toBeInTheDocument();
    // And the row after the folded subtree keeps the number it always had.
    expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '1' })).toBeInTheDocument();
  });

  it('folds and unfolds everything, disabling whichever control would do nothing', async () => {
    const user = userEvent.setup();
    mockTasks(tree);
    renderPage();
    await screen.findByText('Build API');

    const expandAll = screen.getByRole('button', { name: 'Expand all' });
    const collapseAll = screen.getByRole('button', { name: 'Collapse all' });
    expect(expandAll).toBeDisabled(); // nothing is folded yet

    await user.click(collapseAll);
    expect(screen.queryByText('Write tests')).toBeNull();
    expect(screen.getByText('Design login page')).toBeInTheDocument(); // a leaf root survives
    expect(collapseAll).toBeDisabled();
    expect(expandAll).toBeEnabled();

    await user.click(expandAll);
    expect(screen.getByText('Add fixtures')).toBeInTheDocument();
    expect(expandAll).toBeDisabled();
  });

  it('offers no folding controls when nothing in the list has subtasks', async () => {
    mockTasks([node(1, 'Build API'), node(2, 'Design login page')]);
    renderPage();
    await screen.findByText('Build API');

    expect(screen.queryByRole('button', { name: 'Expand all' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Collapse all' })).toBeNull();
  });
});

/**
 * Adding a subtask from the list itself. The mock keeps a real tree and mutates it on POST, so
 * these tests exercise the whole loop the user sees: open the composer, post with a `parentId`,
 * invalidate, refetch, and find the new row nested under its parent.
 */
describe('TaskListPage add subtask', () => {
  const base = {
    status: 'todo' as const,
    parentId: null,
    assignee: null,
    skills: [],
    skillsSource: 'user' as const,
    skillsModel: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const node = (id: number, title: string, subtasks: Task[] = []): Task => ({
    ...base,
    id,
    title,
    subtasks,
  });

  /** Returns a copy of `tasks` with `child` appended to the subtasks of `parentId`. */
  function attach(tasks: Task[], parentId: number, child: Task): Task[] {
    return tasks.map((task) =>
      task.id === parentId
        ? { ...task, subtasks: [...task.subtasks, child] }
        : { ...task, subtasks: attach(task.subtasks, parentId, child) },
    );
  }

  function mockApi(initial: Task[]) {
    const state = { tasks: initial, nextId: 100, rejectWith: null as ErrorResponse | null };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url === '/api/tasks') return jsonResponse(200, state.tasks);
      if (method === 'GET' && url === '/api/developers') return jsonResponse(200, developers);
      if (method === 'GET' && url === '/api/skills') return jsonResponse(200, [frontend, backend]);
      if (method === 'POST' && url === '/api/tasks') {
        if (state.rejectWith) return jsonResponse(409, state.rejectWith);
        const body = JSON.parse(String(init?.body)) as { title: string; parentId?: number };
        const created = { ...node(state.nextId++, body.title), parentId: body.parentId ?? null };
        state.tasks = attach(state.tasks, body.parentId!, created);
        return jsonResponse(201, created);
      }
      throw new Error(`Unhandled request: ${method} ${url}`);
    }) as unknown as typeof fetch;
    return state;
  }

  it('posts the parent id, nests the new row, and says so out loud', async () => {
    const user = userEvent.setup();
    mockApi([node(1, 'Build API', [node(2, 'Write tests')])]);
    renderPage();
    await screen.findByText('Build API');

    await user.click(screen.getByRole('button', { name: 'Add subtask to Build API' }));
    // The composer names what it is adding to, so a long table can't leave you guessing.
    expect(screen.getByText(/New subtask of/)).toHaveTextContent('New subtask of 1 — Build API');

    await user.type(screen.getByLabelText('Title'), 'Add fixtures');
    await user.click(screen.getByRole('button', { name: 'Add subtask' }));

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/tasks',
        expect.objectContaining({
          method: 'POST',
          // No `skillIds` key at all: that is how the backend is told to infer them.
          body: JSON.stringify({ title: 'Add fixtures', parentId: 1 }),
        }),
      ),
    );

    // The new task comes back nested and numbered as a subtask, not as a root.
    expect(await screen.findByText('Add fixtures')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '1.2' })).toBeInTheDocument();
    expect(screen.getByText('Added "Add fixtures" under "Build API"')).toBeInTheDocument();
    // And the composer is gone once it has done its job.
    expect(screen.queryByText(/New subtask of/)).toBeNull();
  });

  it('sends the skills that were ticked', async () => {
    const user = userEvent.setup();
    mockApi([node(1, 'Build API')]);
    renderPage();
    await screen.findByText('Build API');

    await user.click(screen.getByRole('button', { name: 'Add subtask to Build API' }));
    await user.type(screen.getByLabelText('Title'), 'Charts');
    await user.click(
      within(screen.getByRole('group', { name: 'Skills for the new subtask' })).getByLabelText(
        'Frontend',
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Add subtask' }));

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/tasks',
        expect.objectContaining({
          body: JSON.stringify({ title: 'Charts', parentId: 1, skillIds: [1] }),
        }),
      ),
    );
  });

  it('unfolds the parent so the subtask it just made is not created into a hidden row', async () => {
    const user = userEvent.setup();
    mockApi([node(1, 'Build API', [node(2, 'Write tests')])]);
    renderPage();
    await screen.findByText('Build API');

    await user.click(screen.getByRole('button', { name: 'Subtasks of Build API' }));
    expect(screen.queryByText('Write tests')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Add subtask to Build API' }));
    await user.type(screen.getByLabelText('Title'), 'Add fixtures');
    await user.click(screen.getByRole('button', { name: 'Add subtask' }));

    expect(await screen.findByText('Add fixtures')).toBeInTheDocument();
    expect(screen.getByText('Write tests')).toBeInTheDocument();
  });

  it('explains an empty title instead of disabling the button, and keeps focus in the field', async () => {
    const user = userEvent.setup();
    mockApi([node(1, 'Build API')]);
    renderPage();
    await screen.findByText('Build API');

    await user.click(screen.getByRole('button', { name: 'Add subtask to Build API' }));
    const submit = screen.getByRole('button', { name: 'Add subtask' });
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveFocus();
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns focus to the row action when the composer is cancelled', async () => {
    const user = userEvent.setup();
    mockApi([node(1, 'Build API')]);
    renderPage();
    await screen.findByText('Build API');

    const action = screen.getByRole('button', { name: 'Add subtask to Build API' });
    await user.click(action);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText(/New subtask of/)).toBeNull();
    expect(action).toHaveFocus();
  });

  it("shows the server's own message inside the composer when the POST is rejected", async () => {
    const user = userEvent.setup();
    const state = mockApi([node(1, 'Build API')]);
    state.rejectWith = {
      error: { code: 'PARENT_IS_DONE', message: 'Cannot add a subtask under a task that is Done' },
    };
    renderPage();
    await screen.findByText('Build API');

    await user.click(screen.getByRole('button', { name: 'Add subtask to Build API' }));
    await user.type(screen.getByLabelText('Title'), 'Add fixtures');
    await user.click(screen.getByRole('button', { name: 'Add subtask' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cannot add a subtask under a task that is Done',
    );
    // The composer stays open with the typed title intact, so the work isn't lost.
    expect(screen.getByLabelText('Title')).toHaveValue('Add fixtures');
  });

  it('holds the submit and says why when the parent is Done', async () => {
    const user = userEvent.setup();
    mockApi([{ ...node(1, 'Build API'), status: 'done' }]);
    renderPage();
    await screen.findByText('Build API');

    await user.click(screen.getByRole('button', { name: 'Add subtask to Build API' }));

    expect(screen.getByRole('button', { name: 'Add subtask' })).toBeDisabled();
    expect(screen.getByText(/is Done, so it can't take a new subtask/)).toBeInTheDocument();
  });

  it('offers no action on a task that is already five levels deep', async () => {
    mockApi([node(1, 'L1', [node(2, 'L2', [node(3, 'L3', [node(4, 'L4', [node(5, 'L5')])])])])]);
    renderPage();
    await screen.findByText('L1');

    expect(screen.getByRole('button', { name: 'Add subtask to L4' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add subtask to L5' })).toBeNull();
  });
});
