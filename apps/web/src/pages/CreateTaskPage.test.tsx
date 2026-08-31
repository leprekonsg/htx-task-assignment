// Tests for the Create Task page: building a nested subtask tree through the UI and checking the
// resulting POST body; the new validation flow (submit stays clickable with an empty title —
// clicking it shows an alert, marks the field invalid, and moves focus there, instead of the old
// silently-disabled button); Remove's confirm-and-refocus behaviour; the pending/"Creating…" label
// and inference hint while a POST is in flight; the task-count-aware button label and success flash;
// and the depth-cap guardrail ("Add subtask" disappears once the cap is reached). `globalThis.fetch`
// is mocked the same way as in TaskListPage.test.tsx. Because a successful submit calls
// `navigate('/', { state: { flash } })`, `renderPage` mounts the page under a real `<Routes>` with a
// second route at `/` that just prints `location.state.flash` — the simplest way to observe both
// the navigation and the flash text without mocking `useNavigate`.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorResponse, Skill, Task } from '@htx/shared';
import CreateTaskPage from './CreateTaskPage';

const skills: Skill[] = [
  { id: 1, name: 'Frontend' },
  { id: 2, name: 'Backend' },
];

const createdTask: Task = {
  id: 99,
  title: 'A',
  status: 'todo',
  parentId: null,
  assignee: null,
  skills: [],
  skillsSource: 'user',
  skillsModel: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  subtasks: [],
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const skillsError: ErrorResponse = {
  error: { code: 'INTERNAL_ERROR', message: 'Failed to load skills.' },
};

/**
 * `fetchState.skillsOk` starts `true`; a test can construct the mock with `{ skillsOk: false }` to
 * simulate `GET /api/skills` failing, the same pattern TaskListPage.test.tsx uses for developers.
 */
function makeFetchMock(fetchState: { skillsOk: boolean } = { skillsOk: true }) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (method === 'GET' && url === '/api/skills') {
      return fetchState.skillsOk ? jsonResponse(200, skills) : jsonResponse(500, skillsError);
    }
    if (method === 'POST' && url === '/api/tasks') return jsonResponse(201, createdTask);

    throw new Error(`Unhandled request: ${method} ${url}`);
  });
}

/**
 * Like `makeFetchMock`, but `POST /api/tasks` doesn't resolve until the test calls the returned
 * `resolvePost()` — used to inspect the button/status text while a create is genuinely in flight.
 */
function makeFetchMockWithControllablePost() {
  let resolvePost!: () => void;
  const postSettled = new Promise<void>((resolve) => {
    resolvePost = resolve;
  });
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (method === 'GET' && url === '/api/skills') return jsonResponse(200, skills);
    if (method === 'POST' && url === '/api/tasks') {
      await postSettled;
      return jsonResponse(201, createdTask);
    }

    throw new Error(`Unhandled request: ${method} ${url}`);
  });
  return { fetchMock, resolvePost };
}

/** Prints the flash message CreateTaskPage hands `navigate` on success, so tests can read it. */
function FlashProbe() {
  const location = useLocation();
  const flash = (location.state as { flash?: string } | null)?.flash;
  return <div data-testid="flash">{flash}</div>;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/tasks/new']}>
        <Routes>
          <Route path="/tasks/new" element={<CreateTaskPage />} />
          <Route path="/" element={<FlashProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Types `title` into the most recently added (deepest) task block's title field. */
async function typeDeepestTitle(user: ReturnType<typeof userEvent.setup>, title: string) {
  const titles = screen.getAllByLabelText('Title');
  await user.type(titles[titles.length - 1]!, title);
}

/**
 * Clicks the "Add subtask" button belonging to the deepest task block currently on screen. Names
 * are now e.g. "Add subtask to task 1.1" (Testing Library's `name` match is exact), so this matches
 * on a leading substring rather than the old literal `'Add subtask'`.
 */
async function addSubtaskToDeepest(user: ReturnType<typeof userEvent.setup>) {
  const buttons = screen.getAllByRole('button', { name: /^Add subtask/ });
  await user.click(buttons[0]!);
}

/** Waits out the initial `GET /api/skills` fetch so skill-loading is never the reason a test's later assertion holds. */
async function waitForSkillsToLoad() {
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
}

describe('CreateTaskPage', () => {
  beforeEach(() => {
    globalThis.fetch = makeFetchMock() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submits a title, a subtask and a sub-subtask as one nested POST body', async () => {
    const user = userEvent.setup();
    renderPage();

    await typeDeepestTitle(user, 'A');
    await addSubtaskToDeepest(user);
    await typeDeepestTitle(user, 'B');
    await addSubtaskToDeepest(user);
    await typeDeepestTitle(user, 'C');

    await user.click(screen.getByRole('button', { name: 'Create 3 tasks' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/tasks',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => (call[1] as RequestInit | undefined)?.method === 'POST',
    );
    const body = JSON.parse(String((call?.[1] as RequestInit | undefined)?.body));
    expect(body).toEqual({
      title: 'A',
      subtasks: [{ title: 'B', subtasks: [{ title: 'C' }] }],
    });
    expect(body).not.toHaveProperty('skillIds');
    expect(body.subtasks[0]).not.toHaveProperty('skillIds');
  });

  it('flashes a pluralised message and lands on the list after creating a tree', async () => {
    const user = userEvent.setup();
    renderPage();

    await typeDeepestTitle(user, 'A');
    await addSubtaskToDeepest(user);
    await typeDeepestTitle(user, 'B');
    await addSubtaskToDeepest(user);
    await typeDeepestTitle(user, 'C');

    await user.click(screen.getByRole('button', { name: 'Create 3 tasks' }));

    expect(await screen.findByTestId('flash')).toHaveTextContent('Created "A" and 2 subtasks');
  });

  it('does not disable submit for an empty title; clicking it shows an alert, marks the field invalid, and focuses it', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForSkillsToLoad();

    const submit = screen.getByRole('button', { name: 'Create task' });
    expect(submit).not.toBeDisabled();

    await user.click(submit);

    expect(globalThis.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({ method: 'POST' }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Task 1 needs a title.');

    const titleInput = screen.getByLabelText('Title');
    expect(document.activeElement).toBe(titleInput);
    expect(titleInput).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Title is required')).toBeInTheDocument();

    await user.type(titleInput, 'Now filled');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(titleInput).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('Title is required')).not.toBeInTheDocument();
  });

  it("on a deeper tree, names the offending task in the alert and focuses that task's title", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForSkillsToLoad();

    await typeDeepestTitle(user, 'A');
    await addSubtaskToDeepest(user); // Task 1.1, left blank

    await user.click(screen.getByRole('button', { name: 'Create 2 tasks' }));

    expect(globalThis.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({ method: 'POST' }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Task 1.1 needs a title.');

    const titles = screen.getAllByLabelText('Title');
    expect(titles).toHaveLength(2);
    expect(document.activeElement).toBe(titles[1]);
    expect(titles[1]).toHaveAttribute('aria-invalid', 'true');
  });

  it("focuses a freshly added subtask's title input immediately", async () => {
    const user = userEvent.setup();
    renderPage();

    await addSubtaskToDeepest(user);

    const titles = screen.getAllByLabelText('Title');
    expect(document.activeElement).toBe(titles[titles.length - 1]);
  });

  it('labels the button with the task count, then shows a pending label and inference hint while creating', async () => {
    const user = userEvent.setup();
    const { fetchMock, resolvePost } = makeFetchMockWithControllablePost();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    renderPage();
    await waitForSkillsToLoad();

    await typeDeepestTitle(user, 'A');
    await addSubtaskToDeepest(user);
    await typeDeepestTitle(user, 'B');
    await addSubtaskToDeepest(user);
    await typeDeepestTitle(user, 'C');

    const submit = screen.getByRole('button', { name: 'Create 3 tasks' });
    await user.click(submit);

    expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDisabled();
    expect(
      screen.getByText('Skills are being inferred from the title — this can take a few seconds.'),
    ).toBeInTheDocument();

    resolvePost();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Creating…' })).not.toBeInTheDocument(),
    );
  });

  describe('removing a node', () => {
    async function buildThreeLevelTree(user: ReturnType<typeof userEvent.setup>) {
      await typeDeepestTitle(user, 'A');
      await addSubtaskToDeepest(user); // Task 1.1
      await typeDeepestTitle(user, 'B');
      await addSubtaskToDeepest(user); // Task 1.1.1
      await typeDeepestTitle(user, 'C');
    }

    it('confirms before removing a node with descendants, and leaves the tree alone when declined', async () => {
      const user = userEvent.setup();
      renderPage();
      await buildThreeLevelTree(user);

      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const removeParent = screen.getByRole('button', {
        name: 'Remove task 1.1 and its 1 subtask',
      });

      await user.click(removeParent);

      expect(confirmSpy).toHaveBeenCalledWith('Remove task 1.1 and its 1 subtask?');
      expect(screen.getByText('Task 1.1', { exact: true })).toBeInTheDocument();
      expect(screen.getByText('Task 1.1.1', { exact: true })).toBeInTheDocument();

      confirmSpy.mockReturnValue(true);
      await user.click(removeParent);

      expect(screen.queryByText('Task 1.1', { exact: true })).not.toBeInTheDocument();
      expect(screen.queryByText('Task 1.1.1', { exact: true })).not.toBeInTheDocument();

      const addRootButton = screen.getByRole('button', { name: 'Add subtask to task 1' });
      expect(document.activeElement).toBe(addRootButton);
    });

    it("removes a leaf without confirming, and focuses its parent's Add subtask button", async () => {
      const user = userEvent.setup();
      renderPage();
      await buildThreeLevelTree(user);

      const confirmSpy = vi.spyOn(window, 'confirm');

      await user.click(screen.getByRole('button', { name: 'Remove task 1.1.1' }));

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(screen.queryByText('Task 1.1.1', { exact: true })).not.toBeInTheDocument();
      expect(screen.getByText('Task 1.1', { exact: true })).toBeInTheDocument();

      const addParentButton = screen.getByRole('button', { name: 'Add subtask to task 1.1' });
      expect(document.activeElement).toBe(addParentButton);
    });
  });

  it('hides "Add subtask" once a branch reaches the maximum depth', async () => {
    const user = userEvent.setup();
    renderPage();

    // Depth 1 (root) already exists; four more adds reach depth 5, the maximum.
    for (let i = 0; i < 4; i++) {
      await addSubtaskToDeepest(user);
    }

    // One "Add subtask" button per node from depth 1-4; the depth-5 leaf has none.
    expect(screen.getAllByRole('button', { name: /^Add subtask/ })).toHaveLength(4);
  });

  it('shows an error banner and blocks submit, with a visible reason, when skills fails to load', async () => {
    const user = userEvent.setup();
    const fetchState = { skillsOk: false };
    globalThis.fetch = makeFetchMock(fetchState) as unknown as typeof fetch;
    renderPage();

    // Fill in the title so the only remaining reason submit is disabled is the skills failure.
    await typeDeepestTitle(user, 'Something');

    expect(
      await screen.findByText("Couldn't load the skill list, so skills can't be chosen right now."),
    ).toBeInTheDocument();

    const submit = screen.getByRole('button', { name: 'Create task' });
    expect(submit).toBeDisabled();
    expect(
      screen.getByText('Create task is unavailable until the skill list loads.'),
    ).toBeInTheDocument();
  });

  it('shows nothing skills-related, and allows submitting, once skills loads successfully', async () => {
    renderPage();

    // The transient "Loading skills…" status clears once the (successful) fetch resolves.
    await waitForSkillsToLoad();

    expect(screen.queryByText(/Couldn't load the skill list/)).not.toBeInTheDocument();
    expect(
      screen.queryByText('Create task is unavailable until the skill list loads.'),
    ).not.toBeInTheDocument();

    // Titles no longer block Submit (see the validation tests above) — once skills have loaded,
    // it's enabled even with an empty title; only a pending create or missing skills disable it.
    const submit = screen.getByRole('button', { name: 'Create task' });
    expect(submit).not.toBeDisabled();
  });
});
