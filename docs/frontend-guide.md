# Frontend guide

A reading guide to `apps/web` for a backend developer who hasn't worked in React before. It assumes
you know HTTP, JSON, and how to read TypeScript types; it doesn't assume you know React.

## 1. The mental model

A React component is a function. It takes **props** (like function arguments) and returns a
description of some UI (JSX — HTML-looking syntax that's actually JavaScript). React calls that
function, gets the description, and turns it into real DOM elements.

```tsx
function Greeting({ name }: { name: string }) {
  return <p>Hello, {name}</p>;
}
```

Three ideas make the rest of this codebase readable:

- **Props in, events out.** A component receives data as props and reports things that happened
  (a click, a typed character) by calling a function prop, usually named `onSomething`. It does not
  reach into its parent or siblings. `StatusSelect` receives `task` and `onChange`; it has no idea
  what `onChange` actually does (in our case, send a PATCH) — that's the caller's job.
- **State causes re-render.** A component can hold its own local state with `useState` (a value) or
  `useReducer` (a value plus the logic to change it — see §3). Whenever that state changes, React
  calls the function again with the new state and updates the DOM to match. You never manually
  mutate the page; you change data and describe what the UI should look like for that data.
- **Nothing is shared unless it's passed down or fetched.** There's no global mutable state. Data
  that multiple components need either comes from props (passed down the tree) or from the
  TanStack Query cache (§3), which every component can read independently via a hook.

## 2. Reading order

Read these in order; each paragraph is one file.

1. **`src/main.tsx`** — the only file that calls `createRoot(...).render(...)`. It wraps `<App />`
   in two providers: `QueryClientProvider` (server-data cache) and `BrowserRouter` (URL routing).
   Everything below assumes those two are in place.
2. **`src/App.tsx`** — `AppShell` (header + nav) and `<Routes>`, which maps a URL to a page
   component: `/` → `TaskListPage`, `/tasks/new` → `CreateTaskPage`, anything else → `NotFoundPage`.
3. **`src/index.css`** — Tailwind setup and the design tokens (`@theme` block). Skim it once so the
   class names you see everywhere else (`bg-accent`, `text-text-muted`) make sense; see §5.
4. **`src/api/client.ts`** — `apiGet`/`apiPost`/`apiPatch`, the only functions that call `fetch`
   directly, plus `ApiError`, which turns the server's `{ error: { code, message } }` envelope into
   a real JS exception with a `.message` you can show to a user.
5. **`src/api/hooks.ts`** — every component-facing way to read or write server data
   (`useTasks`, `useDevelopers`, `useSkills`, `useCreateTask`, `useUpdateTask`). Read this before
   any page component; see §3 for what a "query" and a "mutation" actually are.
6. **`src/pages/TaskListPage.tsx`** → **`src/components/TaskRow.tsx`** →
   **`StatusSelect.tsx`** / **`AssigneeSelect.tsx`** / **`SkillBadges.tsx`** — the `/` page, in the
   order data flows: the page fetches tasks and developers and picks between loading / error / empty
   / table; each row owns its own PATCH; the two selects are "controlled" (§4) and dumb — they don't
   know what a PATCH is, they just report the new value.
7. **`src/components/task-form/treeReducer.ts`** — read this file itself; it's short and has good
   comments. It's the state model for the create-task form: one root task with nested subtasks,
   edited by dispatching actions addressed by a `path`. See §3.
8. **`src/components/task-form/TaskNodeForm.tsx`** → **`src/pages/CreateTaskPage.tsx`** — the form
   itself. `TaskNodeForm` renders itself for each of its own subtasks (a component calling itself is
   normal in React — it's how any nested/tree UI gets built). `CreateTaskPage` owns the
   `useReducer`, decides whether Submit is allowed, and turns a successful submit into a POST plus a
   redirect.
9. **`src/components/{SkeletonRows,EmptyState,ErrorBanner,FlashBanner}.tsx`** — small, single-purpose
   display components used by the two pages above. Read on demand; each has its own header comment.

## 3. Four concepts, and where they show up

**`useReducer` + an immutable tree** (`treeReducer.ts`, `CreateTaskPage.tsx`). A reducer is a pure
function `(state, action) => newState` — no side effects, easy to unit test without rendering
anything (see `treeReducer.test.ts`). The create-task form's whole tree — root task, its subtasks,
their subtasks — is one `FormState` value. Every edit dispatches an action like
`{ type: 'setTitle', path: [0, 1], title: 'Fix bug' }`; the reducer walks down `path` and returns a
**new** tree where only the nodes on that path are new objects — every untouched sibling is the
exact same object reference as before (`toBe`-equal, checked in the tests). That's not an
optimization here, it's what makes "one big object represents a whole nested form" tractable at all.

**TanStack Query** (`api/hooks.ts`). A **query** (`useTasks()`) fetches data and caches it under a
key (`['tasks']`); call the same hook from two components and they share one cached result and one
in-flight request, with `isLoading` / `isError` / `data` you can branch on directly in JSX. A
**mutation** (`useUpdateTask()`) wraps a write; you call `.mutate(variables)`, and it exposes
`isPending` / `isError` / `error` for *that specific call*. On success, both mutations call
`queryClient.invalidateQueries({ queryKey: ['tasks'] })`, which tells Query "the tasks list might be
stale" — Query refetches it, and every component reading `useTasks()` re-renders with the fresh
data. This is why there's no `useEffect(() => { fetch(...) }, [])` anywhere: manually fetching in an
effect means hand-rolling loading states, race conditions between overlapping fetches, and cache
invalidation yourself. Query does all of that, so components just call a hook and read the result.

**react-router** (`App.tsx` and any page that navigates). `<Routes>`/`<Route>` map URL patterns to
elements. `NavLink` behaves like `<a>` but knows if its own route matches the current URL (so it can
style itself as "active" — see the header nav in `AppShell`). `useNavigate()` returns a function for
navigating *imperatively*, e.g. after a form submits successfully:
`navigate('/', { state: { flash: 'Created "..."' } })`. The second argument's `state` isn't part of
the URL — it's a one-time bag of data attached to that specific navigation, which the destination
page can read via `useLocation().state`. That's how `TaskListPage` shows a "Created ..." banner
right after `CreateTaskPage` redirects to it, without a global store.

**Tailwind tokens** (`index.css`, every component's `className`). Instead of hand-written CSS files,
components style themselves with utility classes (`flex`, `gap-2`, `rounded-md`) directly in
`className`. The `@theme` block in `index.css` declares this app's *own* names for colours, radii and
the font stack as CSS variables (`--color-accent`, `--radius-md`, ...); Tailwind turns each one into
matching utility classes (`bg-accent`, `rounded-md`). Every component in this app uses only those
generated utilities — never a raw Tailwind palette class like `bg-blue-500` and never an inline hex
colour — so the entire app's palette lives in one file, and changing a token there changes every
component that uses it.

## 4. How a status change travels

1. User picks "Done" in the `<select>` rendered by `StatusSelect` inside a `TaskRow`.
2. The browser fires the select's `onChange`; `StatusSelect` calls the `onChange` prop it was given
   with the new status string. This is what "controlled input" means: the select's `value` always
   comes from `task.status` (a prop), never its own internal state, so React — not the DOM — is the
   source of truth for what's selected.
3. `TaskRow.handleStatusChange` calls `updateTask.mutate({ id: task.id, status })` — `updateTask` is
   this row's own `useUpdateTask()` instance, so only this row's controls disable while it runs.
4. The mutation's `mutationFn` (`api/hooks.ts`) calls `apiPatch('/api/tasks/:id', { status })`, which
   does the actual `fetch`.
5. If the server rejects it (e.g. `409 SUBTASKS_NOT_DONE`), `apiPatch` throws an `ApiError`;
   `updateTask.isError` becomes true and `TaskRow` renders `updateTask.error.message` — the server's
   own words — in a `role="alert"` row right under the offending row.
6. Either way, on **success** the mutation invalidates `['tasks']`, TanStack Query refetches
   `GET /api/tasks`, and every `TaskRow` re-renders from the fresh server data. There's no
   optimistic update and no manual "undo the select" logic: a failed PATCH just leaves the select
   showing whatever the server still thinks is true, because the select's value is always read from
   server data, never guessed at locally.

## 5. How the nested form travels

1. Typing in a title input fires `onChange`, which the relevant `TaskNodeForm` turns into
   `dispatch({ type: 'setTitle', path, title })` — `path` is that exact node's address in the tree
   (`[]` for the root, `[0, 2]` for "root's first subtask's third subtask").
2. `useReducer` calls `treeReducer(currentState, action)`, which walks `path` and returns a new tree
   with just that one node replaced (§3). React re-renders `CreateTaskPage` and, because
   `TaskNodeForm` renders itself once per subtask, only the components on that path actually produce
   new JSX — an untouched sibling subtree renders again structurally but with the exact same prop
   values, so nothing the user sees changes.
3. On every render, `firstProblem(state.root)` walks the whole tree depth-first and returns the
   `path` of the first task with a blank title, or `null`. `CreateTaskPage` disables the Submit
   button whenever that isn't `null` (or a request is already in flight).
4. Clicking Submit calls `toCreateRequest(state.root)`, which turns the `FormNode` tree into the
   API's `CreateTaskRequest` shape — trimming titles and dropping `skillIds`/`subtasks` entirely when
   empty, so an untouched task doesn't send `"skillIds": []` (the backend takes a missing key as "the
   user didn't choose skills — infer them").
5. `useCreateTask().mutate(request)` POSTs it. On success, `CreateTaskPage` calls
   `navigate('/', { state: { flash: `Created "${request.title}"` } })`; on failure, it renders
   `createTask.error.message` in a banner at the top of the form instead of redirecting.

## 6. Running and testing

From the repo root (all commands use the npm workspace, not `apps/web` directly):

- `npm run dev` — starts the API, the shared package's watch build, and the Vite dev server
  together; the web app proxies `/api/*` to `http://localhost:3000` (see `vite.config.ts`).
- `npx vitest run --root apps/web` — runs all tests once. `npx vitest --root apps/web` watches.
- `npx tsc -b apps/web` — typechecks without emitting anything.
- `npm run build -w @htx/web` — production build (typecheck + `vite build`) into `apps/web/dist`.
- `npm run test:e2e` — the Playwright suite in `e2e/` drives a real browser against the full Docker
  Compose stack (nginx → API → Postgres). Read `e2e/tests/subtasks-rule-b.spec.ts` after this guide: it
  is the whole product story in one test — create a three-level tree from the nested form, watch the
  numbering appear, try to close the parent early, complete it bottom-up.

Tests live next to the file they test (`treeReducer.test.ts` beside `treeReducer.ts`, etc.) and never
hit a real server: `globalThis.fetch` is replaced with a small mock that answers by URL and method,
so a test like "changing status shows the server's error message" exercises the real hooks and
components end to end, with only the network faked.
