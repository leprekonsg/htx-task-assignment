# reX — Task Assignment App

[![CI](https://github.com/leprekonsg/htx-task-assignment/actions/workflows/ci.yml/badge.svg)](https://github.com/leprekonsg/htx-task-assignment/actions/workflows/ci.yml)

A small full-stack application for assigning software tasks to developers by skill. Tasks can be nested into
subtasks, a task can only be assigned to a developer who has every skill it requires, a parent task can only be
completed once all of its subtasks are, and when a task is created without skills an LLM infers them from the title.

Built for the HTX xDigital software-engineering take-home (Parts 1–7). Stack: **PostgreSQL 17 · Node 24 / TypeScript ·
Fastify 5 · React 19 (Vite) · Gemini API · Docker Compose**.

- [Where each requirement lives](#where-each-requirement-lives)
- [Quick start (Docker)](#quick-start-docker)
  - [Two states you can load](#two-states-you-can-load)
- [Local development](#local-development)
- [Configuration](#configuration)
- [System design](#system-design)
  - [Database](#database)
- [MCP (Important Feature)](#mcp-important-feature-model-continuity-plan)
- [API](#api)
- [Frontend](#frontend)
  - [Create Task form (Part 4.3)](#create-task-form-part-43)
  - [Design system](#design-system)
- [Tests](#tests)
- [Dependencies and why](#dependencies-and-why)
- [Assumptions](#assumptions)
- [Known limitations and future work](#known-limitations-and-future-work)

## Where each requirement lives

| Part | Asks for | Where to look |
|---|---|---|
| 1 | Postgres schema — developers, tasks, skills, both many-to-many links, task status — with seed data | [Database](#database) (including why the business rules are enforced by the API, not by triggers) · `apps/api/migrations/` |
| 2 | Node/TypeScript API: create/read/update tasks (assign, change status), read developers and skills; **Rule A** — a developer can only be assigned a task whose required skills they all have | [API](#api) · [Business rules](#business-rules) · `apps/api/src/modules/tasks/` |
| 3 | React SPA: a Task List (title, skills, status ▾, assignee ▾) and a Create Task page (title, optional skills, no assignee) | [Frontend](#frontend) · `apps/web/src/pages/` |
| 4 | Subtasks with the same properties as tasks; **Rule B** — a parent is Done only when every subtask is Done | [Database](#database) · [Business rules](#business-rules) |
| 4.3 | The Create Task page builds subtasks and nested subtasks from React components rendered dynamically on the same page (wireframe: components 1 → 1.1 → 1.1.1, an *Add Subtask* on each, one *Save*) | [Create Task form (Part 4.3)](#create-task-form-part-43) · `apps/web/src/components/task-form/` |
| 5 | When a task is created without skills, an LLM infers them from the title on the backend | [Skill inference (Part 5)](#skill-inference-part-5) · `apps/api/src/llm/` |
| 6 | Docker Compose runs everything | [Quick start](#quick-start-docker) · `docker-compose.yml` |
| 7 | Public repository and a README covering how to run and configure, the design, the API, and why each dependency is used | this file · Swagger UI at `/docs` · [Dependencies and why](#dependencies-and-why) |

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

Without a `GEMINI_API_KEY` everything still works; tasks created without skills are stored as *not inferred*
(see [Skill inference](#skill-inference-part-5)). To start from an empty database again: `docker compose down -v`.

### Two states you can load

A fresh stack starts with no tasks. One command loads a set of tasks that covers every state the Task List can
display, and another removes them again:

```bash
docker compose run --rm api node dist/db/cli.js demo    # 16 tasks: the demo state
docker compose run --rm api node dist/db/cli.js empty   # back to no tasks
```

Both replace only the tasks; the seeded developers and skills are the same in either state. Both are safe to re-run:
ids restart at 1 and the fixture uses fixed timestamps rather than `now()`, so a reload produces an identical tree
and a screenshot or bug report taken from it stays reproducible. In local development the same two states are
`npm run db:demo` and `npm run db:empty`.

Both delete every task, and both read their target from the same `DATABASE_URL` as everything else, so both refuse
a host that is not local: anything but loopback, `host.docker.internal`, or the `db` service in this compose file.
The error names the host and database, and `--force` overrides the check:

```bash
npm run db:empty                          # Refusing to run "empty" against orders on db.internal.example.com …
npm run db:empty -- --force               # overrides the check
```

The demo state is built to cover every state the UI can display, not to resemble a real backlog. It has a branch deep
enough to fold, a five-level chain (the API's limit, where **Add subtask** is no longer offered), a Done parent whose
whole subtree is Done (where **Add subtask** is disabled and says why), a leaf with nothing under it, all three
`skills_source` values (chosen, AI-inferred, not inferred), assigned and unassigned rows, and a task needing both
skills, which only Carol is eligible for. `apps/api/test/demo.test.ts` loads it and checks it against Rule A, Rule B,
and the depth limit, so the fixture cannot contain a state the API would refuse, then loads it a second time and
compares the whole API response to the first.

## Local development

Prerequisites: Node 24 (`.nvmrc`), npm 11, Docker (for Postgres only).

```bash
npm ci                 # installs every workspace from the single lockfile
npm run db:up          # postgres:17 on localhost:5432 (user/password/db: taskapp)
npm run db:migrate     # apply migrations + seed
npm run db:demo        # load the demo tasks (npm run db:empty to remove them again)
npm run dev            # shared (tsc -w) + api (tsx watch, :3000) + web (vite, :5173, proxies /api → :3000)
```

Other scripts (all from the repo root): `npm run typecheck` · `npm run lint` · `npm run format` · `npm test` ·
`npm run test:e2e` · `npm run build`. The API's tests need the Postgres container running; they use a separate
`taskapp_test` database. The e2e suite needs Docker and, once, `npx playwright install chromium`.

## Configuration

All configuration is by environment variable (`.env` is read by Compose and by the dev scripts). `.env.example`
lists the keys you normally set; every key the API itself reads is declared in
[`apps/api/src/config.ts`](apps/api/src/config.ts), which validates them at startup with Zod and refuses to start on a
bad value.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://taskapp:taskapp@localhost:5432/taskapp` | Postgres connection string (Compose points it at the `db` service) |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | API listen address |
| `LOG_LEVEL` | `info` | pino log level |
| `NODE_ENV` | `development` | Log format only: pretty in `development`, silent in `test`, JSON otherwise (the image sets `production`) |
| `GEMINI_API_KEY` | *(unset)* | Enables skill inference. Unset ⇒ inference disabled |
| `LLM_MODEL` | `gemini-3.5-flash-lite` | Primary model |
| `LLM_FALLBACK_MODELS` | `gemma-4-31b-it,gemma-4-26b-a4b-it` | Tried in order when the primary fails (quota, timeout, bad output) |
| `LLM_TIMEOUT_MS` | `15000` | Whole-chain time budget for one create request |
| `LLM_ATTEMPT_TIMEOUT_MS` | `8000` | Timeout per attempt, enforced client-side with an `AbortSignal` (not sent as a server deadline — the Gemini API rejects deadlines under 10 s) |
| `LLM_PRIMARY_ATTEMPTS` | `2` | Attempts for the primary model (408/5xx and dropped connections retried with exponential backoff; a 429 or a timed-out attempt falls through instead); fallbacks get one each |
| `LLM_RATE_LIMIT_COOLDOWN_MS` | `60000` | How long the chain skips a model after it answers 429; `0` disables the cooldown |
| `POSTGRES_USER/PASSWORD/DB` | `taskapp` | Used by Compose to create the database |

Under Compose, `docker-compose.yml` sets `DATABASE_URL` (built from `POSTGRES_*`, pointed at the `db` service) and
`PORT` (`3000`, where `web`'s nginx and the image's healthcheck expect the API) itself, the image sets `NODE_ENV` to
`production`, and `HOST` keeps its default so the API is reachable from the other containers. Every other key the API
reads passes through from `.env` to the `api` container when set, and takes its default when not. In local development
(`npm run dev`) the API reads the whole `.env` file.

## System design

The alternatives considered for each choice in this section, and why they were rejected, are in [`docs/PLAN.md`](docs/PLAN.md).

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
statement (so the schema's use can be reviewed in one file); `llm/*` is the only code that calls Gemini.

### Database

All persistent data is in one PostgreSQL 17 server: the `db` service in `docker-compose.yml`. This section covers
the container, the databases inside it, every table and column, and how the schema is created.

**The container.** `db` runs the stock `postgres:17-alpine` image; there is no Dockerfile for it. Compose passes it
`POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` from `.env` (all three default to `taskapp`), publishes port
5432 on the host so `psql`, the dev server and the API's tests can reach it, and mounts the named volume `pgdata` at
`/var/lib/postgresql/data`. Because of that volume, tasks persist across `docker compose down` and `docker compose up`;
`docker compose down -v` removes it, which is how to start over. A `pg_isready` healthcheck (every 2 s, up to 30 tries)
controls the start order: `migrate` doesn't run and `api` doesn't start until the server accepts connections. CI runs the
same image as a GitHub Actions service container.

The project uses three of the server's databases (the other two, `template0` and `template1`, belong to Postgres and
are not used):

| Database | Created by | Purpose |
|---|---|---|
| `taskapp` | Postgres, at first start (`POSTGRES_DB`) | The application database: the schema described in this section, migrated and seeded by the `migrate` service. `DATABASE_URL` points here. |
| `taskapp_test` | [`apps/api/test/global-setup.ts`](apps/api/test/global-setup.ts), the first time the API tests run | The API's integration tests: migrated the same way, truncated between tests. Present only once the tests have run against this server. `TEST_DATABASE_URL` points here (default `postgresql://taskapp:taskapp@localhost:5432/taskapp_test`). |
| `postgres` | Postgres | The default maintenance database. The test setup connects here to issue `CREATE DATABASE taskapp_test`; nothing else uses it. |

To inspect the database:

```bash
docker compose exec db psql -U taskapp -d taskapp                   # a psql shell in the container
psql postgresql://taskapp:taskapp@localhost:5432/taskapp            # or any client on the host, via the published port
docker compose exec db pg_dump -U taskapp -d taskapp --schema-only  # the current DDL
```

**Schema.** One enum and six tables, all in the `public` schema. Five tables are the data model; the sixth,
`schema_migrations`, records which migrations have been applied.

```
developers ──< developer_skills >── skills ──< task_skills >── tasks ──┐
   id, name                          id, name                    id, title, status, assignee_id ──► developers
                                                                 parent_task_id ──► tasks (self, ON DELETE CASCADE)
                                                                 skills_source, skills_model, created_at, updated_at
schema_migrations
   version, applied_at
```

`task_status` is a Postgres enum: `'todo'`, `'in_progress'`, `'done'`. Every `id` is an identity column
(`GENERATED ALWAYS AS IDENTITY`), so the database assigns ids and a client can't choose them; the seed uses
`OVERRIDING SYSTEM VALUE` to give its four developers and two skills fixed ids.

`developers` — one row per developer.

| Column | Type | Constraints |
|---|---|---|
| `id` | `integer` | Primary key, identity |
| `name` | `text` | `NOT NULL` |
| `created_at` | `timestamptz` | `NOT NULL`, default `now()` |

`skills` — the skill catalogue. Seeded with the assignment's two skills; a table rather than an enum, so it can grow
without a migration.

| Column | Type | Constraints |
|---|---|---|
| `id` | `integer` | Primary key, identity |
| `name` | `text` | `NOT NULL`, `UNIQUE` |

`developer_skills` — which developer has which skill (the first many-to-many link).

| Column | Type | Constraints |
|---|---|---|
| `developer_id` | `integer` | Part of the primary key; references `developers(id)` `ON DELETE CASCADE` |
| `skill_id` | `integer` | Part of the primary key; references `skills(id)` `ON DELETE RESTRICT` |

`tasks` — tasks and subtasks alike: a subtask is a row whose `parent_task_id` is set (Part 4, "same properties as
tasks").

| Column | Type | Constraints |
|---|---|---|
| `id` | `integer` | Primary key, identity |
| `title` | `text` | `NOT NULL`; `CHECK` 1–500 characters (the request schema enforces the same bounds before the row is written) |
| `status` | `task_status` | `NOT NULL`, default `'todo'` |
| `assignee_id` | `integer` | Nullable (unassigned); references `developers(id)` `ON DELETE SET NULL`; indexed (`tasks_assignee_id_idx`) |
| `parent_task_id` | `integer` | Nullable (`NULL` is a root task); references `tasks(id)` `ON DELETE CASCADE`; `CHECK (parent_task_id <> id)`; indexed (`tasks_parent_task_id_idx`) for the parent → children joins in the recursive tree queries |
| `skills_source` | `text` | `NOT NULL`, default `'user'`; `CHECK IN ('user', 'llm', 'unresolved')` — how the task's skills were determined (see the following list) |
| `skills_model` | `text` | Nullable; the model that answered when `skills_source = 'llm'` |
| `created_at` | `timestamptz` | `NOT NULL`, default `now()` |
| `updated_at` | `timestamptz` | `NOT NULL`, default `now()`; the API's `UPDATE` sets it to `now()` — there is no trigger |

`task_skills` — which skills a task requires (the second many-to-many link).

| Column | Type | Constraints |
|---|---|---|
| `task_id` | `integer` | Part of the primary key; references `tasks(id)` `ON DELETE CASCADE` |
| `skill_id` | `integer` | Part of the primary key; references `skills(id)` `ON DELETE RESTRICT`; indexed (`task_skills_skill_id_idx`) |

`schema_migrations` — the record of applied migrations; the runner creates it itself rather than a migration.

| Column | Type | Constraints |
|---|---|---|
| `version` | `text` | Primary key; the migration's filename without `.sql`, for example `0002_subtasks` |
| `applied_at` | `timestamptz` | `NOT NULL`, default `now()` |

The delete rules together mean: deleting a developer unassigns their tasks and deletes their skill links; deleting a
task deletes its subtasks (recursively) and its skill links; a skill that any developer or task still references
cannot be deleted. The API exposes no delete endpoint (see [Assumptions](#assumptions)), so these rules apply to
direct SQL only, including the e2e suite's teardown, which deletes its fixture tasks by title and relies on the
cascade to delete the subtasks and links.

Three things the schema deliberately leaves to the API:

- **Tree depth.** The self-reference is unbounded in SQL; the API caps a tree at 5 levels (`MAX_DEPTH_EXCEEDED`).
- **Rule A and Rule B.** Neither is a constraint, and neither is a trigger. Rule A spans three tables, so enforcing
  it in the database would take three triggers (on a task's assignee, on a skill added to a task, and on a skill
  removed from a developer), two of them for writes the API never makes, and the third raising an exception the API
  would translate back into the 409 it already sends. Rule B would add two more on `tasks`, on a status change and
  on an insert under a done parent, and each rule would then be implemented in two places. Instead the schema is
  designed so that each rule is a short lookup plus a check: the two link tables make Rule A a set comparison (the
  pure function `canAssign`, shared with the UI), and the self-reference makes Rule B a recursive query over the
  subtree, run under a root lock in a transaction because it spans rows (see [Business rules](#business-rules)).
- **What `skills_source` means.** `user`: skills came with the request. `llm`: inferred from the title by the model
  in `skills_model`. `unresolved`: none supplied and no model answered (no key, quota, timeout). This lets the UI and
  the API report whether the LLM was used.

**How the schema is created.** Migrations are plain SQL in [`apps/api/migrations/`](apps/api/migrations/), one file
per part of the assignment that changed the schema:

| File | Part | What it adds |
|---|---|---|
| `0001_init.sql` | 1 | `task_status`, the five data tables, `tasks_assignee_id_idx`, `task_skills_skill_id_idx` |
| `0002_subtasks.sql` | 4 | `tasks.parent_task_id`, the not-self check, `tasks_parent_task_id_idx` |
| `0003_skill_inference.sql` | 5 | `tasks.skills_source`, `tasks.skills_model` |
| `seed.sql` | 1 | Skills 1 Frontend, 2 Backend; developers 1 Alice (Frontend), 2 Bob (Backend), 3 Carol (Frontend, Backend), 4 Dave (Backend). Idempotent: fixed ids, `ON CONFLICT DO NOTHING`, sequences re-synced with `setval` |

The runner, [`apps/api/src/db/migrate.ts`](apps/api/src/db/migrate.ts) (about 60 lines), takes a Postgres advisory
lock so two API replicas starting together can't both migrate, creates `schema_migrations` if it's missing, and
applies every `NNNN_name.sql` not yet recorded there in filename order — each in its own transaction, recorded on
commit. It is forward-only: there are no down migrations, and a schema change is a new numbered file, never an edit to
an applied one. The seed is a separate step, and the CLI runs the two in order: `migrate` in
[`apps/api/src/db/cli.ts`](apps/api/src/db/cli.ts) calls `runMigrations` and then `runSeed`, both exported by
`migrate.ts`. The Compose `migrate` service is exactly that command (`node dist/db/cli.js migrate`) run once from the
API image, and `api` waits for it to exit successfully; locally it is `npm run db:migrate`. The CLI's `demo` and
`empty` commands migrate and seed first, then `TRUNCATE tasks RESTART IDENTITY CASCADE` and, for `demo`, insert the
fixture — which is why either works on a database that has only just been created, and why a reload returns ids 1..n
again (see [Two states you can load](#two-states-you-can-load)).

### Business rules

**Rule A — eligibility (Part 2).** A developer can be assigned a task only if `developer.skills ⊇ task.skills`. The UI
shows ineligible developers as disabled options and names the missing skill, and the API independently rejects an
ineligible assignment with `409 DEVELOPER_LACKS_SKILLS`. A task with no skills can be assigned to anyone. The check is
the pure function `canAssign` in `packages/shared`, used by both the API and the web app.

**Rule B — completion (Part 4).** A task can be set to `done` only when every descendant is `done`
(`409 SUBTASKS_NOT_DONE`). To keep the invariant *"a done task has no non-done descendant"* true afterwards, two more
transitions are rejected: reopening a task while an ancestor is `done` (`409 ANCESTOR_IS_DONE`) and adding a subtask under
a `done` ancestor (`409 PARENT_IS_DONE`).

**Why Rule B needs a lock, not just a check.** The rule spans rows, so two concurrent requests can each pass their own
check against the other's uncommitted state — *parent → done* and *child → todo* could both commit and leave a done
parent with a todo child. Every mutation that can affect a tree's invariant therefore first takes a row lock on the
**root of the tree** (`SELECT … FOR UPDATE` after walking up with a recursive common table expression (CTE)), then
re-reads the statuses it depends on and checks them under the lock. Under READ COMMITTED the second transaction sees
the first one's committed writes once it acquires the lock, so the race is prevented with one lock per tree and no retry
logic. An integration test sends the two conflicting updates concurrently for 25 rounds and asserts the invariant
after each.

**Atomic nested create.** `POST /api/tasks` accepts a whole tree and inserts it depth-first in one transaction; any
invalid node (unknown skill id, depth > 5) rolls back everything.

### MCP (Important Feature): Model Continuity Plan

Not that other MCP. This **Model Continuity Plan** keeps skill inference working when the primary model fails.
`gemini-3.5-flash-lite` gets two attempts, but the second only after a failure that returns quickly: a 408, a 5xx,
or a dropped connection waits for an exponential backoff (1 s, doubling to a 2 s cap, ±20 % jitter) and tries again.
Any other failure ends that model's attempts immediately: a 4xx, invalid model output, and an attempt that used its whole
8-second timeout, which has already consumed the time a fallback would need.

A 429 also ends that model's attempts, deliberately. Rate limits apply per project and vary per model, so a wait short enough for a
synchronous request cannot span a per-minute window, while the next model in the chain has a quota of its own. A
rate-limited model therefore yields to the next model immediately, and is then skipped for a minute
(`LLM_RATE_LIMIT_COOLDOWN_MS`) so the next create request does not spend a round trip on a call that will be refused.

Fallback continues to `gemma-4-31b-it` and then `gemma-4-26b-a4b-it`, with one attempt each. Retries and fallbacks
share the same 15-second budget, so a create request waits at most 15 s for inference however many models fail. If
every model fails, creation still succeeds: the task is saved as `skills_source = 'unresolved'` rather than failing
the request or recording that no skills apply.

### Skill inference (Part 5)

When a task (or any node of a tree) is created without `skillIds`, the API infers the skills from the title before
saving — automatically, on the backend, in the same request.

- **Provider continuity:** the retries, fallback order, and shared time budget are described in the
  [Model Continuity Plan](#mcp-important-feature-model-continuity-plan). The emailed API key is shared by every
  reviewer, so reaching the free-tier quota is expected; a 429 on the primary falls through to Gemma, and the
  rate-limited model is skipped for a minute.
- **One call per request:** every node needing inference goes into a single batched prompt with the allowed skill names
  read from the database and the three examples from the assignment. Gemini models are asked for constrained JSON
  (`responseMimeType` + `responseJsonSchema`). Gemma models accept those options but ignore them (verified live: they
  answer with prose and a fenced JSON block), so they are asked for JSON in the prompt and the JSON object is extracted
  from the text. Output is validated with Zod; unknown skill names are dropped, and one bad name never discards the
  whole batch. An item whose names were *all* rejected is treated as unresolved rather than as "no skills apply" (an
  empty list returned by the model is still accepted): the item is dropped instead of recorded as an empty,
  unrestricted result, and a response with no usable items falls through to the next model in the chain.
- **Fail-open:** if every model fails, the task is still created with no skills and `skills_source =
  'unresolved'`, shown in the UI as "Not inferred". The heuristic alternative (keyword matching) was deliberately not
  built, because it would have made Part 5 appear to work when the LLM was not used.
- **No thinking:** every model is asked for `thinkingLevel: MINIMAL`. Choosing between two labels needs no reasoning,
  and Gemma 4 otherwise thinks by default (measured live at 6–10 s per request); minimal brings Gemma to 3–5 s and
  `gemini-3.5-flash-lite` to about a second. That is why the per-attempt timeout is 8 s inside the 15 s budget.
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
| GET | `/api/skills/:id` | | `Skill` | 404 |
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
  (1, 1.1, 1.1.1) set in monospace so `1.1.1` lines up under `1.1`. A count line beside the heading
  (*7 tasks · 2 done · 1 unassigned*; the code calls it the census) summarises the list before any row is read. Any
  task with subtasks can be folded from the gutter: the folded row states how many subtasks it hides (*3 subtasks
  hidden*, counting the whole subtree), numbering and the count line are unchanged by folding, and *Expand all* /
  *Collapse all* appear only when at least one task has subtasks. Each row also offers *Add subtask*, which opens a
  one-node composer under that row and posts it with the parent's id; the API already accepts `parentId`, so this
  adds a UI for an existing API capability. (Part 4.3's nested creation is on the Create Task page and is
  unchanged.) A Done parent explains that it cannot take a subtask rather than letting you write one the server
  would refuse, and rows at depth 5 do not offer the action. Status and assignee are inline `<select>`s that save
  immediately; the assignee list disables ineligible developers and names the skill they lack; a parent that still
  has unfinished subtasks shows this under its status control (*0/2 subtasks done*) before you try, but leaves Done
  selectable so that the server remains the enforcer of Rule B; a rejected change (409) shows the server's message
  in the row and the row reverts to the saved state. Skills inferred by the LLM have an "AI-inferred" tag; tasks
  whose skills could not be inferred are marked "Not inferred".
- **Create Task (`/tasks/new`)** — a title, optional skills, and nested subtasks in any structure up to depth 5, submitted
  as one tree; the details are in the next section. There is no assignee field; assignment happens on the Task List.

![The Task List: a folded subtree, hierarchical numbering, inline status and assignee, AI-inferred tag](docs/images/task-list.png)

*The demo state (`db:demo`), so this is reproducible. Task 4 is folded; its row states how many subtasks it hides, and task 5 keeps its number. The pointer is over task 1, so its Add subtask action is visible. Task 1.3 was created without skills and no model was available, so it is marked "Not inferred" rather than shown as needing no skills.*

![The Add subtask composer, open under an existing task](docs/images/add-subtask.png)

*Add subtask opens a one-node composer under the row it belongs to, and names the parent task. Leave the skills unticked and they are inferred from the title, exactly as on the Create Task page. Tasks 2 and 4 are folded here; folding and composing are independent, and a draft survives both.*

State management is intentionally minimal: TanStack Query owns server state (fetching, caching, invalidation after a
mutation); a `useReducer` over an immutable tree owns the create form; there is no global store. Styling is Tailwind v4
with every design token declared in one `@theme` block, and native form controls throughout. If you are new to React,
[`docs/frontend-guide.md`](docs/frontend-guide.md) explains this codebase file by file.

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

The form's entire state is one `useReducer` value: a tree of `{ title, skillIds, subtasks }` nodes. Every edit — typing a
title three levels down, ticking a skill, adding or removing a block — is an action addressed by a **path** (`[0, 2]` is the
third subtask of the first subtask), and the reducer (`treeReducer.ts`, a pure function with its own unit tests) returns a new
tree with only that branch replaced. `TaskNodeForm` holds no state of its own; that is what lets the page validate and
submit the whole tree at once.

Behaviour to expect:

- **Validation names the problem instead of greying out the button.** Submitting with an empty title anywhere in the tree
  focuses that field, marks it, and says "Task 1.1 needs a title" beside the button — even when the field is off-screen.
- **Skills are optional per task.** Any task left without skills is sent to the LLM (Part 5). While that request is in
  flight the button reads "Creating…" and a status line explains that skills are being inferred, which can take a few seconds.
- **If reference data fails to load, the form says so.** If `GET /api/skills` fails, a banner with Retry explains why
  creation is unavailable rather than offering an empty skill list.
- Success returns to the Task List with a flash message naming what was created: *Created "Reporting feature" and 2 subtasks*.

### Design system

The portal is named **reX**, a reference to Jira, whose own name came from *Gojira*. The lowercase `re` is live text
in Work Sans 700; the uppercase `X` is a custom glyph, tapered with slightly concave terminals, drawn as a single inline
SVG path in [`Wordmark.tsx`](apps/web/src/components/Wordmark.tsx). Because it is drawn rather than shipped as an
image, it takes its two colours from the text and accent tokens in the following table, aligns to the same left edge
as everything else, and renders sharply at any size.

The interface uses a deliberately small palette: two background colours, one colour family for text and structure,
one accent colour, and one failure colour. Every colour is defined in exactly one place, the `@theme` block in
[`apps/web/src/index.css`](apps/web/src/index.css). No component writes a hex value or a raw Tailwind palette class.

| Role | Colour | Used for |
|---|---|---|
| Background | `#e9e9e5` page, `#fafaf7` content surface | The page and the content surface. Content sits on the lighter colour, so the two are separated by tone rather than by shadows. |
| Text and structure | `#12011c`, greys `#4f4f51` / `#78787e` / `#c9c9c4` | Body text, table rules, control borders, labels. |
| Accent (violet) | `#5c068c`, `#7b35a3`, `#f0e4f7` | Four uses only: hierarchy numbers, active or selected state, the one primary action per page, and the focus ring. Limiting the uses is what keeps the accent meaningful. |
| Failure | `#a4161a` | The one colour outside the palette above, used only for rejected requests and blocking validation errors, because errors must be unmissable. |

There is no success green and no warning amber. Confirmations use the accent colour like every other state, which
removes two colours from the system without losing any meaning.

Two typefaces, each with one job. **Work Sans** is for prose: titles, sentences, names. A monospace stack is for
data: task numbers, counts, column headers. Monospace digits share a width, so `1.1.1` sits directly under `1.1` in
the number column and the task list reads as an outline. The shared class strings for both are in
[`apps/web/src/components/typeStyles.ts`](apps/web/src/components/typeStyles.ts), beside `buttonStyles.ts`.

The palette and typeface are taken from [htx.gov.sg](https://www.htx.gov.sg/who-we-are/our-purpose): the violet, the
violet-tinted black and Work Sans come from that site's stylesheet. Only the palette and typeface are borrowed: no HTX
name, logo, or mark appears anywhere in the UI, because this app is not an HTX product and should not imply that it is.

Work Sans is **self-hosted** (one 50 KB variable file covering weights 400–700 in
[`apps/web/public/fonts/`](apps/web/public/fonts/), under the [SIL Open Font
License](apps/web/public/fonts/OFL.txt)) rather than fetched from a CDN, so the app needs no network access and
renders identically offline.

Contrast was measured in the rendered page rather than assumed: body text 6.7:1 on the substrate and 19:1 on the sheet,
violet 9.3:1 (white on violet 11.3:1), and every control border and nesting rail at 3.6:1 or better. The previous
control borders were ~1.3:1 and failed WCAG 1.4.11.

## Tests

Four layers, 225 tests in total; every layer runs in CI.

```bash
npm test                              # shared + api + web (API tests need `npm run db:up` first)
npx vitest run --root packages/shared # shared only: 20 tests, no database needed
npx vitest run --root apps/api        # API only: 76 unit + 57 integration tests against Postgres (taskapp_test database)
npx vitest run --root apps/web        # web only: 59 tests, Testing Library + jsdom, fetch mocked
npm run test:e2e                      # 13 Playwright tests against the real Docker Compose stack (builds and starts it)
```

- **shared** — Rule A helpers, request schemas (title bounds, duplicate skill ids, depth limit), tree numbering,
  the visibility-aware traversal that folding uses, and the descendant counts that Rule B uses.
- **api** — every error code has a test that triggers it; nested create persists all nodes and rolls back entirely
  on an invalid deep node; Rule A for each seeded developer; Rule B for done / reopen / add-under-done / grandchild
  cases; the Rule B **concurrency race** (25 rounds, invariant asserted after each); inference with a fake classifier
  (LLM result, failure ⇒ `unresolved`, an empty result accepted, unknown skill names filtered and an all-unknown
  item treated as unresolved, one batched call per request); the
  classifier chain — fallback order, the shared budget against a model's own attempt loop (a timed-out primary leaves
  time for the fallback), and the rate-limit cooldown (a 429 falls through and is remembered, the model is skipped
  while its window runs and tried again after it, `0` turns the cooldown off); the retry policy (408/5xx and a dropped
  connection retried; a 429, a timed-out attempt, and a bug in our own code not); prompt and JSON extraction
  (including Gemma-style prose around the JSON); config parsing;
  `/docs/json` validity; the local-only guard in front of the destructive database commands; and the demo fixture,
  loaded and then checked against Rule A, Rule B, and the depth limit — and reloaded, to prove the second load returns
  the identical tree.
- **web** — form reducer (paths, structural sharing, depth cap, payload shape, numbering, node counts, first
  missing title); Task List rendering (numbering, badges, disabled ineligible developers, PATCH on change, 409 message,
  developers-failed banner with assignment disabled); Create Task: nesting and submitted payload, submit with an empty
  title focuses and names the offending task, Add subtask focuses the new title, Remove confirms for a subtree and returns
  focus to the parent, "Create N tasks" / "Creating…" labels with the inference hint, pluralised flash, skills-failed
  banner; and the list's own reporting: the census line is beside the heading without renaming it, a parent with
  unfinished subtasks says so while leaving Done selectable, and the empty state offers a distinctly named action.
- **e2e** (`e2e/`) — Playwright drives Chromium against `docker compose up --build`, i.e. nginx → API → Postgres
  exactly as a reviewer runs it: smoke (health, `/docs`, seed data), create a task from the UI, Rule A in the assignee
  dropdown (Bob disabled for a Frontend task, Carol accepted), the empty-title alert on the create form, a three-level
  tree created from the nested form with 1 / 1.1 / 1.1.1 numbering, both Rule B rejections and the bottom-up completion
  path, the depth-5 form cap, the Task List outline (fold a subtree and expand it again, leave a subtask draft
  mid-edit and find it still there with the caret position kept, add a subtask in place and reload to prove it reached
  the server), the composer refusing a Done parent and saying so, its recovery when `GET /api/skills` fails and then a
  Retry succeeds without retyping anything, and skill inference, asserted against the live LLM when `GEMINI_API_KEY`
  is set in `.env` and against the `unresolved` path when it is not.
  `E2E_BASE_URL=http://localhost:8080 npm run test:e2e` reuses a stack that is already running; `npm run test:e2e:ui`
  opens Playwright's inspector. On its first run this layer caught the SDK turning the 5-second per-attempt timeout
  into a server deadline that the Gemini API rejects (`400 Manually set deadline 5s is too short`), which no mocked
  test could detect. Every fixture task title includes a `[e2e ...]` marker (`uniqueTitle` in `e2e/tests/helpers.ts`),
  and a `globalTeardown` (`e2e/global-teardown.ts`) deletes exactly those rows (subtasks and skill links cascade) once
  the suite finishes, pass or fail. That matters because, unlike CI (which discards its Postgres volume every run), a
  local run against the Compose stack keeps `pgdata` between runs, so without cleanup the task list would accumulate
  leftover fixtures. Teardown connects with `pg` at `E2E_DATABASE_URL` (default
  `postgresql://taskapp:taskapp@localhost:5432/taskapp`, matching `docker-compose.yml`'s published port); point it
  elsewhere if the stack under test is not on localhost. Teardown never fails the run: if it cannot reach the database
  it logs a warning and the suite's result stands.

CI (GitHub Actions, `.github/workflows/ci.yml`) runs format check, lint, typecheck, and the unit/integration tests
against a Postgres service container, builds both Docker images, and runs the Playwright suite against the composed
stack (without an API key, so the inference test exercises the `unresolved` path there).

## Dependencies and why

Runtime dependencies are limited to what the assignment needs; the following table is the complete list.

| Package | Where | Why this, and not something else |
|---|---|---|
| `fastify` | api | Fast, schema-first Node framework (OpenJS Foundation). Validation, serialisation and logging (pino) are built in, so no separate validator/logger packages. Express would need several add-ons; NestJS is more framework than two resources need. |
| `fastify-type-provider-zod` | api | Lets the Zod schemas in `packages/shared` be the route schemas: one definition gives runtime validation, TypeScript types and the OpenAPI document. |
| `@fastify/swagger`, `@fastify/swagger-ui` | api | Generates and serves the API documentation from those same schemas (`/docs`). |
| `zod` | shared, api | Runtime validation shared by API, web form and LLM output parsing; also emits the JSON Schema sent to Gemini. |
| `pino` | api | Fastify's own logger, declared explicitly because the server imports it directly for the classifier's startup/fallback log lines. No additional code is installed. |
| `pg` | api, e2e | The standard Postgres driver. SQL is written by hand (recursive CTEs, `FOR UPDATE`), so an ORM would add a dependency without removing much code. Also used by `e2e/global-teardown.ts` to delete the suite's own fixture rows after a run — no new dependency, just root `devDependencies` pointing at the same version `apps/api` already pins. |
| `@google/genai` | api | Google's current official Gemini SDK (the older `@google/generative-ai` is end-of-life). Provides structured output, per-attempt timeouts, opt-in retries and abort signals. |
| `react`, `react-dom` | web | Required by the assignment. |
| `react-router` | web | Two pages with real, bookmarkable URLs; declarative mode needs only a few imports. |
| `@tanstack/react-query` | web | Server-state cache with loading/error states and invalidation after mutations — removes hand-written `useEffect` fetching and stale-data bugs. |
| `tailwindcss`, `@tailwindcss/vite` | web (build) | Utility CSS with the design tokens declared in CSS (`@theme`); zero config. A component library (shadcn) was considered and rejected: ~6 extra packages plus vendored component code for two pages, and it replaces the native `<select>` the wireframe uses. |

Every package in the preceding table was vetted before it was chosen: current release, maintenance, licence, OSV/GHSA
advisories, and a name-by-name check against the 2025–26 npm supply-chain incidents, plus the case for Fastify over
Express and NestJS.
One section per dependency, in [`docs/research/`](docs/research/).

Development-only: `typescript`, `vite`, `@vitejs/plugin-react`, `tsx` (run TS in dev), `vitest` + `@testing-library/*` +
`jsdom` (tests), `@playwright/test` (end-to-end tests against the Compose stack), `eslint` + `typescript-eslint` + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh` +
`eslint-config-prettier` + `prettier` (lint/format), `concurrently` (one `npm run dev`), `pino-pretty` (readable dev
logs), `@types/*`. Every version is pinned exactly and installed from the committed lockfile (`npm ci`).

## Assumptions

1. **Eligibility** means the developer holds every skill the task requires; a task with no skills is assignable to anyone.
2. **Skills are fixed at creation.** Updates are limited to `status` and `assignee` (Part 2's list); a task's skills can be
   chosen by the user or inferred, not edited afterwards.
3. **Statuses** are `todo`, `in_progress`, `done` (the spec says "To-do / Done / etc."). Transitions are free except
   for the Rule B constraints described in [Business rules](#business-rules); reopening a *parent* is allowed,
   reopening a child under a done parent is not.
4. **Unassigning** (`assigneeId: null`) is allowed.
5. A subtask tree is created **atomically** in one request; depth ≤ 5, title 1–500 characters, ≤ 50 subtasks per node.
6. **Subtask eligibility** is computed from the subtask's own skills, not its ancestors'.
7. The **skills catalogue** is exactly the two skills in the assignment (Frontend, Backend); it is a table, so it can grow.
8. **No** authentication, deletion, or multi-tenancy — none is asked for.
9. When a task is created **without skills the LLM is called**; `skillIds: []` counts as "no skills provided".

## Known limitations and future work

- Reopening a subtask under a done parent is rejected rather than cascading the reopen up the tree.
- No task deletion, list filtering/search, or optimistic UI updates.
- Folding is per-session state held in the component: it is not persisted across a reload, and a task added from the
  list is placed by the server's ordering (last among its siblings), not inserted client-side.
- An unsaved **Add subtask** draft survives switching rows, folding, and Collapse all, but it is held in component state:
  a reload discards it. Only one composer is open at a time, so subtasks are added one at a time rather than several at once.
- Removing a subtask in the create form asks for confirmation rather than offering undo.
- Tailwind v4 targets modern browsers (Safari 16.4+, Chrome 111+, Firefox 128+).
- Skill inference is synchronous inside the create request (worst case ≈ 15 s when every model times out); an async
  "infer later" flow would be the next step if inference became slow.

---

Built with AI-assisted tooling (Claude Code); design decisions and their reasoning are in [`docs/PLAN.md`](docs/PLAN.md).
