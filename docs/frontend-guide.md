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
3. **`src/index.css`** — Tailwind setup and the design tokens (`@theme` block), with
   `src/components/typeStyles.ts` and `buttonStyles.ts` beside it holding the shared type and button
   class strings. Skim them once so the class names you see everywhere else (`bg-accent`,
   `text-text-muted`, `microLabelClass`) make sense; see §8.
4. **`src/api/client.ts`** — `apiGet`/`apiPost`/`apiPatch`, the only functions that call `fetch`
   directly, plus `ApiError`, which turns the server's `{ error: { code, message } }` envelope into
   a real JS exception with a `.message` you can show to a user.
5. **`src/api/hooks.ts`** — every component-facing way to read or write server data
   (`useTasks`, `useDevelopers`, `useSkills`, `useCreateTask`, `useUpdateTask`). Read this before
   any page component; see §3 for what a "query" and a "mutation" actually are.
6. **`src/pages/TaskListPage.tsx`** → **`src/components/TaskRow.tsx`** →
   **`StatusSelect.tsx`** / **`AssigneeSelect.tsx`** / **`SkillBadges.tsx`** / **`SubtaskToggle.tsx`**
   — the `/` page, in the order data flows: the page fetches tasks and developers, decides which
   rows are visible (§6), and picks between loading / error / empty / table; each row owns its own
   PATCH; the two selects are "controlled" (§4) and dumb — they don't know what a PATCH is, they
   just report the new value.
7. **`src/components/task-form/treeReducer.ts`** — read this file itself; it's short and has good
   comments. It's the state model for the create-task form: one root task with nested subtasks,
   edited by dispatching actions addressed by a `path`. See §3.
8. **`src/components/task-form/TaskNodeForm.tsx`** → **`src/pages/CreateTaskPage.tsx`** — the form
   itself. `TaskNodeForm` renders itself for each of its own subtasks (a component calling itself is
   normal in React — it's how any nested/tree UI gets built). `CreateTaskPage` owns the
   `useReducer`, validates the whole tree when the user submits (focusing the first task without a
   title), and turns a successful submit into a POST plus a redirect.
9. **`src/components/AddSubtaskForm.tsx`** — the one-node composer the task list opens under a row
   to add a subtask to an existing task (§7). It reuses `SkillCheckboxes` from the create form but
   is deliberately not the recursive form itself.
10. **`src/components/{SkeletonRows,EmptyState,ErrorBanner,FlashBanner}.tsx`** — small,
    single-purpose display components used by the two pages above. Read on demand; each has its own
    header comment.

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
component that uses it. §8 covers what this app's particular tokens mean and why there are so few.

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
3. Clicking **Create task** runs `handleSubmit`, which first calls `firstProblem(state.root)`. That
   walks the tree depth-first and returns the `path` and `key` of the first task with a blank title,
   or `null`. If there is one, the page flips `showErrors` on (so every empty title now shows
   "Title is required" under it, with `aria-invalid`), focuses that input by its id
   (`task-title-<key>`), announces "Task 1.1 needs a title" beside the button — and stops. The
   button is deliberately *not* disabled for this case: a disabled control can't explain itself, and
   the offending field may be several screens down a deep tree. (The `<form>` has `noValidate` so
   the browser's own "Please fill out this field" bubble doesn't pre-empt this.)
4. If the tree is valid, `toCreateRequest(state.root)` turns the `FormNode` tree into the API's
   `CreateTaskRequest` shape — trimming titles and dropping `skillIds`/`subtasks` entirely when
   empty, so an untouched task doesn't send `"skillIds": []` (the backend takes a missing key as "the
   user didn't choose skills — infer them").
5. `useCreateTask().mutate(request)` POSTs it. While `isPending` the button reads "Creating…" and,
   if any node has no skills, a `role="status"` line says skills are being inferred (the LLM call can
   take a few seconds). On success, `CreateTaskPage` calls
   `navigate('/', { state: { flash: 'Created "…" and 2 subtasks' } })`; on failure, it renders
   `createTask.error.message` in a banner at the top of the form instead of redirecting.

Two details of this form are about **focus**, which is the one thing you can't express as "describe
the UI for this data" — it's an imperative act on a real DOM element:

- Every title input has `autoFocus`. React calls `.focus()` on the element once, when it *mounts*,
  so the root title takes focus when the page opens and a freshly added subtask's title takes focus
  the moment it appears (the browser scrolls it into view for free). Nothing steals focus later,
  because re-renders don't re-mount.
- Each block keeps a `ref` to its own Add subtask button. A `ref` is React's escape hatch to the
  underlying DOM node; the parent uses it to hand focus back to that button after one of its
  subtasks is removed (otherwise focus would drop to `<body>` when the focused Remove button
  disappears). Removing a subtask that has children first asks with `window.confirm` — the only
  place the app uses a browser dialog.

## 6. How folding travels

A parent row can be folded shut, which takes its whole subtree off the screen. The interesting part
isn't the chevron; it's where the state lives and what it is keyed by.

1. `TaskListPage` holds one piece of state for the whole table: `collapsedIds`, a
   `Set<number>` of **task ids**. Not numbers like `"1.2"` — a task's number describes where it
   currently sits among its siblings, so it changes the moment something is inserted above it, and a
   fold keyed by number would quietly start hiding a different row. An id never changes.
2. Clicking `SubtaskToggle` calls `onToggleCollapse`, which adds or removes that id. React re-renders
   the page with the new set; nothing else in the app knows folding exists.
3. The page then flattens the same server data **twice**, for two different questions:
   `flattenVisibleTaskTree(tasks, collapsedIds)` answers *what is on screen* and is what the table
   maps over; `flattenTaskTree(tasks)` answers *what exists* and is what the census counts. That is
   why folding a subtree never moves the *7 tasks · 2 done* line — it isn't a filter over the data,
   it's a choice about how much of it to draw.
4. Both live in `@htx/shared` (`task.ts`) and share one walk, whose only parameter is "should I
   descend into this task's subtasks?". Numbering is built during the walk from each task's position
   among its siblings, never from its position in the returned array — so a folded subtree leaves no
   gap and renumbers nothing. Fold 1.2 and 1.3 is still 1.3. The pure functions are unit-tested
   without rendering anything (`packages/shared/src/task.test.ts`).
5. A folded row says what it is hiding — *3 subtasks hidden*, counting the whole subtree, not just
   the direct children — and the toggle carries `aria-expanded`, which is the attribute a screen
   reader uses to announce "expanded"/"collapsed". The button's own label therefore names what it
   controls ("Subtasks of Build API") and never the state, so the two can't drift apart.

`Expand all` / `Collapse all` are the same state set wholesale, from `collapsibleTaskIds(tasks)` —
the ids of every task that has subtasks. That list is also how the page knows whether to offer the
controls at all: a flat list has nothing to fold, so it gets no toolbar.

## 7. How adding a subtask in place travels

`POST /api/tasks` has always taken an optional `parentId` that attaches what you send under an
existing task. The Create Task page never sends it — it builds a whole tree and posts it as one
root — so until now the only way to get a subtask was to have thought of it while creating the
parent. The task list can now send it, which is a completeness improvement rather than a missing
requirement: Part 4.3 asks for nested creation *on the Create Task page*, and that page is unchanged.

1. Each row renders an **Add subtask** action, present in the DOM and the tab order at all times and
   revealed on hover or focus, so a table of forty rows isn't also a table of forty buttons. It is
   absent below `MAX_TASK_DEPTH`: a sixth level is something the server would refuse, and a button
   that only ever produces an error is worse than no button.
2. Clicking it sets `composerFor` on the page to that task's id — **one at a time**, so opening a
   composer anywhere closes the one that was open. Two open composers would mean two half-written
   subtasks and two POSTs racing the same refetch.
3. `AddSubtaskForm` renders in a full-width row directly under the parent, indented to where the new
   subtask will land. It is one node — a title and optional skills — not a recursive tree. Leaving
   the skills unticked omits the key entirely from the request body, which is how the backend is
   told to infer them (§5), exactly as on the create page.
4. Submitting calls the same `useCreateTask()` mutation the create page uses, with
   `{ title, parentId, skillIds? }`. Success invalidates `['tasks']`, the list refetches, and the
   new row simply appears in its place in the tree — there is no client-side insert to get wrong.
5. On success the page unfolds the parent (a new subtask created into a folded row would be a write
   with nothing to show for it), marks the new row for a one-shot settle, and writes a sentence into
   a `role="status"` live region so a screen-reader user hears what a sighted user watched happen.
   `TaskRow` handles the part that needs a real DOM node: putting focus back on the **Add subtask**
   button, which is also the fastest place to be if the next thing you want is another subtask.

Two rules the server enforces on attach, and how the form treats them differently:

- **The parent must not be Done.** Rule B means a task is only Done once its whole subtree is, so
  "this task is Done" and "the server will refuse this" are the same fact — the client can know it
  without asking. The submit is disabled with the reason printed beside it, rather than letting you
  type a subtask and then throwing it away.
- **The tree must not pass five levels.** Also knowable up front, and handled by not offering the
  action at all (step 1).

Anything else the server rejects — a parent deleted in another tab, a validation error — arrives as
`createTask.error.message` inside the composer, with the typed title still in the field.

## 8. The design system: two inks on paper

Every colour, size and radius in this app is declared once, in the `@theme` block of `index.css`, and
no component is allowed to invent one. That single rule is most of what "a design system" means in
practice, and it is worth a section because it is the frontend equivalent of refusing to scatter
magic numbers through a service layer: when the palette lives in one file, changing it is an edit,
not an audit.

What makes this particular system easy to hold in your head is that it has a governing metaphor, and
the metaphor does real work. **The interface is a two-colour printed sheet.** A printer gets one
paper stock and two plates of ink and has to say everything with them, so:

- the **substrate** is the paper — a cool grey page (`--color-surface`) with content sitting on a
  slightly brighter sheet (`--color-surface-raised`);
- the **ink plate** carries everything structural — body text, table rules, control borders, labels;
- the **accent plate** (HTX's violet) is allowed exactly four jobs: hierarchy numbers, active state,
  the one primary action on a page, and the focus ring.

The four-jobs rule is the important one, and it is a *design* rule rather than a technical one. Colour
communicates by being scarce. If violet also became the colour of headings, and of hover, and of
chips, then a violet thing would no longer mean anything in particular and the user would have to
read every element to find the actionable one. Keeping it to a fifth of the page is what lets someone
find the primary button without looking for it. The same logic is why there is no success green: a
confirmation is not an emergency, so it is printed on the accent plate like every other piece of
state, and the system carries two fewer colours for no loss of meaning. The one exception, `danger`,
is documented as an exception in `index.css` — in a tool people actually work in, "this went wrong"
has to be unmissable, and that outranks tidiness.

Type follows the same shape: two voices, one job each. Work Sans reads sentences; a monospace stack
carries *facts* — task numbers, counts, column headers. That is not decoration. Monospace digits are
all the same width, so `1.1.1` sits directly under `1.1` down the number column and the task list
reads as an outline rather than a stack of strings.

Three files hold all of it, and none of them is a component:

| File | Holds |
|---|---|
| `src/index.css` | Every token — colours, radii, font stacks — each with the reasoning next to it. |
| `src/components/typeStyles.ts` | The two typographic voices, as reusable class strings. |
| `src/components/buttonStyles.ts` | The two button looks. |

The last two export plain strings rather than `<Button>` components on purpose. Almost every use site
needs to add a class or two of its own (`self-start`, a width cap, a grid position), which is trivial
to do with a string and awkward to do through a component's props. Reach for a component when there
is behaviour to share, and a string when there is only appearance.

**One trap worth knowing, because no type checker catches it.** The browser applies CSS
`text-transform` *before* it computes an element's accessible name. So styling a `<legend>` or a
button label with an `uppercase` class silently renames that control for screen readers and for any
test that finds elements the way a user would (`getByRole('group', { name: 'Skills for task 1' })`).
That is why `microLabelClass` — the only class in the app that uppercases anything — is used strictly
on decorative text and `<th>` column headers, never on a label, legend, button or option. If you add
a micro-label somewhere new, check first whether its text is somebody's accessible name.

## 9. Running and testing

From the repo root (all commands use the npm workspace, not `apps/web` directly):

- `npm run dev` — starts the API, the shared package's watch build, and the Vite dev server
  together; the web app proxies `/api/*` to `http://localhost:3000` (see `vite.config.ts`).
- `npx vitest run --root apps/web` — runs all tests once. `npx vitest --root apps/web` watches.
- `npx tsc -b apps/web` — typechecks without emitting anything.
- `npm run build -w @htx/web` — production build (typecheck + `vite build`) into `apps/web/dist`.
- `npm run test:e2e` — the Playwright suite in `e2e/` drives a real browser against the full Docker
  Compose stack (nginx → API → Postgres). Read `e2e/tests/subtasks-rule-b.spec.ts` after this guide: it
  is the whole product story in one test — create a three-level tree from the nested form (clicking
  the buttons by their accessible names, `Add subtask to task 1.1`), watch the numbering appear, try
  to close the parent early, complete it bottom-up.

Tests live next to the file they test (`treeReducer.test.ts` beside `treeReducer.ts`, etc.) and never
hit a real server: `globalThis.fetch` is replaced with a small mock that answers by URL and method,
so a test like "changing status shows the server's error message" exercises the real hooks and
components end to end, with only the network faked.
