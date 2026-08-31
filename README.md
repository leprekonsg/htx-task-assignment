# reX — Task Assignment App

[![CI](https://github.com/leprekonsg/htx-task-assignment/actions/workflows/ci.yml/badge.svg)](https://github.com/leprekonsg/htx-task-assignment/actions/workflows/ci.yml)

A small full-stack application for assigning software tasks to developers by skill. Tasks can be nested into
subtasks, a task can only be given to a developer who has every skill it requires, a parent task can only be
completed once all of its subtasks are, and when a task is created without skills an LLM infers them from the title.

Built for the HTX xDigital software-engineering take-home (Parts 1–7). Stack: **PostgreSQL 17 · Node 24 / TypeScript ·
Fastify 5 · React 19 (Vite) · Gemini API · Docker Compose**.

- [Where each requirement lives](#where-each-requirement-lives)
- [Quick start (Docker)](#quick-start-docker)
- [Local development](#local-development)
- [Configuration](#configuration)
- [System design](#system-design)
- [API](#api)
- [Frontend](#frontend)
  - [Design system](#design-system)
  - [Create Task form (Part 4.3)](#create-task-form-part-43)
- [Testing](#testing)
- [Dependencies and why](#dependencies-and-why)
- [Assumptions](#assumptions)
- [Known limitations and future work](#known-limitations-and-future-work)

## Where each requirement lives

| Part | Asks for | Where to look |
|---|---|---|
| 1 | Postgres schema — developers, tasks, skills, both many-to-many links, task status — with seed data | [Data model](#data-model) · `apps/api/migrations/` |
| 2 | Node/TypeScript API: create/read/update tasks (assign, change status), read developers and skills; **Rule A** — a developer can only take a task whose skills they all hold | [API](#api) · [Business rules](#business-rules) · `apps/api/src/modules/tasks/` |
| 3 | React SPA: a Task List (title, skills, status ▾, assignee ▾) and a Create Task page (title, optional skills, no assignee) | [Frontend](#frontend) · `apps/web/src/pages/` |
| 4 | Subtasks with the same properties as tasks; **Rule B** — a parent is Done only when every subtask is Done | [Data model](#data-model) · [Business rules](#business-rules) |
| 4.3 | The Create Task page builds subtasks and nested subtasks from React components rendered dynamically on the same page (wireframe: components 1 → 1.1 → 1.1.1, an *Add Subtask* on each, one *Save*) | [Create Task form (Part 4.3)](#create-task-form-part-43) · `apps/web/src/components/task-form/` |
| 5 | When a task is created without skills, an LLM infers them from the title on the backend | [Skill inference (Part 5)](#skill-inference-part-5) · `apps/api/src/llm/` |
| 6 | Docker Compose runs everything | [Quick start](#quick-start-docker) · `docker-compose.yml` |
| 7 | Public repository and a README covering how to run and configure, the design, the API, and why each dependency is there | this file · Swagger UI at `/docs` · [Dependencies and why](#dependencies-and-why) |

## Quick start (Docker)

Prerequisites: Docker Desktop (or any Docker Engine with the Compose plugin). Nothing else.

```bash
git clone https://github.com/leprekonsg/htx-task-assignment.git
cd htx-task-assignment
cp .env.example .env            # optional: put your Gemini key in GEMINI_API_KEY
docker compose up --build
```

Then open:

| URL | What |
|---|---|
| http://localhost:8080 | The web app (Task List, Create Task) |
| http://localhost:8080/docs | Swagger UI for the API (served through the same origin) |
| http://localhost:8080/api/tasks | The API itself (proxied by nginx to the `api` container) |

Compose starts four services in order: `db` (Postgres) → `migrate` (one-shot: applies migrations and the seed, then exits)
→ `api` → `web` (nginx serving the built SPA and proxying `/api` and `/docs`). The database is seeded with the four
developers from the assignment: Alice (Frontend), Bob (Backend), Carol (Frontend + Backend), Dave (Backend).

Without a `GEMINI_API_KEY` everything still works; tasks created without skills are simply stored as *not inferred*
(see [Skill inference](#skill-inference-part-5)). To start from an empty database again: `docker compose down -v`.

## Local development

Prerequisites: Node 24 (`.nvmrc`), npm 11, Docker (for Postgres only).

```bash
npm ci                 # installs every workspace from the single lockfile
npm run db:up          # postgres:17 on localhost:5432 (user/password/db: taskapp)
npm run db:migrate     # apply migrations + seed
npm run dev            # shared (tsc -w) + api (tsx watch, :3000) + web (vite, :5173, proxies /api → :3000)
```

Other scripts (all from the repo root): `npm run typecheck` · `npm run lint` · `npm run format` · `npm test` ·
`npm run test:e2e` · `npm run build`. The API's tests need the Postgres container running; they use a separate
`taskapp_test` database. The e2e suite needs Docker and, once, `npx playwright install chromium`.

## Configuration

All configuration is by environment variable (`.env` is read by Compose and by the dev scripts; `.env.example`
documents every key). The API validates its environment at startup with Zod and refuses to start on a bad value.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://taskapp:taskapp@localhost:5432/taskapp` | Postgres connection string (Compose points it at the `db` service) |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | API listen address |
| `LOG_LEVEL` | `info` | pino log level |
| `GEMINI_API_KEY` | *(unset)* | Enables skill inference. Unset ⇒ inference disabled |
| `LLM_MODEL` | `gemini-3.5-flash-lite` | Primary model |
| `LLM_FALLBACK_MODELS` | `gemma-4-31b-it,gemma-4-26b-a4b-it` | Tried in order when the primary fails (quota, timeout, bad output) |
| `LLM_TIMEOUT_MS` | `15000` | Whole-chain time budget for one create request |
| `LLM_ATTEMPT_TIMEOUT_MS` | `8000` | Timeout per attempt, enforced client-side with an `AbortSignal` (not sent as a server deadline — the Gemini API rejects deadlines under 10 s) |
| `LLM_PRIMARY_ATTEMPTS` | `2` | Attempts for the primary model (429/5xx retried with exponential backoff); fallbacks get one each |
| `POSTGRES_USER/PASSWORD/DB` | `taskapp` | Used by Compose to create the database |

## System design

### Architecture

```
 browser ──► nginx (web, :8080) ──┬── static SPA (Vite build)
                                  ├── /api/*  ──► Fastify (api, :3000) ──► PostgreSQL (db)
                                  └── /docs/* ──► Fastify (Swagger UI)         ▲
                                                        │                       │
                                                        └── Gemini API (only    migrate (one-shot:
                                                            when a task is      migrations + seed)
                                                            created without
                                                            skills)
```

The repository is an npm-workspaces monorepo with three TypeScript projects wired by project references:

```
packages/shared   Zod schemas + domain types + pure rules (Rule A, tree numbering). Single source of truth used by
                  the API (validation, OpenAPI, LLM output parsing) and the web app (types, form payload, eligibility).
apps/api          Fastify HTTP layer → TasksService (business rules, transactions) → SQL (plain `pg`) and the LLM
                  classifier chain behind a small interface.
apps/web          React SPA: two pages, TanStack Query for server state, a reducer for the nested create form.
```

Inside the API the layering is deliberately shallow: `routes/*` declare schemas and call the service; `modules/tasks/
tasks.service.ts` holds every business rule and owns transactions; `modules/tasks/tasks.sql.ts` holds every SQL
statement (so the schema's use can be reviewed in one file); `llm/*` is the only code that knows about Gemini.

### Data model

```
developers ──< developer_skills >── skills ──< task_skills >── tasks ──┐
   id, name                          id, name                    id, title, status, assignee_id ──► developers
                                                                 parent_task_id ──► tasks (self, ON DELETE CASCADE)
                                                                 skills_source, skills_model, created_at, updated_at
```

- `status` is a Postgres enum `task_status ('todo', 'in_progress', 'done')`.
- Subtasks are ordinary rows in `tasks` with `parent_task_id` set (Part 4 — "same properties as tasks"). The tree is
  unbounded in SQL and bounded to 5 levels by the API. Deleting a task would cascade to its subtasks.
- `skills_source` records how the task's skills were determined — `user`, `llm` or `unresolved` — and `skills_model`
  which model answered. This is what lets the UI and the API be honest about when the LLM was actually used.
- Migrations are plain SQL in `apps/api/migrations/` (`0001_init`, `0002_subtasks`, `0003_skill_inference`), applied by a
  ~40-line forward-only runner that records versions in `schema_migrations` under an advisory lock. `seed.sql` is
  idempotent (fixed ids, `ON CONFLICT DO NOTHING`).

### Business rules

**Rule A — eligibility (Part 2).** A developer can be assigned a task only if `developer.skills ⊇ task.skills`. The UI
shows ineligible developers as disabled options with the missing skill spelled out, and the API independently rejects an
ineligible assignment with `409 DEVELOPER_LACKS_SKILLS`. A task with no skills can go to anyone. The check is the pure
function `canAssign` in `packages/shared`, used on both sides.

**Rule B — completion (Part 4).** A task can be set to `done` only when every descendant is `done`
(`409 SUBTASKS_NOT_DONE`). To keep the invariant *"a done task has no non-done descendant"* true afterwards, two more
transitions are rejected: reopening a task while an ancestor is `done` (`409 ANCESTOR_IS_DONE`) and adding a subtask under
a `done` ancestor (`409 PARENT_IS_DONE`).

**Why Rule B needs a lock, not just a check.** The rule spans rows, so two concurrent requests can each pass their own
check against the other's uncommitted state — *parent → done* and *child → todo* could both commit and leave a done parent
with a todo child. Every mutation that can affect a tree's invariant therefore first takes a row lock on the **root of the
tree** (`SELECT … FOR UPDATE` after walking up with a recursive CTE), then re-reads the statuses it depends on and checks
them under the lock. Under READ COMMITTED the second transaction sees the first one's committed writes once it acquires
the lock, so the race is closed with one lock per tree and no retry logic. An integration test fires the two conflicting
updates together for 25 rounds and asserts the invariant after each.

**Atomic nested create.** `POST /api/tasks` accepts a whole tree and inserts it depth-first in one transaction; any
invalid node (unknown skill id, depth > 5) rolls back everything.

### Skill inference (Part 5)

When a task (or any node of a tree) is created without `skillIds`, the API infers the skills from the title before
saving — automatically, on the backend, in the same request.

- **Provider chain:** `gemini-3.5-flash-lite` (2 attempts, exponential backoff on 408/429/5xx) → `gemma-4-31b-it` →
  `gemma-4-26b-a4b-it`, all within one 15-second budget shared across the chain. The emailed API key is shared by every
  reviewer, so hitting the free-tier quota is expected; a 429 on the primary falls through to Gemma instead of failing.
- **One call per request:** every node needing inference goes into a single batched prompt with the allowed skill names
  read from the database and the three examples from the assignment. Gemini models are asked for constrained JSON
  (`responseMimeType` + `responseJsonSchema`). Gemma models accept those options but ignore them — verified live: they
  answer with prose and a fenced JSON block — so they are asked for JSON in the prompt and the JSON object is extracted
  from wherever it lands in the text. Output is validated with Zod; unknown skill names are dropped, one bad name never
  discards the whole batch — but an item whose names were *all* rejected is treated as unresolved rather than as "no
  skills apply" (an empty answer the model gave on its own is still trusted): the item is dropped instead of recorded
  as an empty, unrestricted result, and a response with no usable items falls through to the next model in the chain.
- **Fail-open, honestly:** if every model fails, the task is still created with no skills and `skills_source =
  'unresolved'`, shown in the UI as "Not inferred". The heuristic alternative (keyword matching) was deliberately not
  built — it would have made the app look like Part 5 works when the LLM was not involved.
- **No thinking:** every model is asked for `thinkingLevel: MINIMAL`. Labelling two words needs no reasoning, and
  Gemma 4 otherwise thinks by default — measured live at 6–10 s per request; minimal brings Gemma to 3–5 s and
  `gemini-3.5-flash-lite` to about a second. Hence the 8 s per-attempt timeout inside the 15 s budget.
- **No lock held during the network call:** inference runs before the database transaction opens.
- **Data note:** task titles are sent to Google. On the free tier Google may use prompts to improve its products.

### Error model

Every error is `{ "error": { "code", "message", "details?" } }` with a stable machine-readable `code`
(`VALIDATION_ERROR` 400 · `TASK_NOT_FOUND` / `DEVELOPER_NOT_FOUND` / `SKILL_NOT_FOUND` / `PARENT_NOT_FOUND` /
`NOT_FOUND` 404 · `DEVELOPER_LACKS_SKILLS` / `SUBTASKS_NOT_DONE` / `ANCESTOR_IS_DONE` / `PARENT_IS_DONE` 409 ·
`MAX_DEPTH_EXCEEDED` 400 · `INTERNAL_ERROR` 500). Messages are written for humans and shown verbatim in the UI.

## API

Interactive documentation (generated from the Zod schemas): **http://localhost:8080/docs** (Compose) or
http://localhost:3000/docs (dev). Summary:

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/health` | | `{ "status": "ok" }` | |
| GET | `/api/skills` | | `Skill[]` | |
| GET | `/api/developers` | | `Developer[]` (with `skills`) | |
| GET | `/api/developers/:id` | | `Developer` | 404 |
| GET | `/api/tasks` | | `Task[]` — root tasks with nested `subtasks` | |
| GET | `/api/tasks/:id` | | `Task` (its subtree) | 404 |
| POST | `/api/tasks` | `{ title, skillIds?, parentId?, subtasks?: [...] }` | 201 `Task` | 400 · 404 skill/parent · 409 `PARENT_IS_DONE` |
| PATCH | `/api/tasks/:id` | `{ status?, assigneeId? }` (`assigneeId: null` unassigns) | 200 `Task` | 400 · 404 · 409 `DEVELOPER_LACKS_SKILLS` / `SUBTASKS_NOT_DONE` / `ANCESTOR_IS_DONE` |

```bash
# Create a task and let the LLM infer its skills
curl -s -X POST localhost:8080/api/tasks -H 'content-type: application/json' \
  -d '{"title":"Fix UI bug on login page"}'
# → 201 { "id": 1, "skills": [{ "id": 1, "name": "Frontend" }], "skillsSource": "llm", "skillsModel": "gemini-3.5-flash-lite", ... }

# Create a task with a subtask, skills chosen explicitly
curl -s -X POST localhost:8080/api/tasks -H 'content-type: application/json' \
  -d '{"title":"Reporting feature","skillIds":[2],"subtasks":[{"title":"Design report schema","skillIds":[2]}]}'

# Assign Bob (Backend) to the Frontend task → Rule A
curl -s -X PATCH localhost:8080/api/tasks/1 -H 'content-type: application/json' -d '{"assigneeId":2}'
# → 409 { "error": { "code": "DEVELOPER_LACKS_SKILLS", "message": "Bob lacks required skill(s): Frontend", ... } }

# Mark the parent done while its subtask is still to-do → Rule B
curl -s -X PATCH localhost:8080/api/tasks/2 -H 'content-type: application/json' -d '{"status":"done"}'
# → 409 { "error": { "code": "SUBTASKS_NOT_DONE", ... , "details": { "subtaskIds": [3] } } }
```

`Task` shape: `{ id, title, status, parentId, assignee: { id, name } | null, skills: Skill[], skillsSource, skillsModel,
createdAt, updatedAt, subtasks: Task[] }`.

## Frontend

Two pages, matching the assignment's wireframes:

- **Task List (`/`)** — one table for all tasks; subtasks are indented under their parent with hierarchical numbering
  (1, 1.1, 1.1.1) set in monospace so `1.1.1` lines up under `1.1`. A census beside the heading (*7 tasks · 2 done ·
  1 unassigned*) gives the shape of the list before a single row is read. Any task with subtasks can be folded shut
  from the gutter — the folded row says what it is standing in for (*3 subtasks hidden*, counting the whole subtree),
  numbering and the census are unchanged by folding, and *Expand all* / *Collapse all* appear only when the list
  actually has a branch in it. Each row also offers *Add subtask*, which opens a one-node composer under that row and
  posts it with the parent's id — the API has always accepted `parentId`, so this is the UI catching up with it, not a
  new capability. (Part 4.3's nested creation lives on the Create Task page and is unchanged.) A Done parent says why
  it can't take one instead of letting you write a subtask the server would refuse, and no row five levels deep offers
  the action at all. Status and assignee are inline `<select>`s
  that save immediately; the assignee list disables ineligible developers and says which skill they lack; a parent that
  still has unfinished subtasks says so under its status control (*0/2 subtasks done*) **before** you try, while
  leaving Done selectable so the server stays the one that enforces Rule B; a rejected change (409) shows the server's
  message in the row and the row snaps back to the saved state. Skills inferred by the LLM carry an "AI-inferred" tag;
  tasks whose skills could not be inferred say so.
- **Create Task (`/tasks/new`)** — a title, optional skills, and nested subtasks to any shape up to depth 5, submitted as
  one tree; the details are in the next section. There is no assignee field — assignment happens on the list.

![The Task List: a folded subtree, hierarchical numbering, inline status and assignee, AI-inferred tag](docs/images/task-list.png)

*Task 2 is folded — its row says what it is standing in for, and 3 keeps the number it always had. Task 1 is pointed at, so its Add subtask action is showing.*

![The Add subtask composer, open under an existing task](docs/images/add-subtask.png)

*Add subtask opens a one-node composer under the row it belongs to, naming what it is adding to. Leave the skills unticked and they are inferred from the title, exactly as on the Create Task page.*

State management is intentionally minimal: TanStack Query owns server state (fetching, caching, invalidation after a
mutation); a `useReducer` over an immutable tree owns the create form; there is no global store. Styling is Tailwind v4
with every design token declared in one `@theme` block, and native form controls throughout. New to React? Start with
[`docs/frontend-guide.md`](docs/frontend-guide.md), which walks through this codebase file by file.

### Design system

The portal is named **reX** — a nod to Jira, whose own name came from *Gojira*. The lowercase `re` is live text in
Work Sans 700; the uppercase `X` is a tapered custom X with restrained concave terminals, drawn as a single inline SVG
path in [`Wordmark.tsx`](apps/web/src/components/Wordmark.tsx). Because it is drawn rather than shipped as an image, it
takes its two colours straight from the ink and accent tokens below, sits on the same left edge as everything else, and
stays crisp at any size.

The interface is built like a two-colour printed sheet: one paper stock, two plates of ink. Taking that constraint
literally is what keeps it disciplined, and it is enforced in exactly one place — the `@theme` block in
[`apps/web/src/index.css`](apps/web/src/index.css). No component writes a hex value or a raw Tailwind palette class.

| Plate | Colour | What it is allowed to carry |
|---|---|---|
| Substrate | `#e9e9e5` paper, `#fafaf7` sheet | The page itself. Content sits on a brighter plate, so the figure/ground reads as "a sheet on a desk" rather than "a card with a shadow". |
| Ink (dominant) | `#12011c`, greys `#4f4f51` / `#78787e` / `#c9c9c4` | Everything structural: body text, table rules, control borders, labels. |
| Accent (violet) | `#5c068c`, `#7b35a3`, `#f0e4f7` | Exactly four jobs — hierarchy numbers, active/selected state, the one primary action per page, and the focus ring. Four jobs is what keeps it near a fifth of the page; the moment violet starts decorating things it stops meaning anything. |
| Failure | `#a4161a` | The single deliberate exception to two inks, restricted to rejected requests and blocking validation. In a tool people work in, "this went wrong" has to be unmissable, and that outranks aesthetic purity. |

There is no success green and no warning amber. A confirmation is not an emergency, so it is printed on the accent
plate like every other piece of state — two fewer colours in the system, no meanings lost.

Type is two voices with one job each. **Work Sans** is the reading voice — titles, sentences, names. A monospace stack
is the utility voice and carries anything that is a *fact* rather than a sentence: task numbers, counts, column
headers. Monospace digits share a width, so `1.1.1` sits directly under `1.1` down the number column and the task list
reads as an outline instead of a stack of strings. The shared class strings for both live in
[`apps/web/src/components/typeStyles.ts`](apps/web/src/components/typeStyles.ts), beside `buttonStyles.ts`.

The palette and typeface are taken from [htx.gov.sg](https://www.htx.gov.sg/who-we-are/our-purpose) — the violet, the
violet-cast black and Work Sans are read from that site's own stylesheet. Only the visual language is borrowed: no HTX
name, logo or mark appears anywhere in the UI, because this app is not an HTX product and should not imply that it is.

Work Sans is **self-hosted** — one 50 KB variable file covering weights 400–700 in
[`apps/web/public/fonts/`](apps/web/public/fonts/), under the [SIL Open Font
License](apps/web/public/fonts/OFL.txt) — rather than fetched from a CDN, so `docker compose up` stays hermetic and the
app renders identically with no network access.

Contrast was measured in the rendered page rather than assumed: body text 6.7:1 on the substrate and 19:1 on the sheet,
violet 9.3:1 (white on violet 11.3:1), and every control border and nesting rail at 3.6:1 or better. The previous
control borders were ~1.3:1 and failed WCAG 1.4.11.

### Create Task form (Part 4.3)

The wireframe shows one *New Task Component* per task, each with its own **Add Subtask**, nested and numbered
1 → 1.1 → 1.1.1, and a single **Save**. It maps onto the code like this:

| Wireframe | Implementation |
|---|---|
| New Task Component 1 / 1.1 / 1.1.1 | `TaskNodeForm` (`apps/web/src/components/task-form/`) — one component for one task block (title, skill checkboxes, its own buttons) that **renders itself** once per subtask, so the tree grows on the same page with no navigation or modal. Blocks are labelled `Task 1`, `Task 1.1`, `Task 1.1.1` and indented under a rail, matching the numbering the Task List will show once saved. |
| Add Subtask | On every block. Appends an empty subtask under that task and moves keyboard focus into its title, so typing can continue immediately. Disappears once a branch reaches depth 5, the API's limit, so the form cannot build a tree the server would reject. |
| Save | **Create task** — or **Create 3 tasks**: the label counts the nodes, because one click persists the whole tree in one `POST /api/tasks` (atomic: any invalid node rolls back everything). |
| — | **Remove** on every subtask (the root cannot be removed). When the subtask has children of its own it asks first ("Remove task 1.1 and its 2 subtasks?") and afterwards returns focus to the parent's Add subtask button. |

![The Create Task form: nested task blocks, each with its own Add subtask](docs/images/create-task.png)

Everything the form knows is one `useReducer` state: a tree of `{ title, skillIds, subtasks }` nodes. Every edit — typing a
title three levels down, ticking a skill, adding or removing a block — is an action addressed by a **path** (`[0, 2]` is the
third subtask of the first subtask), and the reducer (`treeReducer.ts`, a pure function with its own unit tests) returns a new
tree with only that branch replaced. `TaskNodeForm` holds no state of its own; that is what lets the page validate and
submit the whole tree at once.

Behaviour worth knowing when you try it:

- **Validation names the problem instead of greying out the button.** Submitting with an empty title anywhere in the tree
  focuses that field, marks it, and says "Task 1.1 needs a title" beside the button — even when the field is off-screen.
- **Skills are optional per task.** Any task left without skills is sent to the LLM (Part 5). While that request is in
  flight the button reads "Creating…" and a status line explains that skills are being inferred, which can take a few seconds.
- **Reference data gates the form, visibly.** If `GET /api/skills` fails, a banner with Retry explains why creation is
  unavailable rather than offering an empty skill list.
- Success returns to the Task List with a flash message naming what was created: *Created "Reporting feature" and 2 subtasks*.

## Testing

Four layers, 148 tests in total; every layer runs in CI.

```bash
npm test                          # shared + api + web (API tests need `npm run db:up` first)
npx vitest run --root apps/api    # API only: 40 unit + 47 integration tests against Postgres (taskapp_test database)
npx vitest run --root apps/web    # web only: 41 tests, Testing Library + jsdom, fetch mocked
npm run test:e2e                  # 10 Playwright tests against the real Docker Compose stack (builds and starts it)
```

- **shared (10)** — Rule A helpers, request schemas (title bounds, duplicate skill ids, depth limit), tree numbering.
- **api (87)** — every error code has a test that triggers it; nested create persists all nodes and rolls back entirely
  on an invalid deep node; Rule A for each seeded developer; Rule B for done / reopen / add-under-done / grandchild
  cases; the Rule B **concurrency race** (25 rounds, invariant asserted after each); inference with a fake classifier
  (LLM result, failure ⇒ `unresolved`, a genuinely empty result kept, unknown skill names filtered and an all-unknown
  item treated as unresolved, one batched call per request); the
  classifier chain, prompt and JSON extraction (including Gemma-style prose around the JSON); config parsing;
  `/docs/json` validity.
- **web (41)** — form reducer (paths, structural sharing, depth cap, payload shape, numbering, node counts, first
  missing title); Task List rendering (numbering, badges, disabled ineligible developers, PATCH on change, 409 message,
  developers-failed banner with assignment disabled); Create Task: nesting and submitted payload, submit with an empty
  title focuses and names the offending task, Add subtask focuses the new title, Remove confirms for a subtree and returns
  focus to the parent, "Create N tasks" / "Creating…" labels with the inference hint, pluralised flash, skills-failed
  banner; and the list's own reporting — the census line sits beside the heading without renaming it, a parent with
  unfinished subtasks says so while leaving Done selectable, and the empty state offers a distinctly named action.
- **e2e (10, `e2e/`)** — Playwright drives Chromium against `docker compose up --build`, i.e. nginx → API → Postgres
  exactly as a reviewer runs it: smoke (health, `/docs`, seed data), create a task from the UI, Rule A in the assignee
  dropdown (Bob disabled for a Frontend task, Carol accepted), the empty-title alert on the create form, a three-level
  tree created from the nested form with 1 / 1.1 / 1.1.1 numbering, both Rule B rejections and the bottom-up completion
  path, the depth-5 form cap, and skill
  inference — asserted strictly against the live LLM when `GEMINI_API_KEY` is set in `.env`, and against the
  `unresolved` path when it is not. `E2E_BASE_URL=http://localhost:8080 npm run test:e2e` reuses a stack that is
  already running; `npm run test:e2e:ui` opens Playwright's inspector. This layer earned its place on the first run:
  it caught the SDK turning the 5-second per-attempt timeout into a server deadline that the Gemini API rejects
  (`400 Manually set deadline 5s is too short`), which no mocked test could see. Every fixture task title carries a
  `[e2e ...]` marker (`uniqueTitle` in `e2e/tests/helpers.ts`), and a `globalTeardown` (`e2e/global-teardown.ts`)
  deletes exactly those rows — subtasks and skill links cascade — once the suite finishes, pass or fail. That matters
  because, unlike CI (which throws its Postgres volume away every run), a local run against the Compose stack keeps
  `pgdata` between runs, so without cleanup the demo task list would fill up with leftover fixtures. Teardown connects
  with `pg` at `E2E_DATABASE_URL` (default `postgresql://taskapp:taskapp@localhost:5432/taskapp`, matching
  `docker-compose.yml`'s published port); point it elsewhere if the stack under test isn't on localhost. It never
  fails the run — a database it can't reach just logs a warning and the suite's own pass/fail stands.

CI (GitHub Actions, `.github/workflows/ci.yml`) runs format check, lint, typecheck and the unit/integration tests
against a Postgres service container, builds both Docker images, and runs the Playwright suite against the composed
stack (without an API key, so the inference test exercises the `unresolved` path there).

## Dependencies and why

Runtime dependencies are kept to what the assignment needs; each one below is the whole list.

| Package | Where | Why this, and not something else |
|---|---|---|
| `fastify` | api | Fast, schema-first Node framework (OpenJS Foundation). Validation, serialisation and logging (pino) are built in, so no separate validator/logger packages. Express would need several add-ons; NestJS is far more framework than two resources warrant. |
| `fastify-type-provider-zod` | api | Lets the Zod schemas in `packages/shared` be the route schemas: one definition gives runtime validation, TypeScript types and the OpenAPI document. |
| `@fastify/swagger`, `@fastify/swagger-ui` | api | Generates and serves the API documentation from those same schemas (`/docs`). |
| `zod` | shared, api | Runtime validation shared by API, web form and LLM output parsing; also emits the JSON Schema sent to Gemini. |
| `pino` | api | Fastify's own logger, declared explicitly because the server imports it directly for the classifier's startup/fallback log lines. No extra code is pulled in. |
| `pg` | api, e2e | The standard Postgres driver. SQL is written by hand (recursive CTEs, `FOR UPDATE`), so an ORM would add a dependency without removing much code. Also used by `e2e/global-teardown.ts` to delete the suite's own fixture rows after a run — no new dependency, just root `devDependencies` pointing at the same version `apps/api` already pins. |
| `@google/genai` | api | Google's current official Gemini SDK (the older `@google/generative-ai` is end-of-life). Provides structured output, per-attempt timeouts, opt-in retries and abort signals. |
| `react`, `react-dom` | web | Required by the assignment. |
| `react-router` | web | Two pages with real, bookmarkable URLs; declarative mode is a handful of imports. |
| `@tanstack/react-query` | web | Server-state cache with loading/error states and invalidation after mutations — removes hand-written `useEffect` fetching and stale-data bugs. |
| `tailwindcss`, `@tailwindcss/vite` | web (build) | Utility CSS with the design tokens declared in CSS (`@theme`); zero config. A component library (shadcn) was considered and rejected: ~6 extra packages plus vendored component code for two pages, and it replaces the native `<select>` the wireframe uses. |

Development-only: `typescript`, `vite`, `@vitejs/plugin-react`, `tsx` (run TS in dev), `vitest` + `@testing-library/*` +
`jsdom` (tests), `@playwright/test` (end-to-end tests against the Compose stack), `eslint` + `typescript-eslint` + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh` +
`eslint-config-prettier` + `prettier` (lint/format), `concurrently` (one `npm run dev`), `pino-pretty` (readable dev
logs), `@types/*`. Every version is pinned exactly and installed from the committed lockfile (`npm ci`). Vetting notes
(maintenance, licences, advisories) are in [`docs/research/`](docs/research/).

## Assumptions

1. **Eligibility** means the developer holds every skill the task requires; a task with no skills is assignable to anyone.
2. **Skills are fixed at creation.** Updates are limited to `status` and `assignee` (Part 2's list); a task's skills can be
   chosen by the user or inferred, not edited afterwards.
3. **Statuses** are `todo`, `in_progress`, `done` (the spec says "To-do / Done / etc."). Transitions are free except the
   Rule B constraints above; reopening a *parent* is allowed, reopening a child under a done parent is not.
4. **Unassigning** (`assigneeId: null`) is allowed.
5. A subtask tree is created **atomically** in one request; depth ≤ 5, title 1–500 characters, ≤ 50 subtasks per node.
6. **Subtask eligibility** is computed from the subtask's own skills, not its ancestors'.
7. The **skills catalogue** is exactly the two skills in the assignment (Frontend, Backend); it is a table, so it can grow.
8. **No** authentication, deletion or multi-tenancy — none is asked for.
9. When a task is created **without skills the LLM is consulted**; `skillIds: []` counts as "no skills provided".

## Known limitations and future work

- Reopening a subtask under a done parent is rejected rather than cascading the reopen up the tree.
- No task deletion, list filtering/search, or optimistic UI updates.
- Folding is a per-session reading choice held in component state: it is not persisted across a reload, and a task added
  from the list is placed by the server's ordering (last among its siblings), not inserted client-side.
- An unsaved **Add subtask** draft survives switching rows, folding and Collapse all, but it lives in component state:
  a reload discards it. Only one composer is open at a time, so subtasks are added one at a time rather than in a run.
- Removing a subtask in the create form asks for confirmation rather than offering undo.
- Tailwind v4 targets modern browsers (Safari 16.4+, Chrome 111+, Firefox 128+).
- Skill inference is synchronous inside the create request (worst case ≈ 15 s when every model times out); an async
  "infer later" flow would be the next step if inference became slow.

---

Built with AI-assisted tooling (Claude Code); design decisions and their reasoning are in [`docs/PLAN.md`](docs/PLAN.md).
