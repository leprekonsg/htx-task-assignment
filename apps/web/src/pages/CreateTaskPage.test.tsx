// Tests for the Create Task page: building a nested subtask tree through the UI and checking the
// resulting POST body, and the two guardrails (submit disabled until every title is filled in, "Add
// subtask" disappears once the depth cap is reached). `globalThis.fetch` is mocked the same way as
// in TaskListPage.test.tsx.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CreateTaskPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Types `title` into the most recently added (deepest) task block's title field. */
async function typeDeepestTitle(user: ReturnType<typeof userEvent.setup>, title: string) {
  const titles = screen.getAllByLabelText('Title');
  await user.type(titles[titles.length - 1]!, title);
}

/** Clicks the "Add subtask" button belonging to the deepest task block currently on screen. */
async function addSubtaskToDeepest(user: ReturnType<typeof userEvent.setup>) {
  const buttons = screen.getAllByRole('button', { name: 'Add subtask' });
  await user.click(buttons[0]!);
}

describe('CreateTaskPage', () => {
  beforeEach(() => {
    globalThis.fetch = makeFetchMock() as unknown as typeof fetch;
  });

  it('submits a title, a subtask and a sub-subtask as one nested POST body', async () => {
    const user = userEvent.setup();
    renderPage();

    await typeDeepestTitle(user, 'A');
    await addSubtaskToDeepest(user);
    await typeDeepestTitle(user, 'B');
    await addSubtaskToDeepest(user);
    await typeDeepestTitle(user, 'C');

    await user.click(screen.getByRole('button', { name: 'Create task' }));

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

  it('disables submit until the root title is filled in', async () => {
    const user = userEvent.setup();
    renderPage();

    const submit = screen.getByRole('button', { name: 'Create task' });
    expect(submit).toBeDisabled();

    await typeDeepestTitle(user, 'Something');
    expect(submit).not.toBeDisabled();
  });

  it('hides "Add subtask" once a branch reaches the maximum depth', async () => {
    const user = userEvent.setup();
    renderPage();

    // Depth 1 (root) already exists; four more adds reach depth 5, the maximum.
    for (let i = 0; i < 4; i++) {
      await addSubtaskToDeepest(user);
    }

    // One "Add subtask" button per node from depth 1-4; the depth-5 leaf has none.
    expect(screen.getAllByRole('button', { name: 'Add subtask' })).toHaveLength(4);
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

  it('shows nothing skills-related, and behaves as before, once skills loads successfully', async () => {
    const user = userEvent.setup();
    renderPage();

    // The transient "Loading skills…" status clears once the (successful) fetch resolves.
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    expect(screen.queryByText(/Couldn't load the skill list/)).not.toBeInTheDocument();
    expect(
      screen.queryByText('Create task is unavailable until the skill list loads.'),
    ).not.toBeInTheDocument();

    const submit = screen.getByRole('button', { name: 'Create task' });
    expect(submit).toBeDisabled(); // still disabled, but only because the title is empty

    await typeDeepestTitle(user, 'Something');
    expect(submit).not.toBeDisabled();
  });
});
